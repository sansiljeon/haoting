/* ============================================================
 * Firebase 프로젝트 설정값
 * ------------------------------------------------------------
 * 1) https://console.firebase.google.com 에서 새 프로젝트를 만든 뒤,
 *    "프로젝트 설정 → 일반 → 내 앱 → 웹앱 추가" 로 받은 설정값을
 *    아래 자리(YOUR_*)에 붙여넣어 주세요.
 *
 * 2) 좌측 메뉴 "Build → Firestore Database" 에서 데이터베이스를 생성
 *    (지역은 asia-northeast3 (서울) 권장).
 *
 * 3) 보안 규칙 (개발/내부용 임시):
 *    rules_version = '2';
 *    service cloud.firestore {
 *      match /databases/{db}/documents {
 *        match /students/{doc} {
 *          allow read, write: if true;   // 내부용 ‘소프트 게이트’와 동일
 *        }
 *      }
 *    }
 *    ※ 외부 노출 환경에서는 반드시 Firebase Auth 로 보호하세요.
 *
 * ⚠️ 보안 안내:
 * - 아래 apiKey 등은 "공개되어도 되는" 식별자입니다 (서버 비밀키 아님).
 * - 실제 보안은 Firestore 규칙(rules)에서 결정됩니다.
 * ============================================================ */
window.HAOTING_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
