// 학생 학습 Timeline 조회 (Stage 0-D10-D)
//
// teacher-authorization.ts의 assertStudentEnrolledInClass()가 검증한
// enrollmentId만을 조회 근거로 삼는다 — 이 파일 자체는 authorization을
// 전혀 하지 않는다(teacher-student-data.ts와 동일한 책임 분리 원칙,
// 0-D10-C 확정 결정 1을 그대로 계승).
//
// ---------- 최근 N개 조회(가장 오래된 것부터) ----------
// "최근 최대 200개"는 created_at DESC + LIMIT으로 얻어야 한다 — created_at
// ASC + LIMIT 200을 쓰면 "가장 오래된 200개"가 되어 정반대의 결과가
// 된다(0-D10-D 확정 결정 4의 명시적 경고). 이 함수는 DB에서 DESC로 최근
// MAX_EVENTS개를 가져온 뒤, 응답 직전에 배열을 뒤집어 API가 요구하는
// "오래된 이벤트 → 최신 이벤트" 순서로 맞춘다.
//
// ---------- payload 최소화(0-D10-D 확정 결정 6) ----------
// learning_event.payload에는 이미 저장 시점에 learning-event-handler.ts가
// sanitize한 값이 들어있지만(예: run.code 최대 20000자), 그걸 그대로
// 반환하지 않는다 — Teacher Timeline의 목적은 "코드 실행이 있었다"는 학습
// 과정 확인이지 코드 전문 열람이 아니다. 이 파일의 TIMELINE_SANITIZERS는
// learning-event-handler.ts의 저장용 SANITIZERS보다 "같거나 더 좁은"
// 범위여야 한다 — 특히 run/real-run의 code는 여기서 전부 제거한다.
import { SupabaseClient } from '@supabase/supabase-js';

export type TeacherTimelineEvent = {
  eventId: string;
  eventType: string;
  activityId: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

const MAX_EVENTS = 200;

function pick(payload: unknown, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof payload !== 'object' || payload === null) return out;
  const p = payload as Record<string, unknown>;
  for (const key of keys) {
    if (p[key] !== undefined) out[key] = p[key];
  }
  return out;
}

// learning-event-handler.ts의 ALLOWED_EVENT_TYPES(25종)와 정확히 같은
// event_type 집합을 다룬다 — 그 외 값은 이 DB에 애초에 저장될 수 없다(그
// handler가 쓰기 시점에 이미 거부하므로). 매핑에 없는 값이 방어적으로
// 들어와도 빈 객체로 처리한다(아래 조회 함수의 fallback).
const TIMELINE_SANITIZERS: Record<string, (payload: unknown) => Record<string, unknown>> = {
  'mission-open': () => ({}),
  'activity-open': (p) => pick(p, ['via']),
  paste: (p) => pick(p, ['lines']),
  'part-add': (p) => pick(p, ['kind', 'gp']),
  'part-move': (p) => pick(p, ['kind', 'from', 'to']),
  'part-remove': (p) => pick(p, ['kind', 'gp']),
  // run: code는 절대 반환하지 않는다(0-D10-D 확정 결정 6) — parts(부품
  // 구성 요약)만 "코드 실행이 있었다"는 학습 과정 확인에 필요한 최소 정보.
  run: (p) => pick(p, ['parts']),
  'run-end': (p) => pick(p, ['ok', 'ms']),
  error: (p) => pick(p, ['type', 'line', 'msg']),
  stop: () => ({}),
  checkpoint: (p) => pick(p, ['ok', 'msg']),
  reset: () => ({}),
  'project-save': () => ({}),
  'project-open': () => ({}),
  'project-share': (p) => pick(p, ['length']),
  'project-restart': () => ({}),
  'real-connect': () => ({}),
  // real-run: code는 저장 시점부터 유일한 필드였지만 Timeline에서는 그마저
  // 전부 제거한다 — "실물에서 실행했다"는 사실만 남긴다.
  'real-run': () => ({}),
  'real-run-end': (p) => pick(p, ['ok', 'error']),
  'real-save': () => ({}),
  // D11-B8: AI Coach 학습 과정 이벤트. 저장 시점에 이미 고정 enum으로
  // sanitize된 값만 있으므로 그대로 노출해도 안전하다.
  'coach-open': () => ({}),
  'coach-hint': (p) => pick(p, ['level', 'focus']),
  'coach-retry': () => ({}),
  'coach-reflection': (p) => pick(p, ['choice']),
  // D11-B11: feedbackId는 내부 DB id이므로 Timeline에는 절대 노출하지
  // 않는다(coach-open/coach-retry와 동일한 패턴) — 교사는 자신이 쓴
  // feedback을 이미 알고 있으므로, "선택했다"는 사실만으로 충분하다. 이
  // 빈 payload는 AI 입력(ai-learning-analysis.ts)에도 그대로 전달되어,
  // feedbackId가 AI에 노출되는 경로 자체를 원천 차단한다.
  'feedback-retry': () => ({}),
};

type LearningEventRow = {
  event_id: string;
  event_type: string;
  activity_id: string;
  payload: unknown;
  created_at: string;
};

export async function listRecentLearningEventsForEnrollment(
  client: SupabaseClient,
  enrollmentId: string
): Promise<TeacherTimelineEvent[]> {
  const { data, error } = await client
    .from('learning_event')
    .select('event_id, event_type, activity_id, payload, created_at')
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: false })
    .limit(MAX_EVENTS);

  if (error) throw error;

  // DESC로 가져온 "최근 N개"를 응답 직전에 뒤집어 오래된 것 → 최신 순으로
  // 맞춘다 — DB 쿼리 자체를 ASC로 바꾸면 "최초 N개"가 되어버리므로 반드시
  // 이 순서(DESC 조회 → 애플리케이션에서 reverse)를 지킨다.
  const rows = (data as LearningEventRow[]).slice().reverse();

  return rows.map((row) => {
    const sanitize = TIMELINE_SANITIZERS[row.event_type];
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      activityId: row.activity_id,
      createdAt: row.created_at,
      payload: sanitize ? sanitize(row.payload) : {},
    };
  });
}

// ---------- D11-B12: 피드백 이후 관찰(Post-Feedback Observation) ----------
//
// "가장 최근 feedback-retry 이후 시간순으로 관찰된 학습 행동"만 deterministic
// 하게 집계한다 — 특정 feedbackId와 연결하지 않는다(Audit 결론: Timeline이
// 이미 feedbackId를 제거한 채로 이벤트를 주므로, 특정 feedback 하나에
// 결과를 귀속시키는 것은 근거 없는 association이 된다). 평가/판정(향상됨,
// 이해함, 성공함 등)은 절대 계산하지 않는다 — 오직 개수/최근값 같은 사실만
// 센다. activityId로 필터링하지 않는다(feedback-retry.activityId는 클릭
// 당시 context일 뿐, 이후 이벤트가 다른 activity에서 일어나도 그대로 포함).
export type PostFeedbackObservation =
  | { hasRetry: false }
  | {
      hasRetry: true;
      retryAt: string;
      totalEvents: number;
      runCount: number;
      checkpointCount: number;
      coachCount: number;
      latestActivityId: string | null;
      latestCheckpointMsg: string | null;
    };

// events는 이미 오래된 → 최신 순으로 정렬되어 있다는 전제(이 파일의 다른
// 모든 함수와 동일한 전제)를 그대로 쓴다 — 별도 정렬을 하지 않고, 뒤에서부터
// 가장 최근 feedback-retry의 index를 찾아 slice(index + 1)만 본다.
export function buildPostFeedbackObservation(events: TeacherTimelineEvent[]): PostFeedbackObservation {
  let anchorIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].eventType === 'feedback-retry') {
      anchorIndex = i;
      break;
    }
  }
  if (anchorIndex === -1) return { hasRetry: false };

  const after = events.slice(anchorIndex + 1);
  let runCount = 0;
  let checkpointCount = 0;
  let coachCount = 0;
  let latestActivityId: string | null = null;
  let latestCheckpointMsg: string | null = null;

  for (const ev of after) {
    latestActivityId = ev.activityId;
    if (ev.eventType === 'run') runCount++;
    if (ev.eventType === 'checkpoint') {
      checkpointCount++;
      const msg = (ev.payload as { msg?: unknown }).msg;
      if (typeof msg === 'string') latestCheckpointMsg = msg;
    }
    if (ev.eventType.startsWith('coach-')) coachCount++;
  }

  return {
    hasRetry: true,
    retryAt: events[anchorIndex].createdAt,
    totalEvents: after.length,
    runCount,
    checkpointCount,
    coachCount,
    latestActivityId,
    latestCheckpointMsg,
  };
}
