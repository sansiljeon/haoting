import { createVerify } from "node:crypto";

// Verifies the caller is a logged-in Firebase user (real authorization boundary
// for /api/*). INTERNAL_API_TOKEN alone used to be the only gate, but that token
// lives in public/api-config.js — a statically-served file anyone can fetch — so
// it can only ever be a bot filter, never proof of who's calling. This checks the
// Firebase ID token the already-logged-in frontend sends instead.
//
// This verifies the token by hand (Google's public certs + RS256 signature check)
// per https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
// instead of using the firebase-admin SDK: firebase-admin's ID-token path pulls in
// jwks-rsa, whose "jose" dependency ships ESM-only and gets required() at import
// time — that crashes every /api/* call on Vercel's Node runtime with
// ERR_REQUIRE_ESM. No service-account credential is needed here; verification only
// ever checks the signature against Google's own public certs.
const GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const DEFAULT_CERTS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

let certsCache = null; // { certs: Record<kid, pem>, expiresAt: number }

async function getGoogleCerts() {
  if (certsCache && certsCache.expiresAt > Date.now()) return certsCache.certs;
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error(`failed to fetch Google certs: ${res.status}`);
  const certs = await res.json();
  const maxAgeMatch = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : DEFAULT_CERTS_TTL_MS;
  certsCache = { certs, expiresAt: Date.now() + ttlMs };
  return certs;
}

async function verifyFirebaseIdToken(idToken) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));

  if (header.alg !== "RS256") throw new Error("unexpected alg");
  if (!header.kid) throw new Error("missing kid");

  const certs = await getGoogleCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error("unknown key id");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const validSignature = verifier.verify(cert, Buffer.from(signatureB64, "base64url"));
  if (!validSignature) throw new Error("invalid signature");

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) throw new Error("token expired");
  if (typeof payload.iat !== "number" || payload.iat > now + CLOCK_SKEW_SECONDS) throw new Error("token issued in the future");
  if (payload.aud !== projectId) throw new Error("audience mismatch");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("issuer mismatch");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("missing subject");
  if (typeof payload.auth_time !== "number" || payload.auth_time > now + CLOCK_SKEW_SECONDS) {
    throw new Error("invalid auth_time");
  }

  return { ...payload, uid: payload.sub };
}

export function isFirebaseAuthConfigured() {
  return Boolean(process.env.FIREBASE_PROJECT_ID);
}

// Returns true and continues (attaching the decoded token as req.firebaseUser) if
// authorized; sends 401 and returns false otherwise. Fails closed (500, not skip)
// when FIREBASE_PROJECT_ID itself hasn't been set — unlike requireInternalToken's
// dev-convenience fail-open, an unconfigured auth check must never mean "allow
// everyone", since this is the only real access-control boundary /api/* has.
export async function requireFirebaseAuth(req, res) {
  if (!isFirebaseAuthConfigured()) {
    res.status(500).json({ error: "server auth not configured" });
    return false;
  }
  const header = (req.headers && req.headers.authorization) || "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  try {
    req.firebaseUser = await verifyFirebaseIdToken(match[1]);
    return true;
  } catch (err) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
}
