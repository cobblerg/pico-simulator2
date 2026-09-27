// Supabase 기반 learning_event 데이터 계층 (Stage 0-D9-B, idempotency: D12-1B)
//
// supabase-student-data.ts와 동일한 패턴을 따른다: SupabaseClient를 인자로
// 받고(secret key는 이 파일 안에서 직접 읽지 않음), snake_case(DB) ↔
// camelCase(도메인) 매핑을 이 파일이 책임지며, 쿼리 에러는 그대로 throw해
// 호출자(learning-event-handler.ts)가 infrastructure failure로 처리하게
// 둔다.
//
// 이 파일의 핵심 책임은 세 가지다:
//   1. verifyEnrollmentConsistency: student_session이 주장하는 identity를
//      그대로 믿지 않고, enrollment_id로 DB를 다시 조회해 student_id/
//      class_id가 실제로 일치하는지 재확인한다. browser-supplied identity를
//      신뢰하는 방식으로 대체하지 않는다 — session 자체도 "재확인 대상"으로
//      취급한다.
//   2. insertLearningEvent: 재확인을 통과한 identity로만 INSERT한다.
//   3. (D12-1B) clientEventId가 있으면 delivery idempotency를 보장한다 —
//      단, clientEventId는 identity가 아니다(D12-1A §G/§H). "누구의
//      기록인가"는 여전히 1번만이 결정한다.
//
// D12-1B 구현 결정: ON CONFLICT DO UPDATE류의 upsert는 쓰지 않는다(기존
// row를 조금이라도 변경할 수 있는 경로 자체를 만들지 않기 위해 —
// append-only 원칙, §17). 대신 이 프로젝트의 기존 컨벤션(teacher-class-
// creation.ts/teacher-roster-creation.ts)과 동일하게 "plain INSERT 시도 →
// unique_violation(23505)이면 SELECT로 기존 row 조회 → 비교" 패턴을
// 쓴다 — 이 패턴은 learning_event에 이미 있는 select/insert grant만으로
// 충분하며 새 grant가 필요 없다(migration 파일 주석 참고).
import { SupabaseClient } from '@supabase/supabase-js';
import { StudentSessionIdentity } from './student-session';
import { getFeedbackEnrollmentId } from './teacher-feedback-data';
import { UNIQUE_VIOLATION_CODE } from './teacher-class-creation';

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
  // D12-1B: optional — 구버전 client(아직 이 필드를 안 보내는)와의 하위
  // 호환을 위해 undefined를 허용한다. undefined면 idempotency 검사 자체를
  // 하지 않고 기존과 동일하게 그냥 INSERT한다(기존 semantics 100% 유지).
  clientEventId?: string;
};

// D12-1A §M 계약을 그대로 옮긴 discriminated result:
//   created   — 신규 row 삽입 성공(clientEventId 없는 기존 요청도 항상 이 값)
//   duplicate — 같은 enrollment+clientEventId의 재전송이며, 이미 저장된
//               row와 activityId/eventType/sanitized payload가 전부 동일
//               (동일 논리적 이벤트) — 새 row를 만들지 않는다.
//   conflict  — 같은 enrollment+clientEventId이지만 activityId/eventType/
//               payload 중 하나라도 다름 — 새 row도, 기존 row 변경도 하지
//               않는다(append-only 유지). handler가 409로 매핑한다.
export type InsertLearningEventResult = { outcome: 'created' } | { outcome: 'duplicate' } | { outcome: 'conflict' };

// key 순서에 의존하지 않는 재귀 비교. JSON.stringify 비교는 sanitizer가
// 만드는 object의 key insertion 순서가 우연히 달라지면 false conflict를
// 만들 수 있어 쓰지 않는다(D12-1A §7 지적 사항) — 새 dependency 없이 이
// 작은 순수 함수로 충분하다. sanitized payload는 항상 JSON-safe(string/
// number/boolean/array/plain object/undefined 생략)이므로 이 정도 범위만
// 다루면 된다.
export function deepEqualForIdempotency(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqualForIdempotency(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>).sort();
    const bKeys = Object.keys(b as Record<string, unknown>).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k, i) => k === bKeys[i] && deepEqualForIdempotency((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

// server-only 데이터 접근 경계 — student-data.ts(StudentDataSource)와 달리
// 이 인터페이스는 browser에서 재사용될 일이 없으므로(0-D9 API 설계 원칙:
// browser는 identity를 절대 직접 다루지 않는다) 계약과 구현을 별도 파일로
// 나누지 않고 이 한 파일에 함께 둔다.
// D11-B11: feedback-retry의 ownership 검증(feedbackId → enrollment_id)도
// 이 데이터소스를 통해서만 이루어진다 — handler는 여전히 dataSource
// 하나만 주입받는다(0-D9-B의 단일 seam 원칙 유지, api/events.ts 어댑터
// 변경 불필요).
export type LearningEventDataSource = {
  verifyEnrollmentConsistency(session: StudentSessionIdentity): Promise<StudentSessionIdentity | null>;
  insertLearningEvent(event: LearningEventInsert): Promise<InsertLearningEventResult>;
  getFeedbackEnrollmentId(feedbackId: string): Promise<string | null>;
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
      const row: Record<string, unknown> = {
        enrollment_id: event.enrollmentId,
        student_id: event.studentId,
        class_id: event.classId,
        activity_id: event.activityId,
        event_type: event.eventType,
        payload: event.payload,
      };
      // clientEventId가 undefined면 이 컬럼 자체를 insert 문에 넣지 않는다
      // — DB default(없음, nullable) 그대로 NULL로 저장되어 기존 semantics와
      // 완전히 동일하다.
      if (event.clientEventId !== undefined) {
        row.client_event_id = event.clientEventId;
      }

      const { error } = await client.from('learning_event').insert(row);

      if (!error) return { outcome: 'created' };

      // clientEventId가 없는 요청에서 나는 에러는 idempotency와 무관한
      // 순수 infra failure다 — 그대로 던져 handler가 500으로 흡수하게 둔다
      // (기존 semantics 그대로).
      if (event.clientEventId === undefined || (error as { code?: unknown }).code !== UNIQUE_VIOLATION_CODE) {
        throw error;
      }

      // UNIQUE(enrollment_id, client_event_id) 위반 — 같은 enrollment의
      // 재전송이다. 기존 row를 조회해 "동일 논리적 이벤트"인지 판정한다.
      // 이 SELECT는 이미 부여된 select grant만으로 충분하다.
      const { data, error: lookupError } = await client
        .from('learning_event')
        .select('activity_id, event_type, payload')
        .eq('enrollment_id', event.enrollmentId)
        .eq('client_event_id', event.clientEventId)
        .limit(2);

      if (lookupError) throw lookupError;
      // 0개(경합 중 방금 삭제됐다는 뜻인데 DELETE grant 자체가 없어 발생할
      // 수 없음) 또는 2개 이상(unique index가 있는 한 불가능) 모두
      // data-integrity/infrastructure failure로 throw한다 — 조용히 하나를
      // 고르지 않는다(이 프로젝트 전반의 방어 패턴과 동일).
      if (data.length !== 1) {
        throw new Error('data integrity: enrollment_id+client_event_id UNIQUE 위반 조회 결과가 1건이 아님');
      }

      const existing = data[0] as { activity_id: string; event_type: string; payload: unknown };
      const isSameLogicalEvent =
        existing.activity_id === event.activityId &&
        existing.event_type === event.eventType &&
        deepEqualForIdempotency(existing.payload, event.payload);

      return { outcome: isSameLogicalEvent ? 'duplicate' : 'conflict' };
    },

    async getFeedbackEnrollmentId(feedbackId) {
      return getFeedbackEnrollmentId(client, feedbackId);
    },
  };
}
