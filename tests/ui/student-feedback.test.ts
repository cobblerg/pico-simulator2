// D12-1C4 — Feedback-Retry Idempotency
//
// student-feedback.ts는 document.getElementById/querySelector/createElement를
// 쓰지만, 모두 함수 안에서만 호출된다(모듈 top-level에서 즉시 실행되는
// document 접근이 없다) — 그래서 learning-event-sink.test.ts와 동일한
// 원칙으로, jsdom 없이 이 모듈이 실제로 쓰는 최소 메서드만 손으로 만든
// fake document/fetch/crypto를 vi.stubGlobal로 주입해 테스트한다(이
// 프로젝트의 "새 DOM test 환경을 추가하지 않는다" 원칙 유지). render()를
// 거치는 전체 DOM 렌더링은 검증 대상이 아니다 — 이 단계의 목표인
// clientEventId 생성/재사용 경계(handleRetryClick 하나)만 직접 호출해
// 검증한다.
import { describe, test, expect, afterEach, vi } from 'vitest';

function makeFakeButton(): HTMLButtonElement {
  return { disabled: false, textContent: '확인하고 다시 해보기' } as unknown as HTMLButtonElement;
}

function makeFakeMsgEl(): HTMLElement {
  return { textContent: '' } as unknown as HTMLElement;
}

function stubActivityDom(activityId: string | null): void {
  vi.stubGlobal('document', {
    querySelector: (sel: string) => (sel === '.m-item.cur' && activityId ? { dataset: { m: activityId } } : null),
  });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function importSink() {
  vi.resetModules();
  return import('../../src/ui/student-feedback');
}

describe('D12-1C4 — clientEventId generation (logical event 경계)', () => {
  test('A/B: 첫 클릭에서 clientEventId가 정확히 1회 생성되고 request body에 포함된다', async () => {
    stubActivityDom('m1');
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const { handleRetryClick } = await importSink();

    const btn = makeFakeButton();
    const msg = makeFakeMsgEl();
    const state = { clientEventId: null as string | null };

    await handleRetryClick('fb-1', btn, msg, state);

    expect(state.clientEventId).not.toBeNull();
    expect(UUID_PATTERN.test(state.clientEventId as string)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.clientEventId).toBe(state.clientEventId);
  });

  test('C: request body에는 studentId/enrollmentId/classId/name/studentNo가 없다', async () => {
    stubActivityDom('m1');
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const { handleRetryClick } = await importSink();

    await handleRetryClick('fb-1', makeFakeButton(), makeFakeMsgEl(), { clientEventId: null });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(Object.keys(body).sort()).toEqual(['activityId', 'clientEventId', 'eventType', 'payload']);
    for (const forbidden of ['studentId', 'enrollmentId', 'classId', 'name', 'studentNo']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  test('activityId를 찾지 못하면 clientEventId를 생성하지 않고 전송도 하지 않는다', async () => {
    stubActivityDom(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { handleRetryClick } = await importSink();

    const state = { clientEventId: null as string | null };
    await handleRetryClick('fb-1', makeFakeButton(), makeFakeMsgEl(), state);

    expect(state.clientEventId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('D12-1C4 — retry / response-loss reuses same clientEventId', () => {
  test('D: network failure 후 같은 버튼을 다시 클릭하면 같은 clientEventId를 재사용한다', async () => {
    stubActivityDom('m1');
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { handleRetryClick } = await importSink();

    const btn = makeFakeButton();
    const msg = makeFakeMsgEl();
    const state = { clientEventId: null as string | null };

    await handleRetryClick('fb-1', btn, msg, state);
    const firstId = state.clientEventId;
    expect(firstId).not.toBeNull();
    expect(btn.disabled).toBe(false); // 실패 후 재클릭 가능해야 함(기존 UX)

    await handleRetryClick('fb-1', btn, msg, state); // 같은 버튼으로 재클릭(재시도)

    expect(state.clientEventId).toBe(firstId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(secondBody.clientEventId).toBe(firstId);
  });

  test('E: response-loss와 동등한 상황(서버는 저장했지만 응답 수신 실패)에서도 재클릭은 같은 clientEventId를 재사용한다', async () => {
    stubActivityDom('m1');
    // response-loss는 클라이언트 입장에서 network failure(catch)와 구분할
    // 수 없다 — 응답 자체가 도착하지 않으므로 동일하게 catch 분기를 탄다.
    const fetchMock = vi.fn(async () => {
      throw new Error('response lost');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { handleRetryClick } = await importSink();

    const btn = makeFakeButton();
    const msg = makeFakeMsgEl();
    const state = { clientEventId: null as string | null };

    await handleRetryClick('fb-1', btn, msg, state);
    const firstId = state.clientEventId;

    // 재클릭 시점에는 서버가 실제로 duplicate(200)로 응답한다고 가정한다
    // (첫 request가 실제로는 DB에 insert됐던 경우) — idempotency 계약상
    // 이것도 정상 성공이어야 한다.
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200 } as Response));
    await handleRetryClick('fb-1', btn, msg, state);

    expect(state.clientEventId).toBe(firstId);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(secondBody.clientEventId).toBe(firstId);
    expect(btn.textContent).toBe('확인함 · 다시 해보세요'); // F: duplicate 200 -> success 취급
  });
});

describe('D12-1C4 — response semantics (created/duplicate/conflict)', () => {
  test('F: duplicate(200)도 성공으로 취급한다', async () => {
    stubActivityDom('m1');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 } as Response)));
    const { handleRetryClick } = await importSink();

    const btn = makeFakeButton();
    await handleRetryClick('fb-1', btn, makeFakeMsgEl(), { clientEventId: null });

    expect(btn.textContent).toBe('확인함 · 다시 해보세요');
    expect(btn.disabled).toBe(true); // 성공 후 영구 비활성(§9)
  });

  test('G: created(200)도 성공으로 취급한다', async () => {
    stubActivityDom('m1');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 } as Response)));
    const { handleRetryClick } = await importSink();

    const btn = makeFakeButton();
    await handleRetryClick('fb-1', btn, makeFakeMsgEl(), { clientEventId: null });

    expect(btn.textContent).toBe('확인함 · 다시 해보세요');
  });

  test('H: 409(conflict) -> 실패로 표시되고, 자동으로 새 clientEventId를 만들어 재전송하지 않는다', async () => {
    stubActivityDom('m1');
    const fetchMock = vi.fn(async () => ({ ok: false, status: 409 } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const { handleRetryClick } = await importSink();

    const btn = makeFakeButton();
    const msg = makeFakeMsgEl();
    const state = { clientEventId: null as string | null };

    await handleRetryClick('fb-1', btn, msg, state);
    const firstId = state.clientEventId;

    expect(btn.disabled).toBe(false); // 실패로 표시 -> 재클릭 가능
    expect(msg.textContent).toBe('지금은 다시 해볼 수 없어요. 잠시 후 다시 시도해 주세요.');
    expect(state.clientEventId).toBe(firstId); // 자동으로 새 UUID를 만들지 않음

    // 학생이 다시 누르면(수동 재시도) 여전히 같은 clientEventId로 나간다.
    await handleRetryClick('fb-1', btn, msg, state);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(secondBody.clientEventId).toBe(firstId);
  });
});

describe('D12-1C4 — new logical action after completed lifecycle', () => {
  test('I: 성공 후에는 버튼이 영구히 disabled되어 같은 렌더에서 재클릭(새 logical action) 자체가 불가능하다', async () => {
    // 코드 근거(§9 준수): handleRetryClick의 res.ok 분기는 btn.disabled를
    // 다시 false로 되돌리는 코드가 없다 — 실패 분기(!res.ok, catch)에만
    // btn.disabled = false가 있다. 즉 현재 UI는 "성공 후 같은 버튼으로
    // 새 logical action을 시작"하는 경로를 제공하지 않는다. 새 logical
        // action은 오직 loadStudentFeedback()의 새 render() 호출(F5/재입장)로
    // 새 버튼·새 state가 생성될 때만 가능하며, 이는 아래 테스트로 확인한다.
    stubActivityDom('m1');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 } as Response)));
    const { handleRetryClick } = await importSink();

    const btn = makeFakeButton();
    const state = { clientEventId: null as string | null };
    await handleRetryClick('fb-1', btn, makeFakeMsgEl(), state);

    expect(btn.disabled).toBe(true);
    // disabled 상태이므로 이후 어떤 클릭 시도도 handleRetryClick 최상단
    // 가드에서 즉시 반환된다 — clientEventId도, fetch 호출도 늘지 않는다.
    const idAfterSuccess = state.clientEventId;
    await handleRetryClick('fb-1', btn, makeFakeMsgEl(), state);
    expect(state.clientEventId).toBe(idAfterSuccess);
  });

  test('새로운 render(새 state 객체)는 새 clientEventId를 받는다(새로고침/재입장과 동등)', async () => {
    stubActivityDom('m1');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 } as Response)));
    const { handleRetryClick } = await importSink();

    const firstState = { clientEventId: null as string | null };
    await handleRetryClick('fb-1', makeFakeButton(), makeFakeMsgEl(), firstState);

    // render()가 다시 호출되면(F5 등) 매번 새 RetryState({ clientEventId: null })를
    // 만든다 — 여기서는 그 사실을 직접 시뮬레이션한다.
    const secondState = { clientEventId: null as string | null };
    await handleRetryClick('fb-1', makeFakeButton(), makeFakeMsgEl(), secondState);

    expect(secondState.clientEventId).not.toBe(firstState.clientEventId);
  });
});

describe('D12-1C4 — double click', () => {
  test('J: 빠른 연속 클릭(동기적 두 번째 호출)은 fetch를 한 번만 보낸다', async () => {
    stubActivityDom('m1');
    let resolveFirst!: (v: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (resolveFirst = resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const { handleRetryClick } = await importSink();

    const btn = makeFakeButton();
    const state = { clientEventId: null as string | null };

    const p1 = handleRetryClick('fb-1', btn, makeFakeMsgEl(), state); // 첫 클릭 — await 전 동기 구간에서 btn.disabled = true
    const p2 = handleRetryClick('fb-1', btn, makeFakeMsgEl(), state); // 곧바로 두 번째 클릭 — btn.disabled 가드에 걸려야 함

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst({ ok: true, status: 200 } as Response);
    await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('D12-1C4 — existing UX unchanged', () => {
  test('K: activityId가 없으면 기존과 동일한 안내 문구를 보여준다', async () => {
    stubActivityDom(null);
    vi.stubGlobal('fetch', vi.fn());
    const { handleRetryClick } = await importSink();

    const msg = makeFakeMsgEl();
    await handleRetryClick('fb-1', makeFakeButton(), msg, { clientEventId: null });

    expect(msg.textContent).toBe('지금은 다시 해볼 수 없어요. 잠시 후 다시 시도해 주세요.');
  });

  test('K: 네트워크 실패 시 버튼 라벨이 원래대로 복원된다', async () => {
    stubActivityDom('m1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    const { handleRetryClick } = await importSink();

    const btn = makeFakeButton();
    const originalLabel = btn.textContent;
    await handleRetryClick('fb-1', btn, makeFakeMsgEl(), { clientEventId: null });

    expect(btn.textContent).toBe(originalLabel);
    expect(btn.disabled).toBe(false);
  });
});
