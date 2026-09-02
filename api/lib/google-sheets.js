import { googleFetch } from "./google-auth.js";

const SHEET_NAME = process.env.GOOGLE_SHEETS_SHEET_NAME || "학습기록";

// Column order for the "학습·숙제 기록" sheet tab (header row A1:P1). Kept in sync
// with the header row documented in README.md — reorder there too if you change this.
export const COLUMNS = [
  "id",
  "studentId",
  "studentName",
  "classDate",
  "registeredSessions",
  "classType",
  "content",
  "comprehension",
  "participation",
  "improvement",
  "homeworkSubmitted",
  "homeworkChecked",
  "feedback",
  "createdAt",
  "updatedAt",
  "deleted",
];

function spreadsheetBaseUrl() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  return `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
}

function rowToRecord(row) {
  return Object.fromEntries(COLUMNS.map((key, i) => [key, row[i] != null ? row[i] : ""]));
}

function recordToRow(record) {
  return COLUMNS.map((key) => (record[key] != null ? String(record[key]) : ""));
}

async function fetchAllRows() {
  const range = encodeURIComponent(`${SHEET_NAME}!A2:P`);
  const data = await googleFetch(`${spreadsheetBaseUrl()}/values/${range}`, { method: "GET" });
  return (data && data.values) || [];
}

export async function listRecords() {
  const rows = await fetchAllRows();
  return rows.map(rowToRecord).filter((record) => record.id && record.deleted !== "TRUE");
}

export async function appendRecord(record) {
  const range = encodeURIComponent(`${SHEET_NAME}!A:P`);
  await googleFetch(
    `${spreadsheetBaseUrl()}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [recordToRow(record)] }) }
  );
  return record;
}

// One combined read (to both locate the row and read its current contents) plus one
// write — 2 round-trips, not 3. Rows are never physically deleted/reordered (see
// softDeleteById), so a row's index stays valid even if other rows are appended
// between a client's read and write.
export async function updateRecordById(id, patch) {
  const rows = await fetchAllRows();
  const index = rows.findIndex((row) => row[0] === id);
  if (index === -1) return null;
  const rowNumber = index + 2; // header row + 1-based row numbering
  const merged = Object.assign({}, rowToRecord(rows[index]), patch, {
    updatedAt: new Date().toISOString(),
  });
  const range = encodeURIComponent(`${SHEET_NAME}!A${rowNumber}:P${rowNumber}`);
  await googleFetch(`${spreadsheetBaseUrl()}/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [recordToRow(merged)] }),
  });
  return merged;
}

export function softDeleteById(id) {
  return updateRecordById(id, { deleted: "TRUE" });
}
