// 체크포인트 타입 (0-C1)
//
// 현재 app.ts의 checkAtEnd/checkLive에 하드코딩된 m1~m6 판정 규칙을
// "데이터"로 표현하기 위한 타입만 정의한다. 이번 단계에서는 evaluator를
// 구현하지 않으며, 이 타입/데이터는 아직 어떤 실행 경로에도 연결되지 않는다.
//
// 이 파일은 의도적으로 다른 모듈을 import하지 않는다(외부 의존 0개).
// data.ts가 Mission.checkpoints 필드를 위해 이 파일의 타입을 가져오는데,
// 향후(0-C2) checkpoint 평가 로직이 data.ts의 Part/PartKind 등을 참조하게 되면
// data.ts ↔ checkpoint.ts 순환 import가 생길 수 있다. 타입만 담은 이 파일을
// 의존성 없는 리프(leaf) 모듈로 유지하면, 그 시점이 오더라도 "타입 정의 파일"과
// "평가 로직 파일"을 분리해 순환을 피할 수 있다.
//
// CheckpointRule은 현재 m1~m6이 실제로 검사하는 조건만 표현한다.
// 아직 코드에 없는 판정 방식(예: 향후 활동 유형을 위한 규칙)은 추가하지 않는다.
export type CheckpointRule =
  // m1: 특정 핀이 켜진(1) 뒤 꺼질(0) 때까지의 시간이 minHoldMs 이상 유지되는가
  | { kind: 'edge-hold'; pin: number; minHoldMs: number }
  // m2: 특정 핀이 0→1(또는 1→0)로 바뀐 횟수가 min회 이상인가
  | { kind: 'edge-count'; pin: number; edge: 'rise' | 'fall'; min: number }
  // m3: 입력 부품(inputGp)을 누른 상태에서 출력 핀(outputGp)이 켜진 것을 본 뒤,
  //     입력을 떼고 출력 핀이 꺼진 것을 보면 통과 (순서가 있는 2단계 상태 검사)
  | { kind: 'press-toggle'; inputGp: number; outputGp: number }
  // m4: 표준출력에서 숫자를 minSamples개 이상 뽑아, 그 값들의 (최대-최소) 범위가
  //     임계값 이상인가. 임계값은 관측된 최댓값이 bigValueThreshold를 넘으면
  //     bigSpanMin, 아니면 smallSpanMin을 쓴다(원본 코드의 조건부 임계값 그대로).
  | { kind: 'stdout-range'; minSamples: number; bigValueThreshold: number; bigSpanMin: number; smallSpanMin: number }
  // m5: 특정 핀의 PWM 출력에서 관측된 주파수 집합이 targets를 (상대오차 tolerance
  //     이내로) 모두 포함하는가
  | { kind: 'pwm-freq-set'; pin: number; targets: number[]; tolerance: number }
  // m6: 특정 핀이 freqRange 범위의 PWM일 때, duty/freq를 서보 각도로 환산한 값들의
  //     집합이 targets를 (절대오차 tolerance도 이내로) 모두 포함하는가
  | { kind: 'pwm-duty-angle-set'; pin: number; freqRange: [number, number]; targets: number[]; tolerance: number };

export type Checkpoint = {
  // 이 규칙을 언제 검사하는지: 실행 중(live)에만 / 실행 종료(end) 시에만 / 둘 다(both)
  when: 'live' | 'end' | 'both';
  rule: CheckpointRule;
};
