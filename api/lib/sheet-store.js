import { randomUUID } from "node:crypto";
import { googleFetch } from "./google-auth.js";

// Writes below use valueInputOption=USER_ENTERED (needed so plain-text dates like
// "2026-09-10" become real date cells, matching how a teacher would type them).
// That same parsing also treats a cell starting with =, +, -, or @ as a formula —
// so any field is a live formula-injection vector unless neutralized first. A
// leading apostrophe is Sheets' own escape for "treat as text" and is stripped
// back off by the API on read, so this is transparent to round-tripped records.
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

function sanitizeCellValue(value) {
  if (value === "" || !FORMULA_TRIGGER_CHARS.has(value[0])) return value;
  return `'${value}`;
}

// Generic CRUD over a single Google Sheets tab whose header row lives at a fixed
// row number (not necessarily row 1 — e.g. tabs with a title/subtitle above the
// header) and whose columns are a fixed, ordered list of field keys. One of those
// keys must be "id" (its position doesn't matter — existing sheets we integrate
// with keep their own columns first and get an id column appended at the end).
export function createSheetStore({ sheetNameEnvVar, defaultSheetName, headerRow, columns }) {
  const idIndex = columns.indexOf("id");
  if (idIndex === -1) throw new Error('createSheetStore: columns must include "id"');

  const dataStartRow = headerRow + 1;
  const lastCol = columnLetter(columns.length);
  const idCol = columnLetter(idIndex + 1);

  function sheetName() {
    return process.env[sheetNameEnvVar] || defaultSheetName;
  }

  function spreadsheetBaseUrl() {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    return `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  }

  function rowToRecord(row) {
    return Object.fromEntries(columns.map((key, i) => [key, row[i] != null ? row[i] : ""]));
  }

  function recordToRow(record) {
    return columns.map((key) => sanitizeCellValue(record[key] != null ? String(record[key]) : ""));
  }

  async function fetchAllRows() {
    const range = encodeURIComponent(`${sheetName()}!A${dataStartRow}:${lastCol}`);
    const data = await googleFetch(`${spreadsheetBaseUrl()}/values/${range}`, { method: "GET" });
    return (data && data.values) || [];
  }

  // Rows that pre-date this app's involvement have real data but no "id" cell yet
  // (that column was newly appended to an existing, teacher-maintained table). Such a
  // row is adopted on first read: we assign it an id and write just that one cell back,
  // so it becomes visible and, from then on, editable/deletable like any other record.
  // A row with no data at all (every cell blank — the result of deleteById's :clear) is
  // treated as gone and skipped.
  async function listRecords() {
    const rows = await fetchAllRows();
    const records = [];
    const backfills = [];
    rows.forEach((row, index) => {
      const hasData = row.some((cell) => cell != null && String(cell).trim() !== "");
      if (!hasData) return;
      const record = rowToRecord(row);
      if (!record.id) {
        record.id = randomUUID();
        backfills.push({ rowNumber: dataStartRow + index, id: record.id });
      }
      records.push(record);
    });
    await Promise.all(
      backfills.map(({ rowNumber, id }) => {
        const range = encodeURIComponent(`${sheetName()}!${idCol}${rowNumber}`);
        return googleFetch(`${spreadsheetBaseUrl()}/values/${range}?valueInputOption=USER_ENTERED`, {
          method: "PUT",
          body: JSON.stringify({ values: [[id]] }),
        });
      })
    );
    return records;
  }

  async function appendRecord(record) {
    const range = encodeURIComponent(`${sheetName()}!A${headerRow}:${lastCol}`);
    await googleFetch(
      `${spreadsheetBaseUrl()}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [recordToRow(record)] }) }
    );
    return record;
  }

  // One combined read (to both locate the row and read its current contents) plus one
  // write — 2 round-trips, not 3. Rows are never physically reordered by updates, so a
  // row's index stays valid even if other rows are appended between a client's read and
  // write.
  async function updateRecordById(id, patch) {
    const rows = await fetchAllRows();
    const index = rows.findIndex((row) => row[idIndex] === id);
    if (index === -1) return null;
    const rowNumber = dataStartRow + index;
    const merged = Object.assign({}, rowToRecord(rows[index]), patch, { id });
    const range = encodeURIComponent(`${sheetName()}!A${rowNumber}:${lastCol}${rowNumber}`);
    await googleFetch(`${spreadsheetBaseUrl()}/values/${range}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ values: [recordToRow(merged)] }),
    });
    return merged;
  }

  // Hard delete: clears the row's values rather than tracking a soft-delete flag column
  // (these sheets are existing, teacher-maintained tables — we only append a hidden id
  // column, not a second one). A fully-blank row is skipped by listRecords() automatically.
  async function deleteById(id) {
    const rows = await fetchAllRows();
    const index = rows.findIndex((row) => row[idIndex] === id);
    if (index === -1) return null;
    const rowNumber = dataStartRow + index;
    const record = rowToRecord(rows[index]);
    const range = encodeURIComponent(`${sheetName()}!A${rowNumber}:${lastCol}${rowNumber}`);
    await googleFetch(`${spreadsheetBaseUrl()}/values/${range}:clear`, { method: "POST" });
    return record;
  }

  return { listRecords, appendRecord, updateRecordById, deleteById };
}

// 1 -> "A", 26 -> "Z", 27 -> "AA", ...
export function columnLetter(n) {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}
