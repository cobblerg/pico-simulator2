// D11-B Regression Test Gate — B12 buildPostFeedbackObservation()
//
// buildPostFeedbackObservation()는 순수 함수다(DB/network 없음) — events
// 배열만으로 anchor(가장 최근 feedback-retry)를 찾고 그 이후 이벤트만
// deterministic하게 집계한다. 이 세 테스트는 Audit에서 지정한 T1~T3을
// 그대로 구현한다.
import { describe, test, expect } from 'vitest';
import { buildPostFeedbackObservation, type TeacherTimelineEvent } from '../../src/server/teacher-timeline-data';

function ev(eventType: string, activityId: string, payload: Record<string, unknown>, createdAt: string): TeacherTimelineEvent {
  return { eventId: `e-${Math.random()}`, eventType, activityId, createdAt, payload };
}

describe('buildPostFeedbackObservation (D11-B12 regression)', () => {
  test('T1: no feedback-retry -> hasRetry false', () => {
    const events = [ev('run', 'm1', {}, 't1'), ev('checkpoint', 'm1', { ok: true }, 't2')];

    const result = buildPostFeedbackObservation(events);

    expect(result).toEqual({ hasRetry: false });
  });

  test('T2: multiple feedback-retry -> only the most recent is the anchor, earlier events excluded', () => {
    const events = [
      ev('feedback-retry', 'm1', { feedbackId: 'fb-old' }, 't1'),
      ev('run', 'm1', {}, 't2'), // anchor 이전 — 새 anchor 계산에 포함되면 안 된다
      ev('feedback-retry', 'm1', { feedbackId: 'fb-new' }, 't3'),
      ev('checkpoint', 'm1', { ok: true, msg: '통과했어요' }, 't4'),
    ];

    const result = buildPostFeedbackObservation(events);

    expect(result.hasRetry).toBe(true);
    if (!result.hasRetry) throw new Error('unreachable');
    expect(result.retryAt).toBe('t3');
    expect(result.totalEvents).toBe(1);
    expect(result.runCount).toBe(0); // t2의 run은 이전 anchor 뒤, 새 anchor 앞이라 제외되어야 한다
    expect(result.checkpointCount).toBe(1);
    expect(result.latestCheckpointMsg).toBe('통과했어요');
  });

  test('T3: cross-activity events are all included (no activityId filtering), latestActivityId reflects the last event', () => {
    const events = [
      ev('feedback-retry', 'm1', { feedbackId: 'fb-1' }, 't1'),
      ev('run', 'm2', {}, 't2'),
      ev('checkpoint', 'm3', { ok: true }, 't3'),
    ];

    const result = buildPostFeedbackObservation(events);

    expect(result.hasRetry).toBe(true);
    if (!result.hasRetry) throw new Error('unreachable');
    expect(result.totalEvents).toBe(2);
    expect(result.runCount).toBe(1);
    expect(result.checkpointCount).toBe(1);
    expect(result.latestActivityId).toBe('m3');
  });
});
