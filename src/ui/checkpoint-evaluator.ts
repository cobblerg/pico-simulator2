// 체크포인트 evaluator (0-C2)
//
// app.ts의 checkAtEnd/checkLive에 하드코딩된 m1~m6 판정 알고리즘을
// 그대로(단순화하거나 개선하지 않고) 재현하는 순수 함수 모음이다.
//
// 이 파일은 checkpoint.ts의 타입만 import한다 — data.ts, app.ts, engine/*,
// board.ts, DOM API는 어느 것도 참조하지 않는다.
//
// 중요: 이 evaluator는 아직 app.ts의 실제 판정에 연결되지 않는다.
// checkAtEnd/checkLive는 계속 자체 하드코딩 로직으로 판정한다(0-C3에서 연결 예정).
import { CheckpointRule, CheckpointEvaluationContext, EvaluationResult, CheckpointRuntimeState } from './checkpoint';

// m1: checkAtEnd의 'm1' 분기(577~587행대)를 그대로 재현.
// - 배열에서 "처음 만나는" level=1 edge만 on으로 본다 (가장 긴 hold를 찾지 않는다).
// - on 이후 "처음 만나는" level=0 edge만 off로 본다.
// - off.atMs - on.atMs >= minHoldMs (경계값 800은 통과) — 원본과 동일한 >= 유지.
// 원본은 end 시점에 항상 pass/fail 중 하나로 완결되므로(pending 경로 없음) 이 rule은
// 'pending'을 반환하지 않는다.
function evalEdgeHold(rule: Extract<CheckpointRule, { kind: 'edge-hold' }>, ctx: CheckpointEvaluationContext): EvaluationResult {
  const e = ctx.edges.filter((x) => x.pin === rule.pin);
  const on = e.find((x) => x.level === 1);
  const off = on && e.find((x) => x.level === 0 && x.atMs > on.atMs);
  const passed = !!(on && off && off.atMs - on.atMs >= rule.minHoldMs);
  return { status: passed ? 'passed' : 'failed' };
}

// m2: checkAtEnd의 'm2' 분기(588~591행대)를 그대로 재현. rises >= min.
// 원본은 if/else 두 분기로 완결되므로(pending 경로 없음) 이 rule도 'pending'을 내지 않는다.
function evalEdgeCount(rule: Extract<CheckpointRule, { kind: 'edge-count' }>, ctx: CheckpointEvaluationContext): EvaluationResult {
  const level = rule.edge === 'rise' ? 1 : 0;
  const count = ctx.edges.filter((x) => x.pin === rule.pin && x.level === level).length;
  return { status: count >= rule.min ? 'passed' : 'failed' };
}

// m3: checkLive의 'm3' 분기(607~612행대)를 그대로 재현.
// 원본의 m3Seen(모듈 전역 mutable 변수)을 외부에서 주입받는 state.seen으로 대체한다.
// 원본 순서:
//   1) btn.pressed && ledOn 이면 m3Seen = true
//   2) m3Seen && !btn.pressed && ledOff 이면 통과
// btn.pressed와 !btn.pressed는 같은 호출에서 동시에 참일 수 없으므로,
// "이번 관측에서 seen이 되는지"와 "이번 관측에서 통과하는지"는 한 번의 순수 계산으로
// 정확히 동일하게 재현할 수 있다. 입력 state 객체는 절대 mutate하지 않고
// 항상 새 객체를 nextState로 반환한다.
// 원본 checkLive의 m3 분기는 showCheck(false, ...)를 호출하는 경로가 전혀 없으므로
// (else 분기 없음), 이 rule은 'failed'를 절대 반환하지 않는다 — 통과 전까지는 계속
// 'pending'이다.
function evalPressToggle(
  rule: Extract<CheckpointRule, { kind: 'press-toggle' }>,
  ctx: CheckpointEvaluationContext,
  state: CheckpointRuntimeState,
): { result: EvaluationResult; nextState: CheckpointRuntimeState } {
  const pressed = ctx.pressedInputs.has(rule.inputGp);
  const out = ctx.pins.get(rule.outputGp);
  const outOn = out?.mode === 'out' && out.level === 1;
  const outOff = out?.mode === 'out' && out.level === 0;
  const seenAfter = !!state.seen || (pressed && outOn);
  const passed = seenAfter && !pressed && outOff;
  return { result: { status: passed ? 'passed' : 'pending' }, nextState: { seen: seenAfter } };
}

// m4: checkLive의 'm4' 분기(613~619행대)를 그대로 재현.
// 숫자 추출 정규식(-?\d+(\.\d+)?)까지 원본과 동일하게 evaluator가 책임진다.
// 원본은 `if (nums.length >= 2) { ... if (span >= big) showCheck(true, ...) }` 구조라
// showCheck(false, ...)를 호출하는 경로가 전혀 없다 — 샘플 부족이든 span 미달이든
// 전부 "판정 보류"이지 "실패 확정"이 아니다. 그래서 이 rule은 'failed'를 절대
// 반환하지 않는다.
function evalStdoutRange(rule: Extract<CheckpointRule, { kind: 'stdout-range' }>, ctx: CheckpointEvaluationContext): EvaluationResult {
  const nums = (ctx.stdout.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  if (nums.length < rule.minSamples) return { status: 'pending' };
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const span = max - min;
  const big = max > rule.bigValueThreshold ? rule.bigSpanMin : rule.smallSpanMin;
  return { status: span >= big ? 'passed' : 'pending' };
}

// m5: checkLive의 'm5' 분기(620~623행대)를 그대로 재현.
// 상대오차 분모는 관측값이 아니라 target — 원본 `Math.abs(x - f) / f`(f=target)과 동일.
// 원본은 통과 조건이 참일 때만 showCheck(true, ...)를 호출하고 else가 없으므로,
// 이 rule도 'failed'를 반환하지 않는다. 실행 종료 시점에 "아직 pending이면 실패로
// 확정"하는 정책은 evaluator가 아니라 checkAtEnd 같은 호출부의 책임이다(0-C3에서 처리).
function evalPwmFreqSet(rule: Extract<CheckpointRule, { kind: 'pwm-freq-set' }>, ctx: CheckpointEvaluationContext): EvaluationResult {
  const freqs = ctx.pwmSamples.filter((x) => x.pin === rule.pin && x.duty > 0).map((x) => x.freq);
  const has = (target: number) => freqs.some((observed) => Math.abs(observed - target) / target < rule.tolerance);
  return { status: rule.targets.every(has) ? 'passed' : 'pending' };
}

// m6: checkLive의 'm6' 분기(624~627행대)를 그대로 재현.
// freqRange 양끝은 원본과 동일하게 배타적(>lo && <hi), 각도 환산식도 원본 그대로.
// m5와 동일한 이유로 'failed'를 반환하지 않는다(실행 종료 시 실패 확정은 호출부 책임).
function evalPwmDutyAngleSet(rule: Extract<CheckpointRule, { kind: 'pwm-duty-angle-set' }>, ctx: CheckpointEvaluationContext): EvaluationResult {
  const [lo, hi] = rule.freqRange;
  const angles = ctx.pwmSamples
    .filter((x) => x.pin === rule.pin && x.freq > lo && x.freq < hi)
    .map((x) => ((x.duty / x.freq) * 1000 - 0.5) / 2 * 180);
  const has = (target: number) => angles.some((a) => Math.abs(a - target) < rule.tolerance);
  return { status: rule.targets.every(has) ? 'passed' : 'pending' };
}

export function evaluateCheckpoint(
  rule: CheckpointRule,
  ctx: CheckpointEvaluationContext,
  state: CheckpointRuntimeState = {},
): { result: EvaluationResult; nextState: CheckpointRuntimeState } {
  switch (rule.kind) {
    case 'edge-hold':
      return { result: evalEdgeHold(rule, ctx), nextState: state };
    case 'edge-count':
      return { result: evalEdgeCount(rule, ctx), nextState: state };
    case 'press-toggle':
      return evalPressToggle(rule, ctx, state);
    case 'stdout-range':
      return { result: evalStdoutRange(rule, ctx), nextState: state };
    case 'pwm-freq-set':
      return { result: evalPwmFreqSet(rule, ctx), nextState: state };
    case 'pwm-duty-angle-set':
      return { result: evalPwmDutyAngleSet(rule, ctx), nextState: state };
  }
}
