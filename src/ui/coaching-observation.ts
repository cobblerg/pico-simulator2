// AI Coach의 관찰/가설 초점 선택 화면에서 쓰는 정적 문구를 제공한다.
// 문구는 원인 진단이나 정답 코드가 아니라, 학생이 다음 관찰 행동을
// 스스로 하도록 돕는 발판이다.
import type { HypothesisFocus, ObservationChoice } from './coaching-session';

export type ObservationScaffold = {
  label: string;
  guidanceMessage: string;
  actionLabel: string;
};

export const OBSERVATION_SCAFFOLDS: Record<ObservationChoice, ObservationScaffold> = {
  'no-change': {
    label: '아무 변화도 일어나지 않았어요',
    guidanceMessage: '기대했던 모습과 지금 화면에 보이는 상태를 비교해 보세요. 미션 카드, 콘솔, 핀 상태를 차례로 다시 살펴보세요.',
    actionLabel: '비교해봤어요',
  },
  'error-message': {
    label: '오류 메시지가 떴어요',
    guidanceMessage: '콘솔의 마지막 오류 줄과 그 아래 도움말을 천천히 다시 읽어 보세요.',
    actionLabel: '다시 읽어봤어요',
  },
  'unexpected-behavior': {
    label: '무언가 달라지긴 했는데, 원하던 모습은 아니었어요',
    guidanceMessage: '원래 기대했던 모습과 실제로 달라진 부분을 각각 떠올려 보고, 두 모습을 비교해 보세요.',
    actionLabel: '비교해봤어요',
  },
  'not-sure': {
    label: '아직 잘 모르겠어요',
    guidanceMessage: '미션 목표 문장을 다시 읽고, 성공했다면 무엇이 보여야 하는지부터 확인해 보세요.',
    actionLabel: '확인해봤어요',
  },
};

export function getObservationScaffold(observation: ObservationChoice): ObservationScaffold {
  return OBSERVATION_SCAFFOLDS[observation];
}

export type HypothesisFocusScaffold = {
  label: string;
  guidanceMessage: string;
  actionLabel: string;
};

export const HYPOTHESIS_FOCUS_SCAFFOLDS: Record<HypothesisFocus, HypothesisFocusScaffold> = {
  code: {
    label: '코드',
    guidanceMessage: '코드를 한 줄씩 순서대로 다시 읽으면서, 의도한 순서와 실제 실행 순서가 같은지 확인해 보세요.',
    actionLabel: '확인해볼게요',
  },
  wiring: {
    label: '핀 연결',
    guidanceMessage: '보드에 놓인 부품이 미션에서 요구하는 핀 위치와 맞게 연결되어 있는지 다시 확인해 보세요.',
    actionLabel: '확인해볼게요',
  },
  'device-behavior': {
    label: '장치 동작',
    guidanceMessage: '그 장치가 어떤 조건에서 어떻게 움직여야 하는지 미션 카드와 보드 상태를 함께 보며 확인해 보세요.',
    actionLabel: '확인해볼게요',
  },
  'not-sure': {
    label: '아직 모르겠어요',
    guidanceMessage: '지금 떠오르는 생각을 짧게 정리하고, 코드·핀 연결·장치 동작 중 하나를 골라 먼저 살펴보세요.',
    actionLabel: '확인해볼게요',
  },
};

export function getHypothesisFocusScaffold(focus: HypothesisFocus): HypothesisFocusScaffold {
  return HYPOTHESIS_FOCUS_SCAFFOLDS[focus];
}
