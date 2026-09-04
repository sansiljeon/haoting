import { createSheetStore } from "./sheet-store.js";

// Column order for the existing "숙제 기록" sheet tab (header row 4, data from row 5).
// Matches the teachers' pre-existing table (HomeworkLog) plus one appended "id" column
// used only by this app for edit/delete tracking. Keep in sync with README.md.
export const COLUMNS = [
  "classDate",
  "classType",
  "studentName",
  "registeredSessions",
  "content",
  "homeworkText",
  "submitted",
  "checked",
  "feedback",
  "recheck",
  "nextCheckDate",
  "memo",
  "id",
];

const store = createSheetStore({
  sheetNameEnvVar: "GOOGLE_SHEETS_HOMEWORK_SHEET_NAME",
  defaultSheetName: "숙제 기록",
  headerRow: 4,
  columns: COLUMNS,
});

export const { listRecords, appendRecord, updateRecordById, deleteById } = store;
