// Public GET/POST /api/teacher/classes/:classId/students/:studentId/feedback
// 요청 처리 로직 (Stage 0-D10-E)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입에 의존하지 않는다.
// api/teacher/classes/[classId]/students/[studentId]/feedback.ts(얇은 HTTP
// 어댑터)가 URL에서 classId/studentId를 뽑고 raw body를 문자열로 넘긴다.
//
// GET/POST 공통 인가 순서(0-D10-E 확정 결정 5):
//   1. 메서드 확인(GET 또는 POST만)
//   2. Authorization 헤더 → extractBearerToken() → 없으면 401
//   3. classId/studentId 구조 확인(빈 문자열 등이면 400)
//   4. resolveTeacherFromAccessToken()으로 서버가 teacherId를 직접 확보
//      (invalid-token → 401 / not-approved → 200 {status:'not_approved'})
//   5. assertTeacherOwnsClass(client, teacherId, classId) — false면 403
//   6. assertStudentEnrolledInClass(client, classId, studentId) — null이면
//      403(5번과 동일한 응답, teacher-timeline-handler.ts와 동일한 원칙)
//   7. 5·6을 모두 통과했을 때만 GET(목록 조회)/POST(작성)를 수행한다.
//
// eventId는 이번 단계에서 browser로부터 받지 않는다(0-D10-E 확정 결정 1/7)
// — assertEventBelongsToEnrollment() 같은 event ownership 검증은 이번
// 단계에 구현하지 않는다(설계 리뷰에서 필요하다고 판단했던 것은 eventId를
// 실제로 받을 때의 이야기이며, 이번 MVP는 그 입력 자체가 없다).
import { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken, resolveTeacherFromAccessToken } from './teacher-session';
import { assertTeacherOwnsClass, assertStudentEnrolledInClass } from './teacher-authorization';
import { listFeedbackForEnrollment, insertFeedback, TeacherFeedbackDTO } from './teacher-feedback-data';

export type TeacherFeedbackHandlerResult = { httpStatus: number; body: unknown };

const MAX_CONTENT_LENGTH = 2000;
// 브라우저가 이 필드들을 body에 넣으면 조용히 무시하지 않고 명시적으로
// 거부한다(0-D9-B/0-D10-B의 "위조 시도를 조용히 무시하지 않고 드러낸다"
// 원칙 재사용) — teacherId/enrollmentId/studentId/classId는 서버가 이미
// token/URL로부터 확보하므로 body에 있을 이유가 없고, eventId는 이번
// 단계에서 아예 지원하지 않는다.
const IDENTITY_FIELD_NAMES = ['teacherId', 'enrollmentId', 'studentId', 'classId', 'eventId'] as const;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

type ContentValidation = { ok: true; content: string } | { ok: false };

// 빈 문자열/whitespace-only/최대 길이 초과를 거부하고, 저장할 때는 trim된
// content를 쓴다(0-D10-E 확정 결정 7).
function validateContent(v: unknown): ContentValidation {
  if (typeof v !== 'string') return { ok: false };
  const trimmed = v.trim();
  if (trimmed.length === 0) return { ok: false };
  if (trimmed.length > MAX_CONTENT_LENGTH) return { ok: false };
  return { ok: true, content: trimmed };
}

export async function handleTeacherFeedbackRequest(
  method: string | undefined,
  authorizationHeader: string | undefined | null,
  classId: unknown,
  studentId: unknown,
  rawBody: string,
  client: SupabaseClient
): Promise<TeacherFeedbackHandlerResult> {
  if (method !== 'GET' && method !== 'POST') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  if (!isNonEmptyString(classId) || !isNonEmptyString(studentId)) {
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
    return { httpStatus: 403, body: { error: 'forbidden' } };
  }

  let enrollmentId: string | null;
  try {
    enrollmentId = await assertStudentEnrolledInClass(client, classId, studentId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }
  if (!enrollmentId) {
    return { httpStatus: 403, body: { error: 'forbidden' } };
  }

  if (method === 'GET') {
    let feedback: TeacherFeedbackDTO[];
    try {
      feedback = await listFeedbackForEnrollment(client, enrollmentId);
    } catch {
      return { httpStatus: 500, body: { error: 'internal error' } };
    }
    return { httpStatus: 200, body: { status: 'ok', feedback } };
  }

  // POST
  let parsed: unknown;
  try {
    parsed = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
  } catch {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }
  const body = parsed as Record<string, unknown>;

  if (IDENTITY_FIELD_NAMES.some((k) => k in body)) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }

  const validated = validateContent(body.content);
  if (!validated.ok) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }

  let created: TeacherFeedbackDTO;
  try {
    created = await insertFeedback(client, {
      teacherId: resolved.teacher.teacherId,
      enrollmentId,
      content: validated.content,
    });
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  return { httpStatus: 200, body: { status: 'ok', feedback: created } };
}
