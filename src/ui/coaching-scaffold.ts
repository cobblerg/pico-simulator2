// AI 코칭 — stuckReason별 정적 콘텐츠
//
// AI Coach panel의 질문 화면(선택지 label)과 스캐폴드 화면(scaffoldMessage,
// actionLabel)에 쓰는 문구를 제공하는 순수 데이터 모듈이다. app.ts가 이
// 데이터로 화면을 렌더링한다 — coaching-session.ts(상태)와 이 파일(콘텐츠)
// 의 책임을 분리한다.
//
// 문구 작성 원칙: 완성 코드, 함수명, Pin 같은 코드 키워드, "이렇게
// 고치세요" 식 수정 지시, 학생 수준 판단 표현을 넣지 않는다. 학생이 이미
// 화면에서 볼 수 있는 것(미션 카드, 보드의 GP 핀, 실행 결과)을 다시 보게
// 유도할 뿐, 정답이나 전체 절차를 대신 알려주지 않는다.
import type { StuckReason } from './coaching-session';

export type CoachingScaffold = {
  label: string;
  scaffoldMessage: string;
  actionLabel: string;
};

// data.ts의 PART_INFO(Record<PartKind, {...}>), app.ts의 CHECKS(Record<PartKind
// | 'common', string[]>)와 동일한 convention — StuckReason 4종을 key로 하는
// Record다. reason을 값 안에 다시 담지 않는 이유: PART_INFO.led가 자기
// 자신의 kind를 필드로 반복하지 않는 것과 같은 이유로, key와 값 내부 필드가
// 어긋날 여지를 원천적으로 없앤다. 배열 + find() 대신 Record를 쓰는 이유:
// StuckReason이 정확히 4개로 닫힌 union이므로, TypeScript가 이 4개 key가
// 모두 채워졌는지 컴파일 타임에 강제해 준다 — find()가 반환할 수 있는
// "찾지 못함"(undefined) 경로 자체가 애초에 존재하지 않는다.
export const COACHING_SCAFFOLDS: Record<StuckReason, CoachingScaffold> = {
  'goal-unclear': {
    label: '무엇을 해야 하는지 잘 모르겠어요',
    scaffoldMessage: '미션 카드의 목표 문장을 다시 한 번 읽어 보고, 이 미션에서 다뤄야 할 장치가 무엇인지 찾아보세요.',
    actionLabel: '찾아봤어요',
  },
  'first-step-unclear': {
    label: '할 일은 알겠는데 어떻게 시작할지 모르겠어요',
    scaffoldMessage: '코드를 쓰기 전에, 이 미션에 필요한 부품이 보드의 어느 GP 핀에 연결되어 있는지부터 확인해 보세요.',
    actionLabel: '확인했어요',
  },
  'tried-not-working': {
    label: '직접 해봤는데 잘 안 돼요',
    scaffoldMessage: '실행 결과를 다시 보고, 예상과 다르게 보인 부분이 정확히 무엇인지 한 문장으로 적어 보세요.',
    actionLabel: '관찰했어요',
  },
  'result-unclear': {
    label: '결과는 나왔는데 왜 그런지 잘 모르겠어요',
    scaffoldMessage: '예상했던 결과와 실제로 나온 결과를 각각 한 문장으로 적고, 두 문장을 나란히 비교해 보세요.',
    actionLabel: '비교해봤어요',
  },
};

// reason은 StuckReason(정확히 4개로 닫힌 union)이므로 COACHING_SCAFFOLDS는
// 항상 값을 갖는다 — undefined 분기나 fallback 문구를 만들지 않는다.
export function getCoachingScaffold(reason: StuckReason): CoachingScaffold {
  return COACHING_SCAFFOLDS[reason];
}
