// Public GET/POST /api/teacher/classes/:classId/students 요청 처리 로직
// (GET: Stage 0-D10-C, POST: D11-C3 로스터 등록)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입(동적 라우트 파라미터 추출
// 포함)에 의존하지 않는다. api/teacher/classes/[classId]/students.ts(얇은
// HTTP 어댑터)가 URL에서 classId를 뽑아 이 함수에 문자열로 넘긴다.
//
// 인가 순서(GET/POST 공통, 0-D10-C 확정 결정 그대로):
//   1. GET 또는 POST 확인
//   2. Authorization 헤더 → extractBearerToken() → 토큰 무효면 401
//   3. resolveTeacherFromAccessToken()으로 서버가 teacherId를 직접 확보
//      (invalid-token → 401 / not-approved → 200 {status:'not_approved'},
//      /api/teacher/me·/api/teacher/classes와 동일한 규약 유지)
//   4. classId 구조 확인(빈 문자열 등 명백히 잘못된 값이면 400)
//   5. assertTeacherOwnsClass(client, teacherId, classId) — false면 무조건
//      403 {error:'forbidden'}. 존재하지 않는 classId와 다른 교사의
//      classId를 구분하지 않는다(0-D10-C 확정 결정 2 — enumeration 방지).
//      D11-C3의 POST도 이 동일한 함수를 그대로 재사용한다(§5 요구사항 —
//      "새 authorization primitive를 만들지 않는다").
//   6. 5번을 통과했을 때만 GET은 listStudentsForClass(), POST는
//      registerRosterEntries()를 호출한다 — 인가에 실패하면 어느 쪽도
//      실행되지 않는다.
//
// POST body는 항상 `{ entries: [{ studentNo, name }, ...] }` 구조 하나로
// 통일한다(D11-C3 §14 권장안) — 단건 등록도 entries 배열 길이 1로 표현해
// 별도 single/bulk 경로를 만들지 않는다. raw pasted text 파싱은 이 파일이
// 하지 않는다(C4 UI 책임, teacher-roster-creation.ts 헤더 참고).
import { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken, resolveTeacherFromAccessToken } from './teacher-session';
import { assertTeacherOwnsClass } from './teacher-authorization';
import { listStudentsForClass, StudentSummary } from './teacher-student-data';
import { registerRosterEntries, RegisterRosterEntry } from './teacher-roster-creation';

export type TeacherStudentsHandlerResult = { httpStatus: number; body: unknown };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isValidRegisterRosterBody(v: unknown): v is { entries: RegisterRosterEntry[] } {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as { entries?: unknown };
  if (!Array.isArray(c.entries)) return false;
  return c.entries.every((entry): entry is RegisterRosterEntry => {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as { studentNo?: unknown; name?: unknown };
    return typeof e.studentNo === 'string' && typeof e.name === 'string';
  });
}

export async function handleTeacherStudentsRequest(
  method: string | undefined,
  authorizationHeader: string | undefined | null,
  classId: unknown,
  rawBody: string,
  client: SupabaseClient
): Promise<TeacherStudentsHandlerResult> {
  if (method !== 'GET' && method !== 'POST') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  if (!isNonEmptyString(classId)) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }

  let resolved;
  try {
    resolved = await resolveTeacherFromAccessToken(client, token);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  if (resolved.status === 'invalid-token') {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }
  if (resolved.status === 'not-approved') {
    return { httpStatus: 200, body: { status: 'not_approved' } };
  }

  let owns: boolean;
  try {
    owns = await assertTeacherOwnsClass(client, resolved.teacher.teacherId, classId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }
  if (!owns) {
    // 존재하지 않는 classId와 다른 교사의 classId를 구분하지 않는다 —
    // 둘 다 동일한 403으로 응답한다(0-D10-C 확정 결정 2).
    return { httpStatus: 403, body: { error: 'forbidden' } };
  }

  if (method === 'POST') {
    let parsed: unknown;
    try {
      parsed = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
    } catch {
      return { httpStatus: 400, body: { error: 'invalid json' } };
    }

    if (!isValidRegisterRosterBody(parsed)) {
      return { httpStatus: 400, body: { error: 'invalid request' } };
    }

    let result;
    try {
      result = await registerRosterEntries(client, classId, parsed.entries);
    } catch {
      return { httpStatus: 500, body: { error: 'internal error' } };
    }

    if (result.status === 'ok') {
      return { httpStatus: 200, body: { status: 'ok', students: result.entries } };
    }
    if (result.status === 'validation-failed') {
      return { httpStatus: 400, body: { error: 'invalid roster entries', details: result.errors } };
    }
    if (result.status === 'empty-entries') {
      return { httpStatus: 400, body: { error: 'invalid request' } };
    }
    if (result.status === 'duplicate-conflict') {
      return { httpStatus: 409, body: { error: 'duplicate student number' } };
    }
    // insert-failed / enrollment-failed / infra-error 모두 내부 DB detail
    // 없이 동일한 controlled 500으로 응답한다 — 원인 구분은 서버 로그
    // (compensation 실패 로그 등) 안에서만 이루어진다.
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  let students: StudentSummary[];
  try {
    students = await listStudentsForClass(client, classId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  return { httpStatus: 200, body: { status: 'ok', students } };
}
