// AI Coach의 retry gate primary("실행해봤어요") 이후에 보여줄 post-retry
// reflection 문구를 제공한다. 강제 흐름이 아니라 학생이 다시 관찰하거나
// 스스로 괜찮다고 마무리할 수 있는 짧은 갈림길이며, checkpoint pass 여부를
// 판정하지 않고 정답 코드나 핀 번호도 담지 않는다.
export type CoachingReflectionPrompt = {
  guidanceMessage: string;
  reobserveActionLabel: string;
  resolvedActionLabel: string;
  resolvedMessage: string;
};

export const POST_RETRY_REFLECTION_PROMPT: CoachingReflectionPrompt = {
  guidanceMessage: '다시 확인해 본 결과, 무엇이 달라졌나요?',
  reobserveActionLabel: '다시 관찰해볼게요',
  resolvedActionLabel: '이제 괜찮아요',
  resolvedMessage: '좋아요. 필요하면 다시 AI 학습 코치를 열어 확인할 수 있어요.',
};

export function getPostRetryReflectionPrompt(): CoachingReflectionPrompt {
  return POST_RETRY_REFLECTION_PROMPT;
}
