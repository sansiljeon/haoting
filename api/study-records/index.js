import { randomUUID } from "node:crypto";
import { isGoogleConfigured, requireInternalToken } from "../lib/google-auth.js";
import { listRecords, appendRecord } from "../lib/google-sheets.js";

function isConfigured() {
  return isGoogleConfigured() && Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
}

export default async function handler(req, res) {
  if (!requireInternalToken(req, res)) return;

  if (!isConfigured()) {
    res.status(200).json({ skipped: true, reason: "sheets sync not configured", records: [] });
    return;
  }

  try {
    if (req.method === "GET") {
      const records = await listRecords();
      const studentId = req.query && req.query.studentId;
      const filtered = studentId ? records.filter((r) => r.studentId === studentId) : records;
      res.status(200).json({ records: filtered });
      return;
    }
    if (req.method === "POST") {
      const body = req.body || {};
      if (!body.studentId || !body.classDate) {
        res.status(400).json({ error: "studentId and classDate are required" });
        return;
      }
      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        studentId: body.studentId,
        studentName: body.studentName || "",
        classDate: body.classDate,
        registeredSessions: body.registeredSessions || "",
        classType: body.classType || "",
        content: body.content || "",
        comprehension: body.comprehension || "",
        participation: body.participation || "",
        improvement: body.improvement || "",
        homeworkSubmitted: body.homeworkSubmitted || "미제출",
        homeworkChecked: body.homeworkChecked || "미확인",
        feedback: body.feedback || "",
        createdAt: now,
        updatedAt: now,
        deleted: "FALSE",
      };
      await appendRecord(record);
      res.status(201).json({ record });
      return;
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    console.error("[api/study-records]", err);
    res.status(502).json({ error: "sheets sync failed" });
  }
}
