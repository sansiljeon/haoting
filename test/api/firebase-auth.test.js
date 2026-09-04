// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyIdToken = vi.fn();
const mockGetApps = vi.fn(() => []);
const mockInitializeApp = vi.fn((_config, name) => ({ name }));

vi.mock("firebase-admin/app", () => ({
  initializeApp: (...args) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
  cert: (config) => config,
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
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

function configureEnv() {
  process.env.FIREBASE_PROJECT_ID = "haoting-aadee";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "key";
}

describe("api/lib/firebase-auth", () => {
  beforeEach(() => {
    resetEnv();
    mockVerifyIdToken.mockReset();
    mockGetApps.mockReset().mockReturnValue([]);
    mockInitializeApp.mockClear();
    vi.resetModules();
  });

  describe("isFirebaseAuthConfigured", () => {
    it("returns false when any of the three required env vars is missing", async () => {
      const { isFirebaseAuthConfigured } = await import("../../api/lib/firebase-auth.js");
      expect(isFirebaseAuthConfigured()).toBe(false);
    });

    it("returns true once FIREBASE_PROJECT_ID and the service account env vars are all set", async () => {
      configureEnv();
      const { isFirebaseAuthConfigured } = await import("../../api/lib/firebase-auth.js");
      expect(isFirebaseAuthConfigured()).toBe(true);
    });
  });

  describe("requireFirebaseAuth", () => {
    it("fails closed with 500 when FIREBASE_PROJECT_ID isn't configured (never silently allows the request)", async () => {
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const result = await requireFirebaseAuth({ headers: {} }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(500);
    });

    it("returns 401 when there's no Authorization header", async () => {
      configureEnv();
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const result = await requireFirebaseAuth({ headers: {} }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it("returns 401 when the Authorization header isn't a Bearer token", async () => {
      configureEnv();
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const result = await requireFirebaseAuth({ headers: { authorization: "Basic abc123" } }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 when verifyIdToken rejects (expired/invalid/forged token)", async () => {
      configureEnv();
      mockVerifyIdToken.mockRejectedValue(new Error("invalid token"));
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const result = await requireFirebaseAuth({ headers: { authorization: "Bearer bad-token" } }, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "unauthorized" });
    });

    it("returns true and attaches the decoded token as req.firebaseUser on success", async () => {
      configureEnv();
      mockVerifyIdToken.mockResolvedValue({ uid: "teacher-1", email: "teacher@example.com" });
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      const req = { headers: { authorization: "Bearer good-token" } };
      const result = await requireFirebaseAuth(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBeNull();
      expect(req.firebaseUser).toEqual({ uid: "teacher-1", email: "teacher@example.com" });
      expect(mockVerifyIdToken).toHaveBeenCalledWith("good-token");
    });

    it("reuses an already-initialized named app instead of calling initializeApp again", async () => {
      configureEnv();
      const existingApp = { name: "haoting-admin-auth" };
      mockGetApps.mockReturnValue([existingApp]);
      mockVerifyIdToken.mockResolvedValue({ uid: "teacher-1" });
      const { requireFirebaseAuth } = await import("../../api/lib/firebase-auth.js");
      const res = makeRes();
      await requireFirebaseAuth({ headers: { authorization: "Bearer good-token" } }, res);
      expect(mockInitializeApp).not.toHaveBeenCalled();
    });
  });
});
