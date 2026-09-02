// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/lib/google-auth.js");
vi.mock("../../api/lib/google-sheets.js");

import { isGoogleConfigured, requireInternalToken } from "../../api/lib/google-auth.js";
import { listRecords, appendRecord, updateRecordById, softDeleteById } from "../../api/lib/google-sheets.js";
import listCreateHandler from "../../api/study-records/index.js";
import itemHandler from "../../api/study-records/[id].js";

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
const sampleRecord = (overrides = {}) =>
  Object.assign(
    {
      id: "rec-1",
      studentId: "student-1",
      studentName: "홍길동",
      classDate: "2026-09-10",
      registeredSessions: "8",
      classType: "일반 회화반",
      content: "1과",
      comprehension: "상",
      participation: "상",
      improvement: "",
      homeworkSubmitted: "제출",
      homeworkChecked: "확인완료",
      feedback: "",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      deleted: "FALSE",
    },
    overrides
  );

describe("api/study-records", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, GOOGLE_SHEETS_SPREADSHEET_ID: "sheet-id" };
    vi.mocked(requireInternalToken).mockReset().mockReturnValue(true);
    vi.mocked(isGoogleConfigured).mockReset().mockReturnValue(true);
    vi.mocked(listRecords).mockReset();
    vi.mocked(appendRecord).mockReset();
    vi.mocked(updateRecordById).mockReset();
    vi.mocked(softDeleteById).mockReset();
  });

  describe("GET/POST /api/study-records", () => {
    it("returns 401 without calling Sheets when the internal token check fails", async () => {
      vi.mocked(requireInternalToken).mockImplementation((req, res) => {
        res.status(401).json({ error: "unauthorized" });
        return false;
      });
      const res = makeRes();
      await listCreateHandler({ method: "GET", headers: {}, query: {} }, res);
      expect(res.statusCode).toBe(401);
      expect(listRecords).not.toHaveBeenCalled();
    });

    it("skips (200, empty list) when Sheets isn't configured yet", async () => {
      vi.mocked(isGoogleConfigured).mockReturnValue(false);
      const res = makeRes();
      await listCreateHandler({ method: "GET", headers: {}, query: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ skipped: true, reason: "sheets sync not configured", records: [] });
    });

    it("skips when GOOGLE_SHEETS_SPREADSHEET_ID is missing", async () => {
      delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      const res = makeRes();
      await listCreateHandler({ method: "GET", headers: {}, query: {} }, res);
      expect(res.body.skipped).toBe(true);
    });

    it("returns all non-deleted records on GET with no filter", async () => {
      vi.mocked(listRecords).mockResolvedValue([sampleRecord({ id: "a" }), sampleRecord({ id: "b", studentId: "student-2" })]);
      const res = makeRes();
      await listCreateHandler({ method: "GET", headers: {}, query: {} }, res);
      expect(res.body.records).toHaveLength(2);
    });

    it("filters by studentId when provided", async () => {
      vi.mocked(listRecords).mockResolvedValue([
        sampleRecord({ id: "a", studentId: "student-1" }),
        sampleRecord({ id: "b", studentId: "student-2" }),
      ]);
      const res = makeRes();
      await listCreateHandler({ method: "GET", headers: {}, query: { studentId: "student-2" } }, res);
      expect(res.body.records).toEqual([expect.objectContaining({ id: "b" })]);
    });

    it("responds 400 on POST when studentId or classDate is missing", async () => {
      const res = makeRes();
      await listCreateHandler({ method: "POST", headers: {}, query: {}, body: { studentId: "student-1" } }, res);
      expect(res.statusCode).toBe(400);
      expect(appendRecord).not.toHaveBeenCalled();
    });

    it("creates a record on POST with valid input", async () => {
      vi.mocked(appendRecord).mockImplementation(async (record) => record);
      const res = makeRes();
      await listCreateHandler(
        { method: "POST", headers: {}, query: {}, body: { studentId: "student-1", classDate: "2026-09-10", studentName: "홍길동" } },
        res
      );
      expect(res.statusCode).toBe(201);
      expect(res.body.record).toMatchObject({ studentId: "student-1", classDate: "2026-09-10", deleted: "FALSE" });
      expect(res.body.record.id).toBeTruthy();
    });

    it("responds 502 when the Sheets API call fails", async () => {
      vi.mocked(listRecords).mockRejectedValue(new Error("boom"));
      const res = makeRes();
      await listCreateHandler({ method: "GET", headers: {}, query: {} }, res);
      expect(res.statusCode).toBe(502);
    });

    it("responds 405 for unsupported methods", async () => {
      const res = makeRes();
      await listCreateHandler({ method: "DELETE", headers: {}, query: {} }, res);
      expect(res.statusCode).toBe(405);
    });
  });

  describe("PATCH/DELETE /api/study-records/:id", () => {
    it("returns 401 without calling Sheets when the internal token check fails", async () => {
      vi.mocked(requireInternalToken).mockImplementation((req, res) => {
        res.status(401).json({ error: "unauthorized" });
        return false;
      });
      const res = makeRes();
      await itemHandler({ method: "PATCH", headers: {}, query: { id: "rec-1" }, body: {} }, res);
      expect(res.statusCode).toBe(401);
      expect(updateRecordById).not.toHaveBeenCalled();
    });

    it("updates a record on PATCH", async () => {
      vi.mocked(updateRecordById).mockResolvedValue(sampleRecord({ content: "2과" }));
      const res = makeRes();
      await itemHandler({ method: "PATCH", headers: {}, query: { id: "rec-1" }, body: { content: "2과" } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.record.content).toBe("2과");
    });

    it("responds 404 on PATCH when the id isn't found", async () => {
      vi.mocked(updateRecordById).mockResolvedValue(null);
      const res = makeRes();
      await itemHandler({ method: "PATCH", headers: {}, query: { id: "missing" }, body: {} }, res);
      expect(res.statusCode).toBe(404);
    });

    it("soft-deletes a record on DELETE", async () => {
      vi.mocked(softDeleteById).mockResolvedValue(sampleRecord({ deleted: "TRUE" }));
      const res = makeRes();
      await itemHandler({ method: "DELETE", headers: {}, query: { id: "rec-1" }, body: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ deleted: true });
    });

    it("responds 404 on DELETE when the id isn't found", async () => {
      vi.mocked(softDeleteById).mockResolvedValue(null);
      const res = makeRes();
      await itemHandler({ method: "DELETE", headers: {}, query: { id: "missing" }, body: {} }, res);
      expect(res.statusCode).toBe(404);
    });

    it("responds 502 when the Sheets API call fails", async () => {
      vi.mocked(updateRecordById).mockRejectedValue(new Error("boom"));
      const res = makeRes();
      await itemHandler({ method: "PATCH", headers: {}, query: { id: "rec-1" }, body: {} }, res);
      expect(res.statusCode).toBe(502);
    });

    it("responds 405 for unsupported methods", async () => {
      const res = makeRes();
      await itemHandler({ method: "GET", headers: {}, query: { id: "rec-1" }, body: {} }, res);
      expect(res.statusCode).toBe(405);
    });
  });
});
