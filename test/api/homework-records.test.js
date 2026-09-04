// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/lib/google-auth.js");
vi.mock("../../api/lib/firebase-auth.js");
vi.mock("../../api/lib/google-sheets-homework.js");

import { isGoogleConfigured, requireInternalToken } from "../../api/lib/google-auth.js";
import { requireFirebaseAuth } from "../../api/lib/firebase-auth.js";
import { listRecords, appendRecord, updateRecordById, deleteById } from "../../api/lib/google-sheets-homework.js";
import listCreateHandler from "../../api/homework-records/index.js";
import itemHandler from "../../api/homework-records/[id].js";

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
      classDate: "2026-09-10",
      classType: "일반 회화반",
      studentName: "홍길동",
      registeredSessions: "8",
      content: "여행 회화",
      homeworkText: "교재 12쪽 문장 10개",
      submitted: "완료",
      checked: "확인 완료",
      feedback: "시제 사용을 한 번 더 복습하세요.",
      recheck: "불필요",
      nextCheckDate: "",
      memo: "",
    },
    overrides
  );

describe("api/homework-records", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, GOOGLE_SHEETS_SPREADSHEET_ID: "sheet-id" };
    vi.mocked(requireFirebaseAuth).mockReset().mockResolvedValue(true);
    vi.mocked(requireInternalToken).mockReset().mockReturnValue(true);
    vi.mocked(isGoogleConfigured).mockReset().mockReturnValue(true);
    vi.mocked(listRecords).mockReset();
    vi.mocked(appendRecord).mockReset();
    vi.mocked(updateRecordById).mockReset();
    vi.mocked(deleteById).mockReset();
  });

  describe("GET/POST /api/homework-records", () => {
    it("returns 401 without calling Sheets when the Firebase ID token check fails", async () => {
      vi.mocked(requireFirebaseAuth).mockImplementation(async (req, res) => {
        res.status(401).json({ error: "unauthorized" });
        return false;
      });
      const res = makeRes();
      await listCreateHandler({ method: "GET", headers: {}, query: {} }, res);
      expect(res.statusCode).toBe(401);
      expect(requireInternalToken).not.toHaveBeenCalled();
      expect(listRecords).not.toHaveBeenCalled();
    });

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

    it("returns all records on GET with no filter", async () => {
      vi.mocked(listRecords).mockResolvedValue([sampleRecord({ id: "a" }), sampleRecord({ id: "b", studentName: "김민지" })]);
      const res = makeRes();
      await listCreateHandler({ method: "GET", headers: {}, query: {} }, res);
      expect(res.body.records).toHaveLength(2);
    });

    it("filters by studentName when provided", async () => {
      vi.mocked(listRecords).mockResolvedValue([
        sampleRecord({ id: "a", studentName: "홍길동" }),
        sampleRecord({ id: "b", studentName: "김민지" }),
      ]);
      const res = makeRes();
      await listCreateHandler({ method: "GET", headers: {}, query: { studentName: "김민지" } }, res);
      expect(res.body.records).toEqual([expect.objectContaining({ id: "b" })]);
    });

    it("responds 400 on POST when studentName or classDate is missing", async () => {
      const res = makeRes();
      await listCreateHandler({ method: "POST", headers: {}, query: {}, body: { studentName: "홍길동" } }, res);
      expect(res.statusCode).toBe(400);
      expect(appendRecord).not.toHaveBeenCalled();
    });

    it("creates a record on POST with valid input", async () => {
      vi.mocked(appendRecord).mockImplementation(async (record) => record);
      const res = makeRes();
      await listCreateHandler(
        { method: "POST", headers: {}, query: {}, body: { studentName: "홍길동", classDate: "2026-09-10" } },
        res
      );
      expect(res.statusCode).toBe(201);
      expect(res.body.record).toMatchObject({ studentName: "홍길동", classDate: "2026-09-10", submitted: "미제출", checked: "미확인" });
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

  describe("PATCH/DELETE /api/homework-records/:id", () => {
    it("returns 401 without calling Sheets when the Firebase ID token check fails", async () => {
      vi.mocked(requireFirebaseAuth).mockImplementation(async (req, res) => {
        res.status(401).json({ error: "unauthorized" });
        return false;
      });
      const res = makeRes();
      await itemHandler({ method: "PATCH", headers: {}, query: { id: "rec-1" }, body: {} }, res);
      expect(res.statusCode).toBe(401);
      expect(requireInternalToken).not.toHaveBeenCalled();
      expect(updateRecordById).not.toHaveBeenCalled();
    });

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
      vi.mocked(updateRecordById).mockResolvedValue(sampleRecord({ checked: "재제출 필요" }));
      const res = makeRes();
      await itemHandler({ method: "PATCH", headers: {}, query: { id: "rec-1" }, body: { checked: "재제출 필요" } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.record.checked).toBe("재제출 필요");
    });

    it("responds 404 on PATCH when the id isn't found", async () => {
      vi.mocked(updateRecordById).mockResolvedValue(null);
      const res = makeRes();
      await itemHandler({ method: "PATCH", headers: {}, query: { id: "missing" }, body: {} }, res);
      expect(res.statusCode).toBe(404);
    });

    it("deletes a record on DELETE", async () => {
      vi.mocked(deleteById).mockResolvedValue(sampleRecord());
      const res = makeRes();
      await itemHandler({ method: "DELETE", headers: {}, query: { id: "rec-1" }, body: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ deleted: true });
    });

    it("responds 404 on DELETE when the id isn't found", async () => {
      vi.mocked(deleteById).mockResolvedValue(null);
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
