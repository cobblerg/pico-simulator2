// 교사 피드백 저장/조회/수정 (Stage 0-D10-E)
//
// teacher-authorization.ts(assertTeacherOwnsClass/assertStudentEnrolledInClass)가
// 검증한 enrollmentId만을 조회/작성 근거로 삼는다 — 이 파일 자체는
// authorization을 전혀 하지 않는다(teacher-student-data.ts/
// teacher-timeline-data.ts와 동일한 책임 분리 원칙).
//
// content validation(빈 문자열/공백/길이 상한/identity 필드 거부)은 이
// 파일의 책임이 아니다 — teacher-feedback-handler.ts/
// teacher-feedback-update-handler.ts가 이미 검증한 값만 이 함수들에 넘긴다.
import { SupabaseClient } from '@supabase/supabase-js';

export type TeacherFeedbackDTO = {
  feedbackId: string;
  content: string;
  eventId: string | null;
  createdAt: string;
  updatedAt: string;
};

const MAX_FEEDBACK_ITEMS = 100;
const FEEDBACK_COLUMNS = 'feedback_id, content, event_id, created_at, updated_at';

type FeedbackRow = {
  feedback_id: string;
  content: string;
  event_id: string | null;
  created_at: string;
  updated_at: string;
};

function toDTO(row: FeedbackRow): TeacherFeedbackDTO {
  return {
    feedbackId: row.feedback_id,
    content: row.content,
    eventId: row.event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 검증된 enrollmentId의 feedback만 반환한다. teacher-timeline-data.ts의
// listRecentLearningEventsForEnrollment()와 동일한 이유로 DESC + LIMIT으로
// "최근 N개"를 먼저 가져온 뒤 reverse()로 오래된 것 → 최신 순으로 맞춘다 —
// ASC + LIMIT을 쓰면 "최초 N개"가 되어버리기 때문이다.
export async function listFeedbackForEnrollment(
  client: SupabaseClient,
  enrollmentId: string
): Promise<TeacherFeedbackDTO[]> {
  const { data, error } = await client
    .from('teacher_feedback')
    .select(FEEDBACK_COLUMNS)
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: false })
    .limit(MAX_FEEDBACK_ITEMS);

  if (error) throw error;

  return (data as FeedbackRow[]).slice().reverse().map(toDTO);
}

// event_id는 이 함수 시그니처 자체에 없다 — 이번 D10-E는 항상 null로
// 저장한다(0-D10-E 확정 결정 1). 향후 특정 이벤트 feedback이 추가되면 이
// 함수에 eventId 인자가 추가될 것이다(스키마는 이미 nullable FK로 준비돼
// 있음).
export async function insertFeedback(
  client: SupabaseClient,
  params: { teacherId: string; enrollmentId: string; content: string }
): Promise<TeacherFeedbackDTO> {
  const { data, error } = await client
    .from('teacher_feedback')
    .insert({
      teacher_id: params.teacherId,
      enrollment_id: params.enrollmentId,
      event_id: null,
      content: params.content,
    })
    .select(FEEDBACK_COLUMNS)
    .single();

  if (error) throw error;
  return toDTO(data as FeedbackRow);
}

// UPDATE는 feedback_id만으로 실행하지 않는다 — teacher_id/enrollment_id를
// WHERE에 함께 걸어 "내가 쓴, 이 학생의 feedback"만 수정 가능하게 한다(0-D10-E
// 확정 결정 9/13). 세 조건을 모두 만족하는 행이 정확히 없으면(존재하지 않는
// feedbackId, 다른 교사의 feedback, 다른 enrollment의 feedback 전부 포함)
// null을 반환한다 — 세 실패 사유를 여기서부터 구분하지 않는다(호출부가
// 구분해서 응답할 방법 자체가 없다).
export async function updateOwnFeedback(
  client: SupabaseClient,
  params: { feedbackId: string; teacherId: string; enrollmentId: string; content: string }
): Promise<TeacherFeedbackDTO | null> {
  const { data, error } = await client
    .from('teacher_feedback')
    .update({ content: params.content, updated_at: new Date().toISOString() })
    .eq('feedback_id', params.feedbackId)
    .eq('teacher_id', params.teacherId)
    .eq('enrollment_id', params.enrollmentId)
    .select(FEEDBACK_COLUMNS);

  if (error) throw error;
  if (data.length !== 1) return null;

  return toDTO(data[0] as FeedbackRow);
}
