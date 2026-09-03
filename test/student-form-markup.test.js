import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8');

describe('student form markup', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  it('renders a schedule memo field distinct from the general notes field', () => {
    const memoField = document.getElementById('f-schedule-memo');
    const notesField = document.getElementById('f-notes');
    const memoLabel = document.querySelector('label[for="f-schedule-memo"]');

    expect(memoField).not.toBeNull();
    expect(memoField.tagName).toBe('TEXTAREA');
    expect(memoField.getAttribute('name')).toBe('scheduleMemo');
    expect(memoLabel).not.toBeNull();
    expect(memoLabel.textContent).toContain('일정 메모');
    expect(notesField).not.toBeNull();
    expect(notesField.getAttribute('name')).toBe('notes');
  });

  it('places the schedule memo field near the schedule days section', () => {
    const scheduleDaysWrap = document.getElementById('f-schedule-days');
    const memoField = document.getElementById('f-schedule-memo');

    expect(scheduleDaysWrap.compareDocumentPosition(memoField) & 4 /* DOCUMENT_POSITION_FOLLOWING */).toBeTruthy();
  });
});
