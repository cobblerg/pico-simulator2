// D11-B Regression Test Gate — B9 AI privacy boundary + failure handling
//
// No real OpenAI call anywhere in this file — AIProviderCall is a fake
// function we control, matching the "테스트 가능한 최소 seam" the file
// itself documents.
import { describe, test, expect } from 'vitest';
import {
  buildAIInputEvents,
  analyzeLearningPattern,
  assertResponseComplete,
  type AIProviderCall,
} from '../../src/server/ai-learning-analysis';
import { listRecentLearningEventsForEnrollment, type TeacherTimelineEvent } from '../../src/server/teacher-timeline-data';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('AI privacy boundary (D11-B9 regression)', () => {
  test('T9: buildAIInputEvents only copies seq/activityId/eventType/payload — stray identity fields on the input object cannot leak through', () => {
    // buildAIInputEvents는 입력 이벤트를 spread하지 않고 새 객체를
    // {seq, activityId, eventType, payload}로 명시적으로 "구성"한다 —
    // 그래서 입력 객체에 studentId/teacherId/classId/enrollmentId/
    // feedbackId 같은 sibling 필드가 어떤 이유로든 붙어 있어도 결과에
    // 나타날 방법이 구조적으로 없다(whitelist 방식, blacklist 아님).
    const sentinel = 'SENTINEL-DO-NOT-LEAK-93a7';
    const events = [
      {
        eventId: 'e1',
        eventType: 'part-add',
        activityId: 'm1',
        createdAt: 't1',
        payload: { kind: 'led', gp: 15 },
        studentId: sentinel,
        teacherId: sentinel,
        classId: sentinel,
        enrollmentId: sentinel,
        feedbackId: sentinel,
      } as unknown as TeacherTimelineEvent,
    ];

    const result = buildAIInputEvents(events);

    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(Object.keys(result[0]).sort()).toEqual(['activityId', 'eventType', 'payload', 'seq']);
  });

  test('T9b: error.msg (student-controlled free text) is stripped — only type/line remain', () => {
    const sentinel = 'SENTINEL-FREE-TEXT-error-msg-4f21';
    const events: TeacherTimelineEvent[] = [
      { eventId: 'e1', eventType: 'error', activityId: 'm1', createdAt: 't1', payload: { type: 'NameError', line: 3, msg: `NameError: ${sentinel}` } },
    ];

    const result = buildAIInputEvents(events);

    expect(result[0].payload).toEqual({ type: 'NameError', line: 3 });
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });

  // 참고: run.code(학생 전체 소스코드)는 buildAIInputEvents 자신이 지우는
  // 것이 아니다 — 이 함수는 "이미 Timeline 계층에서 축소된 안전한 입력"을
  // 전제로 동작한다(0-D11-A 설계 그대로). 실제로 code를 제거하는 책임은
  // teacher-timeline-data.ts의 TIMELINE_SANITIZERS['run']에 있으므로,
  // 그 보장은 buildAIInputEvents가 아니라 listRecentLearningEventsForEnrollment()
  // 자체를 대상으로 검증해야 정확하다(Audit §I에서 확인된 계층 분리).
  test('T9c: run.code (full source) is stripped by the Timeline layer before it would ever reach buildAIInputEvents', async () => {
    const sentinel = 'SENTINEL-FULL-CODE-abc123';
    const fakeClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit: () =>
                        Promise.resolve({
                          data: [
                            {
                              event_id: 'e1',
                              event_type: 'run',
                              activity_id: 'm1',
                              payload: { code: `print("${sentinel}")`, parts: ['led@GP15'] },
                              created_at: 't1',
                            },
                          ],
                          error: null,
                        }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    const events = await listRecentLearningEventsForEnrollment(fakeClient, 'enroll-1');

    expect(JSON.stringify(events)).not.toContain(sentinel);
    expect(events[0].payload).toEqual({ parts: ['led@GP15'] });
  });
});

function makeFakeProvider(opts: { status: string; incompleteReason?: string; outputText: string }): AIProviderCall {
  return async () => {
    assertResponseComplete(opts.status, opts.incompleteReason);
    return opts.outputText;
  };
}

describe('AI failure handling (D11-B9-AI-Output stabilization regression)', () => {
  const events = buildAIInputEvents([{ eventId: 'e1', eventType: 'run', activityId: 'm1', createdAt: 't1', payload: {} }]);

  test('T10: incomplete status -> "incomplete AI output: <reason>" (BUG-D11-B9-AI-Output-01 fix must not regress)', async () => {
    const provider = makeFakeProvider({ status: 'incomplete', incompleteReason: 'max_output_tokens', outputText: '{"summary":"cut off' });

    await expect(analyzeLearningPattern(events, provider)).rejects.toThrow('incomplete AI output: max_output_tokens');
  });

  test('T11: malformed JSON on a complete response -> existing "malformed AI output: invalid JSON" preserved', async () => {
    const provider = makeFakeProvider({ status: 'completed', outputText: '{not valid json' });

    await expect(analyzeLearningPattern(events, provider)).rejects.toThrow('malformed AI output: invalid JSON');
  });
});
