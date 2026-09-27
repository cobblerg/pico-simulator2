// D11-B Regression Test Gate — B10 student feedback isolation
//
// handleStudentFeedbackRequest()는 SupabaseClient를 매개변수로 받는 순수
// 함수라 fake client로 테스트 가능하다. identity source of truth는
// student_session 쿠키뿐이며, 이 함수는 request body/query를 전혀 읽지
// 않는다(구조적으로 클라이언트가 다른 학생을 지정할 방법이 없다).
//
// 참고(Audit §9): 서버 응답 자체는 listFeedbackForEnrollment()가 반환하는
// 오래된→최신 순서를 그대로 반환한다 — "최신이 먼저 보이는" 정렬은
// src/ui/student-feedback.ts의 render()가 클라이언트에서 [...].reverse()로
// 수행하는 UI 책임이지 이 handler의 책임이 아니다. 따라서 이 테스트는
// server-side ordering을 "newest-first"로 잘못 단정하지 않는다.
import { describe, test, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleStudentFeedbackRequest } from '../../src/server/student-feedback-handler';
import { createStudentSession, STUDENT_SESSION_COOKIE_NAME } from '../../src/server/student-session';

beforeAll(() => {
  process.env.STUDENT_SESSION_SECRET = 'test-secret-do-not-use-in-prod';
});

type FeedbackRow = { feedback_id: string; content: string; event_id: string | null; created_at: string; updated_at: string };

function fakeClient(rows: FeedbackRow[]): { client: SupabaseClient; wasCalled: () => boolean } {
  let called = false;
  const client = {
    from() {
      called = true;
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return { limit: () => Promise.resolve({ data: rows, error: null }) };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, wasCalled: () => called };
}

describe('student feedback isolation (D11-B10 regression)', () => {
  test('T7: missing student_session -> 401, no DB access attempted', async () => {
    const { client, wasCalled } = fakeClient([]);

    const res = await handleStudentFeedbackRequest('GET', undefined, client);

    expect(res.httpStatus).toBe(401);
    expect(wasCalled()).toBe(false);
  });

  test('T8: valid session -> response items expose only id/content/createdAt/updatedAt', async () => {
    const token = createStudentSession({ studentId: 'stu-1', enrollmentId: 'enroll-1', classId: 'class-1' });
    const cookie = `${STUDENT_SESSION_COOKIE_NAME}=${token}`;
    const row: FeedbackRow = {
      feedback_id: 'fb-1',
      content: 'LED를 GP15로 옮겨보세요.',
      event_id: null,
      created_at: '2026-09-27T00:00:00Z',
      updated_at: '2026-09-27T00:00:00Z',
    };
    const { client } = fakeClient([row]);

    const res = await handleStudentFeedbackRequest('GET', cookie, client);

    expect(res.httpStatus).toBe(200);
    const body = res.body as { status: string; feedback: Record<string, unknown>[] };
    expect(body.status).toBe('ok');
    expect(body.feedback).toHaveLength(1);
    expect(Object.keys(body.feedback[0]).sort()).toEqual(['content', 'createdAt', 'id', 'updatedAt']);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/studentId|classId|enrollmentId|teacherId|feedback_id|event_id/);
  });
});
