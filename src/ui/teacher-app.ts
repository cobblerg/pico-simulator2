// 교사 인증 진입점 (Stage 0-D10-A)
//
// src/ui/app.ts(학생 시뮬레이터)와 완전히 분리된 별도 entry point다 —
// build.mjs가 이 파일만 별도로 esbuild 번들해 dist/teacher.html을 만든다.
// app.ts는 이 파일을 import하지 않고, 이 파일도 app.ts/student-entry-ui.ts/
// student-session.ts 등 학생 쪽 코드를 전혀 import하지 않는다 — 두 세션은
// 완전히 독립이다(0-D10-A 정책 9, §9 "교사 로그아웃과 학생 로그아웃은 완전히
// 독립이어야 한다").
//
// 이 파일이 절대 하지 않는 것(0-D10-A 정책):
//   - Supabase 학생/학급/learning_event 테이블을 직접 SELECT하지 않는다
//     (Supabase Auth API만 쓴다 — auth.signInWithOAuth/getSession/signOut/
//     onAuthStateChange).
//   - /api/student-session/logout을 호출하지 않는다.
//   - sessionStorage['picosim:student-context']를 지우거나 읽지 않는다.
//   - GET /api/teacher/me 응답을 받아 "승인 teacher"로 표시하는 것 외에
//     어떤 학급/학생 데이터도 요청하지 않는다(대시보드는 0-D10-A 범위 밖).
//
// __TEACHER_SUPABASE_URL__/__TEACHER_SUPABASE_ANON_KEY__는 build.mjs가 이
// 번들에만 esbuild define으로 주입하는 공개 가능한 값이다(anon key는 RLS로
// 보호되는 브라우저 공개 설정이며, service-role 성격의
// SUPABASE_SECRET_KEY/STUDENT_SESSION_SECRET와는 신뢰 등급이 완전히 다르다)
// — 이 두 전역은 이 파일이 정의하지 않는다, build.mjs가 정의해 준다.
import { createClient, Session } from '@supabase/supabase-js';

declare const __TEACHER_SUPABASE_URL__: string;
declare const __TEACHER_SUPABASE_ANON_KEY__: string;

const supabase = createClient(__TEACHER_SUPABASE_URL__, __TEACHER_SUPABASE_ANON_KEY__);

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

const loggedOutEl = el<HTMLElement>('t-logged-out');
const checkingEl = el<HTMLElement>('t-checking');
const approvedEl = el<HTMLElement>('t-approved');
const notApprovedEl = el<HTMLElement>('t-not-approved');
const nameEl = el<HTMLElement>('t-name');
const loginBtn = el<HTMLButtonElement>('t-login');
const logoutBtn = el<HTMLButtonElement>('t-logout');

type UiState = 'logged-out' | 'checking' | 'approved' | 'not-approved';

function setUiState(state: UiState, displayName?: string): void {
  loggedOutEl.hidden = state !== 'logged-out';
  checkingEl.hidden = state !== 'checking';
  approvedEl.hidden = state !== 'approved';
  notApprovedEl.hidden = state !== 'not-approved';
  logoutBtn.hidden = state !== 'approved' && state !== 'not-approved';
  if (state === 'approved' && displayName !== undefined) nameEl.textContent = displayName;
}

type TeacherMeResponse =
  | { status: 'ok'; teacher: { teacherId: string; displayName: string } }
  | { status: 'not_approved' };

// 같은 access_token으로 중복 호출하지 않는다 — getSession()과
// onAuthStateChange(초기 구독 시 INITIAL_SESSION 이벤트 포함)가 페이지
// 로드 시점에 같은 session을 여러 번 넘겨줄 수 있기 때문이다(0-D10-A 정책
// 9의 "중복 호출이나 무한 루프가 생기지 않게" 요구사항).
let lastCheckedAccessToken: string | null = null;

async function checkTeacherStatus(session: Session): Promise<void> {
  if (session.access_token === lastCheckedAccessToken) return;
  lastCheckedAccessToken = session.access_token;

  setUiState('checking');
  try {
    const res = await fetch('/api/teacher/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      // 401(unauthorized) 포함 — access token이 서버 기준으로 이미
      // 무효라는 뜻이므로 로그인 화면으로 되돌아간다.
      setUiState('logged-out');
      return;
    }
    const body = (await res.json()) as TeacherMeResponse;
    if (body.status === 'ok') {
      setUiState('approved', body.teacher.displayName);
    } else {
      setUiState('not-approved');
    }
  } catch {
    // 네트워크 오류 — 토큰/PII를 console에 남기지 않는다.
    setUiState('logged-out');
  }
}

function handleSession(session: Session | null): void {
  if (!session) {
    lastCheckedAccessToken = null;
    setUiState('logged-out');
    return;
  }
  void checkTeacherStatus(session);
}

loginBtn.addEventListener('click', () => {
  void supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/teacher.html` },
  });
});

logoutBtn.addEventListener('click', () => {
  void supabase.auth.signOut().then(() => {
    lastCheckedAccessToken = null;
    setUiState('logged-out');
  });
});

supabase.auth.onAuthStateChange((_event, session) => {
  handleSession(session);
});

void supabase.auth.getSession().then(({ data }) => {
  handleSession(data.session);
});
