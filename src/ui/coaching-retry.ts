// AI Coach의 level 3 힌트 이후에 보여줄 행동/재실행 유도 문구를 제공한다.
// 강제 차단 gate가 아니라 항상 건너뛸 수 있는 짧은 안내이며, 정답 코드나
// 핀 번호를 담지 않고 학생이 스스로 확인·재실행하도록 부드럽게 권유한다.
export type CoachingRetryGate = {
  guidanceMessage: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
};

export const LEVEL_3_RETRY_GATE: CoachingRetryGate = {
  guidanceMessage: '지금까지 확인한 것을 바탕으로 다시 한 번 실행해 볼까요? 실행해봤다면 아래 버튼을 눌러 주세요.',
  primaryActionLabel: '실행해봤어요',
  secondaryActionLabel: '돌아갈게요',
};

export function getLevel3RetryGate(): CoachingRetryGate {
  return LEVEL_3_RETRY_GATE;
}
