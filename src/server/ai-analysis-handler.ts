// Public POST /api/teacher/classes/:classId/students/:studentId/ai-analysis
// 요청 처리 로직 (Stage 0-D11-A)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입에 의존하지 않는다.
// api/teacher/classes/[classId]/students/[studentId]/ai-analysis.ts(얇은
// HTTP 어댑터)가 URL에서 classId/studentId를 뽑아 넘긴다.
//
// 인가 순서는 teacher-timeline-handler.ts/teacher-feedback-handler.ts와
// 완전히 동일하다(classId ownership → student enrollment) — 신규
// authorization helper를 만들지 않았다(0-D11-A 확정 범위).
//
//   1. 메서드 확인(POST만)
//   2. Authorization 헤더 → extractBearerToken() → 없으면 401
//   3. classId/studentId 구조 확인(빈 문자열 등이면 400)
//   4. resolveTeacherFromAccessToken()으로 서버가 teacherId를 직접 확보
//      (invalid-token → 401 / not-approved → 200 {status:'not_approved'})
//   5. assertTeacherOwnsClass() — false면 403
//   6. assertStudentEnrolledInClass() — null이면 403(5번과 동일한 응답)
//   7. 검증된 enrollmentId로만 listRecentLearningEventsForEnrollment()
//      (0-D10-D 재사용 — 이미 run/real-run의 code가 제거된 이벤트만 나옴)
//   8. 이벤트가 하나도 없으면 OpenAI를 호출하지 않고 즉시
//      {status:'ok', analysis:null}을 반환한다(정상적인 빈 상태).
//   9. buildAIInputEvents()로 AI 전용 최소 입력을 구성하고
//      analyzeLearningPattern()을 호출한다 — provider 실패(timeout/
//      rate limit/4xx/5xx/malformed output/refusal 등 무엇이든)는
//      구분 없이 500으로 흡수한다.
//
// 브라우저가 body로 보내는 값은 전혀 읽지 않는다 — teacherId/
// enrollmentId/events/raw payload/student code/AI prompt 그 무엇도
// 브라우저에서 받지 않는다(요구사항 §11).
import { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken, resolveTeacherFromAccessToken } from './teacher-session';
import { assertTeacherOwnsClass, assertStudentEnrolledInClass } from './teacher-authorization';
import { listRecentLearningEventsForEnrollment } from './teacher-timeline-data';
import { buildAIInputEvents, analyzeLearningPattern, logAIProviderFailure, AIProviderCall, AIAnalysisResult } from './ai-learning-analysis';

export type AIAnalysisHandlerResult = { httpStatus: number; body: unknown };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export async function handleAIAnalysisRequest(
  method: string | undefined,
  authorizationHeader: string | undefined | null,
  classId: unknown,
  studentId: unknown,
  client: SupabaseClient,
  aiProvider: AIProviderCall
): Promise<AIAnalysisHandlerResult> {
  if (method !== 'POST') {
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

  let events;
  try {
    events = await listRecentLearningEventsForEnrollment(client, enrollmentId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  if (events.length === 0) {
    // 정상적인 빈 상태 — OpenAI를 호출하지 않는다(비용 통제, 요구사항 §12).
    return { httpStatus: 200, body: { status: 'ok', analysis: null } };
  }

  const aiEvents = buildAIInputEvents(events);

  let analysis: AIAnalysisResult;
  try {
    analysis = await analyzeLearningPattern(aiEvents, aiProvider);
  } catch (error) {
    // OPENAI_API_KEY 누락, timeout, rate limit, provider 4xx/5xx,
    // malformed structured output, refusal, 예기치 못한 SDK 오류 —
    // 전부 구분 없이 브라우저에는 동일한 500으로 흡수한다(응답 body는
    // 절대 바꾸지 않는다). 진단을 위해 Vercel 서버 로그에만 안전한 필드를
    // 남긴다 — logAIProviderFailure()는 error 객체 하나만 받으며, classId/
    // studentId/teacherId/enrollmentId/access token/이벤트 payload는 이
    // 함수 호출부에 애초에 없으므로 로그로 새어나갈 방법이 없다.
    logAIProviderFailure(error);
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  return { httpStatus: 200, body: { status: 'ok', analysis } };
}
