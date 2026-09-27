// D11-B Regression Test Gate — B11 feedback-retry ownership
//
// handleLearningEventRequest()는 SupabaseClient를 직접 참조하지 않고
// LearningEventDataSource를 주입받는 순수 함수다 — 실제 Supabase 없이
// fake data source로 안전하게 테스트할 수 있다(Audit §M/§N 확인 사항).
// 학생 identity는 student_session 서명 쿠키로만 확보한다(0-D9-B 원칙).
import { describe, test, expect, beforeAll } from 'vitest';
import { handleLearningEventRequest } from '../../src/server/learning-event-handler';
import type { LearningEventDataSource } from '../../src/server/learning-event-data';
import { createStudentSession, STUDENT_SESSION_COOKIE_NAME, type StudentSessionIdentity } from '../../src/server/student-session';

beforeAll(() => {
  // 실제 production secret과 무관한 테스트 전용 값 — 이 프로세스 안에서만
  // 서명/검증에 쓰인다.
  process.env.STUDENT_SESSION_SECRET = 'test-secret-do-not-use-in-prod';
});

const STUDENT_A: StudentSessionIdentity = { studentId: 'stu-A', enrollmentId: 'enroll-A', classId: 'class-1' };
const STUDENT_B: StudentSessionIdentity = { studentId: 'stu-B', enrollmentId: 'enroll-B', classId: 'class-1' };
const cookieFor = (identity: StudentSessionIdentity) => `${STUDENT_SESSION_COOKIE_NAME}=${createStudentSession(identity)}`;

const FEEDBACK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // enroll-A 소유
const FEEDBACK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // enroll-B 소유

function makeDataSource() {
  const inserted: unknown[] = [];
  const lookupCalls: string[] = [];
  const ds: LearningEventDataSource = {
    async verifyEnrollmentConsistency(session) {
      if (session.enrollmentId === 'enroll-A') return { ...STUDENT_A };
      if (session.enrollmentId === 'enroll-B') return { ...STUDENT_B };
      return null;
    },
    async insertLearningEvent(event) {
      inserted.push(event);
      return { outcome: 'created' };
    },
    async getFeedbackEnrollmentId(feedbackId) {
      lookupCalls.push(feedbackId);
      if (feedbackId === FEEDBACK_A) return 'enroll-A';
      if (feedbackId === FEEDBACK_B) return 'enroll-B';
      return null;
    },
  };
  return { ds, inserted, lookupCalls };
}

function body(feedbackId: string): string {
  return JSON.stringify({ activityId: 'm1', eventType: 'feedback-retry', payload: { feedbackId } });
}

describe('feedback-retry ownership (D11-B11 regression)', () => {
  test('T4: own feedbackId -> 200, event inserted with unmodified feedbackId payload', async () => {
    const { ds, inserted } = makeDataSource();

    const res = await handleLearningEventRequest('POST', body(FEEDBACK_A), cookieFor(STUDENT_A), ds);

    expect(res.httpStatus).toBe(200);
    expect(inserted).toHaveLength(1);
    const insertedEvent = inserted[0] as { eventType: string; payload: unknown; enrollmentId: string };
    expect(insertedEvent.eventType).toBe('feedback-retry');
    expect(insertedEvent.payload).toEqual({ feedbackId: FEEDBACK_A });
    expect(insertedEvent.enrollmentId).toBe('enroll-A');
  });

  test('T5: cross-student feedbackId -> 400, no event inserted (core security acceptance criterion)', async () => {
    const { ds, inserted } = makeDataSource();

    const res = await handleLearningEventRequest('POST', body(FEEDBACK_B), cookieFor(STUDENT_A), ds);

    expect(res.httpStatus).toBe(400);
    expect(inserted).toHaveLength(0);
    // 다른 학생/feedback 정보를 응답에 노출하지 않는다.
    expect(JSON.stringify(res.body)).not.toMatch(/enroll-B|stu-B/);
  });

  test('T6: invalid UUID -> 400, ownership lookup never attempted (sanitizer rejects before DB access)', async () => {
    const { ds, inserted, lookupCalls } = makeDataSource();

    const res = await handleLearningEventRequest('POST', body('not-a-uuid'), cookieFor(STUDENT_A), ds);

    expect(res.httpStatus).toBe(400);
    expect(inserted).toHaveLength(0);
    expect(lookupCalls).toHaveLength(0);
  });
});
