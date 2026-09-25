// Public PATCH
// /api/teacher/classes/:classId/students/:studentId/feedback/:feedbackId
// 요청 처리 로직 (Stage 0-D10-E)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입에 의존하지 않는다.
// api/teacher/classes/[classId]/students/[studentId]/feedback/[feedbackId].ts
// (얇은 HTTP 어댑터)가 URL에서 classId/studentId/feedbackId를 뽑고 raw
// body를 문자열로 넘긴다.
//
// 인가 순서는 teacher-feedback-handler.ts와 완전히 동일하다(classId
// ownership → student enrollment). 다른 점은 마지막 단계뿐이다 —
// updateOwnFeedback()이 feedback_id + teacher_id + enrollment_id 세 조건을
// 모두 만족하는 행만 수정하고, 매칭되는 행이 없으면(존재하지 않는
// feedbackId, 다른 교사의 feedback, 다른 enrollment의 feedback 전부 포함)
// null을 반환한다 — 이 경우 handler는 그 셋을 구분하지 않고 동일한 403
// forbidden으로 응답한다(0-D10-E 확정 결정 9/16).
import { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken, resolveTeacherFromAccessToken } from './teacher-session';
import { assertTeacherOwnsClass, assertStudentEnrolledInClass } from './teacher-authorization';
import { updateOwnFeedback, TeacherFeedbackDTO } from './teacher-feedback-data';

export type TeacherFeedbackUpdateHandlerResult = { httpStatus: number; body: unknown };

const MAX_CONTENT_LENGTH = 2000;
const IDENTITY_FIELD_NAMES = ['teacherId', 'enrollmentId', 'studentId', 'classId', 'eventId', 'feedbackId'] as const;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

type ContentValidation = { ok: true; content: string } | { ok: false };

function validateContent(v: unknown): ContentValidation {
  if (typeof v !== 'string') return { ok: false };
  const trimmed = v.trim();
  if (trimmed.length === 0) return { ok: false };
  if (trimmed.length > MAX_CONTENT_LENGTH) return { ok: false };
  return { ok: true, content: trimmed };
}

export async function handleTeacherFeedbackUpdateRequest(
  method: string | undefined,
  authorizationHeader: string | undefined | null,
  classId: unknown,
  studentId: unknown,
  feedbackId: unknown,
  rawBody: string,
  client: SupabaseClient
): Promise<TeacherFeedbackUpdateHandlerResult> {
  if (method !== 'PATCH') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  if (!isNonEmptyString(classId) || !isNonEmptyString(studentId) || !isNonEmptyString(feedbackId)) {
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

  let updated: TeacherFeedbackDTO | null;
  try {
    updated = await updateOwnFeedback(client, {
      feedbackId,
      teacherId: resolved.teacher.teacherId,
      enrollmentId,
      content: validated.content,
    });
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  if (!updated) {
    // feedbackId만으로 UPDATE하지 않는다 — teacher_id/enrollment_id 불일치와
    // 존재하지 않는 feedbackId를 구분하지 않고 동일한 403으로 응답한다.
    return { httpStatus: 403, body: { error: 'forbidden' } };
  }

  return { httpStatus: 200, body: { status: 'ok', feedback: updated } };
}
