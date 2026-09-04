// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/lib/google-auth.js");

import { googleFetch } from "../../api/lib/google-auth.js";
import { createSheetStore, columnLetter } from "../../api/lib/sheet-store.js";

const ORIGINAL_ENV = { ...process.env };

describe("columnLetter", () => {
  it("converts 1-based column numbers to spreadsheet letters", () => {
    expect(columnLetter(1)).toBe("A");
    expect(columnLetter(3)).toBe("C");
    expect(columnLetter(26)).toBe("Z");
    expect(columnLetter(27)).toBe("AA");
  });
});

describe("createSheetStore", () => {
  const store = createSheetStore({
    sheetNameEnvVar: "TEST_SHEET_NAME",
    defaultSheetName: "기본시트",
    headerRow: 4,
    columns: ["a", "b", "id"],
  });

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, GOOGLE_SHEETS_SPREADSHEET_ID: "sheet-id" };
    vi.mocked(googleFetch).mockReset();
  });

  it("uses the default sheet name when the env var isn't set", async () => {
    delete process.env.TEST_SHEET_NAME;
    vi.mocked(googleFetch).mockResolvedValue({ values: [] });
    await store.listRecords();
    expect(googleFetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("기본시트!A5:C")),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("uses the env var's sheet name when set, reading from headerRow+1", async () => {
    process.env.TEST_SHEET_NAME = "커스텀시트";
    vi.mocked(googleFetch).mockResolvedValue({ values: [] });
    await store.listRecords();
    expect(googleFetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("커스텀시트!A5:C")),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("lists records and drops fully-blank rows", async () => {
    vi.mocked(googleFetch).mockResolvedValue({
      values: [
        ["x1", "y1", "id-1"],
        ["", "", ""],
      ],
    });
    const records = await store.listRecords();
    expect(records).toEqual([{ a: "x1", b: "y1", id: "id-1" }]);
  });

  it("backfills an id for a pre-existing row that has data but no id yet", async () => {
    process.env.TEST_SHEET_NAME = "커스텀시트";
    vi.mocked(googleFetch)
      .mockResolvedValueOnce({
        values: [
          ["x1", "y1", "id-1"],
          ["x2", "y2", ""],
        ],
      })
      .mockResolvedValueOnce({});
    const records = await store.listRecords();
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ a: "x1", b: "y1", id: "id-1" });
    expect(records[1]).toMatchObject({ a: "x2", b: "y2" });
    expect(records[1].id).toBeTruthy();
    expect(googleFetch).toHaveBeenLastCalledWith(
      expect.stringContaining(encodeURIComponent("커스텀시트!C6")),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ values: [[records[1].id]] }) })
    );
  });

  it("appends a new row to the header-row-anchored range", async () => {
    process.env.TEST_SHEET_NAME = "커스텀시트";
    vi.mocked(googleFetch).mockResolvedValue({});
    await store.appendRecord({ a: "x1", b: "y1", id: "id-1" });
    expect(googleFetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("커스텀시트!A4:C") + ":append"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ values: [["x1", "y1", "id-1"]] }) })
    );
  });

  it("updates the matching row by id and preserves the id field", async () => {
    process.env.TEST_SHEET_NAME = "커스텀시트";
    vi.mocked(googleFetch)
      .mockResolvedValueOnce({
        values: [
          ["x1", "y1", "id-1"],
          ["x2", "y2", "id-2"],
        ],
      })
      .mockResolvedValueOnce({});
    const result = await store.updateRecordById("id-2", { b: "updated" });
    expect(result).toEqual({ a: "x2", b: "updated", id: "id-2" });
    expect(googleFetch).toHaveBeenLastCalledWith(
      expect.stringContaining(encodeURIComponent("커스텀시트!A6:C6")),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ values: [["x2", "updated", "id-2"]] }) })
    );
  });

  it("returns null from updateRecordById when the id isn't found", async () => {
    vi.mocked(googleFetch).mockResolvedValue({ values: [["x1", "y1", "id-1"]] });
    const result = await store.updateRecordById("missing", { b: "updated" });
    expect(result).toBeNull();
  });

  it("clears the matching row's values on deleteById and returns the prior record", async () => {
    process.env.TEST_SHEET_NAME = "커스텀시트";
    vi.mocked(googleFetch)
      .mockResolvedValueOnce({
        values: [
          ["x1", "y1", "id-1"],
          ["x2", "y2", "id-2"],
        ],
      })
      .mockResolvedValueOnce({});
    const result = await store.deleteById("id-1");
    expect(result).toEqual({ a: "x1", b: "y1", id: "id-1" });
    expect(googleFetch).toHaveBeenLastCalledWith(
      expect.stringContaining(encodeURIComponent("커스텀시트!A5:C5") + ":clear"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns null from deleteById when the id isn't found", async () => {
    vi.mocked(googleFetch).mockResolvedValue({ values: [["x1", "y1", "id-1"]] });
    const result = await store.deleteById("missing");
    expect(result).toBeNull();
  });

  it("throws at setup time when columns doesn't include an id key", () => {
    expect(() => createSheetStore({ sheetNameEnvVar: "X", defaultSheetName: "y", headerRow: 1, columns: ["a", "b"] })).toThrow();
  });

  describe("formula-injection guard", () => {
    it.each([
      ["=HYPERLINK(\"http://evil.example\")", "'=HYPERLINK(\"http://evil.example\")"],
      ["+1+1", "'+1+1"],
      ["-1", "'-1"],
      ["@SUM(A1)", "'@SUM(A1)"],
      ["\ttabbed", "'\ttabbed"],
    ])("prefixes a leading %j with an apostrophe before appendRecord writes it", async (raw, expected) => {
      vi.mocked(googleFetch).mockResolvedValue({});
      await store.appendRecord({ a: raw, b: "y1", id: "id-1" });
      expect(googleFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify({ values: [[expected, "y1", "id-1"]] }) })
      );
    });

    it("leaves ordinary text (including embedded, non-leading formula characters) untouched", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});
      await store.appendRecord({ a: "normal text = still fine", b: "y1", id: "id-1" });
      expect(googleFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify({ values: [["normal text = still fine", "y1", "id-1"]] }) })
      );
    });

    it("also sanitizes updateRecordById writes", async () => {
      vi.mocked(googleFetch)
        .mockResolvedValueOnce({ values: [["x1", "y1", "id-1"]] })
        .mockResolvedValueOnce({});
      await store.updateRecordById("id-1", { b: "=IMPORTXML(\"http://evil.example\",\"//*\")" });
      expect(googleFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ values: [["x1", "'=IMPORTXML(\"http://evil.example\",\"//*\")", "id-1"]] }),
        })
      );
    });
  });
});
