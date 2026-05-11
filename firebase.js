/* ============================================================
 * Firebase 데이터 레이어
 * ------------------------------------------------------------
 * - Firestore 의 "students" 컬렉션을 단일 진실 공급원으로 사용합니다.
 * - 어느 기기에서든 같은 Firestore 데이터를 보고, 한 쪽에서 변경하면
 *   onSnapshot 으로 다른 쪽 화면에도 즉시 반영됩니다.
 * - 외부에는 window.HaotingDB 를 통해 비동기 CRUD API 만 노출합니다.
 *   (app.js 는 Firebase SDK 를 직접 import 하지 않고 이 객체만 사용)
 * ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  getDocs,
  limit,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const COLLECTION = "students";

function isPlaceholder(value) {
  if (!value || typeof value !== "string") return true;
  // "YOUR_..." 자리표시자가 아직 그대로 남아있으면 미설정으로 간주
  return /^YOUR_/.test(value);
}

function isConfigValid(cfg) {
  if (!cfg || typeof cfg !== "object") return false;
  return ["apiKey", "projectId", "appId"].every(
    (k) => cfg[k] && !isPlaceholder(cfg[k])
  );
}

const cfg = window.HAOTING_FIREBASE_CONFIG;
const valid = isConfigValid(cfg);

let app = null;
let db = null;
let initError = null;

if (valid) {
  try {
    app = initializeApp(cfg);
    db = getFirestore(app);
  } catch (err) {
    console.error("[firebase] init failed", err);
    initError = err;
  }
}

function stripId(obj) {
  const next = Object.assign({}, obj || {});
  delete next.id;
  return next;
}

window.HaotingDB = {
  /** Firebase 가 정상 초기화되어 사용 가능한 상태인지 */
  isReady() {
    return !!db && !initError;
  },

  /** 현재 막혀 있는 이유. UI 에 표시할 사람이 읽을 수 있는 한국어 메시지. */
  configError() {
    if (!cfg) {
      return "firebase-config.js 가 로드되지 않았습니다.";
    }
    if (!valid) {
      return 'firebase-config.js 의 값이 아직 채워지지 않았습니다. (apiKey / projectId / appId 의 "YOUR_..." 자리표시자를 본인 프로젝트 값으로 교체해 주세요)';
    }
    if (initError) {
      return `Firebase 초기화 중 오류가 발생했습니다: ${initError.message || initError}`;
    }
    return null;
  },

  /**
   * 학생 컬렉션을 실시간 구독합니다.
   * 콜백 시그니처: (students, error) => void
   * 반환값: 구독 해제 함수
   */
  subscribeStudents(callback) {
    if (!db) return () => {};
    const q = query(
      collection(db, COLLECTION),
      orderBy("registrationDate", "desc")
    );
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data() || {};
          // Firestore 문서 ID 를 학생 객체의 id 로 사용 (앱 전반에서 단일 식별자)
          return Object.assign({}, data, { id: d.id });
        });
        callback(items, null);
      },
      (err) => {
        console.error("[subscribeStudents]", err);
        callback([], err);
      }
    );
  },

  /** 새 학생 문서를 추가합니다. 생성된 doc id 를 반환합니다. */
  async createStudent(draft) {
    if (!db) throw new Error("Firestore is not initialized");
    const ref = await addDoc(collection(db, COLLECTION), {
      ...stripId(draft),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  /** 기존 학생 문서를 업데이트합니다. */
  async updateStudent(id, draft) {
    if (!db) throw new Error("Firestore is not initialized");
    await updateDoc(doc(db, COLLECTION, id), {
      ...stripId(draft),
      updatedAt: serverTimestamp(),
    });
  },

  /** 학생 문서를 삭제합니다. */
  async deleteStudent(id) {
    if (!db) throw new Error("Firestore is not initialized");
    await deleteDoc(doc(db, COLLECTION, id));
  },

  /**
   * Firestore 컬렉션이 비어 있을 때만 초기 데이터를 한 번 채워 넣습니다.
   * - localStorage 에 기존 데이터가 있으면 그것을 우선 사용해 마이그레이션,
   * - 없으면 dummies 더미 데이터를 시드합니다.
   * 동시 접속 환경에서 약간의 중복 시드 가능성이 있으나 내부용 도구에서 허용 범위입니다.
   */
  async seedIfEmpty({ localFallback, dummies }) {
    if (!db) return { seeded: false, source: "skip" };
    const probe = await getDocs(query(collection(db, COLLECTION), limit(1)));
    if (!probe.empty) return { seeded: false, source: "remote" };

    const seedSource =
      Array.isArray(localFallback) && localFallback.length > 0
        ? localFallback
        : Array.isArray(dummies)
          ? dummies
          : [];
    if (seedSource.length === 0) return { seeded: false, source: "empty" };

    const batch = writeBatch(db);
    seedSource.forEach((s) => {
      const ref = doc(collection(db, COLLECTION));
      batch.set(ref, {
        ...stripId(s),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return {
      seeded: true,
      source:
        Array.isArray(localFallback) && localFallback.length > 0
          ? "local"
          : "dummy",
      count: seedSource.length,
    };
  },
};

// 비동기로 모듈 로딩이 끝났음을 app.js 에 알립니다.
window.dispatchEvent(new CustomEvent("haoting:db-ready"));
