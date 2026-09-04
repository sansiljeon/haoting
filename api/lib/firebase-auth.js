import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Verifies the caller is a logged-in Firebase user (real authorization boundary
// for /api/*). INTERNAL_API_TOKEN alone used to be the only gate, but that token
// lives in public/api-config.js — a statically-served file anyone can fetch — so
// it can only ever be a bot filter, never proof of who's calling. This checks the
// Firebase ID token the already-logged-in frontend sends instead.
//
// Reuses the same Google service account credential as Calendar/Sheets sync
// (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) — the admin
// app's credential only needs to be *a* valid Google service account (it's used
// for Admin API calls, not for the ID-token signature check itself, which always
// verifies against Google's public certs). FIREBASE_PROJECT_ID must match the
// Firebase project in public/firebase-config.js so the token's audience matches.
let cachedApp;

function getFirebaseAdminApp() {
  if (cachedApp) return cachedApp;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawKey) return null;
  const existing = getApps().find((app) => app.name === "haoting-admin-auth");
  cachedApp =
    existing ||
    initializeApp(
      { credential: cert({ projectId, clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") }), projectId },
      "haoting-admin-auth"
    );
  return cachedApp;
}

export function isFirebaseAuthConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

// Returns true and continues (attaching the decoded token as req.firebaseUser) if
// authorized; sends 401 and returns false otherwise. Fails closed (401, not skip)
// when FIREBASE_PROJECT_ID itself hasn't been set — unlike requireInternalToken's
// dev-convenience fail-open, an unconfigured auth check must never mean "allow
// everyone", since this is the only real access-control boundary /api/* has.
export async function requireFirebaseAuth(req, res) {
  const app = getFirebaseAdminApp();
  if (!app) {
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
    req.firebaseUser = await getAuth(app).verifyIdToken(match[1]);
    return true;
  } catch (err) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
}
