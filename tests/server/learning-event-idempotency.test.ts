// D12-1B — learning_event delivery idempotency boundary
//
// 두 계층을 나누어 테스트한다(D12-1A §T 계획 그대로):
//   1. data-adapter 계층(createSupabaseLearningEventDataSource.insertLearningEvent) —
//      DB unique_violation(23505) 발생/미발생을 fake SupabaseClient로
//      시뮬레이션한다(teacher-class-creation.test.ts/teacher-roster-
//      creation.test.ts와 동일한 ad-hoc fake 스타일).
//   2. handler 계층(handleLearningEventRequest) — clientEventId 필드
//      자체의 요청 계약(optional/형식 검증/응답 shape 하위호환/identity
//      필드 방어 회귀)을 검증한다.
//
// clientEventId는 identity가 아니다 — 이 파일 어떤 테스트도 clientEventId로
// "누구의 기록인지"를 판정하지 않는다(그건 여전히 student_session만
// 결정한다).
import { describe, test, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleLearningEventRequest } from '../../src/server/learning-event-handler';
import {
  createSupabaseLearningEventDataSource,
  deepEqualForIdempotency,
  type LearningEventDataSource,
  type LearningEventInsert,
} from '../../src/server/learning-event-data';
import { createStudentSession, STUDENT_SESSION_COOKIE_NAME, type StudentSessionIdentity } from '../../src/server/student-session';

beforeAll(() => {
  process.env.STUDENT_SESSION_SECRET = 'test-secret-do-not-use-in-prod';
});

const CLIENT_EVENT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_EVENT_ID_2 = '22222222-2222-4222-8222-222222222222';

// ---------- 1. data-adapter 계층: insertLearningEvent ----------

type InsertOutcome = { kind: 'ok' } | { kind: 'collision' } | { kind: 'error'; error: unknown };
type ExistingRow = { activity_id: string; event_type: string; payload: unknown };

function makeFakeClient(config: { insertOutcomes: InsertOutcome[]; existingRow?: ExistingRow }) {
  let insertIndex = 0;
  const insertCalls: Record<string, unknown>[] = [];
  const selectCalls: { enrollmentId: string; clientEventId: string }[] = [];

  const client = {
    from(table: string) {
      if (table !== 'learning_event') throw new Error(`unexpected table in fake client: ${table}`);
      return {
        insert(row: Record<string, unknown>) {
          insertCalls.push(row);
          const outcome = config.insertOutcomes[insertIndex++];
          if (!outcome) throw new Error('test setup error: not enough insertOutcomes');
          if (outcome.kind === 'ok') return Promise.resolve({ data: null, error: null });
          if (outcome.kind === 'collision') {
            return Promise.resolve({
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint "learning_event_enrollment_client_event_id_idx"' },
            });
          }
          return Promise.resolve({ data: null, error: outcome.error });
        },
        select() {
          return {
            eq(_col: string, enrollmentId: string) {
              return {
                eq(_col2: string, clientEventId: string) {
                  return {
                    async limit() {
                      selectCalls.push({ enrollmentId, clientEventId });
                      return { data: config.existingRow ? [config.existingRow] : [], error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, insertCalls, selectCalls };
}

const BASE_EVENT: Omit<LearningEventInsert, 'clientEventId'> = {
  enrollmentId: 'enroll-1',
  studentId: 'stu-1',
  classId: 'class-1',
  activityId: 'm1',
  eventType: 'checkpoint',
  payload: { ok: true, msg: '통과' },
};

describe('createSupabaseLearningEventDataSource().insertLearningEvent — idempotency (D12-1B)', () => {
  test('A: clientEventId 포함 정상 event -> one insert, outcome created', async () => {
    const { client, insertCalls } = makeFakeClient({ insertOutcomes: [{ kind: 'ok' }] });
    const ds = createSupabaseLearningEventDataSource(client);

    const result = await ds.insertLearningEvent({ ...BASE_EVENT, clientEventId: CLIENT_EVENT_ID });

    expect(result).toEqual({ outcome: 'created' });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].client_event_id).toBe(CLIENT_EVENT_ID);
  });

  test('B: 같은 enrollment+clientEventId+activityId+eventType+동일 payload 재전송 -> duplicate, 새 insert 없음', async () => {
    const { client, insertCalls } = makeFakeClient({
      insertOutcomes: [{ kind: 'collision' }],
      existingRow: { activity_id: 'm1', event_type: 'checkpoint', payload: { ok: true, msg: '통과' } },
    });
    const ds = createSupabaseLearningEventDataSource(client);

    const result = await ds.insertLearningEvent({ ...BASE_EVENT, clientEventId: CLIENT_EVENT_ID });

    expect(result).toEqual({ outcome: 'duplicate' });
    expect(insertCalls).toHaveLength(1); // 시도는 1번(실패), 추가 insert 없음
  });

  test('C: 같은 clientEventId, payload만 다름 -> conflict, 기존 row 변경 없음(update 호출 자체가 없음)', async () => {
    const { client } = makeFakeClient({
      insertOutcomes: [{ kind: 'collision' }],
      existingRow: { activity_id: 'm1', event_type: 'checkpoint', payload: { ok: true, msg: '통과' } },
    });
    const ds = createSupabaseLearningEventDataSource(client);

    const result = await ds.insertLearningEvent({
      ...BASE_EVENT,
      payload: { ok: false, msg: '미통과' },
      clientEventId: CLIENT_EVENT_ID,
    });

    expect(result).toEqual({ outcome: 'conflict' });
  });

  test('D: 같은 clientEventId, eventType만 다름 -> conflict', async () => {
    const { client } = makeFakeClient({
      insertOutcomes: [{ kind: 'collision' }],
      existingRow: { activity_id: 'm1', event_type: 'checkpoint', payload: { ok: true, msg: '통과' } },
    });
    const ds = createSupabaseLearningEventDataSource(client);

    const result = await ds.insertLearningEvent({ ...BASE_EVENT, eventType: 'run-end', clientEventId: CLIENT_EVENT_ID });

    expect(result).toEqual({ outcome: 'conflict' });
  });

  test('E: 같은 clientEventId, activityId만 다름 -> conflict', async () => {
    const { client } = makeFakeClient({
      insertOutcomes: [{ kind: 'collision' }],
      existingRow: { activity_id: 'm1', event_type: 'checkpoint', payload: { ok: true, msg: '통과' } },
    });
    const ds = createSupabaseLearningEventDataSource(client);

    const result = await ds.insertLearningEvent({ ...BASE_EVENT, activityId: 'm2', clientEventId: CLIENT_EVENT_ID });

    expect(result).toEqual({ outcome: 'conflict' });
  });

  test('F: 다른 enrollment + 같은 clientEventId -> 서로 독립적으로 둘 다 created', async () => {
    const { client: clientA } = makeFakeClient({ insertOutcomes: [{ kind: 'ok' }] });
    const { client: clientB } = makeFakeClient({ insertOutcomes: [{ kind: 'ok' }] });
    const dsA = createSupabaseLearningEventDataSource(clientA);
    const dsB = createSupabaseLearningEventDataSource(clientB);

    const resultA = await dsA.insertLearningEvent({ ...BASE_EVENT, enrollmentId: 'enroll-A', clientEventId: CLIENT_EVENT_ID });
    const resultB = await dsB.insertLearningEvent({ ...BASE_EVENT, enrollmentId: 'enroll-B', clientEventId: CLIENT_EVENT_ID });

    expect(resultA).toEqual({ outcome: 'created' });
    expect(resultB).toEqual({ outcome: 'created' });
  });

  test('J: DB race 시뮬레이션(unique violation 발생) — 동일 논리적 이벤트는 duplicate로, 충돌 payload는 conflict로 안정적으로 수렴', async () => {
    // 두 개의 "동시 요청"이 있었다고 가정: 첫 번째는 이미 DB에 반영됐고
    // (existingRow), 두 번째 요청이 이 함수를 호출하는 시점에 unique
    // violation을 만난다 — insert 자체는 항상 'collision'으로 응답하게
    // 설정해 race의 "패자" 쪽 관점만 검증한다(D12-1A §5 Scenario C/G와
    // 동일한 상황).
    const { client: sameClient } = makeFakeClient({
      insertOutcomes: [{ kind: 'collision' }],
      existingRow: { activity_id: 'm1', event_type: 'checkpoint', payload: { ok: true, msg: '통과' } },
    });
    const sameResult = await createSupabaseLearningEventDataSource(sameClient).insertLearningEvent({
      ...BASE_EVENT,
      clientEventId: CLIENT_EVENT_ID,
    });
    expect(sameResult).toEqual({ outcome: 'duplicate' });

    const { client: diffClient } = makeFakeClient({
      insertOutcomes: [{ kind: 'collision' }],
      existingRow: { activity_id: 'm1', event_type: 'checkpoint', payload: { ok: true, msg: '통과' } },
    });
    const diffResult = await createSupabaseLearningEventDataSource(diffClient).insertLearningEvent({
      ...BASE_EVENT,
      payload: { ok: false },
      clientEventId: CLIENT_EVENT_ID,
    });
    expect(diffResult).toEqual({ outcome: 'conflict' });
  });

  test('non-collision DB error는 clientEventId가 있어도 그대로 throw된다(infra failure, idempotency 로직으로 흡수하지 않음)', async () => {
    const { client } = makeFakeClient({ insertOutcomes: [{ kind: 'error', error: { message: 'connection reset' } }] });
    const ds = createSupabaseLearningEventDataSource(client);

    await expect(ds.insertLearningEvent({ ...BASE_EVENT, clientEventId: CLIENT_EVENT_ID })).rejects.toBeTruthy();
  });

  test('clientEventId 없는 요청의 DB 에러는 기존과 동일하게 그대로 throw(하위호환)', async () => {
    const { client } = makeFakeClient({ insertOutcomes: [{ kind: 'error', error: { message: 'connection reset' } }] });
    const ds = createSupabaseLearningEventDataSource(client);

    await expect(ds.insertLearningEvent({ ...BASE_EVENT })).rejects.toBeTruthy();
  });
});

describe('deepEqualForIdempotency', () => {
  test('key 순서가 달라도 동일한 object로 판정한다', () => {
    expect(deepEqualForIdempotency({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
  test('값이 다르면 다른 object로 판정한다', () => {
    expect(deepEqualForIdempotency({ ok: true }, { ok: false })).toBe(false);
  });
  test('배열도 순서를 포함해 비교한다', () => {
    expect(deepEqualForIdempotency(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(deepEqualForIdempotency(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});

// ---------- 2. handler 계층: /api/events 요청 계약 ----------

const IDENTITY: StudentSessionIdentity = { studentId: 'stu-1', enrollmentId: 'enroll-1', classId: 'class-1' };
// beforeAll()이 STUDENT_SESSION_SECRET을 설정하기 전에 모듈 최상단에서
// createStudentSession()을 호출하면 실패한다 — cookieFor()로 지연 계산한다
// (feedback-retry.test.ts와 동일한 패턴).
const cookieFor = (identity: StudentSessionIdentity) => `${STUDENT_SESSION_COOKIE_NAME}=${createStudentSession(identity)}`;

function makeSimpleDataSource() {
  const insertCalls: LearningEventInsert[] = [];
  const ds: LearningEventDataSource = {
    async verifyEnrollmentConsistency(session) {
      return session;
    },
    async insertLearningEvent(event) {
      insertCalls.push(event);
      return { outcome: 'created' };
    },
    async getFeedbackEnrollmentId() {
      return null;
    },
  };
  return { ds, insertCalls };
}

function body(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

describe('handleLearningEventRequest — clientEventId request contract (D12-1B)', () => {
  test('G: clientEventId 없음 -> 기존과 완전히 동일한 응답({status:"ok"}, outcome 없음), insert에는 clientEventId:undefined 전달', async () => {
    const { ds, insertCalls } = makeSimpleDataSource();

    const res = await handleLearningEventRequest('POST', body({ activityId: 'm1', eventType: 'run', payload: {} }), cookieFor(IDENTITY), ds);

    expect(res.httpStatus).toBe(200);
    expect(res.body).toEqual({ status: 'ok' }); // outcome 필드 없음 — 하위호환
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].clientEventId).toBeUndefined();
  });

  test('H: malformed clientEventId(UUID 아님) -> 400, insert 시도 없음', async () => {
    const { ds, insertCalls } = makeSimpleDataSource();

    const res = await handleLearningEventRequest(
      'POST',
      body({ activityId: 'm1', eventType: 'run', payload: {}, clientEventId: 'not-a-uuid' }),
      cookieFor(IDENTITY),
      ds
    );

    expect(res.httpStatus).toBe(400);
    expect(insertCalls).toHaveLength(0);
  });

  test('유효한 UUID clientEventId -> 200, {status:"ok", outcome:"created"}', async () => {
    const { ds } = makeSimpleDataSource();

    const res = await handleLearningEventRequest(
      'POST',
      body({ activityId: 'm1', eventType: 'run', payload: {}, clientEventId: CLIENT_EVENT_ID }),
      cookieFor(IDENTITY),
      ds
    );

    expect(res.httpStatus).toBe(200);
    expect(res.body).toEqual({ status: 'ok', outcome: 'created' });
  });

  test('conflict outcome -> 409, 기존 payload/내용을 응답에 노출하지 않음', async () => {
    const ds: LearningEventDataSource = {
      async verifyEnrollmentConsistency(session) {
        return session;
      },
      async insertLearningEvent() {
        return { outcome: 'conflict' };
      },
      async getFeedbackEnrollmentId() {
        return null;
      },
    };

    const res = await handleLearningEventRequest(
      'POST',
      body({ activityId: 'm1', eventType: 'run', payload: {}, clientEventId: CLIENT_EVENT_ID }),
      cookieFor(IDENTITY),
      ds
    );

    expect(res.httpStatus).toBe(409);
    expect(res.body).toEqual({ error: 'invalid request' });
  });

  test('I(회귀): body에 studentId/enrollmentId/classId가 있으면 clientEventId 유무와 무관하게 여전히 거부됨, insert 시도 없음', async () => {
    const { ds: ds1, insertCalls: calls1 } = makeSimpleDataSource();
    const res1 = await handleLearningEventRequest(
      'POST',
      body({ activityId: 'm1', eventType: 'run', payload: {}, studentId: 'attacker-supplied' }),
      cookieFor(IDENTITY),
      ds1
    );
    expect(res1.httpStatus).toBe(400);
    expect(calls1).toHaveLength(0);

    const { ds: ds2, insertCalls: calls2 } = makeSimpleDataSource();
    const res2 = await handleLearningEventRequest(
      'POST',
      body({ activityId: 'm1', eventType: 'run', payload: {}, clientEventId: CLIENT_EVENT_ID_2, enrollmentId: 'attacker-supplied' }),
      cookieFor(IDENTITY),
      ds2
    );
    expect(res2.httpStatus).toBe(400);
    expect(calls2).toHaveLength(0);
  });

  test('sanitization 의미론: 서버가 버리는 여분 필드만 다른 두 요청은 동일 논리적 이벤트로 duplicate 처리된다', async () => {
    // 실제 SANITIZERS(learning-event-handler.ts)와 실제 deepEqualForIdempotency를
    // 그대로 거치는 end-to-end 검증 — raw client payload가 아니라
    // sanitize 이후 payload를 기준으로 비교됨을 증명한다(D12-1A §7/§12).
    const store = new Map<string, { activityId: string; eventType: string; payload: unknown }>();
    const ds: LearningEventDataSource = {
      async verifyEnrollmentConsistency(session) {
        return session;
      },
      async insertLearningEvent(event) {
        if (event.clientEventId === undefined) return { outcome: 'created' };
        const key = `${event.enrollmentId}:${event.clientEventId}`;
        const existing = store.get(key);
        if (!existing) {
          store.set(key, { activityId: event.activityId, eventType: event.eventType, payload: event.payload });
          return { outcome: 'created' };
        }
        const same = existing.activityId === event.activityId && existing.eventType === event.eventType && deepEqualForIdempotency(existing.payload, event.payload);
        return { outcome: same ? 'duplicate' : 'conflict' };
      },
      async getFeedbackEnrollmentId() {
        return null;
      },
    };

    const firstBody = body({ activityId: 'm1', eventType: 'checkpoint', payload: { ok: true, msg: '통과' }, clientEventId: CLIENT_EVENT_ID });
    const res1 = await handleLearningEventRequest('POST', firstBody, cookieFor(IDENTITY), ds);
    expect(res1.body).toEqual({ status: 'ok', outcome: 'created' });

    // checkpoint sanitizer는 ok/msg만 남기고 그 외 필드는 버린다
    // (learning-event-handler.ts SANITIZERS.checkpoint) — 아래 studentComment는
    // 서버에 절대 저장되지 않는 필드다.
    const secondBody = body({
      activityId: 'm1',
      eventType: 'checkpoint',
      payload: { ok: true, msg: '통과', studentComment: '이 필드는 서버가 버린다' },
      clientEventId: CLIENT_EVENT_ID,
    });
    const res2 = await handleLearningEventRequest('POST', secondBody, cookieFor(IDENTITY), ds);
    expect(res2.body).toEqual({ status: 'ok', outcome: 'duplicate' });
  });
});
