# 하오팅 중국어 관리자 시스템

중국어 교습소 **하오팅 중국어** 의 선생님들을 위한 학생·매출 관리 웹앱입니다.

**HTML / CSS / Vanilla JavaScript** 로 동작하며, 학생 데이터는 **Firebase Firestore** 에 저장되어 PC·모바일·여러 선생님 사이에 **실시간으로 공유**됩니다. **로그인**은 **Firebase Authentication**(이메일·비밀번호)을 사용합니다. **Vercel** 배포 시 `npm run build` 로 Tailwind CSS(`tailwind.css`)가 생성됩니다.

## 기술 스택

- HTML5 (단일 `index.html` 기반 SPA)
- [Tailwind CSS](https://tailwindcss.com/) v3 (로컬 빌드 → `tailwind.css`, 마크업·`app.js` 변경 후 `npm run build:css` 로 재생성)
- [Font Awesome 6](https://fontawesome.com/) 아이콘 (CDN)
- [Pretendard](https://github.com/orioncactus/pretendard) 한글 폰트 (CDN)
- 순수 JavaScript (`app.js` 번들 없음); `firebase.js` 만 ES 모듈
- 데이터: **Firebase Firestore** (실시간 동기화)
- 로그인: **Firebase Authentication** (이메일·비밀번호, 세션은 Firebase 가 브라우저에 유지)

## 디렉터리 구조

```
.
├── index.html            # 마크업 + 사이드바 / 헤더 / 모달 템플릿
├── app.js                # 라우팅, 렌더링, 이벤트 핸들러 등 전 로직
├── firebase.js           # Firestore + Auth (window.HaotingDB) — ESM 모듈
├── firebase-config.js    # Firebase 프로젝트 설정값 (직접 채워 넣기)
├── tailwind.css          # Tailwind 빌드 산출물 (저장소에 포함, 로컬에서 `npm run build:css` 로 갱신)
├── src/tailwind-input.css
├── tailwind.config.js
├── package.json          # `npm run build` (= `build:css`) — Vercel 배포 시 실행
├── styles.css            # 폼 입력, 토글, 테이블 등 커스텀 스타일
├── vercel.json           # Vercel 정적 배포용 설정 (선택)
└── README.md
```

## 로컬 시작 체크리스트

1. **Node.js** 설치 후 프로젝트 루트에서 `npm install` 실행  
2. **Firebase**: `firebase-config.js` 채움, 콘솔에서 **Authentication → Sign-in method** 에서 **이메일/비밀번호** 사용 설정, 선생님용 **사용자 계정** 생성(이메일·비밀번호)  
3. **Tailwind**: `npm run build:css` 한 번 실행(또는 개발 중 `npm run watch:css`). 클래스를 바꾼 뒤에는 재빌드  
4. **로컬 서버**로 열기 (예: `python3 -m http.server 8080` 후 `http://localhost:8080`) — `file://` 은 ES 모듈 때문에 비권장  
5. **Vercel 배포**: 저장소 연결 시 `npm run build`가 실행됩니다(`vercel.json`의 `buildCommand`).

## 주요 기능

### 학생 관리

- 전체 학생 목록을 표(Table) 형태로 표시 (모바일은 핵심 5컬럼 + 행 탭으로 상세 펼침)
- 상단 KPI 카드: 전체 학생 / 수강 중 / 오늘 수업 일정 / 이번달 재등록 필요
- **학생 추가** 모달: 모든 필드를 한 번에 입력
- **수정 / 삭제**: 각 행의 액션 버튼 또는 행 클릭 → 수정 모달 (데스크탑)
- **수강 여부 필터링**: "현재 수강 중인 학생만 보기" 토글
- **검색**: 이름·강사·연락처·커리큘럼·지역·수업장소 통합 검색
- 모든 변경사항은 즉시 Firestore 에 저장되고 다른 기기 화면도 자동 갱신됩니다.

### 매출 관리

- 총 매출 / 수강 중 매출 / 학생 1인당 평균 / 1회당 평균 단가 KPI
- 등록일 기준 월별 매출 추이 차트 (최근 6~12개월)
- 강사별 매출 막대 / 비중 표

### 데이터 모델 (학생 1명)

```ts
{
  id: string;                     // Firestore 문서 ID
  name: string;                   // 학생 이름
  assignedInstructor: string;     // 담당 강사 (박환희 / 김정화)
  registeredSessions: number;     // 등록 횟수
  registrationDate: string;       // YYYY-MM-DD
  lastClassDate: string;          // YYYY-MM-DD
  notes: string;                  // 비고
  location: string;               // 수업장소
  durationMinutes: number;        // 1회 수업 시간(분)
  tuitionFee: number;             // 수업료 (원)
  contact: string;                // 연락처
  inflowChannel: string;          // 유입 경로
  region: string;                 // 지역
  curriculum: string;             // 커리큘럼
  leaveReason: string;            // 퇴원 사유
  isActive: boolean;              // 현재 수강 여부
  progress: string;               // 진도
  homework: string;               // 숙제 관리
  scheduleDays: string[];         // 수업 요일 ("월"·"화"·... 한글)
  createdAt: Timestamp;           // Firestore 자동 기록
  updatedAt: Timestamp;           // Firestore 자동 기록
}
```

## Firebase 연동 설정 (필수)

학생 데이터는 Firestore 에 저장되므로, 처음 한 번 본인 Firebase 프로젝트를 연결해 주어야 합니다. 약 5분 소요됩니다.

### 1) Firebase 프로젝트 생성

1. [Firebase 콘솔](https://console.firebase.google.com) 접속 → "프로젝트 추가"
2. 이름은 자유 (예: `haoting-admin`). Google Analytics 는 선택 (없어도 됨).

### 2) Firestore Database 생성

1. 좌측 메뉴 **Build → Firestore Database** → **데이터베이스 만들기**
2. 모드: 일단 **테스트 모드** 로 시작 (30일 후 만료, 운영 전엔 아래 규칙 교체)
3. 위치: **asia-northeast3 (Seoul)** 권장 (한국 사용자 대상)

### 3) 웹앱 등록 후 설정값 복사

1. 프로젝트 개요 화면 상단 **`</>` (웹) 아이콘** 클릭
2. 닉네임 입력 후 "앱 등록" (Hosting 설정은 건너뛰어도 됨)
3. 표시되는 `firebaseConfig` 객체를 복사

```js
// 예시 (실제 값은 본인 프로젝트에서 받음)
const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "haoting-admin.firebaseapp.com",
  projectId: "haoting-admin",
  storageBucket: "haoting-admin.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

### 4) `firebase-config.js` 에 붙여넣기

프로젝트 루트의 `firebase-config.js` 를 열어 `YOUR_*` 자리표시자를 본인 값으로 교체하고 저장합니다.

```js
window.HAOTING_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD...",                      // ← 교체
  authDomain: "haoting-admin.firebaseapp.com", // ← 교체
  projectId: "haoting-admin",                  // ← 교체
  storageBucket: "haoting-admin.appspot.com",  // ← 교체
  messagingSenderId: "123456789012",           // ← 교체
  appId: "1:123456789012:web:abc123def456",    // ← 교체
};
```

> 위 키들(특히 `apiKey`)은 일반적인 의미의 "비밀키" 가 아니라 **공개되어도 되는 식별자**입니다. 실제 보안은 Firestore 규칙에서 결정됩니다 (다음 단계).

### 5) Firestore 보안 규칙 설정

Firebase 콘솔 → **Firestore Database → 규칙** 탭. 아래 둘 중 하나를 선택해 적용하고 **게시**.

#### 옵션 A. 내부용 임시 규칙 (배포 URL 만 알아도 누구나 접근)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /students/{doc} {
      allow read, write: if true;
    }
  }
}
```

> URL 만 알면 누구나 데이터를 보거나 변경할 수 있습니다. **외부에 URL 이 노출될 가능성이 있다면 절대 사용하지 마세요.** 가족·친구가 우연히 접근할 수도 있는 정도라면, 운영 전에 옵션 B 로 교체를 강력히 권장합니다.

#### 옵션 B. Firebase Authentication 으로 보호 (권장)

Firebase 콘솔 → **Build → Authentication → 시작하기** → **Email/Password** 활성화. 두 선생님 이메일을 등록해 두고 규칙은 다음과 같이:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /students/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

앱은 위 규칙과 맞게 **Firebase Authentication**(이메일·비밀번호)으로 로그인한 뒤 Firestore 에 접근합니다. 콘솔 **Authentication → Users** 에서 선생님 계정을 추가하고, 필요하면 사용자 **이름(display name)** 을 설정해 사이드바 표시명을 맞춥니다.

### 6) 페이지를 새로고침하면 끝

브라우저에서 앱을 다시 로드하면 더미 학생 3명이 자동 시드되고, 이후 모든 변경은 Firestore 에 저장됩니다. 다른 기기에서 접속해도 동일한 데이터가 보이며, 한쪽에서 수정하면 다른 쪽 화면도 1초 안에 자동 갱신됩니다.

만약 이전 버전을 사용하면서 `localStorage` 에 학생 데이터가 쌓여 있었다면, 첫 실행 시 그 데이터가 자동으로 Firestore 로 옮겨집니다 ("이전 기기 데이터를 Firebase 로 옮겼습니다" 토스트 표시).

## 로컬 실행

`npm install` 후 **Firebase Authentication** 에서 로그인할 사용자를 만든 뒤, 정적 파일 서버로 열면 됩니다. Tailwind 클래스를 수정했다면 `npm run build:css` 로 `tailwind.css` 를 갱신합니다.

```bash
# 방법 1) Python 내장 서버
python3 -m http.server 5173

# 방법 2) Node 가 설치되어 있다면
npx --yes serve .

# 또는 VS Code 의 "Live Server" 확장 사용
```

브라우저에서 [http://localhost:5173](http://localhost:5173) 으로 접속합니다.

> `firebase.js` 는 ES 모듈을 사용하므로 정적 파일 서버를 통해 열어야 합니다. `index.html` 을 더블클릭으로 여는 `file://` 방식은 모듈 로드 보안 정책상 차단됩니다.

### 로그인 (Firebase Authentication)

앱은 **이메일·비밀번호** 로그인만 지원합니다. 계정은 Firebase 콘솔 **Authentication → Users** 에서 관리합니다.

**Vercel 등 배포 URL** 을 사용할 경우, Firebase 콘솔 → Authentication → **Settings → 승인된 도메인** 에 배포 도메인(예: `*.vercel.app`)을 추가해야 로그인할 수 있습니다.

### 첫 실행 시 동작

1. `firebase-config.js` 의 값이 비어 있으면 **"Firebase 설정이 필요합니다" 안내 배너**가 표시됩니다.
2. 설정이 끝난 뒤 페이지를 새로고침하면 로그인 화면이 나타납니다.
3. 로그인에 성공하면 학생 목록을 볼 수 있습니다.
4. Firestore 가 비어 있으면 더미 학생 3명이 자동 생성되어 한 번만 시드됩니다.

### 데이터 / 로컬 잔여 키

| 위치 | 키 | 설명 |
| --- | --- | --- |
| Firestore 콘솔 | `students` 컬렉션 | 학생 데이터 (수동 삭제 시 다음 접속에서 더미 재시드) |
| 브라우저 Local Storage | `haoting:students:v1` | 이전 버전 잔존 데이터 (마이그레이션 후 사용 안 함, 수동 삭제 가능) |

로그인 세션은 **Firebase Authentication** 이 관리합니다(브라우저 IndexedDB 등).

## Vercel 배포

1. 이 폴더를 GitHub 저장소로 push
2. [Vercel](https://vercel.com) 에서 해당 저장소를 Import
3. **Deploy** — 빌드는 `vercel.json` 의 `buildCommand`(`npm run build`)를 따릅니다.

배포 후 Firebase 콘솔의 **Authentication → Settings → 승인된 도메인** 에 Vercel 배포 도메인을 추가해 주세요.

`vercel.json` 에는 빌드 명령, 출력 디렉터리(`.` ), 캐시 헤더 등이 들어 있습니다.

## 라이선스

내부 사용을 위한 프로젝트로, 별도의 라이선스를 명시하지 않았습니다.
