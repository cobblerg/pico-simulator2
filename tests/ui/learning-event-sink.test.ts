// D12-1C1 — Client Event ID + Durable Queue Core
//
// learning-event-sink.ts는 document를 참조하지 않지만(window.addEventListener/
// localStorage/fetch/crypto만 사용) jsdom 없이는 window/localStorage 전역이
// 없다 — 이 프로젝트의 "새 DOM test 환경을 추가하지 않는다" 원칙을 지키기
// 위해 최소한의 fake(EventTarget 기반 window, Map 기반 localStorage,
// vi.fn 기반 fetch)만 vi.stubGlobal로 주입한다. Node 내장 EventTarget/
// CustomEvent/crypto.randomUUID를 그대로 사용한다(신규 dependency 없음).
//
// 매 test마다 vi.resetModules() 후 모듈을 다시 import해 activeEnrollmentId/
// processing 같은 module-level 상태가 test 간에 새지 않게 한다.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

function makeFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    _store: store,
  };
}

type FakeFetchResponse = { status: number };

function makeFakeFetch(responses: FakeFetchResponse[]) {
  let i = 0;
  const calls: unknown[] = [];
  const fn = vi.fn(async (_url: string, init?: { body?: string }) => {
    calls.push(init?.body ? JSON.parse(init.body) : undefined);
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return { ok: r.status >= 200 && r.status < 300, status: r.status } as Response;
  });
  return { fn, calls };
}

async function setupSink(fakeStorage: ReturnType<typeof makeFakeLocalStorage>) {
  vi.resetModules();
  const fakeWindow = new EventTarget();
  vi.stubGlobal('localStorage', fakeStorage);
  vi.stubGlobal('window', fakeWindow);

  const lifecycle = await import('../../src/ui/learning-event-lifecycle');
  const sink = await import('../../src/ui/learning-event-sink');

  lifecycle.enableLearningEventSink();
  sink.initLearningEventSink();

  return { sink, fakeWindow };
}

function dispatch(target: EventTarget, detail: { type: string; activityId: string; data?: unknown }) {
  target.dispatchEvent(new CustomEvent('picosim:event', { detail }));
}

const ENROLLMENT_A = 'enroll-aaaa';
const ENROLLMENT_B = 'enroll-bbbb';
const KEY_A = `picosim:event-queue:${ENROLLMENT_A}`;
const KEY_B = `picosim:event-queue:${ENROLLMENT_B}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('D12-1C1 — enqueue / persist-before-send', () => {
  test('A/C: enqueue 시 clientEventId가 1회 생성되고, network send 전에 localStorage에 먼저 기록된다', async () => {
    const storage = makeFakeLocalStorage();
    // fetch가 아직 응답하기 전에도 이미 durable하게 기록되어 있어야 한다 —
    // 이를 확인하기 위해 fetch를 절대 resolve하지 않는 pending Promise로
    // 만든다.
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow } = await setupSink(storage);
    // activateLearningEventQueue는 sink 모듈에서 가져온다.
    const sinkModule = await import('../../src/ui/learning-event-sink');
    sinkModule.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: { code: 'led.on()' } });

    // fetch가 아직 pending인 시점에도 localStorage에는 이미 1개 item이 있어야 한다.
    const raw = storage.getItem(KEY_A);
    expect(raw).not.toBeNull();
    const items = JSON.parse(raw as string);
    expect(items).toHaveLength(1);
    expect(items[0].activityId).toBe('m1');
    expect(items[0].eventType).toBe('run');
    expect(typeof items[0].clientEventId).toBe('string');
    expect(items[0].clientEventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(typeof items[0].createdAt).toBe('number');
  });

  test('B: retry 시 같은 clientEventId를 재사용한다(5xx로 재시도 유도)', async () => {
    const storage = makeFakeLocalStorage();
    const { fn: fetchMock, calls } = makeFakeFetch([{ status: 500 }, { status: 500 }, { status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });

    await vi.waitFor(() => expect(storage.getItem(KEY_A)).toBeNull());

    expect(calls).toHaveLength(3);
    const ids = calls.map((c) => (c as { clientEventId: string }).clientEventId);
    expect(new Set(ids).size).toBe(1); // 세 번의 시도 모두 같은 clientEventId
  });
});

describe('D12-1C1 — ACK semantics', () => {
  test('F: created(200) ACK -> item 제거', async () => {
    const storage = makeFakeLocalStorage();
    const { fn: fetchMock } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'checkpoint', activityId: 'm1', data: { ok: true } });

    await vi.waitFor(() => expect(storage.getItem(KEY_A)).toBeNull());
  });

  test('G: duplicate(200) ACK도 동일하게 item 제거(D12-1B 계약 — res.ok만으로 판단)', async () => {
    const storage = makeFakeLocalStorage();
    const { fn: fetchMock } = makeFakeFetch([{ status: 200 }]); // created/duplicate 모두 200
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run-end', activityId: 'm1', data: { ok: true } });

    await vi.waitFor(() => expect(storage.getItem(KEY_A)).toBeNull());
  });
});

describe('D12-1C1 — durable preservation on failure', () => {
  test('H: network failure(전부 예외) -> durable item 보존, discard 없음', async () => {
    const storage = makeFakeLocalStorage();
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });

    // 재시도가 모두 소진될 때까지 기다린다(3회 호출) — 그 이후에도 item은 남아있어야 한다.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const raw = storage.getItem(KEY_A);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  test('I: 5xx 재시도 소진 -> durable item 보존(discard하지 않음, 순서 유지를 위해 큐 처리 중단)', async () => {
    const storage = makeFakeLocalStorage();
    const { fn: fetchMock, calls } = makeFakeFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const raw = storage.getItem(KEY_A);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
    expect(calls).toHaveLength(3); // 무한 재시도 아님 — 정확히 MAX_RETRIES+1회에서 멈춤
  });
});

describe('D12-1C1 — recovery (refresh/re-init)', () => {
  test('D/E: 같은 enrollment로 재활성화하면 저장된 큐가 복원되어 같은 clientEventId로 재전송된다', async () => {
    const storage = makeFakeLocalStorage();

    // "이전 세션"이 이미 실패로 남겨둔 item을 미리 durable storage에 심어둔다.
    const preExisting = [{ clientEventId: '11111111-1111-4111-8111-111111111111', activityId: 'm1', eventType: 'run', payload: {}, createdAt: Date.now() }];
    storage.setItem(KEY_A, JSON.stringify(preExisting));

    const { fn: fetchMock, calls } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { sink } = await setupSink(storage);

    // 새로고침 후 재초기화를 흉내낸다 — activate만으로 복원+재개되어야 한다(별도 enqueue 없음).
    sink.activateLearningEventQueue(ENROLLMENT_A);

    await vi.waitFor(() => expect(storage.getItem(KEY_A)).toBeNull());
    expect(calls).toHaveLength(1);
    expect((calls[0] as { clientEventId: string }).clientEventId).toBe('11111111-1111-4111-8111-111111111111');
  });
});

describe('D12-1C1 — cross-enrollment isolation', () => {
  test('J/K/L: 다른 enrollment의 큐는 읽지도, 전송하지도, 지우지도 않는다', async () => {
    const storage = makeFakeLocalStorage();
    // B의 큐를 미리 채워둔다 — A만 활성화된 이번 세션에서는 절대 건드리지 않아야 한다.
    const bItems = [{ clientEventId: '22222222-2222-4222-8222-222222222222', activityId: 'm2', eventType: 'run', payload: {}, createdAt: Date.now() }];
    storage.setItem(KEY_B, JSON.stringify(bItems));

    const { fn: fetchMock, calls } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });

    await vi.waitFor(() => expect(storage.getItem(KEY_A)).toBeNull());

    // B의 큐는 조금도 변하지 않았어야 한다.
    expect(storage.getItem(KEY_B)).toBe(JSON.stringify(bItems));
    // 전송된 요청도 A의 item 하나뿐이었어야 한다(B의 clientEventId가 섞이지 않음).
    const sentIds = calls.map((c) => (c as { clientEventId: string }).clientEventId);
    expect(sentIds).not.toContain('22222222-2222-4222-8222-222222222222');
  });
});

describe('D12-1C1 — request body trust boundary', () => {
  test('M/N: request body에 identity 필드나 createdAt이 없고, clientEventId/activityId/eventType/payload만 있다', async () => {
    const storage = makeFakeLocalStorage();
    const { fn: fetchMock, calls } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: { code: 'x=1' } });

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const sentBody = calls[0] as Record<string, unknown>;
    expect(Object.keys(sentBody).sort()).toEqual(['activityId', 'clientEventId', 'eventType', 'payload']);
    expect(sentBody).not.toHaveProperty('createdAt');
    expect(sentBody).not.toHaveProperty('studentId');
    expect(sentBody).not.toHaveProperty('enrollmentId');
    expect(sentBody).not.toHaveProperty('classId');
    expect(sentBody).not.toHaveProperty('name');
    expect(sentBody).not.toHaveProperty('studentNo');
  });
});

describe('D12-1C1 — corrupt storage recovery', () => {
  test('O: invalid JSON storage -> 앱을 crash시키지 않고 빈 큐로 취급, 이후 정상 enqueue 가능', async () => {
    const storage = makeFakeLocalStorage();
    storage.setItem(KEY_A, '{not valid json');

    const { fn: fetchMock } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);

    expect(() => sink.activateLearningEventQueue(ENROLLMENT_A)).not.toThrow();

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  test('P: mixed valid/invalid stored items -> valid item만 보존되어 전송 시도됨', async () => {
    const storage = makeFakeLocalStorage();
    const validItem = { clientEventId: '33333333-3333-4333-8333-333333333333', activityId: 'm1', eventType: 'run', payload: {}, createdAt: Date.now() };
    const invalidItem = { clientEventId: 'not-a-uuid', activityId: 'm1', eventType: 'run', payload: {}, createdAt: Date.now() };
    storage.setItem(KEY_A, JSON.stringify([invalidItem, validItem]));

    const { fn: fetchMock, calls } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0] as { clientEventId: string }).clientEventId).toBe('33333333-3333-4333-8333-333333333333');
  });
});

describe('D12-1C1 — legacy / no-storage', () => {
  test('R: 기존에 저장된 큐가 전혀 없어도(신규 학생) 정상 동작한다', async () => {
    const storage = makeFakeLocalStorage();
    const { fn: fetchMock } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'mission-open', activityId: 'm1', data: {} });

    await vi.waitFor(() => expect(storage.getItem(KEY_A)).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('D12-1C1 — multi-tab resurrection safety', () => {
  test('Q: 다른 "탭"이 새 item을 추가한 뒤에도, 이 탭이 stale snapshot으로 ACK 제거를 해도 그 새 item을 지우지 않는다', async () => {
    const storage = makeFakeLocalStorage();
    let resolveFirst!: (v: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (resolveFirst = resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    // "탭 1"이 item A를 enqueue하고 전송을 시작(아직 응답 대기 중, pending).
    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // 그 사이 "다른 탭"이 같은 enrollment의 localStorage에 item B를 직접
    // 추가했다고 가정한다(실제로는 다른 JS 컨텍스트가 하는 일이지만, 이
    // 테스트에서는 storage를 직접 조작해 그 효과만 재현한다).
    const raw = storage.getItem(KEY_A) as string;
    const itemsSoFar = JSON.parse(raw);
    const itemB = { clientEventId: '44444444-4444-4444-8444-444444444444', activityId: 'm2', eventType: 'run', payload: {}, createdAt: Date.now() };
    storage.setItem(KEY_A, JSON.stringify([...itemsSoFar, itemB]));

    // 이제 "탭 1"이 들고 있던 pending 요청(item A)에 대한 응답이 도착한다 —
    // 탭 1은 item A를 ACK 제거해야 하지만, 그 사이 추가된 item B는
    // 살아남아야 한다(position 기반 slice(1)이 아니라 clientEventId
    // 기반 필터링이므로).
    resolveFirst({ ok: true, status: 200 } as Response);

    await vi.waitFor(() => {
      const remaining = JSON.parse(storage.getItem(KEY_A) as string);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].clientEventId).toBe('44444444-4444-4444-8444-444444444444');
    });
  });
});
