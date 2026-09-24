// 체크포인트 선택 (0-C3-A)
//
// Mission.checkpoints 중 주어진 시점(when)에 평가해야 할 Checkpoint만 골라내는
// 순수 함수. DOM, Board, app.ts 런타임 상태를 전혀 참조하지 않는다.
//
// 이 함수는 app.ts에서 아직 호출되지 않는다(0-C3-A는 "연결 안 된" 준비 계층만
// 만드는 단계) — checkAtEnd/checkLive는 여전히 자체 하드코딩 로직으로 판정한다.
import { Mission } from './data';
import { Checkpoint } from './checkpoint';

export function selectCheckpoints(mission: Mission, when: 'live' | 'end'): Checkpoint[] {
  return (mission.checkpoints ?? []).filter((c) => c.when === when || c.when === 'both');
}
