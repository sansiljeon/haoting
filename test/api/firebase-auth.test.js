// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const PROJECT_ID = "haoting-aadee";
const KID = "test-kid";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.FIREBASE_PROJECT_ID;
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signToken({ header, payload, privateKey }) {
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

function stubGoogleCerts(publicKeyPem) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "cache-control": "max-age=3600" }),
      json: async () => ({ [KID]: publicKeyPem }),
    }))
  );
}

describe("api/lib/firebase-auth", () => {
  let keyPair;

  beforeEach(() => {
    resetEnv();
    process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
    keyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function publicKeyPem() {
    return keyPair.publicKey.export({ type: "spki", format: "pem" });
  }

  function makeValidToken(overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", kid: KID, ...(overrides.header || {}) };
    const payload = {
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: "teacher-1",
      auth_time: now - 10,
      iat: now - 10,
      exp: now + 3600,
      ...(overrides.payload || {}),
    };
    return signToken({ header, payload, privateKey: keyPair.privateKey });
  }

  describe("isFirebaseAuthConfigured", () => {
    it("returns false when FIREBASE_PROJECT_ID isn't set", async () => {
      delete process.env.FIREBASE_PROJECT_ID;
      const { isFirebaseAuthConfigured } = await import("../../api/lib/firebase-auth.js");
      expect(isFirebaseAuthConfigured()).toBe(false);
    });

    it("returns true once FIREBASE_PROJECT_ID is set", async () => {
      const { isFirebaseAuthConfigured } = await import("../../api/lib/firebase-auth.js");
      expect(isFirebaseAuthConfigured()).toBe(true);
    });
  });

  describe("requireFirebaseAuth", () => {
    it("fails closed with 500 when FIREBASE_PROJECT_ID isn't configured (never silently allows the request)", async () => {
      delete process.env.FIREBASE_PROJECT_ID;
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const result = await requireFirebaseAuth({ headers: {} }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(500);
    });

    it("returns 401 when there's no Authorization header", async () => {
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const result = await requireFirebaseAuth({ headers: {} }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 when the Authorization header isn't a Bearer token", async () => {
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const result = await requireFirebaseAuth({ headers: { authorization: "Basic abc123" } }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 for a malformed token (not three dot-separated segments)", async () => {
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const result = await requireFirebaseAuth({ headers: { authorization: "Bearer not-a-jwt" } }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "unauthorized" });
    });

    it("returns 401 when the signature doesn't match the cert on file", async () => {
      const otherKeyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
      stubGoogleCerts(otherKeyPair.publicKey.export({ type: "spki", format: "pem" }));
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const token = makeValidToken();
      const result = await requireFirebaseAuth({ headers: { authorization: `Bearer ${token}` } }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 when the kid isn't in Google's published certs", async () => {
      stubGoogleCerts(publicKeyPem());
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const token = makeValidToken({ header: { kid: "unknown-kid" } });
      const result = await requireFirebaseAuth({ headers: { authorization: `Bearer ${token}` } }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 when the token has expired", async () => {
      stubGoogleCerts(publicKeyPem());
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const now = Math.floor(Date.now() / 1000);
      const token = makeValidToken({ payload: { exp: now - 10 } });
      const result = await requireFirebaseAuth({ headers: { authorization: `Bearer ${token}` } }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 when the audience doesn't match FIREBASE_PROJECT_ID", async () => {
      stubGoogleCerts(publicKeyPem());
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const token = makeValidToken({ payload: { aud: "some-other-project" } });
      const result = await requireFirebaseAuth({ headers: { authorization: `Bearer ${token}` } }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 when the issuer doesn't match", async () => {
      stubGoogleCerts(publicKeyPem());
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const token = makeValidToken({ payload: { iss: "https://securetoken.google.com/wrong-project" } });
      const result = await requireFirebaseAuth({ headers: { authorization: `Bearer ${token}` } }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it("returns true and attaches the decoded token as req.firebaseUser on success", async () => {
      stubGoogleCerts(publicKeyPem());
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const token = makeValidToken();
      const req = { headers: { authorization: `Bearer ${token}` } };
      const result = await requireFirebaseAuth(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBeNull();
      expect(req.firebaseUser).toMatchObject({ uid: "teacher-1", sub: "teacher-1" });
    });
  });
});
