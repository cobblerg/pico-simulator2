// AI Coach의 hint ladder에서 쓰는 정적 문구를 제공한다. hypothesisFocus별로
// 3단계 힌트를 담고 있으며, 힌트는 단계가 올라가도 정답 코드·핀 번호·수정
// 지시를 담지 않는다 — 학생이 다시 확인·비교·실험할 대상만 좁혀준다.
import type { HypothesisFocus } from './coaching-session';

export type HintLevel = 1 | 2 | 3;

export type CoachingHint = {
  guidanceMessage: string;
  actionLabel: string;
};

export const MAX_COACHING_HINT_LEVEL = 3;

export const COACHING_HINTS: Record<HypothesisFocus, Record<HintLevel, CoachingHint>> = {
  code: {
    1: { guidanceMessage: '코드를 위에서 아래로 천천히 읽으며, 각 줄이 어떤 순서로 실행될지 손으로 짚어 보세요.', actionLabel: '확인해봤어요' },
    2: { guidanceMessage: '같은 장치를 다루는 부분들이 서로 어떤 순서로 놓여 있는지 비교해 보세요.', actionLabel: '비교해봤어요' },
    3: { guidanceMessage: '한 번에 한 부분만 바꿔 실행해 보고, 결과가 어떻게 달라지는지 관찰해 보세요.', actionLabel: '실험해볼게요' },
  },
  wiring: {
    1: { guidanceMessage: '보드 위에서 이번 미션에 쓰이는 부품이 어느 자리에 꽂혀 있는지 다시 확인해 보세요.', actionLabel: '확인해봤어요' },
    2: { guidanceMessage: '부품의 각 연결이 미션 카드의 요구사항과 어떻게 대응되는지 하나씩 짝지어 보세요.', actionLabel: '비교해봤어요' },
    3: { guidanceMessage: '연결 상태를 하나씩 확인한 뒤 다시 실행해 보고, 보드 반응이 달라지는지 관찰해 보세요.', actionLabel: '실험해볼게요' },
  },
  'device-behavior': {
    1: { guidanceMessage: '이 장치가 정상일 때 어떤 모습으로 반응해야 하는지 미션 카드에서 다시 찾아보세요.', actionLabel: '확인해봤어요' },
    2: { guidanceMessage: '지금 보이는 반응과 기대한 반응 중 어디가 다른지 하나씩 비교해 보세요.', actionLabel: '비교해봤어요' },
    3: { guidanceMessage: '장치에 영향을 주는 입력이나 조작을 하나만 바꿔 다시 실행해 보고, 반응이 달라지는지 관찰해 보세요.', actionLabel: '실험해볼게요' },
  },
  'not-sure': {
    1: { guidanceMessage: '지금 막힌 부분이 코드, 연결, 장치 동작 중 어디에 가까운지 하나만 골라 보세요.', actionLabel: '확인해봤어요' },
    2: { guidanceMessage: '고른 부분에서 지금 실제로 보이는 모습을 짧게 떠올리고, 미션 목표와 나란히 비교해 보세요.', actionLabel: '비교해봤어요' },
    3: { guidanceMessage: '가장 먼저 확인할 작은 행동 하나를 정해 실행해 보고, 달라진 점이 있는지 관찰해 보세요.', actionLabel: '실험해볼게요' },
  },
};

export function getCoachingHint(focus: HypothesisFocus, hintLevel: HintLevel): CoachingHint {
  return COACHING_HINTS[focus][hintLevel];
}
