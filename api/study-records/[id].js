import { isGoogleConfigured, requireInternalToken } from "../lib/google-auth.js";
import { updateRecordById, softDeleteById } from "../lib/google-sheets.js";

function isConfigured() {
  return isGoogleConfigured() && Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
}

export default async function handler(req, res) {
  if (!requireInternalToken(req, res)) return;

  if (!isConfigured()) {
    res.status(200).json({ skipped: true, reason: "sheets sync not configured" });
    return;
  }

  const id = req.query && req.query.id;

  try {
    if (req.method === "PATCH") {
      const record = await updateRecordById(id, req.body || {});
      if (!record) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json({ record });
      return;
    }
    if (req.method === "DELETE") {
      const record = await softDeleteById(id);
      if (!record) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json({ deleted: true });
      return;
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    console.error("[api/study-records/:id]", err);
    res.status(502).json({ error: "sheets sync failed" });
  }
}
