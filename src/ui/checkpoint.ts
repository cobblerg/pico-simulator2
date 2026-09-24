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

// ---------- 0-C2: evaluator 입출력 타입 ----------
//
// 아래 타입들은 checkpoint-evaluator.ts가 사용하는 입출력 타입이다.
// 이 파일(checkpoint.ts)은 계속 "타입 전용, 외부 의존 0개" 모듈로 유지하고,
// 실제 판정 로직은 checkpoint-evaluator.ts에만 둔다.

// app.ts의 runEdges 원소와 같은 모양(부품/DOM 타입 없이 pin/level/시각만).
export type EdgeEvent = { pin: number; level: 0 | 1; atMs: number };

// app.ts의 runPins 원소와 같은 모양.
export type PwmSample = { pin: number; freq: number; duty: number };

// engine/core.ts의 PinReport와 구조적으로 호환되는(하지만 import하지 않는)
// 최소 스냅샷 — evaluator가 실제로 읽는 mode/level만 담는다.
export type PinSnapshot = { mode: 'out' | 'in' | 'pwm' | 'off'; level: 0 | 1 };

// Board 전체, app.ts 상태 전체, DOM을 넘기지 않고 6개 rule이 실제로 읽는
// "관측 이력의 스냅샷"만 담은 최소 컨텍스트.
export type CheckpointEvaluationContext = {
  edges: EdgeEvent[]; // m1(edge-hold), m2(edge-count)
  pwmSamples: PwmSample[]; // m5(pwm-freq-set), m6(pwm-duty-angle-set)
  stdout: string; // m4(stdout-range)
  pressedInputs: Set<number>; // m3(press-toggle) — 현재 눌린 입력 부품의 gp
  pins: Map<number, PinSnapshot>; // m3(press-toggle) — 현재 핀 상태
};

// 0-C2 보완: {passed:boolean} 하나로는 기존 checkAtEnd/checkLive의 실제 UI 의미를
// 재현할 수 없다는 것이 밝혀져 3상태 모델로 바꿨다(0-C2 최초 구현 직후, commit 전).
//
// - pending: 아직 성공 조건이 충족되지 않았지만, 기존 UI가 "실패"로 표시하지
//            않는 상태 (showCheck가 호출되지 않는 경우) — m3/m4/m5/m6가 여기 해당.
// - failed : 현재 판정 시점에서 실패가 확정된 상태 (showCheck(false, ...)가 호출됨)
//            — m1/m2의 end 판정만 evaluator 레벨에서 이 값을 낸다.
// - passed : 성공 조건 충족 (showCheck(true, ...))
//
// passed:boolean + pending:boolean 같은 복수 boolean 조합은 쓰지 않는다 —
// 모순된 조합(예: passed:true인데 pending도 true)이 타입상 아예 불가능하도록
// 단일 discriminated 필드로 둔다.
export type EvaluationResult = { status: 'pending' | 'failed' | 'passed' };

// m3(press-toggle) 전용 상태만 표현한다. 범용 상태 머신 프레임워크가 아니다.
// press-toggle이 아닌 rule은 이 상태를 읽지도 쓰지도 않는다.
export type CheckpointRuntimeState = { seen?: boolean };
