// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/lib/google-auth.js");
vi.mock("../../api/lib/firebase-auth.js");

import { googleFetch, isGoogleConfigured, requireInternalToken } from "../../api/lib/google-auth.js";
import { requireFirebaseAuth } from "../../api/lib/firebase-auth.js";
import handler from "../../api/calendar/list-changes.js";

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

const ORIGINAL_ENV = { ...process.env };

describe("api/calendar/list-changes", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, GOOGLE_CALENDAR_ID: "shared-calendar@group.calendar.google.com" };
    vi.mocked(googleFetch).mockReset();
    vi.mocked(isGoogleConfigured).mockReset().mockReturnValue(true);
    vi.mocked(requireFirebaseAuth).mockReset().mockResolvedValue(true);
    vi.mocked(requireInternalToken).mockReset().mockReturnValue(true);
  });

  it("returns 401 without calling downstream logic when the Firebase ID token check fails", async () => {
    vi.mocked(requireFirebaseAuth).mockImplementation(async (req, res) => {
      res.status(401).json({ error: "unauthorized" });
      return false;
    });
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(requireInternalToken).not.toHaveBeenCalled();
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("returns 401 without calling downstream logic when the internal token check fails", async () => {
    vi.mocked(requireInternalToken).mockImplementation((req, res) => {
      res.status(401).json({ error: "unauthorized" });
      return false;
    });
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("responds 405 for unsupported methods", async () => {
    const res = makeRes();
    await handler({ method: "POST", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("skips (200) instead of erroring when Google isn't configured yet", async () => {
    vi.mocked(isGoogleConfigured).mockReturnValue(false);
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ skipped: true, reason: "calendar sync not configured" });
  });

  it("skips when GOOGLE_CALENDAR_ID is missing even if the service account is configured", async () => {
    delete process.env.GOOGLE_CALENDAR_ID;
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBe(true);
  });

  it("defaults updatedMin to roughly 30 days ago when the client sends none", async () => {
    vi.mocked(googleFetch).mockResolvedValue({ items: [] });
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
    const updatedMin = new URL(calledUrl).searchParams.get("updatedMin");
    const ageMs = Date.now() - Date.parse(updatedMin);
    expect(ageMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan(31 * 24 * 60 * 60 * 1000);
  });

  it("passes through a valid client-supplied updatedMin", async () => {
    vi.mocked(googleFetch).mockResolvedValue({ items: [] });
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: { updatedMin: "2026-08-01T00:00:00.000Z" } }, res);
    const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
    expect(new URL(calledUrl).searchParams.get("updatedMin")).toBe("2026-08-01T00:00:00.000Z");
  });

  it("falls back to the default lookback when the client sends an invalid updatedMin", async () => {
    vi.mocked(googleFetch).mockResolvedValue({ items: [] });
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: { updatedMin: "not-a-date" } }, res);
    const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
    const updatedMin = new URL(calledUrl).searchParams.get("updatedMin");
    expect(Number.isNaN(Date.parse(updatedMin))).toBe(false);
    expect(updatedMin).not.toBe("not-a-date");
  });

  it("maps returned events to the trimmed shape and requests showDeleted + singleEvents", async () => {
    vi.mocked(googleFetch).mockResolvedValue({
      items: [
        {
          id: "evt-1",
          status: "confirmed",
          summary: "[박환희] 홍길동 3회차",
          start: { dateTime: "2026-09-10T19:00:00+09:00" },
          end: { dateTime: "2026-09-10T20:00:00+09:00" },
          extraFieldWeDontWant: "ignored",
        },
        { id: "evt-2", status: "cancelled" },
      ],
    });
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.events).toEqual([
      {
        id: "evt-1",
        status: "confirmed",
        summary: "[박환희] 홍길동 3회차",
        start: { dateTime: "2026-09-10T19:00:00+09:00" },
        end: { dateTime: "2026-09-10T20:00:00+09:00" },
      },
      { id: "evt-2", status: "cancelled", summary: "", start: null, end: null },
    ]);
    expect(typeof res.body.syncedAt).toBe("string");
    const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
    const params = new URL(calledUrl).searchParams;
    expect(params.get("showDeleted")).toBe("true");
    expect(params.get("singleEvents")).toBe("true");
  });

  it("follows nextPageToken across multiple pages and stops when it's absent", async () => {
    vi.mocked(googleFetch)
      .mockResolvedValueOnce({ items: [{ id: "evt-1", status: "confirmed" }], nextPageToken: "page-2" })
      .mockResolvedValueOnce({ items: [{ id: "evt-2", status: "confirmed" }] });
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(googleFetch).toHaveBeenCalledTimes(2);
    expect(new URL(vi.mocked(googleFetch).mock.calls[1][0]).searchParams.get("pageToken")).toBe("page-2");
    expect(res.body.events.map((e) => e.id)).toEqual(["evt-1", "evt-2"]);
  });

  it("stops after MAX_PAGES even if the API keeps returning a nextPageToken", async () => {
    vi.mocked(googleFetch).mockResolvedValue({ items: [{ id: "evt", status: "confirmed" }], nextPageToken: "more" });
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(googleFetch).toHaveBeenCalledTimes(5);
    expect(res.body.events).toHaveLength(5);
  });

  it("responds 502 when the Calendar API call fails", async () => {
    vi.mocked(googleFetch).mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(502);
  });

  it("retries with progressively shorter windows when Google rejects a stale client updatedMin (410)", async () => {
    const tooOld = () => Object.assign(new Error("Google API 410: updatedMinTooLongAgo"), { status: 410 });
    vi.mocked(googleFetch)
      .mockRejectedValueOnce(tooOld()) // client's own value
      .mockRejectedValueOnce(tooOld()) // 30 days
      .mockRejectedValueOnce(tooOld()) // 3 days
      .mockResolvedValueOnce({ items: [{ id: "evt-1", status: "confirmed" }] }); // 1 day
    const res = makeRes();
    await handler(
      { method: "GET", headers: {}, query: { updatedMin: "2020-01-01T00:00:00.000Z" } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.events.map((e) => e.id)).toEqual(["evt-1"]);
    expect(googleFetch).toHaveBeenCalledTimes(4);
    const lastUpdatedMin = new URL(vi.mocked(googleFetch).mock.calls[3][0]).searchParams.get("updatedMin");
    const ageMs = Date.now() - Date.parse(lastUpdatedMin);
    expect(ageMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan(25 * 60 * 60 * 1000);
    // syncedAt is still fresh so the client can save it and stop resending the stale checkpoint.
    expect(Date.now() - Date.parse(res.body.syncedAt)).toBeLessThan(5000);
  });

  it("responds 502 when every fallback window is also rejected", async () => {
    vi.mocked(googleFetch).mockRejectedValue(
      Object.assign(new Error("Google API 410: updatedMinTooLongAgo"), { status: 410 })
    );
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(502);
    // no client value supplied, so only the 4 fallback windows are tried
    expect(googleFetch).toHaveBeenCalledTimes(4);
  });

  it("does not retry a non-410 error even if later candidates might have worked", async () => {
    vi.mocked(googleFetch).mockRejectedValue(Object.assign(new Error("boom"), { status: 403 }));
    const res = makeRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(502);
    expect(googleFetch).toHaveBeenCalledTimes(1);
  });
});
