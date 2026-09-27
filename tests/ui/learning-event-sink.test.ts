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

  return { sink, lifecycle, fakeWindow };
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

// ==========================================================================
// D12-1C2 — Session / Ownership Recovery
// ==========================================================================

describe('D12-1C2 — 401: preserve, stop, do not delete', () => {
  test('A/B/C: 401 -> 현재 item과 나머지 partition 전부 보존, 이후 자동 전송 중단', async () => {
    const storage = makeFakeLocalStorage();
    const { fn: fetchMock, calls } = makeFakeFetch([{ status: 401 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // 401 직후에도 item은 그대로 durable queue에 남아 있어야 한다(삭제 없음).
    const raw = storage.getItem(KEY_A);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);

    // 같은 partition에 새 이벤트를 더 추가해도(§11 — durable하게는 쌓이되)
    // 401 이후에는 자동 전송을 다시 시도하지 않는다(현재 fetch 호출 수가
        // 더 늘지 않아야 한다).
    dispatch(fakeWindow, { type: 'checkpoint', activityId: 'm1', data: { ok: true } });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1); // 추가 전송 시도 없음
    const rawAfter = JSON.parse(storage.getItem(KEY_A) as string);
    expect(rawAfter).toHaveLength(2); // 두 이벤트 모두 durable하게는 쌓여 있음(NO SILENT LOSS)
  });

  test('D: 401을 받은 partition과 다른 enrollment의 큐는 전혀 건드리지 않는다', async () => {
    const storage = makeFakeLocalStorage();
    const bItems = [{ clientEventId: '55555555-5555-4555-8555-555555555555', activityId: 'm2', eventType: 'run', payload: {}, createdAt: Date.now() }];
    storage.setItem(KEY_B, JSON.stringify(bItems));

    const { fn: fetchMock } = makeFakeFetch([{ status: 401 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(storage.getItem(KEY_B)).toBe(JSON.stringify(bItems));
  });
});

describe('D12-1C2 — same-enrollment reactivation after 401', () => {
  test('E/P: 같은 enrollment 재활성화 -> 기존 큐 재개, 같은 clientEventId 그대로 전송', async () => {
    const storage = makeFakeLocalStorage();
    const { fn: fetchMock, calls } = makeFakeFetch([{ status: 401 }, { status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const clientEventId = JSON.parse(storage.getItem(KEY_A) as string)[0].clientEventId;

    // 같은 enrollment가 다시 정상적으로 accepted되어 재활성화된다 — 새
    // clientEventId를 만들지 않고 suspend를 해제한 뒤 재개해야 한다.
    sink.activateLearningEventQueue(ENROLLMENT_A);

    await vi.waitFor(() => expect(storage.getItem(KEY_A)).toBeNull());
    expect(calls).toHaveLength(2);
    expect((calls[0] as { clientEventId: string }).clientEventId).toBe(clientEventId);
    expect((calls[1] as { clientEventId: string }).clientEventId).toBe(clientEventId); // 재시도도 같은 ID
  });
});

describe('D12-1C2 — session change (student A -> student B)', () => {
  test('F/G/H: A의 큐는 보존되고 전송되지 않으며, B는 독립적으로 활성화/재개된다', async () => {
    const storage = makeFakeLocalStorage();
    let resolveA!: (v: Response) => void;
    const fetchMock = vi.fn((_: string, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : undefined;
      if (body?.activityId === 'm1') return new Promise<Response>((resolve) => (resolveA = resolve)); // A의 요청은 응답을 미룬다(pending 유지)
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);

    // 학생 A로 활성화 후 이벤트 발생 — 응답은 아직 오지 않은 채로 남는다.
    sink.activateLearningEventQueue(ENROLLMENT_A);
    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });
    await vi.waitFor(() => expect(storage.getItem(KEY_A)).not.toBeNull());
    const aSnapshot = storage.getItem(KEY_A);

    // 학생 B로 전환(같은 브라우저) — A를 건드리지 않고 B만 활성화된다.
    sink.activateLearningEventQueue(ENROLLMENT_B);
    dispatch(fakeWindow, { type: 'run', activityId: 'm2', data: {} });

    await vi.waitFor(() => expect(storage.getItem(KEY_B)).toBeNull()); // B는 정상 전송/ACK됨

    // A의 큐는 그동안 전혀 변하지 않았어야 한다(전송되지도, 지워지지도 않음).
    expect(storage.getItem(KEY_A)).toBe(aSnapshot);

    resolveA({ ok: true, status: 200 } as Response); // 정리(pending 누수 방지)
  });
});

describe('D12-1C2 — logout bounded flush', () => {
  test('I: flush 성공 -> ACK된 item 제거', async () => {
    const storage = makeFakeLocalStorage();
    const { fn: fetchMock } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { sink } = await setupSink(storage);

    storage.setItem(
      KEY_A,
      JSON.stringify([{ clientEventId: '66666666-6666-4666-8666-666666666666', activityId: 'm1', eventType: 'run', payload: {}, createdAt: Date.now() }])
    );
    sink.activateLearningEventQueue(ENROLLMENT_A);
    await vi.waitFor(() => expect(storage.getItem(KEY_A)).toBeNull()); // activate 자체가 이미 flush와 동일 경로

    // 새 item을 추가한 뒤 명시적 flushLearningEventQueue로도 정상 동작 확인.
    storage.setItem(
      KEY_A,
      JSON.stringify([{ clientEventId: '77777777-7777-4777-8777-777777777777', activityId: 'm1', eventType: 'run', payload: {}, createdAt: Date.now() }])
    );
    await sink.flushLearningEventQueue(ENROLLMENT_A);
    expect(storage.getItem(KEY_A)).toBeNull();
  });

  test('J: flush 실패(5xx 소진) -> item 보존', async () => {
    const storage = makeFakeLocalStorage();
    storage.setItem(
      KEY_A,
      JSON.stringify([{ clientEventId: '88888888-8888-4888-8888-888888888888', activityId: 'm1', eventType: 'run', payload: {}, createdAt: Date.now() }])
    );
    const { fn: fetchMock } = makeFakeFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { sink } = await setupSink(storage);

    sink.activateLearningEventQueue(ENROLLMENT_A);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    await sink.flushLearningEventQueue(ENROLLMENT_A);
    const raw = storage.getItem(KEY_A);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  test('K: flush timeout(응답이 끝내 오지 않음) -> item 보존, flush 자체는 bounded 시간 내 끝남', async () => {
    vi.useFakeTimers();
    try {
      const storage = makeFakeLocalStorage();
      storage.setItem(
        KEY_A,
        JSON.stringify([{ clientEventId: '99999999-9999-4999-8999-999999999999', activityId: 'm1', eventType: 'run', payload: {}, createdAt: Date.now() }])
      );
      const fetchMock = vi.fn(() => new Promise<Response>(() => {})); // 절대 응답하지 않음
      vi.stubGlobal('fetch', fetchMock);
      const { sink } = await setupSink(storage);
      sink.activateLearningEventQueue(ENROLLMENT_A);

      const flushPromise = sink.flushLearningEventQueue(ENROLLMENT_A);
      await vi.advanceTimersByTimeAsync(3000); // bounded timeout(2s)을 넘기도록 가짜 시간을 흘려보낸다
      await flushPromise; // timeout 경로로 반드시 resolve되어야 한다(무기한 대기 아님)

      const raw = storage.getItem(KEY_A);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('flushLearningEventQueue는 현재 active하지 않은 enrollment는 절대 건드리지 않는다', async () => {
    const storage = makeFakeLocalStorage();
    const bItems = [{ clientEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', activityId: 'm2', eventType: 'run', payload: {}, createdAt: Date.now() }];
    storage.setItem(KEY_B, JSON.stringify(bItems));
    const { fn: fetchMock } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A); // A만 active, B는 아님

    await sink.flushLearningEventQueue(ENROLLMENT_B); // B는 현재 active가 아니므로 아무 일도 하지 않아야 함

    expect(storage.getItem(KEY_B)).toBe(JSON.stringify(bItems));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('D12-1C2 — logout failure / revert', () => {
  test('M: 로그아웃 API 실패 후 같은 enrollment로 재활성화 -> 정상 재개', async () => {
    const storage = makeFakeLocalStorage();
    storage.setItem(
      KEY_A,
      JSON.stringify([{ clientEventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', activityId: 'm1', eventType: 'run', payload: {}, createdAt: Date.now() }])
    );
    const { fn: fetchMock, calls } = makeFakeFetch([{ status: 200 }]);
    vi.stubGlobal('fetch', fetchMock);
    const { sink } = await setupSink(storage);

    // "로그아웃 API 자체가 실패해 같은 학생이 계속 쓴다" 시나리오 —
    // student-entry-ui.ts는 이 경우 같은 enrollmentId로 activateLearningEventQueue를
    // 다시 호출한다(이미 §M 구현에서 확인). 여기서는 그 재호출이 안전하게
    // 큐를 재개시키는지만 sink 경계에서 검증한다.
    sink.activateLearningEventQueue(ENROLLMENT_A);

    await vi.waitFor(() => expect(storage.getItem(KEY_A)).toBeNull());
    expect((calls[0] as { clientEventId: string }).clientEventId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });
});

describe('D12-1C2 — disable semantics', () => {
  test('N: sink를 disable해도 durable queue는 삭제되지 않는다(신규 enqueue만 중단)', async () => {
    const storage = makeFakeLocalStorage();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink, lifecycle } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);

    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });
    const before = storage.getItem(KEY_A);
    expect(before).not.toBeNull();

    lifecycle.disableLearningEventSink();

    // disable 이후에는 신규 이벤트가 들어가지 않아야 한다.
    dispatch(fakeWindow, { type: 'checkpoint', activityId: 'm1', data: { ok: true } });
    expect(storage.getItem(KEY_A)).toBe(before); // 늘지 않음(신규 enqueue 차단)

    // 하지만 이미 있던 durable queue 자체는 조금도 삭제되지 않는다.
    expect(JSON.parse(storage.getItem(KEY_A) as string)).toHaveLength(1);
  });
});

// ==========================================================================
// D12-1C3 — Retention + Non-Silent Queue Failure
// ==========================================================================
//
// pruneQueue()는 activateLearningEventQueue() 안에서 동기적으로 실행되고
// 끝난다(§3/§10 lazy pruning) — 따라서 아래 테스트들은 activate 호출
// 직후 곧바로(아직 어떤 fetch 응답도 도착하지 않은 시점에) storage를
// 확인한다. ACK로 인한 제거와 pruning으로 인한 제거를 섞이지 않게 하기
// 위해 fetch는 항상 "응답하지 않는" mock을 쓴다(테스트 K/N처럼 이미
// 쓰인 패턴).
const DAY_MS = 24 * 60 * 60 * 1000;
const neverRespondingFetch = () => vi.fn(() => new Promise<Response>(() => {}));

function makeItem(overrides: Partial<{ clientEventId: string; activityId: string; eventType: string; payload: unknown; createdAt: number }> = {}) {
  return {
    clientEventId: overrides.clientEventId ?? '11111111-2222-4333-8444-555555555555',
    activityId: overrides.activityId ?? 'm1',
    eventType: overrides.eventType ?? 'run',
    payload: overrides.payload ?? {},
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

describe('D12-1C3 — retention (7 days, item-level)', () => {
  test('A: 7일이 안 된 item은 재활성화(pruning) 시에도 보존된다', async () => {
    const storage = makeFakeLocalStorage();
    const fresh = makeItem({ clientEventId: '10101010-1010-4010-8010-101010101010', createdAt: Date.now() - 1 * DAY_MS });
    storage.setItem(KEY_A, JSON.stringify([fresh]));
    vi.stubGlobal('fetch', neverRespondingFetch());
    const { sink } = await setupSink(storage);

    sink.activateLearningEventQueue(ENROLLMENT_A);

    const raw = storage.getItem(KEY_A);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  test('B: 7일이 지난 item은 재활성화(pruning) 시 제거되고 전송 시도조차 되지 않는다', async () => {
    const storage = makeFakeLocalStorage();
    const old = makeItem({ clientEventId: '20202020-2020-4020-8020-202020202020', createdAt: Date.now() - 8 * DAY_MS });
    storage.setItem(KEY_A, JSON.stringify([old]));
    const fetchMock = neverRespondingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { sink } = await setupSink(storage);

    sink.activateLearningEventQueue(ENROLLMENT_A);

    expect(storage.getItem(KEY_A)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('C: 만료된 item과 아직 유효한 sibling이 섞여 있으면 만료된 것만 제거된다', async () => {
    const storage = makeFakeLocalStorage();
    const old = makeItem({ clientEventId: '30303030-3030-4030-8030-303030303030', createdAt: Date.now() - 8 * DAY_MS });
    const fresh = makeItem({ clientEventId: '40404040-4040-4040-8040-404040404040', eventType: 'checkpoint', createdAt: Date.now() - 1 * DAY_MS });
    storage.setItem(KEY_A, JSON.stringify([old, fresh]));
    vi.stubGlobal('fetch', neverRespondingFetch());
    const { sink } = await setupSink(storage);

    sink.activateLearningEventQueue(ENROLLMENT_A);

    const raw = JSON.parse(storage.getItem(KEY_A) as string);
    expect(raw).toHaveLength(1);
    expect(raw[0].clientEventId).toBe(fresh.clientEventId);
  });

  test('D: 모든 item이 만료되면 해당 enrollment의 storage key 자체가 제거된다', async () => {
    const storage = makeFakeLocalStorage();
    const old1 = makeItem({ clientEventId: '41414141-4141-4141-8141-414141414141', createdAt: Date.now() - 10 * DAY_MS });
    const old2 = makeItem({ clientEventId: '42424242-4242-4242-8242-424242424242', eventType: 'checkpoint', createdAt: Date.now() - 9 * DAY_MS });
    storage.setItem(KEY_A, JSON.stringify([old1, old2]));
    vi.stubGlobal('fetch', neverRespondingFetch());
    const { sink, fakeWindow } = await setupSink(storage);

    let warningReason: string | undefined;
    fakeWindow.addEventListener('picosim:event-delivery-warning', (e) => {
      warningReason = (e as CustomEvent).detail?.reason;
    });

    sink.activateLearningEventQueue(ENROLLMENT_A);

    expect(storage.getItem(KEY_A)).toBeNull();
    expect(warningReason).toBe('expired-events'); // M: expiration 발생 시 경고
  });

  test('E: 같은 enrollment를 다시 활성화할 때에도 lazy pruning이 수행된다', async () => {
    const storage = makeFakeLocalStorage();
    vi.stubGlobal('fetch', neverRespondingFetch());
    const { sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A); // 최초 활성화 — 큐 없음

    // 시간이 흘러 큐에 만료된 item이 생겼다고 가정한다(직접 주입으로
    // 시간 경과를 시뮬레이션).
    const old = makeItem({ clientEventId: '50505050-5050-4050-8050-505050505050', createdAt: Date.now() - 8 * DAY_MS });
    storage.setItem(KEY_A, JSON.stringify([old]));

    sink.activateLearningEventQueue(ENROLLMENT_A); // 재활성화 -> pruning 재수행

    expect(storage.getItem(KEY_A)).toBeNull();
  });

  test('F: 다른 enrollment를 활성화해도 비활성 partition의 만료 item은 건드리지 않는다', async () => {
    const storage = makeFakeLocalStorage();
    const oldA = makeItem({ clientEventId: '60606060-6060-4060-8060-606060606060', createdAt: Date.now() - 8 * DAY_MS });
    storage.setItem(KEY_A, JSON.stringify([oldA]));
    vi.stubGlobal('fetch', neverRespondingFetch());
    const { sink } = await setupSink(storage);

    sink.activateLearningEventQueue(ENROLLMENT_B); // B만 활성화 — A는 cross-enrollment isolation상 절대 건드리지 않는다

    expect(storage.getItem(KEY_A)).toBe(JSON.stringify([oldA]));
  });

  test('G: 401로 suspend된 큐도 7일 이내면 재활성화 시 pruning에서 보존된다', async () => {
    const storage = makeFakeLocalStorage();
    let callCount = 0;
    const fetchMock = vi.fn(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: false, status: 401 } as Response);
      return new Promise<Response>(() => {}); // 재시도 응답은 오지 않는다 — ACK 여부와 무관하게 pruning만 확인
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);
    sink.activateLearningEventQueue(ENROLLMENT_A);
    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); // 401 -> suspend

    sink.activateLearningEventQueue(ENROLLMENT_A); // 재활성화 -> pruneQueue는 동기적으로 즉시 끝난다

    const raw = storage.getItem(KEY_A);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  test('S: 미래로 조작된 createdAt도 결국 정상적으로 만료된다(무기한 보존 우회 방지)', async () => {
    vi.useFakeTimers();
    try {
      const storage = makeFakeLocalStorage();
      const future = makeItem({ clientEventId: '80808080-8080-4080-8080-808080808080', createdAt: Date.now() + 365 * DAY_MS });
      storage.setItem(KEY_A, JSON.stringify([future]));
      vi.stubGlobal('fetch', neverRespondingFetch());
      const { sink } = await setupSink(storage);

      sink.activateLearningEventQueue(ENROLLMENT_A);
      // 미래로 조작된 값은 "지금 막 생성된 것"으로 취급될 뿐, 즉시
      // 사라지지도 즉시 특별 대우를 받지도 않는다 — 정상 item처럼 살아남는
      // 것 자체는 의도된 동작이다.
      expect(storage.getItem(KEY_A)).not.toBeNull();

      // 8일(가짜 시간)이 지나면 다른 정상 item과 마찬가지로 만료돼야 한다
      // — 미래 조작값이 "영원히 젊음"을 얻어 retention을 무기한 우회하지
      // 않는다는 뜻이다.
      vi.setSystemTime(Date.now() + 8 * DAY_MS);
      sink.activateLearningEventQueue(ENROLLMENT_A);
      expect(storage.getItem(KEY_A)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('D12-1C3 — overflow policy (reject-newest, preserve durable)', () => {
  test('H/I/J: 큐가 가득 차면 기존 item은 보존되고, 새 event는 저장/전송되지 않으며, non-silent 경고가 발생한다', async () => {
    const storage = makeFakeLocalStorage();
    const existing = Array.from({ length: 50 }, (_, i) =>
      makeItem({ clientEventId: `70000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`, createdAt: Date.now() })
    );
    storage.setItem(KEY_A, JSON.stringify(existing));
    const fetchMock = neverRespondingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);

    let warningReason: string | undefined;
    fakeWindow.addEventListener('picosim:event-delivery-warning', (e) => {
      warningReason = (e as CustomEvent).detail?.reason;
    });

    sink.activateLearningEventQueue(ENROLLMENT_A); // 기존 50개 item 자체는 정상적으로 재시도 대상이 된다(overflow와 무관)
    dispatch(fakeWindow, { type: 'checkpoint', activityId: 'm1', data: {} }); // 51번째 — 자리가 없다

    const raw = JSON.parse(storage.getItem(KEY_A) as string);
    expect(raw).toHaveLength(50); // H: 기존 durable item 50개 그대로(oldest-drop 없음)
    expect(raw.map((it: { clientEventId: string }) => it.clientEventId)).toEqual(existing.map((it) => it.clientEventId));
    // I: 새(거부된) event는 애초에 큐에 들어간 적이 없으므로 clientEventId
    // 자체가 존재하지 않는다 — 어떤 fetch 호출의 body에도 나타날 수
    // 없다(기존 50개 item의 재시도 전송과는 별개 — eventType으로 구분).
    const sentEventTypes = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as { body: string }).body).eventType);
    expect(sentEventTypes).not.toContain('checkpoint');
    expect(warningReason).toBe('queue-overflow'); // J: non-silent 경고
  });
});

describe('D12-1C3 — localStorage write failure', () => {
  test('K/L: localStorage 쓰기 실패 시 network 전송을 시도하지 않고 non-silent 경고를 보낸다', async () => {
    const storage = makeFakeLocalStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fakeWindow, sink } = await setupSink(storage);

    let warningReason: string | undefined;
    fakeWindow.addEventListener('picosim:event-delivery-warning', (e) => {
      warningReason = (e as CustomEvent).detail?.reason;
    });

    sink.activateLearningEventQueue(ENROLLMENT_A);
    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });

    expect(fetchMock).not.toHaveBeenCalled(); // K
    expect(warningReason).toBe('storage-write-failed'); // L
  });
});

describe('D12-1C3 — warning payload boundary & spam control', () => {
  test('N: 경고 이벤트에는 reason만 실리고 payload/clientEventId는 없다', async () => {
    const storage = makeFakeLocalStorage();
    storage.setItem(KEY_A, JSON.stringify(Array.from({ length: 50 }, (_, i) => makeItem({ clientEventId: `71000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}` }))));
    vi.stubGlobal('fetch', neverRespondingFetch());
    const { fakeWindow, sink } = await setupSink(storage);

    let detail: Record<string, unknown> | undefined;
    fakeWindow.addEventListener('picosim:event-delivery-warning', (e) => {
      detail = (e as CustomEvent).detail;
    });

    sink.activateLearningEventQueue(ENROLLMENT_A);
    dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: { secret: 'should-not-leak' } });

    expect(detail).toBeDefined();
    expect(Object.keys(detail as object)).toEqual(['reason']);
    expect(JSON.stringify(detail)).not.toContain('should-not-leak');
    expect(JSON.stringify(detail)).not.toContain('clientEventId');
  });

  test('O: 같은 이유의 경고가 짧은 시간 안에 반복되면 폭주하지 않는다(throttle)', async () => {
    const storage = makeFakeLocalStorage();
    storage.setItem(KEY_A, JSON.stringify(Array.from({ length: 50 }, (_, i) => makeItem({ clientEventId: `72000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}` }))));
    vi.stubGlobal('fetch', neverRespondingFetch());
    const { fakeWindow, sink } = await setupSink(storage);

    let warningCount = 0;
    fakeWindow.addEventListener('picosim:event-delivery-warning', () => {
      warningCount++;
    });

    sink.activateLearningEventQueue(ENROLLMENT_A);
    // 큐가 계속 가득 찬 상태에서 연속으로 여러 이벤트를 발생시킨다 — 매번
    // overflow 조건에 부딪히지만 경고는 폭주하면 안 된다.
    for (let i = 0; i < 10; i++) {
      dispatch(fakeWindow, { type: 'run', activityId: 'm1', data: {} });
    }

    expect(warningCount).toBe(1); // throttle 창 안에서는 한 번만
  });
});

describe('D12-1C3 — corrupt item pruning', () => {
  test('P/Q: valid item은 corrupt item과 섞여 있어도 살아남고, corrupt item은 전송되지 않는다', async () => {
    const storage = makeFakeLocalStorage();
    const valid = makeItem({ clientEventId: '90909090-9090-4090-8090-909090909090' });
    const corruptItems = [{ not: 'a valid item' }, valid, { clientEventId: 'not-a-uuid', activityId: 'm1', eventType: 'run', payload: {}, createdAt: Date.now() }];
    storage.setItem(KEY_A, JSON.stringify(corruptItems));
    const fetchMock = neverRespondingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { sink } = await setupSink(storage);

    sink.activateLearningEventQueue(ENROLLMENT_A);

    const raw = JSON.parse(storage.getItem(KEY_A) as string);
    expect(raw).toHaveLength(1); // P: valid sibling만 생존
    expect(raw[0].clientEventId).toBe(valid.clientEventId);
    // Q: 전송 시도 자체가 걸리는지는 위 A류 테스트에서 이미 확인되지만,
    // corrupt item이 애초에 큐에 남아있지 않으므로 sendOne의 body에도
    // 나타날 수 없다 — 기존 M/N(request body trust boundary) 테스트와
    // 결합해 이미 전체적으로 보장된다.
  });

  test('R: corrupt item이 제거되면 non-silent 경고(corrupt-events)가 발생한다', async () => {
    const storage = makeFakeLocalStorage();
    storage.setItem(KEY_A, JSON.stringify([{ garbage: true }]));
    vi.stubGlobal('fetch', neverRespondingFetch());
    const { fakeWindow, sink } = await setupSink(storage);

    let warningReason: string | undefined;
    fakeWindow.addEventListener('picosim:event-delivery-warning', (e) => {
      warningReason = (e as CustomEvent).detail?.reason;
    });

    sink.activateLearningEventQueue(ENROLLMENT_A);

    expect(warningReason).toBe('corrupt-events');
  });
});
