/* ============================================================
 * 하오팅 중국어 관리자 시스템 - app.js
 *  - 순수 Vanilla JS (모듈 X, 단일 파일)
 *  - 학생 데이터: Firebase Firestore (window.HaotingDB 어댑터 사용)
 *  - 로그인 세션: localStorage (기기별)
 *  - 화면 전환: 메인 영역(#main-view) DOM 교체 방식의 SPA
 * ============================================================ */
(function () {
  "use strict";

  /* ==========================================================
   * 1. 상수 / 상태
   * ========================================================== */
  // 이전 버전(로컬 저장 전용) 의 학생 데이터 키 — Firestore 가 비어 있을 때
  // 한 번 마이그레이션해 올리는 용도로만 참조합니다.
  const LEGACY_STUDENTS_KEY = "haoting:students:v1";
  const STORAGE_SESSION_KEY = "haoting:session:v1";

  // 하오팅 중국어의 두 분 강사 (단일 출처). 학생 폼 select 옵션과 동기화됩니다.
  const INSTRUCTORS = ["박환희", "김정화"];

  /** 수업 요일 칩 순서 및 저장 시 요일 배열 정렬에 사용 (월 시작). 유동 단독 선택은 따로 처리합니다. */
  const SCHEDULE_DAY_DISPLAY_ORDER = ["월", "화", "수", "목", "금", "토", "일"];
  /** 커리큘럼 select 옵션 값 (index.html 의 option value 와 동기화). */
  const CURRICULUM_OPTIONS = [
    "유아",
    "초1,2",
    "초3,4",
    "초5,6",
    "기초 중국어",
    "회화 입문",
    "회화 초급",
    "회화 중급",
    "회화 고급",
    "HSK 3급",
    "HSK 4급",
    "HSK 5급",
    "HSK 6급",
  ];
  const SCHEDULE_FLEXIBLE_DAY = "유동";

  // 하오팅 중국어 선생님 계정 (백엔드가 없으므로 코드에 하드코딩).
  // 실서비스 인증이 아닌 "내부용 소프트 게이트" 입니다.
  const ACCOUNTS = [
    {
      username: "admin1",
      password: "haoting1234",
      displayName: "박환희 선생님",
      instructorName: "박환희",
      email: "admin1@haoting.kr",
    },
    {
      username: "admin2",
      password: "haoting1234",
      displayName: "김정화 선생님",
      instructorName: "김정화",
      email: "admin2@haoting.kr",
    },
  ];

  const state = {
    route: "students", // "students" | "sales"
    students: [],
    isStudentsLoading: true, // Firestore 첫 스냅샷 도착 전까지 true
    filter: "all", // "all" | "active"
    keyword: "",
    editingId: null, // 모달이 수정 모드일 때의 학생 id
    pendingDeleteId: null, // 확인 모달에서 삭제 대상
    salesFilter: "all", // 매출 화면 필터: "all" | "active"
    currentUser: null, // 로그인 한 선생님 정보 (없으면 비로그인)
    expandedRowIds: new Set(), // 모바일에서 인라인 확장된 학생 행 id 들
  };

  // Firestore 구독 해제 함수. 여러 번 구독되지 않도록 한 곳에서 보관합니다.
  let unsubscribeStudents = null;

  /* ==========================================================
   * 2. 더미 데이터
   * ========================================================== */
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  const DUMMY_STUDENTS = [
    {
      id: "stu-0001",
      name: "김민서",
      assignedInstructor: "박환희",
      registeredSessions: 20,
      registrationDate: "2026-02-10",
      lastClassDate: "2026-05-06",
      notes: "비즈니스 회화 중심 수업 희망. 주 2회 화/목 19:00.",
      location: "강남 본원 302호",
      durationMinutes: 60,
      tuitionFee: 720000,
      contact: "010-1234-5678",
      inflowChannel: "인스타그램 광고",
      region: "서울 강남구",
      curriculum: "新실용중국어회화 중급 2",
      leaveReason: "",
      isActive: true,
      progress: "Lesson 8 / 12 진행 중. 발음 교정 단계.",
      homework: "Lesson 8 단어 50개 암기, 본문 낭독 녹음 제출",
      scheduleDays: ["화", "목"],
    },
    {
      id: "stu-0002",
      name: "박지훈",
      assignedInstructor: "김정화",
      registeredSessions: 12,
      registrationDate: "2026-03-22",
      lastClassDate: "2026-05-08",
      notes: "HSK 4급 단기 합격 목표. 어휘 보강 필요.",
      location: "온라인 (Zoom)",
      durationMinutes: 50,
      tuitionFee: 480000,
      contact: "010-2222-3344",
      inflowChannel: "지인 추천",
      region: "경기 성남시",
      curriculum: "HSK 4급 종합반",
      leaveReason: "",
      isActive: true,
      progress: "독해 정답률 72%, 듣기 64%. 모의고사 2회 완료.",
      homework: "기출 듣기 PART 2 풀이, 빈출 어휘 100개 정리",
      scheduleDays: ["월", "수", "토"],
    },
    {
      id: "stu-0003",
      name: "정수아",
      assignedInstructor: "박환희",
      registeredSessions: 10,
      registrationDate: "2025-11-05",
      lastClassDate: "2026-02-14",
      notes: "학업 일정으로 휴원. 9월 복귀 예정.",
      location: "강남 본원 201호",
      durationMinutes: 45,
      tuitionFee: 350000,
      contact: "010-9876-5432",
      inflowChannel: "네이버 검색",
      region: "서울 서초구",
      curriculum: "어린이 중국어 STEP 3",
      leaveReason: "학업 일정으로 인한 일시 중단",
      isActive: false,
      progress: "Step 3 의 Unit 4 까지 완료.",
      homework: "방학 중 워크북 Unit 1~3 복습",
      scheduleDays: [],
    },
  ];

  /* ==========================================================
   * 3. 데이터 레이어 (Firestore 어댑터)
   *    - 학생 데이터의 단일 진실 공급원은 Firestore "students" 컬렉션입니다.
   *    - 변경(추가/수정/삭제)은 onSnapshot 으로 모든 기기에 자동 전파됩니다.
   *    - app.js 는 SDK 를 직접 import 하지 않고 window.HaotingDB 만 호출합니다.
   * ========================================================== */

  // 신규/이전 버전 호환을 위해 누락된 필드를 안전한 기본값으로 채워 줍니다.
  function normalizeStudent(s) {
    if (!s || typeof s !== "object") return s;
    return Object.assign({}, s, {
      scheduleDays: Array.isArray(s.scheduleDays) ? s.scheduleDays : [],
    });
  }

  // Firestore 의 students 컬렉션을 실시간 구독합니다. 변경이 생기면 곧바로 화면이 갱신됩니다.
  function subscribeToStudents() {
    if (!isDBReady()) return;
    if (unsubscribeStudents) {
      unsubscribeStudents();
      unsubscribeStudents = null;
    }
    unsubscribeStudents = window.HaotingDB.subscribeStudents((items, err) => {
      if (err) {
        showToast("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        state.isStudentsLoading = false;
        render();
        return;
      }
      state.students = (items || []).map(normalizeStudent);
      state.isStudentsLoading = false;
      // 동기화 결과 더 이상 존재하지 않는 학생의 확장행 id 정리
      if (state.expandedRowIds.size > 0) {
        const valid = new Set(state.students.map((s) => s.id));
        state.expandedRowIds.forEach((id) => {
          if (!valid.has(id)) state.expandedRowIds.delete(id);
        });
      }
      render();
    });
  }

  async function createStudent(draft) {
    if (!isDBReady()) throw new Error("Firestore 가 준비되지 않았습니다.");
    return window.HaotingDB.createStudent(draft);
  }

  async function updateStudent(id, draft) {
    if (!isDBReady()) throw new Error("Firestore 가 준비되지 않았습니다.");
    return window.HaotingDB.updateStudent(id, draft);
  }

  async function deleteStudent(id) {
    if (!isDBReady()) throw new Error("Firestore 가 준비되지 않았습니다.");
    return window.HaotingDB.deleteStudent(id);
  }

  /**
   * Firestore 가 비어 있을 때만 1회 시드합니다.
   *  - localStorage 에 이전 버전 데이터가 남아 있다면 그것을 끌어올립니다.
   *  - 아니면 코드에 정의된 더미 학생 3명을 넣어 줍니다.
   */
  async function seedFirestoreOnce() {
    if (!isDBReady()) return;

    let localFallback = [];
    try {
      const raw = localStorage.getItem(LEGACY_STUDENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localFallback = parsed.map(normalizeStudent);
        }
      }
    } catch {
      /* 깨진 로컬 데이터는 무시 */
    }

    try {
      const result = await window.HaotingDB.seedIfEmpty({
        localFallback,
        dummies: DUMMY_STUDENTS,
      });
      if (result && result.seeded && result.source === "local") {
        // 마이그레이션 성공: 로컬 키는 안전을 위해 즉시 삭제하지 않고 보존합니다.
        showToast("이전 기기 데이터를 Firebase 로 옮겼습니다.");
      }
    } catch (err) {
      console.error("[seedFirestoreOnce]", err);
    }
  }

  function isDBReady() {
    return !!window.HaotingDB && window.HaotingDB.isReady();
  }

  /* ----- 세션 (로그인 상태) ----- */

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // 저장된 세션의 username 이 현재 ACCOUNTS 에 존재하는지 확인 (방어적 검증)
      const account = ACCOUNTS.find((a) => a.username === parsed.username);
      if (!account) return null;
      return account;
    } catch {
      return null;
    }
  }

  function saveSession(account) {
    try {
      localStorage.setItem(
        STORAGE_SESSION_KEY,
        JSON.stringify({
          username: account.username,
          loggedInAt: new Date().toISOString(),
        })
      );
    } catch (err) {
      console.error("[saveSession]", err);
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    } catch (err) {
      console.error("[clearSession]", err);
    }
  }

  /* ==========================================================
   * 4. 유틸
   * ========================================================== */
  function generateId() {
    return "stu-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCurrency(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "₩0";
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return new Intl.NumberFormat("ko-KR").format(n);
  }

  // ₩ 표기 + 한국식 단위(만/억) 압축. 차트 라벨 등 좁은 영역에서 사용.
  function formatCompactCurrency(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return "-";
    if (n >= 100000000) {
      const v = n / 100000000;
      return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}억원`;
    }
    if (n >= 10000) {
      const v = n / 10000;
      return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}만원`;
    }
    return formatCurrency(n);
  }

  function formatDate(value) {
    if (!value) return "-";
    const trimmed = String(value).trim();
    if (!trimmed) return "-";
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return trimmed;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd}`;
  }

  function todayISO() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  /** 입력 중이거나 블러 시에도 010- 로 시작하면 하이픈을 끼워 넣습니다 (11자 완성 시 최종 형식). */
  function formatContactAsTyping(raw) {
    const d = String(raw || "").replace(/\D/g, "").slice(0, 11);
    if (!d.startsWith("010")) return d;
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }

  /** 010 휴대폰: 010-xxxx-xxxx 로 정규화 (미완성이면 진행 형태 유지). 그 외는 숫자만 정리합니다. */
  function normalizeKoreanMobileContact(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.startsWith("010")) return formatContactAsTyping(d);
    return d || String(raw || "").trim();
  }

  function getTodayWeekdayKor() {
    return WEEKDAYS[new Date().getDay()];
  }

  // KPI 카드 등에 학생 이름을 짧게 표기. 0명이면 null 을 반환해 호출 측에서 fallback 처리.
  function formatStudentNames(students, maxShown = 2) {
    if (!Array.isArray(students) || students.length === 0) return null;
    const names = students.map((s) => s.name).filter(Boolean);
    if (names.length === 0) return null;
    if (names.length <= maxShown) return names.join(", ");
    return `${names.slice(0, maxShown).join(", ")} 외 ${names.length - maxShown}명`;
  }

  // 등록일 + (등록 회차 / 주당 수업 횟수) 주 ≒ 예상 종료일.
  // 수업 요일이 없으면 주 1회로 보수적으로 추정합니다. 데이터가 부족하면 null.
  function estimateClassEndDate(student) {
    if (!student || !student.registrationDate) return null;
    const start = new Date(student.registrationDate);
    if (Number.isNaN(start.getTime())) return null;
    const sessions = Number(student.registeredSessions) || 0;
    if (sessions <= 0) return null;
    const perWeek =
      Array.isArray(student.scheduleDays) && student.scheduleDays.length > 0
        ? student.scheduleDays.length
        : 1;
    const weeks = sessions / perWeek;
    const end = new Date(start);
    end.setDate(end.getDate() + Math.ceil(weeks * 7));
    return end;
  }

  // 활동 중인 학생 중, 예상 종료일이 이번달 말까지(이미 지났더라도 포함)인 경우.
  function isRenewalDueThisMonth(student) {
    if (!student || !student.isActive) return false;
    const end = estimateClassEndDate(student);
    if (!end) return false;
    const today = new Date();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    return end <= endOfMonth;
  }

  function showToast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.classList.remove("show");
    }, 1800);
  }

  /* ==========================================================
   * 5. 라우팅 / 렌더링
   * ========================================================== */
  function navigate(route) {
    state.route = route;
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.route === route);
    });
    render();
  }

  function render() {
    const main = document.getElementById("main-view");
    if (!main) return;

    if (state.route === "students") {
      main.innerHTML = renderStudentsView();
      bindStudentsViewEvents();
    } else if (state.route === "sales") {
      main.innerHTML = renderSalesView();
      bindSalesViewEvents();
    }
  }

  function bindSalesViewEvents() {
    const toggleInput = document.getElementById("sales-active-only");
    if (toggleInput) {
      toggleInput.addEventListener("change", (e) => {
        state.salesFilter = e.target.checked ? "active" : "all";
        render();
      });
    }
  }

  /* ----------------------------------------------------------
   * 5-1. 학생 관리 화면
   * ---------------------------------------------------------- */
  function renderStudentsView() {
    const total = state.students.length;
    const activeCount = state.students.filter((s) => s.isActive).length;

    // 오늘 수업 일정: 활동 중인 학생 중 수업 요일에 오늘이 포함된 학생들
    const todayWeekday = getTodayWeekdayKor();
    const todayClasses = state.students.filter((s) => {
      if (!s.isActive || !Array.isArray(s.scheduleDays) || s.scheduleDays.length === 0) return false;
      const onlyFlexible =
        s.scheduleDays.length === 1 &&
        String(s.scheduleDays[0]).trim() === SCHEDULE_FLEXIBLE_DAY;
      if (onlyFlexible) return false;
      return s.scheduleDays.includes(todayWeekday);
    });

    // 이번달 재등록이 필요한 학생: 활동 중이며, 등록 회차의 예상 소진일이 이번달 말까지인 학생.
    // (이미 예상 종료일이 지났더라도 활동 중이면 더 시급하므로 포함)
    const renewalDueStudents = state.students.filter((s) => isRenewalDueThisMonth(s));

    const today = new Date();
    const todaySubLabel = `${today.getMonth() + 1}월 ${today.getDate()}일 ${todayWeekday}요일`;

    const stats = [
      {
        label: "전체 학생",
        value: formatNumber(total) + "명",
        sub: "등록 누적",
        icon: "fa-users",
        accent: "bg-slate-100 text-slate-600",
      },
      {
        label: "수강 중",
        value: formatNumber(activeCount) + "명",
        sub: "활동 중인 학생",
        icon: "fa-user-check",
        accent: "bg-emerald-100 text-emerald-600",
      },
      {
        label: "오늘 수업 일정",
        value: formatStudentNames(todayClasses) || "예정 없음",
        sub: todaySubLabel,
        icon: "fa-calendar-day",
        accent: "bg-sky-100 text-sky-600",
      },
      {
        label: "이번달 재등록 필요",
        value: formatStudentNames(renewalDueStudents) || "예정 없음",
        sub: "예상 종료일 기준",
        icon: "fa-rotate-right",
        accent: "bg-amber-100 text-amber-600",
      },
    ];

    const filteredStudents = applyFilters(state.students, state.filter, state.keyword);

    return `
      <section class="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 md:text-2xl">학생 관리</h2>
          <p class="mt-1 text-sm text-slate-500">
            등록된 학생을 한눈에 확인하고, 진도·숙제·수강 상태를 관리하세요.
          </p>
        </div>
        <button
          type="button"
          id="btn-add-student"
          class="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <i class="fa-solid fa-plus"></i>
          학생 추가
        </button>
      </section>

      <section class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        ${stats
          .map(
            (s) => `
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium text-slate-500">${escapeHtml(s.label)}</p>
              <span class="flex h-8 w-8 items-center justify-center rounded-lg ${s.accent}">
                <i class="fa-solid ${s.icon} text-sm"></i>
              </span>
            </div>
            <p
              class="mt-3 truncate text-lg font-semibold text-slate-900 sm:text-xl"
              title="${escapeHtml(s.value)}"
            >
              ${escapeHtml(s.value)}
            </p>
            ${
              s.sub
                ? `<p class="mt-1 truncate text-[11px] text-slate-400" title="${escapeHtml(s.sub)}">${escapeHtml(s.sub)}</p>`
                : ""
            }
          </div>
        `
          )
          .join("")}
      </section>

      <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div class="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div class="flex items-center gap-2">
            <label
              id="active-toggle"
              class="toggle ${state.filter === "active" ? "is-on" : ""}"
              for="active-only-input"
              role="switch"
              aria-checked="${state.filter === "active" ? "true" : "false"}"
            >
              <input
                id="active-only-input"
                type="checkbox"
                ${state.filter === "active" ? "checked" : ""}
              />
              <span class="knob"></span>
            </label>
            <label for="active-only-input" class="cursor-pointer text-sm font-medium text-slate-700">
              현재 수강 중인 학생만 보기
            </label>
            <span class="hidden text-xs text-slate-400 sm:inline">
              · 표시 ${formatNumber(filteredStudents.length)}명 / 전체 ${formatNumber(total)}명
            </span>
          </div>

          <div class="relative w-full md:w-72">
            <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input
              id="search-input"
              type="search"
              value="${escapeHtml(state.keyword)}"
              placeholder="이름·강사·연락처·커리큘럼 검색"
              class="form-input pl-9"
            />
          </div>
        </div>

        <div class="overflow-x-auto">
          ${
            state.isStudentsLoading
              ? renderTableLoading()
              : filteredStudents.length === 0
                ? renderEmpty()
                : renderStudentTable(filteredStudents)
          }
        </div>
      </section>
    `;
  }

  function renderTableLoading() {
    return `
      <div class="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <i class="fa-solid fa-rotate fa-spin text-xl"></i>
        </span>
        <p class="mt-4 text-sm font-medium text-slate-700">데이터를 불러오는 중...</p>
        <p class="mt-1 text-xs text-slate-500">Firebase 와 동기화하고 있습니다.</p>
      </div>
    `;
  }

  function renderStudentTable(students) {
    return `
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr class="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th class="whitespace-nowrap px-4 py-3 md:px-6">학생</th>
            <th class="whitespace-nowrap px-4 py-3 md:px-6">담당 강사</th>
            <th class="hidden whitespace-nowrap px-4 py-3 md:table-cell md:px-6">연락처</th>
            <th class="hidden whitespace-nowrap px-4 py-3 md:table-cell md:px-6">커리큘럼</th>
            <th class="whitespace-nowrap px-4 py-3 text-right md:px-6">등록 횟수</th>
            <th class="hidden whitespace-nowrap px-4 py-3 md:table-cell md:px-6">진도</th>
            <th class="whitespace-nowrap px-4 py-3 md:px-6">수강 여부</th>
            <th class="whitespace-nowrap px-4 py-3 text-right md:px-6">
              <span class="sr-only">작업</span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          ${students.map((s) => renderStudentRow(s)).join("")}
        </tbody>
      </table>
    `;
  }

  function renderStudentRow(s) {
    const initials = (s.name || "?").trim().slice(0, 1);
    const isExpanded = state.expandedRowIds.has(s.id);
    const statusBadge = s.isActive
      ? '<span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 md:px-2.5 md:text-xs"><i class="fa-solid fa-circle text-[6px]"></i>수강 중</span>'
      : '<span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 md:px-2.5 md:text-xs"><i class="fa-solid fa-circle text-[6px]"></i>휴원·퇴원</span>';

    return `
      <tr class="student-row" data-id="${escapeHtml(s.id)}">
        <td class="whitespace-nowrap px-4 py-3.5 md:px-6">
          <div class="flex items-center gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              ${escapeHtml(initials)}
            </span>
            <div class="min-w-0 leading-tight">
              <div class="flex items-center gap-1.5">
                <p class="truncate font-medium text-slate-900">${escapeHtml(s.name)}</p>
                <i class="fa-solid fa-chevron-down text-[10px] text-slate-400 transition-transform md:hidden ${
                  isExpanded ? "rotate-180" : ""
                }"></i>
              </div>
              <p class="hidden truncate text-xs text-slate-500 md:block">${escapeHtml(s.region || "지역 미입력")}</p>
            </div>
          </div>
        </td>
        <td class="whitespace-nowrap px-4 py-3.5 text-slate-700 md:px-6">${escapeHtml(s.assignedInstructor || "-")}</td>
        <td class="hidden whitespace-nowrap px-4 py-3.5 text-slate-700 md:table-cell md:px-6">${escapeHtml(s.contact || "-")}</td>
        <td class="hidden whitespace-nowrap px-4 py-3.5 text-slate-700 md:table-cell md:px-6">${escapeHtml(s.curriculum || "-")}</td>
        <td class="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 md:px-6">
          ${formatNumber(s.registeredSessions || 0)}회
        </td>
        <td class="hidden px-4 py-3.5 text-slate-600 md:table-cell md:px-6">
          <span class="line-clamp-1 max-w-[260px]">${escapeHtml(s.progress || "-")}</span>
        </td>
        <td class="whitespace-nowrap px-4 py-3.5 md:px-6">${statusBadge}</td>
        <td class="whitespace-nowrap px-4 py-3.5 text-right md:px-6">
          <div class="inline-flex items-center gap-1">
            <button
              type="button"
              class="action-edit inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
              data-id="${escapeHtml(s.id)}"
              title="수정"
              aria-label="수정"
            >
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button
              type="button"
              class="action-delete inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              data-id="${escapeHtml(s.id)}"
              title="삭제"
              aria-label="삭제"
            >
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
      ${isExpanded ? renderStudentExpandedRow(s) : ""}
    `;
  }

  // 모바일에서 행을 탭하면 보이는 상세 정보 (데스크탑에서는 컬럼이 다 보이므로 노출하지 않음)
  function renderStudentExpandedRow(s) {
    const items = [
      { label: "지역", value: s.region },
      { label: "수업장소", value: s.location },
      { label: "연락처", value: s.contact },
      { label: "커리큘럼", value: s.curriculum },
      {
        label: "수업 요일",
        value:
          Array.isArray(s.scheduleDays) && s.scheduleDays.length > 0
            ? s.scheduleDays.join(" · ")
            : "-",
      },
      { label: "진도", value: s.progress },
      { label: "숙제", value: s.homework },
    ];

    return `
      <tr class="student-row-detail md:hidden bg-slate-50/60" data-id="${escapeHtml(s.id)}">
        <td colspan="5" class="px-4 py-4">
          <dl class="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
            ${items
              .map(
                (it) => `
              <div class="flex items-start gap-3 text-sm">
                <dt class="w-20 shrink-0 text-xs font-medium text-slate-500">${escapeHtml(it.label)}</dt>
                <dd class="min-w-0 flex-1 break-words text-slate-800">${escapeHtml(it.value || "-")}</dd>
              </div>
            `
              )
              .join("")}
          </dl>
        </td>
      </tr>
    `;
  }

  function renderEmpty() {
    return `
      <div class="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <i class="fa-solid fa-user-slash text-xl"></i>
        </span>
        <p class="mt-4 text-sm font-medium text-slate-700">표시할 학생이 없습니다.</p>
        <p class="mt-1 text-xs text-slate-500">필터를 해제하거나, 새로운 학생을 추가해 보세요.</p>
        <button
          type="button"
          class="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          onclick="document.getElementById('btn-add-student')?.click()"
        >
          <i class="fa-solid fa-plus"></i>
          학생 추가
        </button>
      </div>
    `;
  }

  /* ----------------------------------------------------------
   * 5-2. 매출 관리
   *      - 등록된 수업료(tuitionFee)를 매출의 기준으로 사용합니다.
   *      - 추이는 학생의 등록일(registrationDate) 기준 월별 합산입니다.
   * ---------------------------------------------------------- */
  function renderSalesView() {
    const source =
      state.salesFilter === "active"
        ? state.students.filter((s) => s.isActive)
        : state.students;

    const totalRevenue = source.reduce(
      (sum, s) => sum + (Number(s.tuitionFee) || 0),
      0
    );
    const activeRevenue = state.students
      .filter((s) => s.isActive)
      .reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);
    const avgPerStudent =
      source.length === 0 ? 0 : Math.round(totalRevenue / source.length);
    const totalSessions = source.reduce(
      (sum, s) => sum + (Number(s.registeredSessions) || 0),
      0
    );
    const avgPerSession =
      totalSessions === 0 ? 0 : Math.round(totalRevenue / totalSessions);

    const monthly = aggregateMonthlyRevenue(source);
    const monthlyMax = Math.max(1, ...monthly.map((m) => m.total));
    const monthlySum = monthly.reduce((s, m) => s + m.total, 0);

    const instructorStats = aggregateInstructorRevenue(source);
    const instructorMax = Math.max(
      1,
      ...instructorStats.map((i) => i.totalRevenue)
    );

    const stats = [
      {
        label: "총 매출",
        value: formatCurrency(totalRevenue),
        sub: `${formatNumber(source.length)}명 기준`,
        icon: "fa-coins",
        accent: "bg-brand-100 text-brand-600",
      },
      {
        label: "수강 중 매출",
        value: formatCurrency(activeRevenue),
        sub: `현재 진행 중인 학생 합계`,
        icon: "fa-circle-dollar-to-slot",
        accent: "bg-emerald-100 text-emerald-600",
      },
      {
        label: "학생 1인당 평균",
        value: formatCurrency(avgPerStudent),
        sub: `(총 매출 / 학생 수)`,
        icon: "fa-user-tag",
        accent: "bg-sky-100 text-sky-600",
      },
      {
        label: "1회당 평균 단가",
        value: formatCurrency(avgPerSession),
        sub: `(총 매출 / 누적 회차)`,
        icon: "fa-receipt",
        accent: "bg-amber-100 text-amber-600",
      },
    ];

    return `
      <section class="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 md:text-2xl">매출 관리</h2>
          <p class="mt-1 text-sm text-slate-500">
            학생별 등록 수업료를 기반으로 총 매출 · 강사별 매출 · 매출 추이를 한눈에 확인하세요.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <label
            class="toggle ${state.salesFilter === "active" ? "is-on" : ""}"
            for="sales-active-only"
            role="switch"
            aria-checked="${state.salesFilter === "active" ? "true" : "false"}"
          >
            <input
              id="sales-active-only"
              type="checkbox"
              ${state.salesFilter === "active" ? "checked" : ""}
            />
            <span class="knob"></span>
          </label>
          <label for="sales-active-only" class="cursor-pointer text-sm font-medium text-slate-700">
            수강 중인 학생만 집계
          </label>
        </div>
      </section>

      <section class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        ${stats
          .map(
            (s) => `
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium text-slate-500">${escapeHtml(s.label)}</p>
              <span class="flex h-8 w-8 items-center justify-center rounded-lg ${s.accent}">
                <i class="fa-solid ${s.icon} text-sm"></i>
              </span>
            </div>
            <p class="mt-3 text-xl font-semibold text-slate-900">${escapeHtml(s.value)}</p>
            <p class="mt-1 text-[11px] text-slate-400">${escapeHtml(s.sub)}</p>
          </div>
        `
          )
          .join("")}
      </section>

      <section class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 class="text-base font-semibold text-slate-900">매출 추이</h3>
              <p class="text-xs text-slate-500">학생 등록일 기준 월별 합계 · 막대에 마우스를 올리면 상세 표시</p>
            </div>
            <div class="text-right">
              <p class="text-[11px] text-slate-400">표시 기간 합계</p>
              <p class="text-sm font-semibold text-slate-900">${formatCurrency(monthlySum)}</p>
            </div>
          </div>
          ${renderMonthlyChart(monthly, monthlyMax)}
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-4">
            <h3 class="text-base font-semibold text-slate-900">강사별 매출</h3>
            <p class="text-xs text-slate-500">매출이 높은 강사 순으로 정렬됩니다.</p>
          </div>
          ${renderInstructorBars(instructorStats, instructorMax)}
        </div>
      </section>

      <section>
        <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div class="border-b border-slate-200 px-5 py-4">
            <h3 class="text-base font-semibold text-slate-900">강사별 상세</h3>
            <p class="text-xs text-slate-500">담당 학생 수와 매출 비중을 확인하세요.</p>
          </div>
          ${renderInstructorTable(instructorStats, totalRevenue)}
        </div>
      </section>
    `;
  }

  /* ----- 매출 집계 헬퍼들 ----- */

  // 학생 등록일 기준으로 월별 매출을 합산. 가장 오래된 등록월부터 현재월까지를 표시하되,
  // 최소 6개월/최대 12개월 범위를 유지합니다.
  function aggregateMonthlyRevenue(students) {
    const now = new Date();
    let oldest = null;
    students.forEach((s) => {
      if (!s.registrationDate) return;
      const d = new Date(s.registrationDate);
      if (Number.isNaN(d.getTime())) return;
      if (!oldest || d < oldest) oldest = d;
    });
    if (!oldest) {
      oldest = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    }

    const span =
      (now.getFullYear() - oldest.getFullYear()) * 12 +
      (now.getMonth() - oldest.getMonth()) +
      1;
    const monthsToShow = Math.min(Math.max(span, 6), 12);

    const months = [];
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        total: 0,
        count: 0,
      });
    }

    students.forEach((s) => {
      if (!s.registrationDate) return;
      const d = new Date(s.registrationDate);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) {
        bucket.total += Number(s.tuitionFee) || 0;
        bucket.count += 1;
      }
    });

    return months;
  }

  function aggregateInstructorRevenue(students) {
    const map = new Map();
    students.forEach((s) => {
      const name = (s.assignedInstructor || "").trim() || "미지정";
      if (!map.has(name)) {
        map.set(name, {
          instructor: name,
          totalRevenue: 0,
          studentCount: 0,
          activeCount: 0,
        });
      }
      const item = map.get(name);
      item.totalRevenue += Number(s.tuitionFee) || 0;
      item.studentCount += 1;
      if (s.isActive) item.activeCount += 1;
    });
    return Array.from(map.values()).sort(
      (a, b) => b.totalRevenue - a.totalRevenue
    );
  }

  /* ----- 매출 차트/테이블 렌더러들 ----- */

  function renderMonthlyChart(monthly, max) {
    if (monthly.length === 0 || max <= 1) {
      return `
        <div class="flex h-56 flex-col items-center justify-center text-center text-sm text-slate-400">
          <i class="fa-regular fa-chart-bar mb-2 text-2xl"></i>
          집계할 등록 데이터가 없습니다.
        </div>
      `;
    }

    return `
      <div class="relative h-56">
        <div class="flex h-full items-end gap-2 sm:gap-3">
          ${monthly
            .map((m) => {
              const heightPct = (m.total / max) * 100;
              const visibleHeight = m.total > 0 ? Math.max(heightPct, 4) : 0;
              return `
                <div class="group flex h-full flex-1 flex-col items-center justify-end">
                  <div
                    class="relative w-full max-w-[44px] rounded-t-md bg-brand-500 transition-colors duration-150 group-hover:bg-brand-700"
                    style="height: ${visibleHeight}%"
                  >
                    <div class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
                      ${formatCurrency(m.total)} · ${formatNumber(m.count)}건
                    </div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="mt-3 flex gap-2 sm:gap-3">
        ${monthly
          .map(
            (m) => `
          <div class="flex flex-1 flex-col items-center text-center">
            <span class="text-xs font-medium text-slate-600">${m.month}월</span>
            <span class="text-[10px] text-slate-400">${formatCompactCurrency(m.total)}</span>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderInstructorBars(stats, max) {
    if (stats.length === 0) {
      return `<div class="py-8 text-center text-sm text-slate-400">데이터가 없습니다.</div>`;
    }

    const palette = ["bg-brand-600", "bg-brand-500", "bg-brand-400", "bg-brand-300"];

    return `
      <div class="space-y-4">
        ${stats
          .map((s, i) => {
            const widthPct = max > 0 ? (s.totalRevenue / max) * 100 : 0;
            return `
              <div>
                <div class="flex items-center justify-between text-sm">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-slate-900">${escapeHtml(s.instructor)}</span>
                    <span class="text-xs text-slate-500">
                      ${formatNumber(s.studentCount)}명 · 수강 중 ${formatNumber(s.activeCount)}명
                    </span>
                  </div>
                  <span class="tabular-nums font-semibold text-slate-700">
                    ${formatCurrency(s.totalRevenue)}
                  </span>
                </div>
                <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full ${palette[i % palette.length]}"
                    style="width: ${Math.max(widthPct, 4)}%"
                  ></div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderInstructorTable(stats, totalRevenue) {
    if (stats.length === 0) {
      return `<div class="px-5 py-12 text-center text-sm text-slate-400">강사 데이터가 없습니다.</div>`;
    }

    return `
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr class="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th class="whitespace-nowrap px-5 py-3">강사</th>
              <th class="whitespace-nowrap px-5 py-3 text-right">담당 학생</th>
              <th class="whitespace-nowrap px-5 py-3 text-right">수강 중</th>
              <th class="whitespace-nowrap px-5 py-3 text-right">총 매출</th>
              <th class="whitespace-nowrap px-5 py-3 text-right">매출 비중</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            ${stats
              .map((s) => {
                const share =
                  totalRevenue > 0 ? (s.totalRevenue / totalRevenue) * 100 : 0;
                return `
                <tr>
                  <td class="px-5 py-3.5">
                    <div class="flex items-center gap-3">
                      <span class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        ${escapeHtml((s.instructor || "?").trim().slice(0, 1))}
                      </span>
                      <span class="font-medium text-slate-900">${escapeHtml(s.instructor)}</span>
                    </div>
                  </td>
                  <td class="px-5 py-3.5 text-right tabular-nums text-slate-700">
                    ${formatNumber(s.studentCount)}명
                  </td>
                  <td class="px-5 py-3.5 text-right">
                    <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      ${formatNumber(s.activeCount)}명
                    </span>
                  </td>
                  <td class="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-900">
                    ${formatCurrency(s.totalRevenue)}
                  </td>
                  <td class="px-5 py-3.5 text-right tabular-nums text-slate-600">
                    ${share.toFixed(1)}%
                  </td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }


  /* ==========================================================
   * 6. 필터 / 검색
   * ========================================================== */
  function applyFilters(list, filter, keyword) {
    let next = list;
    if (filter === "active") {
      next = next.filter((s) => s.isActive);
    }
    const kw = (keyword || "").trim().toLowerCase();
    if (kw) {
      next = next.filter((s) => {
        return [
          s.name,
          s.assignedInstructor,
          s.contact,
          s.curriculum,
          s.region,
          s.location,
        ]
          .map((v) => (v || "").toLowerCase())
          .some((v) => v.includes(kw));
      });
    }
    return next;
  }

  /* ==========================================================
   * 7. 학생 관리 뷰 이벤트 바인딩
   * ========================================================== */
  function bindStudentsViewEvents() {
    const addBtn = document.getElementById("btn-add-student");
    if (addBtn) {
      addBtn.addEventListener("click", () => openStudentModal(null));
    }

    const toggleInput = document.getElementById("active-only-input");
    if (toggleInput) {
      toggleInput.addEventListener("change", (e) => {
        state.filter = e.target.checked ? "active" : "all";
        render();
      });
    }

    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.keyword = e.target.value;
        // 입력 중에는 입력 포커스가 사라지지 않도록 단순 재렌더 후 포커스 복원
        const cursorPos = e.target.selectionStart;
        render();
        const next = document.getElementById("search-input");
        if (next) {
          next.focus();
          try {
            next.setSelectionRange(cursorPos, cursorPos);
          } catch (_) {}
        }
      });
    }

    document.querySelectorAll(".action-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        openStudentModal(id);
      });
    });

    document.querySelectorAll(".action-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const target = state.students.find((s) => s.id === id);
        openConfirm({
          title: "학생을 삭제하시겠습니까?",
          message: `${target ? target.name : ""} 학생의 모든 정보가 삭제되며, 되돌릴 수 없습니다.`,
          onConfirm: async () => {
            try {
              await deleteStudent(id);
              showToast("학생이 삭제되었습니다.");
              // 화면 갱신은 onSnapshot 에 위임
            } catch (err) {
              console.error("[deleteStudent]", err);
              showToast("삭제에 실패했습니다. 네트워크와 Firebase 설정을 확인해 주세요.");
            }
          },
        });
      });
    });

    document.querySelectorAll(".student-row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.dataset.id;
        // 모바일: 인라인 확장 토글 / 데스크탑: 수정 모달 열기
        if (isMobileViewport()) {
          toggleExpandedRow(id);
        } else {
          openStudentModal(id);
        }
      });
    });
  }

  function toggleExpandedRow(id) {
    if (!id) return;
    if (state.expandedRowIds.has(id)) {
      state.expandedRowIds.delete(id);
    } else {
      state.expandedRowIds.add(id);
    }
    render();
  }

  /* ==========================================================
   * 8. 학생 추가/수정 모달
   * ========================================================== */
  function openStudentModal(id) {
    const modal = document.getElementById("student-modal");
    const form = document.getElementById("student-form");
    if (!modal || !form) return;

    state.editingId = id || null;

    const titleEl = document.getElementById("student-modal-title");
    const subtitleEl = document.getElementById("student-modal-subtitle");
    const submitLabel = document.getElementById("student-form-submit-label");

    if (id) {
      const s = state.students.find((it) => it.id === id);
      if (!s) {
        showToast("학생 정보를 찾을 수 없습니다.");
        return;
      }
      titleEl.textContent = "학생 정보 수정";
      subtitleEl.textContent = `${s.name} 학생의 정보를 수정합니다.`;
      submitLabel.textContent = "수정 저장";
      fillFormFromStudent(form, s);
    } else {
      titleEl.textContent = "학생 추가";
      subtitleEl.textContent = "모든 항목을 입력 후 저장 버튼을 눌러 주세요.";
      submitLabel.textContent = "저장";
      resetForm(form);
    }

    modal.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      const focusable = form.querySelector("input[name='name']");
      if (focusable) focusable.focus();
    }, 30);
  }

  function closeStudentModal() {
    const modal = document.getElementById("student-modal");
    if (!modal) return;
    modal.classList.remove("modal-open");
    document.body.style.overflow = "";
    state.editingId = null;
  }

  function resetForm(form) {
    form.reset();
    form.elements.id.value = "";
    form.elements.registrationDate.value = todayISO();
    form.elements.lastClassDate.value = todayISO();
    form.elements.isActive.checked = true;
    setScheduleDaysOnForm(form, []);
    cleanInstructorLegacyOption(form);
    cleanCurriculumLegacyOption(form);
    // form.reset() 후에는 disabled placeholder 가 다시 selected 가 되어 value 가 "" 으로 돌아갑니다.
    form.elements.assignedInstructor.value = "";
    form.elements.curriculum.value = "";
  }

  function fillFormFromStudent(form, s) {
    form.elements.id.value = s.id || "";
    form.elements.name.value = s.name || "";
    ensureInstructorOption(form, s.assignedInstructor);
    form.elements.assignedInstructor.value = s.assignedInstructor || "";
    form.elements.contact.value = s.contact || "";
    form.elements.region.value = s.region || "";
    form.elements.location.value = s.location || "";
    form.elements.inflowChannel.value = s.inflowChannel || "";
    ensureCurriculumOption(form, s.curriculum);
    form.elements.curriculum.value = s.curriculum || "";
    form.elements.registeredSessions.value = s.registeredSessions ?? "";
    form.elements.durationMinutes.value = s.durationMinutes ?? "";
    form.elements.tuitionFee.value = s.tuitionFee ?? "";
    form.elements.registrationDate.value = s.registrationDate || "";
    form.elements.lastClassDate.value = s.lastClassDate || "";
    form.elements.progress.value = s.progress || "";
    form.elements.homework.value = s.homework || "";
    form.elements.isActive.checked = !!s.isActive;
    form.elements.leaveReason.value = s.leaveReason || "";
    form.elements.notes.value = s.notes || "";
    setScheduleDaysOnForm(form, Array.isArray(s.scheduleDays) ? s.scheduleDays : []);
  }

  function readDraftFromForm(form) {
    const fd = new FormData(form);
    const toNumber = (key) => {
      const raw = fd.get(key);
      if (raw === null || raw === "") return 0;
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    };
    const checkedDays = fd.getAll("scheduleDays").map(String);
    const orderedDays = checkedDays.includes(SCHEDULE_FLEXIBLE_DAY)
      ? [SCHEDULE_FLEXIBLE_DAY]
      : SCHEDULE_DAY_DISPLAY_ORDER.filter((d) => checkedDays.includes(d));
    return {
      name: String(fd.get("name") || "").trim(),
      assignedInstructor: String(fd.get("assignedInstructor") || "").trim(),
      registeredSessions: toNumber("registeredSessions"),
      registrationDate: String(fd.get("registrationDate") || "").trim(),
      lastClassDate: String(fd.get("lastClassDate") || "").trim(),
      notes: String(fd.get("notes") || "").trim(),
      location: String(fd.get("location") || "").trim(),
      durationMinutes: toNumber("durationMinutes"),
      tuitionFee: toNumber("tuitionFee"),
      contact: String(fd.get("contact") || "").trim(),
      inflowChannel: String(fd.get("inflowChannel") || "").trim(),
      region: String(fd.get("region") || "").trim(),
      curriculum: String(fd.get("curriculum") || "").trim(),
      leaveReason: String(fd.get("leaveReason") || "").trim(),
      isActive: form.elements.isActive.checked,
      progress: String(fd.get("progress") || "").trim(),
      homework: String(fd.get("homework") || "").trim(),
      scheduleDays: orderedDays,
    };
  }

  // 요일·유동 칩을 학생 모달 폼 안에 초기화합니다 (한 번만).
  function wireScheduleFlexibleExclusive(container) {
    if (!container || container.dataset.exclusionWired === "true") return;
    container.dataset.exclusionWired = "true";

    container.addEventListener("change", (e) => {
      const target = e.target;
      if (!target || target.name !== "scheduleDays") return;
      const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"][name="scheduleDays"]'));
      if (target.value === SCHEDULE_FLEXIBLE_DAY && target.checked) {
        checkboxes.forEach((cb) => {
          if (cb !== target) cb.checked = false;
        });
      } else if (target.value !== SCHEDULE_FLEXIBLE_DAY && target.checked) {
        const flex = checkboxes.find((cb) => cb.value === SCHEDULE_FLEXIBLE_DAY);
        if (flex) flex.checked = false;
      }
    });
  }

  function ensureScheduleDayChips() {
    const container = document.getElementById("f-schedule-days");
    if (!container || container.dataset.initialized === "true") return;
    container.dataset.initialized = "true";

    const weekdayHtml = SCHEDULE_DAY_DISPLAY_ORDER.map(
      (d) => `
          <label
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <input
              type="checkbox"
              name="scheduleDays"
              value="${d}"
              class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>${d}</span>
          </label>
        `
    ).join("");
    const flexChip = `
          <label
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
          >
            <input
              type="checkbox"
              name="scheduleDays"
              value="${SCHEDULE_FLEXIBLE_DAY}"
              class="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <span>${SCHEDULE_FLEXIBLE_DAY}</span>
          </label>
        `;
    container.innerHTML = weekdayHtml + flexChip;

    wireScheduleFlexibleExclusive(container);
  }

  function setScheduleDaysOnForm(form, days) {
    const set = new Set(days || []);
    Array.from(form.elements)
      .filter((el) => el.name === "scheduleDays" && el.type === "checkbox")
      .forEach((el) => {
        el.checked = set.has(el.value);
      });
  }

  // 학생의 담당 강사가 현재 INSTRUCTORS 옵션에 없는 경우(예: 이전 데이터)
  // "(기존)" 임시 옵션을 추가해서 폼이 깨지지 않도록 합니다.
  function ensureInstructorOption(form, value) {
    const select = form.elements.assignedInstructor;
    if (!select || !value) return;
    if (INSTRUCTORS.includes(value)) return;
    const exists = Array.from(select.options).some((o) => o.value === value);
    if (exists) return;
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = `${value} (기존)`;
    opt.dataset.legacy = "true";
    select.appendChild(opt);
  }

  function cleanInstructorLegacyOption(form) {
    const select = form.elements.assignedInstructor;
    if (!select) return;
    Array.from(select.options).forEach((opt) => {
      if (opt.dataset && opt.dataset.legacy === "true") opt.remove();
    });
  }

  // 커리큘럼이 현재 옵션에 없는 과거 문자열 값이더라도 편집 시 선택 가능하도록 임시 옵션을 붙입니다.
  function ensureCurriculumOption(form, value) {
    const select = form.elements.curriculum;
    if (!select || !value) return;
    if (CURRICULUM_OPTIONS.includes(value)) return;
    const exists = Array.from(select.options).some((o) => o.value === value);
    if (exists) return;
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = `${value} (기존)`;
    opt.dataset.legacy = "true";
    select.appendChild(opt);
  }

  function cleanCurriculumLegacyOption(form) {
    const select = form.elements.curriculum;
    if (!select) return;
    Array.from(select.options).forEach((opt) => {
      if (opt.dataset && opt.dataset.legacy === "true") opt.remove();
    });
  }

  async function handleStudentFormSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;

    if (!isDBReady()) {
      const detail =
        window.HaotingDB && typeof window.HaotingDB.configError === "function"
          ? window.HaotingDB.configError()
          : "Firebase Firestore 에 연결할 수 없습니다.";
      showToast(detail || "저장 환경을 확인해 주세요.");
      return;
    }

    const contactInput = form.elements.contact;
    if (contactInput) contactInput.value = normalizeKoreanMobileContact(contactInput.value);

    const draft = readDraftFromForm(form);

    if (!draft.name) {
      showToast("학생 이름을 입력해 주세요.");
      form.elements.name.focus();
      return;
    }
    if (!draft.assignedInstructor) {
      showToast("담당 강사를 선택해 주세요.");
      form.elements.assignedInstructor.focus();
      return;
    }
    if (!draft.contact) {
      showToast("연락처를 입력해 주세요.");
      form.elements.contact.focus();
      return;
    }
    const contactDigits = draft.contact.replace(/\D/g, "");
    if (contactDigits.length === 11 && contactDigits.startsWith("010")) {
      draft.contact = normalizeKoreanMobileContact(draft.contact);
    }

    // 저장 버튼 중복 클릭 방지 (#student-form-submit 은 type=button)
    const submitBtn = document.getElementById("student-form-submit");
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (state.editingId) {
        await updateStudent(state.editingId, draft);
        closeStudentModal();
        showToast("학생 정보가 수정되었습니다.");
      } else {
        await createStudent(draft);
        closeStudentModal();
        showToast("새 학생이 추가되었습니다.");
      }
      navigate("students");
    } catch (err) {
      console.error("[handleStudentFormSubmit]", err);
      showToast("저장에 실패했습니다. 네트워크와 Firebase 설정을 확인해 주세요.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  /* ==========================================================
   * 9. 확인(삭제) 모달
   * ========================================================== */
  function openConfirm({ title, message, onConfirm }) {
    const modal = document.getElementById("confirm-modal");
    if (!modal) return;
    document.getElementById("confirm-title").textContent = title || "정말 진행할까요?";
    document.getElementById("confirm-message").textContent = message || "";

    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    const cleanup = () => {
      modal.classList.remove("modal-open");
      okBtn.removeEventListener("click", handleOk);
      cancelBtn.removeEventListener("click", handleCancel);
      modal.removeEventListener("click", handleBackdrop);
    };
    const handleOk = () => {
      cleanup();
      if (typeof onConfirm === "function") onConfirm();
    };
    const handleCancel = () => cleanup();
    const handleBackdrop = (e) => {
      if (e.target === modal) cleanup();
    };

    okBtn.addEventListener("click", handleOk);
    cancelBtn.addEventListener("click", handleCancel);
    modal.addEventListener("click", handleBackdrop);

    modal.classList.add("modal-open");
  }

  /* ==========================================================
   * 10-pre. 모바일 사이드바 열기 / 닫기
   * ========================================================== */
  function isMobileViewport() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function isMobileMenuOpen() {
    return !!document
      .getElementById("sidebar")
      ?.classList.contains("mobile-open");
  }

  function openMobileMenu() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("mobile-backdrop");
    if (!sidebar) return;
    sidebar.classList.add("mobile-open");
    backdrop?.classList.add("show");
    document.body.style.overflow = "hidden";

    // 햄버거 아이콘을 X 로 잠깐 바꿔도 좋지만, 사이드바 안에 별도 닫기 버튼이 있으므로 유지.
  }

  function closeMobileMenu() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("mobile-backdrop");
    sidebar?.classList.remove("mobile-open");
    backdrop?.classList.remove("show");
    document.body.style.overflow = "";
  }

  function toggleMobileMenu() {
    if (isMobileMenuOpen()) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  /* ==========================================================
   * 10. 인증 (로그인 / 로그아웃 / 화면 전환)
   * ========================================================== */
  function showLogin() {
    const loginScreen = document.getElementById("login-screen");
    const appShell = document.getElementById("app-shell");
    if (loginScreen) {
      loginScreen.classList.remove("hidden");
      loginScreen.classList.add("flex");
    }
    if (appShell) {
      appShell.classList.add("hidden");
      appShell.classList.remove("flex");
    }
    const usernameInput = document.getElementById("login-username");
    if (usernameInput) {
      setTimeout(() => usernameInput.focus(), 30);
    }
  }

  function showApp() {
    const loginScreen = document.getElementById("login-screen");
    const appShell = document.getElementById("app-shell");
    if (loginScreen) {
      loginScreen.classList.add("hidden");
      loginScreen.classList.remove("flex");
    }
    if (appShell) {
      appShell.classList.remove("hidden");
      appShell.classList.add("flex");
    }
  }

  function applyUserToShell() {
    const user = state.currentUser;
    if (!user) return;

    const initial = (user.displayName || "?").trim().slice(0, 1);

    // 사이드바
    const sideName = document.getElementById("sidebar-user-name");
    const sideEmail = document.getElementById("sidebar-user-email");
    const sideAvatar = document.getElementById("sidebar-user-avatar");
    if (sideName) sideName.textContent = user.displayName;
    if (sideEmail) sideEmail.textContent = user.email;
    if (sideAvatar) sideAvatar.textContent = initial;

    // 헤더
    const headerChip = document.getElementById("header-user-chip");
    const headerName = document.getElementById("header-user-name");
    const headerAvatar = document.getElementById("header-user-avatar");
    if (headerChip) {
      headerChip.classList.remove("hidden");
      headerChip.classList.add("inline-flex");
    }
    if (headerName) headerName.textContent = user.displayName;
    if (headerAvatar) headerAvatar.textContent = initial;
  }

  function handleLoginSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const username = String(form.elements.username.value || "")
      .trim()
      .toLowerCase();
    const password = String(form.elements.password.value || "");
    const errorEl = document.getElementById("login-error");

    const account = ACCOUNTS.find(
      (a) => a.username === username && a.password === password
    );

    if (!account) {
      if (errorEl) {
        errorEl.textContent = "아이디 또는 비밀번호가 올바르지 않습니다.";
        errorEl.classList.remove("hidden");
      }
      form.elements.password.value = "";
      form.elements.password.focus();
      return;
    }

    if (errorEl) errorEl.classList.add("hidden");

    state.currentUser = account;
    saveSession(account);
    applyUserToShell();
    showApp();
    navigate("students");
    showToast(`${account.displayName} 환영합니다!`);
    form.reset();
  }

  function handleLogout() {
    clearSession();
    state.currentUser = null;

    // 학생 관리 화면 상태도 깔끔하게 초기화
    state.route = "students";
    state.filter = "all";
    state.keyword = "";
    state.salesFilter = "all";

    closeMobileMenu();
    showLogin();
    showToast("로그아웃되었습니다.");
  }

  function bindLoginEvents() {
    const form = document.getElementById("login-form");
    if (form) {
      form.addEventListener("submit", handleLoginSubmit);
    }

    // 비밀번호 표시 토글
    const toggleBtn = document.getElementById("login-password-toggle");
    const passwordInput = document.getElementById("login-password");
    if (toggleBtn && passwordInput) {
      toggleBtn.addEventListener("click", () => {
        const isPwd = passwordInput.type === "password";
        passwordInput.type = isPwd ? "text" : "password";
        const icon = toggleBtn.querySelector("i");
        if (icon) {
          icon.classList.toggle("fa-eye", !isPwd);
          icon.classList.toggle("fa-eye-slash", isPwd);
        }
      });
    }

    // 로그아웃 버튼들 (헤더 / 사이드바)
    document
      .getElementById("header-logout-btn")
      ?.addEventListener("click", handleLogout);
    document
      .getElementById("sidebar-logout-btn")
      ?.addEventListener("click", handleLogout);
  }

  /* ==========================================================
   * 11. 전역 이벤트 / 초기화
   * ========================================================== */
  function bindGlobalEvents() {
    // 사이드바 네비게이션
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate(btn.dataset.route);
        // 모바일에서 메뉴 클릭 시 사이드바 자동 닫기
        if (isMobileViewport()) closeMobileMenu();
      });
    });

    // 모바일 메뉴 토글 (햄버거 / 닫기 / 백드롭)
    document
      .getElementById("mobile-menu-toggle")
      ?.addEventListener("click", toggleMobileMenu);
    document
      .getElementById("mobile-menu-close")
      ?.addEventListener("click", closeMobileMenu);
    document
      .getElementById("mobile-backdrop")
      ?.addEventListener("click", closeMobileMenu);

    // 데스크탑으로 리사이즈되면 모바일 오픈 상태를 정리
    window.addEventListener("resize", () => {
      if (!isMobileViewport()) closeMobileMenu();
    });

    // 학생 모달 닫기 버튼들
    document.querySelectorAll("#student-modal .modal-close").forEach((btn) => {
      btn.addEventListener("click", closeStudentModal);
    });

    // 학생 모달 백드롭 클릭으로 닫기
    const studentModal = document.getElementById("student-modal");
    if (studentModal) {
      studentModal.addEventListener("click", (e) => {
        if (e.target === studentModal) closeStudentModal();
      });
    }

    // ESC 키로 모달 닫기
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // 우선순위: 학생 모달 → 모바일 사이드바
      if (document.getElementById("student-modal")?.classList.contains("modal-open")) {
        closeStudentModal();
        return;
      }
      if (document.getElementById("sidebar")?.classList.contains("mobile-open")) {
        closeMobileMenu();
      }
    });

    // 학생 폼 제출
    const studentForm = document.getElementById("student-form");
    if (studentForm) {
      studentForm.addEventListener("submit", handleStudentFormSubmit);
      document.getElementById("student-form-submit")?.addEventListener("click", () =>
        handleStudentFormSubmit({
          preventDefault() {},
          currentTarget: studentForm,
        })
      );
    }

    const contactInput = document.getElementById("f-contact");
    if (contactInput) {
      contactInput.addEventListener("input", () => {
        contactInput.value = contactInput.value.replace(/\D/g, "").slice(0, 11);
      });
      contactInput.addEventListener("blur", () => {
        contactInput.value = normalizeKoreanMobileContact(contactInput.value);
      });
    }

    // 헤더 우측 날짜
    const dateEl = document.getElementById("header-date");
    if (dateEl) {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      });
      dateEl.textContent = formatter.format(now);
    }
  }

  // 로고 JPEG 의 검정 배경을 흰색으로 칠해 PNG 데이터 URL 로 만든 뒤 favicon 으로 교체합니다.
  // (브라우저는 favicon 에 CSS 필터를 적용하지 못하므로 별도로 픽셀 가공이 필요합니다.)
  function buildAndApplyFavicon() {
    const link = document.getElementById("app-favicon");
    if (!link) return;

    const img = new Image();
    img.onload = function () {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);

        const padding = 4;
        ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2);

        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        const threshold = 70; // JPEG 경계 노이즈를 흡수하기 위해 약간 넉넉히
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < threshold && data[i + 1] < threshold && data[i + 2] < threshold) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          }
        }
        ctx.putImageData(imageData, 0, 0);

        link.type = "image/png";
        link.href = canvas.toDataURL("image/png");
      } catch (err) {
        // file:// 에서 canvas tainted 등으로 실패할 수 있음 → 원본 favicon 유지.
        console.warn("[buildAndApplyFavicon]", err);
      }
    };
    img.onerror = function () {
      /* 원본 favicon 유지 */
    };
    img.src = "./assets/logo.jpg";
  }

  function init() {
    state.currentUser = loadSession();

    ensureScheduleDayChips();
    bindGlobalEvents();
    bindLoginEvents();
    buildAndApplyFavicon();

    // 학생 데이터(Firestore) 는 SDK 모듈 로딩이 끝난 뒤에만 초기화 가능합니다.
    whenDBReady(initData);

    if (state.currentUser) {
      applyUserToShell();
      showApp();
      navigate("students");
    } else {
      showLogin();
    }
  }

  // Firebase SDK 모듈(firebase.js) 이 window.HaotingDB 를 노출할 때까지 대기.
  // 8 초 안에 준비되지 않으면 네트워크/CDN 문제로 간주하고 설정 안내 배너를 띄웁니다.
  function whenDBReady(callback) {
    if (window.HaotingDB) {
      callback();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      callback();
    };
    window.addEventListener("haoting:db-ready", finish, { once: true });
    setTimeout(() => {
      if (!window.HaotingDB) finish();
    }, 8000);
  }

  async function initData() {
    if (!isDBReady()) {
      // 설정값이 아직 비어 있는 등 Firestore 를 사용할 수 없는 상태
      state.isStudentsLoading = false;
      render();
      showFirebaseConfigBanner();
      return;
    }
    // 시드(seed)가 끝날 때까지 기다린 뒤 구독하면 첫 화면이 늦어집니다.
    // onSnapshot 을 먼저 걸어 첫 스냅샷으로 UI를 바로 풀고, 시드는 병렬로 진행합니다.
    subscribeToStudents();
    seedFirestoreOnce().catch((err) => {
      console.error("[seedFirestoreOnce]", err);
    });
  }

  function showFirebaseConfigBanner() {
    const banner = document.getElementById("firebase-config-banner");
    if (!banner) return;

    const msgEl = document.getElementById("firebase-config-banner-message");
    const detail =
      window.HaotingDB && typeof window.HaotingDB.configError === "function"
        ? window.HaotingDB.configError()
        : null;
    if (msgEl && detail) {
      msgEl.textContent = detail;
    }

    banner.classList.remove("hidden");
    banner.classList.add("flex");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
