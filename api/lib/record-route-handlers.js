import { randomUUID } from "node:crypto";
import { isGoogleConfigured, requireInternalToken } from "./google-auth.js";
import { requireFirebaseAuth } from "./firebase-auth.js";

// Shared HTTP-handler shape for a sheet-backed record resource (auth guard,
// configured check, and the request/response envelope). The two route pairs
// (study-records, homework-records) differ only in which sheet store they talk
// to and which fields a new record needs — everything else here was previously
// copy-pasted verbatim across both.
function isSheetsConfigured() {
  return isGoogleConfigured() && Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
}

// GET (optionally filtered by ?studentName=) + POST (requires studentName/classDate,
// builds the new record via `buildRecord`) for a record collection.
export function createListCreateHandler({ store, buildRecord, logTag }) {
  return async function handler(req, res) {
    if (!(await requireFirebaseAuth(req, res))) return;
    if (!requireInternalToken(req, res)) return;
    if (!isSheetsConfigured()) {
      res.status(200).json({ skipped: true, reason: "sheets sync not configured", records: [] });
      return;
    }
    try {
      if (req.method === "GET") {
        const records = await store.listRecords();
        const studentName = req.query && req.query.studentName;
        const filtered = studentName ? records.filter((r) => r.studentName === studentName) : records;
        res.status(200).json({ records: filtered });
        return;
      }
      if (req.method === "POST") {
        const body = req.body || {};
        if (!body.studentName || !body.classDate) {
          res.status(400).json({ error: "studentName and classDate are required" });
          return;
        }
        const record = { id: randomUUID(), ...buildRecord(body) };
        await store.appendRecord(record);
        res.status(201).json({ record });
        return;
      }
      res.status(405).json({ error: "method not allowed" });
    } catch (err) {
      console.error(`[${logTag}]`, err);
      res.status(502).json({ error: "sheets sync failed" });
    }
  };
}

// PATCH (partial update) + DELETE for a single record by id.
export function createItemHandler({ store, logTag }) {
  return async function handler(req, res) {
    if (!(await requireFirebaseAuth(req, res))) return;
    if (!requireInternalToken(req, res)) return;
    if (!isSheetsConfigured()) {
      res.status(200).json({ skipped: true, reason: "sheets sync not configured" });
      return;
    }
    const id = req.query && req.query.id;
    try {
      if (req.method === "PATCH") {
        const record = await store.updateRecordById(id, req.body || {});
        if (!record) {
          res.status(404).json({ error: "not found" });
          return;
        }
        res.status(200).json({ record });
        return;
      }
      if (req.method === "DELETE") {
        const record = await store.deleteById(id);
        if (!record) {
          res.status(404).json({ error: "not found" });
          return;
        }
        res.status(200).json({ deleted: true });
        return;
      }
      res.status(405).json({ error: "method not allowed" });
    } catch (err) {
      console.error(`[${logTag}]`, err);
      res.status(502).json({ error: "sheets sync failed" });
    }
  };
}
