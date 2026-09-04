// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/lib/google-auth.js");
vi.mock("../../api/lib/firebase-auth.js");

import { googleFetch, isGoogleConfigured, requireInternalToken } from "../../api/lib/google-auth.js";
import { requireFirebaseAuth } from "../../api/lib/firebase-auth.js";
import handler from "../../api/calendar/sync-session.js";

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

describe("api/calendar/sync-session", () => {
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
    await handler({ method: "POST", headers: {}, body: {} }, res);
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
    await handler({ method: "POST", headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("skips (200) instead of erroring when Google isn't configured yet", async () => {
    vi.mocked(isGoogleConfigured).mockReturnValue(false);
    const res = makeRes();
    await handler({ method: "POST", headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ skipped: true, reason: "calendar sync not configured" });
  });

  it("skips when GOOGLE_CALENDAR_ID is missing even if the service account is configured", async () => {
    delete process.env.GOOGLE_CALENDAR_ID;
    const res = makeRes();
    await handler({ method: "POST", headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBe(true);
  });

  it("creates a new event via POST when no calendarEventId is provided", async () => {
    vi.mocked(googleFetch).mockResolvedValue({ id: "new-event-id" });
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          studentName: "홍길동",
          instructor: "박환희",
          sessionNumber: 3,
          sessionDate: "2026-09-10",
          startTime: "19:00",
          endTime: "20:00",
        },
      },
      res
    );
    expect(googleFetch).toHaveBeenCalledWith(
      expect.stringContaining("/events"),
      expect.objectContaining({ method: "POST" })
    );
    expect(res.body).toEqual({ eventId: "new-event-id" });
  });

  it("updates the existing event via PATCH when calendarEventId is provided", async () => {
    vi.mocked(googleFetch).mockResolvedValue({ id: "existing-event-id" });
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          calendarEventId: "existing-event-id",
          studentName: "홍길동",
          instructor: "박환희",
          sessionNumber: 3,
          sessionDate: "2026-09-10",
          startTime: "19:00",
          endTime: "20:00",
        },
      },
      res
    );
    expect(googleFetch).toHaveBeenCalledWith(
      expect.stringContaining("/events/existing-event-id"),
      expect.objectContaining({ method: "PATCH" })
    );
    expect(res.body).toEqual({ eventId: "existing-event-id" });
  });

  it("falls back to creating a new event when a PATCH target returns 404", async () => {
    const notFound = Object.assign(new Error("gone"), { status: 404 });
    vi.mocked(googleFetch).mockRejectedValueOnce(notFound).mockResolvedValueOnce({ id: "recreated-id" });
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          calendarEventId: "stale-id",
          studentName: "홍길동",
          sessionNumber: 1,
          sessionDate: "2026-09-10",
          startTime: "19:00",
          endTime: "20:00",
        },
      },
      res
    );
    expect(googleFetch).toHaveBeenCalledTimes(2);
    expect(googleFetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/events"), expect.objectContaining({ method: "POST" }));
    expect(res.body).toEqual({ eventId: "recreated-id" });
  });

  it("responds 400 when DELETE is called without a calendarEventId", async () => {
    const res = makeRes();
    await handler({ method: "DELETE", headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it("deletes the event and treats a 404/410 response as already-gone success", async () => {
    const gone = Object.assign(new Error("gone"), { status: 410 });
    vi.mocked(googleFetch).mockRejectedValue(gone);
    const res = makeRes();
    await handler({ method: "DELETE", headers: {}, body: { calendarEventId: "some-id" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it("responds 502 when the Calendar API call fails for a reason other than not-found", async () => {
    vi.mocked(googleFetch).mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    const res = makeRes();
    await handler({ method: "DELETE", headers: {}, body: { calendarEventId: "some-id" } }, res);
    expect(res.statusCode).toBe(502);
  });

  it("responds 405 for unsupported methods", async () => {
    const res = makeRes();
    await handler({ method: "GET", headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});
