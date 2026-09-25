// 교사 Supabase Auth token 검증 + 승인 teacher 조회 (Stage 0-D10-A)
//
// 학생 흐름(student-session.ts)과 인증 메커니즘이 완전히 다르다 — 학생은
// 이 서버가 직접 HMAC으로 서명/검증하는 자체 세션이고, 교사는 Supabase
// Auth(Google OAuth)가 발급한 access token을 Supabase 서버에 검증시킨다.
// 두 모듈은 서로를 import하지 않는다 — 완전히 독립된 신뢰 경계다.
//
// 이 파일이 지키는 핵심 원칙(0-D10-A 정책 3): "Google 로그인 성공"과
// "PicoSim 교사 승인"은 다른 사건이다. access token이 유효하다는 것은
// auth.users에 그 사람이 존재한다는 것만 증명하고, teacher 테이블에 그
// auth_user_id로 등록된 row가 있어야만 비로소 승인 교사다. teacher row는
// 이 파일을 포함해 어떤 코드도 자동으로 만들지 않는다 — 관리자가 Supabase
// SQL Editor에서 수동으로 INSERT한다(0-D10-A audit §8).
//
// 책임 분리: 이 파일은 두 책임을 의도적으로 서로 다른 함수로 나눈다.
//   - verifyAccessToken(): "이 토큰은 누구의 것인가"만 답한다(Auth 검증).
//   - findApprovedTeacherByAuthUserId(): "이 사람은 승인 교사인가"만
//     답한다(teacher 테이블 조회).
// 두 함수 모두 같은 SupabaseClient(service-role, src/server/supabase.ts의
// createServerSupabaseClient())를 인자로 받는다 — 이 프로젝트는 브라우저용
// anon key를 서버 환경변수로 별도로 두지 않으므로(0-D10-A는 PUBLIC_
// 환경변수를 오직 teacher 브라우저 번들에만 주입하기로 정했다, §11), 새
// 서버 전용 anon-key 클라이언트를 추가로 만들지 않고 기존 service-role
// client를 재사용한다. client.auth.getUser(token)은 인자로 받은 토큰의
// 서명/만료를 Supabase Auth 서버가 검증하는 API이므로(로컬 decode가 아님),
// 어떤 API key로 만든 client를 통해 부르든 검증 결과 자체는 동일하다 — 단,
// "무엇을 검증하는 함수"와 "무엇을 조회하는 함수"를 코드에서 분리해 두는
// 것만으로 책임 혼동(예: 조회 로직 안에서 몰래 토큰 신뢰를 생략하는 실수)을
// 막는다는 것이 이 분리의 실질적 목적이다.
import { SupabaseClient } from '@supabase/supabase-js';

export type TeacherIdentity = {
  teacherId: string;
  displayName: string;
};

type TeacherRow = {
  teacher_id: string;
  display_name: string;
};

const BEARER_PREFIX = 'Bearer ';

export function extractBearerToken(authorizationHeader: string | undefined | null): string | null {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith(BEARER_PREFIX)) return null;
  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

// Supabase Auth 서버에 실제로 토큰을 검증시킨다 — JWT를 로컬에서 decode만
// 해서 서명 확인 없이 payload를 신뢰하는 일은 절대 하지 않는다.
// getUser(accessToken)은 전달받은 토큰을 Supabase Auth 서버에 보내
// 서명/만료를 검증하고, 유효할 때만 그 토큰이 가리키는 auth.users row를
// 돌려주는 API다. 이 함수는 auth_user_id 확보까지만 책임진다 — teacher
// 테이블은 건드리지 않는다.
async function verifyAccessToken(client: SupabaseClient, accessToken: string): Promise<string | null> {
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

// teacher 테이블 조회만 책임진다 — 토큰을 다루지 않는다. 0개(미승인) 또는
// 2개 이상(auth_user_id UNIQUE 제약상 정상적으로는 불가능하지만, learning-
// event-data.ts의 verifyEnrollmentConsistency와 동일하게 방어적으로 처리)
// 모두 "승인된 teacher 없음"으로 취급한다.
async function findApprovedTeacherByAuthUserId(
  client: SupabaseClient,
  authUserId: string
): Promise<TeacherIdentity | null> {
  const { data, error } = await client
    .from('teacher')
    .select('teacher_id, display_name')
    .eq('auth_user_id', authUserId)
    .limit(2);

  if (error) throw error;
  if (data.length !== 1) return null;

  const row = data[0] as TeacherRow;
  return { teacherId: row.teacher_id, displayName: row.display_name };
}

export type ResolveTeacherResult =
  | { status: 'ok'; teacher: TeacherIdentity }
  | { status: 'invalid-token' }
  | { status: 'not-approved' };

// 두 책임(토큰 검증 → teacher 조회)을 순서대로 엮는 조합 함수 — 호출부는
// 이 함수 하나만 부르면 된다. 이 함수 자체가 반환하는 결과는 세 가지를
// 구분하지만("invalid-token" vs "not-approved"), 그 구분을 외부(HTTP
// 응답)에 얼마나/어떻게 노출할지는 이 파일이 아니라 handler 경계
// (teacher-me-handler.ts)가 결정한다 — student-entry-handler.ts가 내부
// StudentEntryResult와 public response를 분리하는 것과 동일한 경계 원칙.
export async function resolveTeacherFromAccessToken(
  client: SupabaseClient,
  accessToken: string
): Promise<ResolveTeacherResult> {
  const authUserId = await verifyAccessToken(client, accessToken);
  if (!authUserId) return { status: 'invalid-token' };

  const teacher = await findApprovedTeacherByAuthUserId(client, authUserId);
  if (!teacher) return { status: 'not-approved' };

  return { status: 'ok', teacher };
}
