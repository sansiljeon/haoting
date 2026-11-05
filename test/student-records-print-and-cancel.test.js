// app.js 는 export 가 없는 IIFE 라, index.html 을 jsdom 에 올리고 app.js 를 그대로 실행한 뒤
// window.HaotingDB / fetch 를 가짜로 바꿔 실제 클릭 흐름을 검증합니다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const html = readFileSync(join(publicDir, 'index.html'), 'utf-8').replace(
  /<script[^>]*src=[^>]*><\/script>/g,
  ''
);
const appJs = readFileSync(join(publicDir, 'app.js'), 'utf-8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOMEWORK = [
  { id: 'h1', studentName: '홍길동', classDate: '2026-10-02', homeworkText: '단어 20개', feedback: '잘함', memo: '내부메모H', submitted: '완료', checked: '확인 완료' },
  { id: 'h2', studentName: '홍길동', classDate: '2026-10-09', homeworkText: '문장 만들기', memo: '' },
  { id: 'h3', studentName: '김철수', classDate: '2026-10-03', homeworkText: '다른 학생 숙제' },
];
const STUDY = [
  { id: 's1', studentName: '홍길동', classDate: '2026-10-02', topic: '성조', content: '1~4성', teacherMemo: '내부메모S' },
];

let dom;

async function bootApp({ students } = {}) {
  dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  const updates = [];
  let current = students || [
    {
      id: 'stu1',
      name: '홍길동',
      isActive: true,
      registeredSessions: 4,
      registrationDate: '2026-10-01',
      assignedInstructor: '왕선생',
      sessionRecords: [{ sessionNumber: 1, sessionDate: '2026-11-03', startTime: '10:00', endTime: '11:00' }],
    },
  ];
  let studentsCb = null;
  w.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/api/homework-records')) return { ok: true, json: async () => ({ records: HOMEWORK }) };
    if (u.includes('/api/study-records')) return { ok: true, json: async () => ({ records: STUDY }) };
    return { ok: true, json: async () => ({ skipped: true }) };
  });
  w.HaotingDB = {
    isReady: () => true,
    configError: () => null,
    getIdToken: async () => 'token',
    subscribeAuthState(cb) {
      setTimeout(() => cb({ uid: 'u1', email: 'a@b.c' }), 0);
      return () => {};
    },
    subscribeStudents(cb) {
      studentsCb = cb;
      setTimeout(() => cb(current), 0);
      return () => {};
    },
    subscribeStudentTabs(cb) {
      setTimeout(() => cb([]), 0);
      return () => {};
    },
    subscribeCounselingRecords(cb) {
      setTimeout(() => cb([]), 0);
      return () => {};
    },
    seedIfEmpty: async () => {},
    updateStudent: async (id, patch) => {
      updates.push({ id, patch });
      current = current.map((s) => (s.id === id ? Object.assign({}, s, patch) : s));
      setTimeout(() => studentsCb && studentsCb(current), 0);
    },
  };
  w.eval(appJs);
  await sleep(50);
  return { w, d: w.document, updates };
}

afterEach(() => {
  if (dom) dom.window.close();
  dom = null;
});

describe('학생 관리 → 숙제/학습 기록 바로 보기', () => {
  it('학생 목록 행의 기록 버튼을 누르면 해당 학생 기록 모달이 열린다', async () => {
    const { d } = await bootApp();
    const btn = d.querySelector('.action-records[data-id="stu1"]');
    expect(btn).not.toBeNull();
    btn.click();
    await sleep(30);
    const modal = d.getElementById('student-records-modal');
    expect(modal.classList.contains('modal-open')).toBe(true);
    expect(d.getElementById('student-records-modal-title').textContent).toContain('홍길동');
    const body = d.getElementById('student-records-modal-body').textContent;
    expect(body).toContain('단어 20개');
    expect(body).not.toContain('다른 학생 숙제');
  });

  it('기록 버튼 클릭이 행 클릭(상세 모달 열기)으로 번지지 않는다', async () => {
    const { d } = await bootApp();
    d.querySelector('.action-records[data-id="stu1"]').click();
    await sleep(10);
    expect(d.getElementById('student-detail-modal').classList.contains('modal-open')).toBe(false);
  });

  it('학생 상세 모달의 "숙제/학습 기록" 버튼으로 기록 모달로 넘어간다', async () => {
    const { d } = await bootApp();
    d.querySelector('.student-row[data-id="stu1"]').click();
    await sleep(20);
    expect(d.getElementById('student-detail-modal').classList.contains('modal-open')).toBe(true);
    d.getElementById('student-detail-records-btn').click();
    await sleep(20);
    expect(d.getElementById('student-detail-modal').classList.contains('modal-open')).toBe(false);
    expect(d.getElementById('student-records-modal').classList.contains('modal-open')).toBe(true);
  });
});

describe('숙제/학습 기록 프린트', () => {
  async function openRecordsAndPrint({ includeMemo = false, popup = true } = {}) {
    const ctx = await bootApp();
    const { w, d } = ctx;
    let written = '';
    const fakeWin = {
      document: { open() {}, write: (s) => (written += s), close() {} },
      focus: vi.fn(),
      print: vi.fn(),
    };
    w.open = vi.fn(() => (popup ? fakeWin : null));
    d.querySelector('.action-records[data-id="stu1"]').click();
    await sleep(30);
    d.getElementById('student-records-print-include-memo').checked = includeMemo;
    d.getElementById('student-records-print-btn').click();
    await sleep(300);
    return { ...ctx, fakeWin, written: () => written };
  }

  it('해당 학생 기록만 오래된 순으로 담은 문서를 열고 인쇄 창을 띄운다', async () => {
    const { fakeWin, written } = await openRecordsAndPrint();
    const out = written();
    expect(out).toContain('홍길동 숙제·학습 기록');
    expect(out).toContain('숙제 기록 (2건)');
    expect(out).toContain('학습 기록 (1건)');
    expect(out).not.toContain('다른 학생 숙제');
    expect(out.indexOf('단어 20개')).toBeLessThan(out.indexOf('문장 만들기'));
    expect(fakeWin.print).toHaveBeenCalled();
  });

  it('메모 포함을 끄면 내부 메모는 빠진다', async () => {
    const { written } = await openRecordsAndPrint({ includeMemo: false });
    expect(written()).not.toContain('내부메모H');
    expect(written()).not.toContain('내부메모S');
  });

  it('메모 포함을 켜면 내부 메모도 출력된다', async () => {
    const { written } = await openRecordsAndPrint({ includeMemo: true });
    expect(written()).toContain('내부메모H');
    expect(written()).toContain('내부메모S');
  });

  it('팝업이 차단되면 안내 토스트를 띄운다', async () => {
    const { d } = await openRecordsAndPrint({ popup: false });
    expect(d.getElementById('toast').textContent).toContain('팝업이 차단');
  });
});

describe('휴강/취소', () => {
  it('회차 패널의 휴강/취소 체크가 isCancelled 로 저장되고, 다시 누르면 해제된다', async () => {
    const { d, updates } = await bootApp();
    d.querySelector('.action-sessions[data-id="stu1"]').click();
    await sleep(10);
    d.querySelector('.session-tab-button[data-session-number="1"]').click();
    await sleep(10);
    d.querySelector('.session-cancel-toggle').click();
    await sleep(30);
    expect(updates.at(-1).patch.sessionRecords[0].isCancelled).toBe(true);
    expect(d.querySelector('.session-cancel-check').checked).toBe(true);
    d.querySelector('.session-cancel-toggle').click();
    await sleep(30);
    expect(updates.at(-1).patch.sessionRecords[0].isCancelled).toBe(false);
  });

  it('휴강 회차는 회차 버튼에 휴강 표시(취소선)가 붙는다', async () => {
    const { d } = await bootApp({
      students: [
        {
          id: 'stu1',
          name: '홍길동',
          isActive: true,
          registeredSessions: 4,
          sessionRecords: [
            { sessionNumber: 1, sessionDate: '2026-11-03', startTime: '10:00', endTime: '11:00', isCancelled: true },
          ],
        },
      ],
    });
    d.querySelector('.action-sessions[data-id="stu1"]').click();
    await sleep(10);
    const tab1 = d.querySelector('.session-tab-button[data-session-number="1"]');
    const tab2 = d.querySelector('.session-tab-button[data-session-number="2"]');
    expect(tab1.className).toContain('line-through');
    expect(tab2.className).not.toContain('line-through');
  });

  it('캘린더 날짜 팝업의 휴강/취소 버튼으로 휴강 처리하고, 휴강 해제로 되돌린다', async () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const { d, updates } = await bootApp({
      students: [
        {
          id: 'stu1',
          name: '홍길동',
          isActive: true,
          registeredSessions: 4,
          sessionRecords: [{ sessionNumber: 1, sessionDate: iso, startTime: '10:00', endTime: '11:00' }],
        },
      ],
    });
    d.querySelector('button.nav-item[data-route="calendar"]').click();
    await sleep(20);
    d.querySelector(`.calendar-event-chip[data-calendar-date="${iso}"]`).click();
    await sleep(20);
    const btn = d.querySelector('.calendar-toggle-cancel[data-student-id="stu1"]');
    expect(btn.textContent).toContain('휴강/취소');
    btn.click();
    await sleep(30);
    expect(updates.at(-1).patch.sessionRecords[0].isCancelled).toBe(true);
    const undo = d.querySelector('.calendar-toggle-cancel[data-student-id="stu1"]');
    expect(undo.textContent).toContain('휴강 해제');
    undo.click();
    await sleep(30);
    expect(updates.at(-1).patch.sessionRecords[0].isCancelled).toBe(false);
  });
});
