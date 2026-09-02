// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JWT } from "google-auth-library";
import {
  isGoogleConfigured,
  getServiceAccountClient,
  googleFetch,
  requireInternalToken,
} from "../../api/lib/google-auth.js";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  delete process.env.INTERNAL_API_TOKEN;
}

describe("api/lib/google-auth", () => {
  beforeEach(() => {
    resetEnv();
  });

  describe("isGoogleConfigured", () => {
    it("returns false when the service-account env vars are missing", () => {
      expect(isGoogleConfigured()).toBe(false);
    });

    it("returns true once both email and private key are set", () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "key";
      expect(isGoogleConfigured()).toBe(true);
    });
  });

  describe("getServiceAccountClient", () => {
    // Runs before any test constructs a client, so the module's internal cachedClient is still null.
    it("throws when env vars are not configured", () => {
      expect(() => getServiceAccountClient()).toThrow(/not configured/);
    });

    it("unescapes \\n sequences in the private key when constructing the JWT client", () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "line1\\nline2";

      const client = getServiceAccountClient();

      expect(client).toBeInstanceOf(JWT);
      expect(client.key).toBe("line1\nline2");
      expect(client.email).toBe(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
    });
  });

  describe("googleFetch", () => {
    beforeEach(() => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "key";
      // Avoid a real network round-trip to Google's token endpoint: the client is
      // constructed for real (cheap, no I/O), only header issuance is stubbed.
      vi.spyOn(JWT.prototype, "getRequestHeaders").mockResolvedValue({
        Authorization: "Bearer test-token",
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("resolves with the parsed JSON body on success", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      });
      const result = await googleFetch("https://example.com");
      expect(result).toEqual({ ok: true });
    });

    it("returns null for a 204 No Content response", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      const result = await googleFetch("https://example.com");
      expect(result).toBeNull();
    });

    it("throws with the response status attached when the request fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "not found",
      });
      await expect(googleFetch("https://example.com")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("requireInternalToken", () => {
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

    it("allows the request through when INTERNAL_API_TOKEN is not configured", () => {
      const res = makeRes();
      expect(requireInternalToken({ headers: {} }, res)).toBe(true);
      expect(res.statusCode).toBeNull();
    });

    it("allows the request through when the header matches the configured token", () => {
      process.env.INTERNAL_API_TOKEN = "secret";
      const res = makeRes();
      const req = { headers: { "x-internal-api-token": "secret" } };
      expect(requireInternalToken(req, res)).toBe(true);
      expect(res.statusCode).toBeNull();
    });

    it("rejects with 401 when the header is missing or does not match", () => {
      process.env.INTERNAL_API_TOKEN = "secret";
      const res = makeRes();
      const req = { headers: { "x-internal-api-token": "wrong" } };
      expect(requireInternalToken(req, res)).toBe(false);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "unauthorized" });
    });
  });
});
