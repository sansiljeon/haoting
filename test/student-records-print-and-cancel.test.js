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

describe('학습/숙제 기록 화면 — 탭 없이 한 페이지', () => {
  async function openRecordsPage() {
    const ctx = await bootApp();
    ctx.d.querySelector('button.nav-item[data-route="records"]').click();
    await sleep(40);
    return ctx;
  }

  it('숙제 기록과 학습 기록이 탭 없이 한 화면에 함께 보인다', async () => {
    const { d } = await openRecordsPage();
    expect(d.querySelector('.records-tab-btn')).toBeNull();
    expect(d.getElementById('homework-form')).not.toBeNull();
    expect(d.getElementById('study-form')).not.toBeNull();
    // 숙제 3건(h1~h3), 학습 1건(s1)이 각 표에 함께 그려진다.
    expect(d.querySelectorAll('.homework-edit').length).toBe(3);
    expect(d.querySelectorAll('.study-edit').length).toBe(1);
  });

  it('바로가기 버튼이 학습 기록 섹션으로 스크롤한다', async () => {
    const { w, d } = await openRecordsPage();
    const scrolled = vi.fn();
    w.HTMLElement.prototype.scrollIntoView = scrolled;
    d.querySelector('.records-jump-btn[data-records-jump="records-study-section"]').click();
    expect(scrolled).toHaveBeenCalled();
  });

  it('숙제 폼에 쓰던 내용이 학습 쪽 필터 변경(다시 그리기) 후에도 남아 있다', async () => {
    const { w, d } = await openRecordsPage();
    const ta = d.getElementById('hf-feedback');
    ta.value = '쓰던 피드백';
    ta.dispatchEvent(new w.Event('input', { bubbles: true }));
    const studyFilter = d.getElementById('study-class-type-filter') || d.getElementById('study-student-filter');
    studyFilter.value = studyFilter.options[studyFilter.options.length - 1].value;
    studyFilter.dispatchEvent(new w.Event('change', { bubbles: true }));
    await sleep(10);
    expect(d.getElementById('hf-feedback').value).toBe('쓰던 피드백');
  });
});

describe('날짜별 진도 한눈에 보기', () => {
  async function openRecordsPage() {
    const ctx = await bootApp();
    ctx.d.querySelector('button.nav-item[data-route="records"]').click();
    await sleep(40);
    return ctx;
  }

  it('같은 날 같은 학생의 학습·숙제 기록을 한 줄로 묶는다', async () => {
    const { d } = await openRecordsPage();
    const rows = Array.from(d.querySelectorAll('#records-daily-section .daily-record-row'));
    // 홍길동 10/02(학습+숙제), 홍길동 10/09(숙제만), 김철수 10/03(숙제만) → 3줄
    expect(rows.length).toBe(3);
    const oct2 = rows.find((r) => r.textContent.includes('2026.10.02'));
    expect(oct2.querySelector('.daily-study-cell').textContent).toContain('성조');
    expect(oct2.querySelector('.daily-homework-cell').textContent).toContain('단어 20개');
  });

  it('최신 날짜가 맨 위에 오고, 한쪽 기록이 없으면 "기록 없음"으로 표시한다', async () => {
    const { d } = await openRecordsPage();
    const rows = Array.from(d.querySelectorAll('#records-daily-section .daily-record-row'));
    expect(rows[0].textContent).toContain('2026.10.09');
    expect(rows[0].querySelector('.daily-study-cell').textContent).toContain('학습 기록 없음');
  });

  it('학생 필터로 한 학생만 볼 수 있다', async () => {
    const { w, d } = await openRecordsPage();
    const sel = d.getElementById('daily-student-filter');
    sel.value = '김철수';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await sleep(10);
    const rows = d.querySelectorAll('#records-daily-section .daily-record-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('다른 학생 숙제');
  });

  it('학생별 기록 창에도 그 학생의 날짜별 진도가 학생 칸 없이 나온다', async () => {
    const { d } = await bootApp();
    d.querySelector('.action-records[data-id="stu1"]').click();
    await sleep(30);
    const body = d.getElementById('student-records-modal-body');
    const rows = body.querySelectorAll('.daily-record-row');
    expect(rows.length).toBe(2);
    expect(body.textContent).not.toContain('다른 학생 숙제');
    expect(body.querySelector('.daily-records-table thead').textContent).not.toContain('학생');
  });

  it('기록을 불러오지 못하면 "기록 없음" 대신 실패 안내를 보여준다', async () => {
    const ctx = await bootApp();
    ctx.w.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    ctx.d.querySelector('button.nav-item[data-route="records"]').click();
    await sleep(40);
    expect(ctx.d.getElementById('records-daily-section').textContent).toContain('불러오지 못했습니다');
  });
});

describe('학생별 기록 모달 — 다시 그려져도 입력 유지', () => {
  it('모달 숙제 폼에 쓰던 내용이 render() 후에도 남아 있다', async () => {
    const { w, d } = await bootApp();
    d.querySelector('.action-records[data-id="stu1"]').click();
    await sleep(30);
    const ta = d.getElementById('mhf-feedback');
    ta.value = '모달에서 쓰던 내용';
    ta.dispatchEvent(new w.Event('input', { bubbles: true }));
    // 다른 화면 이벤트로 render() 가 돌게 만든다(회차 패널 열기).
    d.querySelector('.action-sessions[data-id="stu1"]').click();
    await sleep(10);
    expect(d.getElementById('mhf-feedback').value).toBe('모달에서 쓰던 내용');
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

describe('리뷰 지적 수정 — 회귀 테스트', () => {
  it('기록 불러오기에 실패하면 프린트를 막고 안내한다("기록 없음" 문서가 나가지 않게)', async () => {
    const ctx = await bootApp();
    ctx.w.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    ctx.w.open = vi.fn();
    ctx.d.querySelector('.action-records[data-id="stu1"]').click();
    await sleep(40);
    ctx.d.getElementById('student-records-print-btn').click();
    await sleep(10);
    expect(ctx.w.open).not.toHaveBeenCalled();
    expect(ctx.d.getElementById('toast').textContent).toContain('불러오지 못해');
  });

  it('기록 창에서 숙제를 저장한 뒤에도 학생 칸이 그 학생으로 유지된다', async () => {
    const { w, d } = await bootApp();
    d.querySelector('.action-records[data-id="stu1"]').click();
    await sleep(40);
    const form = d.getElementById('mhf-form');
    expect(d.getElementById('mhf-student').value).toBe('stu1');
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await sleep(40);
    const posted = w.fetch.mock.calls.find(([, opt]) => opt && opt.method === 'POST');
    expect(posted).toBeTruthy();
    expect(JSON.parse(posted[1].body).studentName).toBe('홍길동');
    expect(d.getElementById('mhf-student').value).toBe('stu1');
  });

  it('기록 창에서 수정 취소를 눌러도 학생 칸이 비지 않는다', async () => {
    const { d } = await bootApp();
    d.querySelector('.action-records[data-id="stu1"]').click();
    await sleep(40);
    d.querySelector('.msf-edit').click();
    await sleep(10);
    d.getElementById('msf-cancel-edit').click();
    await sleep(10);
    expect(d.getElementById('msf-student').value).toBe('stu1');
  });

  it('ESC 로 학생별 기록 창이 닫힌다', async () => {
    const { w, d } = await bootApp();
    d.querySelector('.action-records[data-id="stu1"]').click();
    await sleep(30);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(10);
    expect(d.getElementById('student-records-modal').classList.contains('modal-open')).toBe(false);
  });

  describe('동명이인', () => {
    const twins = [
      { id: 'a', name: '홍길동', isActive: true, registeredSessions: 4, assignedInstructor: '왕' },
      { id: 'b', name: '홍길동', isActive: true, registeredSessions: 4, assignedInstructor: '李' },
    ];

    it('기록 화면에서 이름을 누르면 엉뚱한 학생을 열지 않고 안내한다', async () => {
      const { d } = await bootApp({ students: twins });
      d.querySelector('button.nav-item[data-route="records"]').click();
      await sleep(40);
      d.querySelector('.records-row-student-name[data-student-name="홍길동"]').click();
      await sleep(10);
      expect(d.getElementById('student-records-modal').classList.contains('modal-open')).toBe(false);
      expect(d.getElementById('toast').textContent).toContain('2명');
    });

    it('기록 창에 동명이인 경고를 보여준다', async () => {
      const { d } = await bootApp({ students: twins });
      d.querySelector('.action-records[data-id="b"]').click();
      await sleep(30);
      expect(d.querySelector('.student-records-duplicate-warning')).not.toBeNull();
    });

    it('이름이 하나뿐이면 경고가 없다', async () => {
      const { d } = await bootApp();
      d.querySelector('.action-records[data-id="stu1"]').click();
      await sleep(30);
      expect(d.querySelector('.student-records-duplicate-warning')).toBeNull();
    });
  });
});
