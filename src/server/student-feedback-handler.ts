// Public GET /api/student-feedback 요청 처리 로직 (Stage D11-B10)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입에 의존하지 않는다.
// api/student-feedback.ts(얇은 HTTP 어댑터)가 req.headers.cookie를 그대로
// 넘긴다.
//
// identity 근거는 오직 student_session(HttpOnly 쿠키)뿐이다 — 이 함수는
// request body/query를 전혀 읽지 않으므로, 브라우저가 studentId/
// enrollmentId/classId 같은 값을 무엇을 보내든 애초에 identity로 쓰일
// 방법이 없다(0-D9-B의 "identity는 오직 서버가 스스로 확보한 값만 쓴다"
// 원칙과 동일 — api/events.ts/learning-event-handler.ts가 이미 이 패턴을
// 쓰고 있다).
//
// teacher_feedback 조회는 teacher-feedback-data.ts의
// listFeedbackForEnrollment()를 그대로 재사용한다 — 이 함수는 애초에
// authorization을 하지 않고 enrollmentId 하나만 받으므로(책임 분리 원칙,
// teacher-feedback-handler.ts와 동일하게 이 파일도 authorization은 직접
// session 검증만으로 끝낸다), teacher 전용 authorization 체인
// (assertTeacherOwnsClass/assertStudentEnrolledInClass)을 학생 API에
// 복제할 필요가 없다.
//
// 이 endpoint는 read-only이므로 learning-event-handler.ts의
// verifyEnrollmentConsistency() 같은 추가 DB 재확인은 의도적으로 넣지
// 않았다 — 그 재확인은 "쓰기 작업이 잘못된 enrollment에 새 행을 남기는
// 것"을 막기 위한 것이었고, 이 endpoint는 이미 존재하는 teacher_feedback
// 행을 enrollment_id로 조회만 할 뿐 아무 것도 쓰지 않는다.
//
// 응답은 학생에게 필요한 최소 정보만 담는다 — teacherId/enrollmentId/
// studentId/classId/eventId 같은 내부 식별자는 포함하지 않는다.
import { SupabaseClient } from '@supabase/supabase-js';
import { parseStudentSessionCookie, verifyStudentSession } from './student-session';
import { listFeedbackForEnrollment } from './teacher-feedback-data';

export type StudentFeedbackHandlerResult = { httpStatus: number; body: unknown };

export type StudentFeedbackItem = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export async function handleStudentFeedbackRequest(
  method: string | undefined,
  cookieHeader: string | undefined | null,
  client: SupabaseClient
): Promise<StudentFeedbackHandlerResult> {
  if (method !== 'GET') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  const session = verifyStudentSession(parseStudentSessionCookie(cookieHeader));
  if (!session) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  let feedback;
  try {
    feedback = await listFeedbackForEnrollment(client, session.enrollmentId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  const minimized: StudentFeedbackItem[] = feedback.map((f) => ({
    id: f.feedbackId,
    content: f.content,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));

  return { httpStatus: 200, body: { status: 'ok', feedback: minimized } };
}
