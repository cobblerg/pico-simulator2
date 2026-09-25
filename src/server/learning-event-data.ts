// Supabase 기반 learning_event 데이터 계층 (Stage 0-D9-B)
//
// supabase-student-data.ts와 동일한 패턴을 따른다: SupabaseClient를 인자로
// 받고(secret key는 이 파일 안에서 직접 읽지 않음), snake_case(DB) ↔
// camelCase(도메인) 매핑을 이 파일이 책임지며, 쿼리 에러는 그대로 throw해
// 호출자(learning-event-handler.ts)가 infrastructure failure로 처리하게
// 둔다.
//
// 이 파일의 핵심 책임은 두 가지뿐이다:
//   1. verifyEnrollmentConsistency: student_session이 주장하는 identity를
//      그대로 믿지 않고, enrollment_id로 DB를 다시 조회해 student_id/
//      class_id가 실제로 일치하는지 재확인한다. browser-supplied identity를
//      신뢰하는 방식으로 대체하지 않는다 — session 자체도 "재확인 대상"으로
//      취급한다.
//   2. insertLearningEvent: 재확인을 통과한 identity로만 INSERT한다.
import { SupabaseClient } from '@supabase/supabase-js';
import { StudentSessionIdentity } from './student-session';

type EnrollmentConsistencyRow = {
  enrollment_id: string;
  student_id: string;
  class_id: string;
};

export type LearningEventInsert = {
  enrollmentId: string;
  studentId: string;
  classId: string;
  activityId: string;
  eventType: string;
  payload: unknown;
};

// server-only 데이터 접근 경계 — student-data.ts(StudentDataSource)와 달리
// 이 인터페이스는 browser에서 재사용될 일이 없으므로(0-D9 API 설계 원칙:
// browser는 identity를 절대 직접 다루지 않는다) 계약과 구현을 별도 파일로
// 나누지 않고 이 한 파일에 함께 둔다.
export type LearningEventDataSource = {
  verifyEnrollmentConsistency(session: StudentSessionIdentity): Promise<StudentSessionIdentity | null>;
  insertLearningEvent(event: LearningEventInsert): Promise<void>;
};

export function createSupabaseLearningEventDataSource(client: SupabaseClient): LearningEventDataSource {
  return {
    async verifyEnrollmentConsistency(session) {
      const { data, error } = await client
        .from('enrollment')
        .select('enrollment_id, student_id, class_id')
        .eq('enrollment_id', session.enrollmentId)
        .limit(2);

      if (error) throw error;
      // 0개(존재하지 않음) 또는 2개 이상(PK 유일성상 정상적으로는 불가능하지만,
      // 혹시라도 나오면 하나를 임의로 고르지 않고 거부한다) 모두 실패로
      // 취급한다.
      if (data.length !== 1) return null;

      const row = data[0] as EnrollmentConsistencyRow;
      if (row.student_id !== session.studentId || row.class_id !== session.classId) return null;

      return { studentId: row.student_id, enrollmentId: row.enrollment_id, classId: row.class_id };
    },

    async insertLearningEvent(event) {
      const { error } = await client.from('learning_event').insert({
        enrollment_id: event.enrollmentId,
        student_id: event.studentId,
        class_id: event.classId,
        activity_id: event.activityId,
        event_type: event.eventType,
        payload: event.payload,
      });
      if (error) throw error;
    },
  };
}
