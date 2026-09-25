// 학생 세션 서버 서명/검증 + HttpOnly 쿠키 직렬화 (Stage 0-D9-A1)
//
// StudentContext(sessionStorage, src/ui/student-entry-ui.ts)는 계속
// UI 게이트 상태로만 쓰이고, 학습 Event 같은 서버 authorization의 근거로는
// 절대 쓰이지 않는다 — 이 모듈이 발급/검증하는 student_session(HttpOnly
// 쿠키)만이 서버가 스스로 신뢰할 수 있는 identity 근거다.
//
// Node 내장 crypto만 사용한다 — 새 npm package를 추가하지 않는다.
// secret이나 토큰 전체를 console/log/error에 절대 출력하지 않는다.
//
// 서명 키(STUDENT_SESSION_SECRET)는 SUPABASE_SECRET_KEY와 별개의 환경변수다
// — 0-D9 architecture review의 key separation 원칙(서로 다른 권한 범위의
// 키를 재사용하지 않는다)에 따른 것이다.
import { createHmac, timingSafeEqual } from 'crypto';

export type StudentSessionIdentity = {
  studentId: string;
  enrollmentId: string;
  classId: string;
};

export type StudentSessionPayload = StudentSessionIdentity & {
  iat: number; // 발급 시각(초 단위 unix time)
  exp: number; // 만료 시각(초 단위 unix time)
};

// 수업 단위 사용을 고려한 만료 시간. 8시간으로 정한 이유: 학생이 하루
// 등교 시간 동안 여러 교시에 걸쳐 시뮬레이터를 다시 열어도(F5, 탭 재방문)
// 재입장 없이 이어서 쓸 수 있을 만큼 충분히 길게 잡되, 24시간보다는
// 확실히 짧게 잡아 방치된 교실 PC가 다음날 아침까지도 전날 학생으로
// 인증되는 상황을 막는다.
export const STUDENT_SESSION_TTL_SECONDS = 8 * 60 * 60;

export const STUDENT_SESSION_COOKIE_NAME = 'student_session';

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

function getSecret(): string {
  const secret = process.env.STUDENT_SESSION_SECRET;
  if (!secret) {
    // 조용히 생략하지 않는다 — 호출부(API 핸들러)가 이 예외를 잡아 항상
    // generic 500으로만 변환해 응답한다. 이 메시지 자체도 secret 값을
    // 담지 않는다(이름만 언급).
    throw new Error('STUDENT_SESSION_SECRET 환경변수가 설정되어 있지 않습니다 (server-only).');
  }
  return secret;
}

function sign(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function createStudentSession(identity: StudentSessionIdentity): string {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload: StudentSessionPayload = {
    studentId: identity.studentId,
    enrollmentId: identity.enrollmentId,
    classId: identity.classId,
    iat: now,
    exp: now + STUDENT_SESSION_TTL_SECONDS,
  };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signatureB64 = base64url(sign(payloadB64, secret));
  return `${payloadB64}.${signatureB64}`;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isValidPayloadShape(v: unknown): v is StudentSessionPayload {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    isNonEmptyString(c.studentId) &&
    isNonEmptyString(c.enrollmentId) &&
    isNonEmptyString(c.classId) &&
    typeof c.iat === 'number' &&
    typeof c.exp === 'number'
  );
}

// 실패 조건: 토큰 형식 오류, signature mismatch, 만료, malformed payload,
// 필수 id 누락 — 전부 null을 반환한다(어느 쪽이 실패 원인인지 호출부에
// 구분해서 알려주지 않는다 — 정보 노출 최소화, 0-D7-B의 "실패 사유를 하나로
// 접는다" 원칙과 동일).
export function verifyStudentSession(token: string | undefined | null): StudentSessionPayload | null {
  if (!isNonEmptyString(token)) return null;

  const dot = token.indexOf('.');
  if (dot === -1 || token.indexOf('.', dot + 1) !== -1) return null; // 정확히 점 하나
  const payloadB64 = token.slice(0, dot);
  const signatureB64 = token.slice(dot + 1);
  if (!payloadB64 || !signatureB64) return null;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null; // 설정 오류도 검증 실패로 취급한다
  }

  let expectedSignature: Buffer;
  let actualSignature: Buffer;
  try {
    expectedSignature = sign(payloadB64, secret);
    actualSignature = fromBase64url(signatureB64);
  } catch {
    return null;
  }

  // timing-safe 비교. 길이가 다르면 timingSafeEqual이 예외를 던지므로
  // 먼저 길이를 확인한다(길이 확인 자체는 비밀값 비교가 아니므로 타이밍
  // 공격 표면이 아니다).
  if (expectedSignature.length !== actualSignature.length) return null;
  if (!timingSafeEqual(expectedSignature, actualSignature)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(fromBase64url(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  if (!isValidPayloadShape(payload)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  return payload;
}

// ---------- HttpOnly 쿠키 직렬화 ----------
//
// Production(Vercel) 여부는 클라이언트가 보내는 어떤 값도 참조하지 않고,
// Vercel이 모든 배포(Production/Preview 공통)에 자동으로 설정하는 시스템
// 환경변수 VERCEL=1만으로 판단한다 — 이 값은 요청 헤더나 쿼리스트링이
// 아니라 서버 프로세스 환경 자체에 있으므로 클라이언트가 조작할 수 없다.
// Vercel 배포는 Preview 포함 항상 HTTPS이므로 이 조건이면 항상 Secure를
// 켠다. 로컬 개발(npm start, http://localhost)에서는 이 값이 없으므로
// Secure를 켜지 않는다 — 그렇지 않으면 로컬 http에서 쿠키가 저장되지 않아
// 로그인 자체가 깨진다. HttpOnly/SameSite=Lax/Path=/는 환경과 무관하게
// 항상 적용한다 — 이 셋을 로컬에서 낮추는 것은 임의로 보안을 약화시키는
// 것이므로 하지 않는다.
function isProductionEnvironment(): boolean {
  return process.env.VERCEL === '1';
}

export function serializeStudentSessionCookie(token: string): string {
  const attrs = [
    `${STUDENT_SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${STUDENT_SESSION_TTL_SECONDS}`,
  ];
  if (isProductionEnvironment()) attrs.push('Secure');
  return attrs.join('; ');
}

export function serializeExpiredStudentSessionCookie(): string {
  const attrs = [`${STUDENT_SESSION_COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (isProductionEnvironment()) attrs.push('Secure');
  return attrs.join('; ');
}

export function parseStudentSessionCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === STUDENT_SESSION_COOKIE_NAME) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

// ---------- POST /api/student-session/logout 순수 로직 ----------
//
// api/student-session/logout.ts(얇은 HTTP 어댑터)가 이 함수를 감싼다 —
// student-entry-handler.ts와 동일한 패턴(Vercel 타입에 의존하지 않는 순수
// 함수)이라 Node http 객체를 흉내 내지 않고도 단위 테스트할 수 있다.
export type StudentSessionLogoutResult = { httpStatus: number; body: unknown; headers?: Record<string, string> };

export function handleStudentSessionLogout(method: string | undefined): StudentSessionLogoutResult {
  if (method !== 'POST') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }
  return {
    httpStatus: 200,
    body: { status: 'ok' },
    headers: { 'Set-Cookie': serializeExpiredStudentSessionCookie() },
  };
}
