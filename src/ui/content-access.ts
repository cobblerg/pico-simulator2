// 콘텐츠 접근 계층 (0-B)
//
// app.ts가 PICO_COURSE의 내부 구조(units/lessons/activities 배열)를
// 직접 탐색하지 않고도 Mission을 조회할 수 있게 하는 API.
// 지금은 PICO_COURSE(→ MISSIONS)를 감쌀 뿐이지만, 향후 Content Source가
// JSON이나 Supabase로 바뀌어도 이 함수들의 시그니처는 유지하는 것이 목표다.
import { Mission } from './data';
import { PICO_COURSE } from './content';

// Unit/Lesson이 여러 개로 늘어나도 동작하도록 특정 인덱스에 의존하지 않고
// 전체를 순회한다. 목록이 작고(현재 6개) 자주 호출되지 않으므로
// 별도 캐시 없이 매번 계산하는 가장 단순한 방식을 쓴다.
function collectSimulatorMissions(): Mission[] {
  const missions: Mission[] = [];
  for (const unit of PICO_COURSE.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        if (activity.type === 'simulator') missions.push(activity.mission);
      }
    }
  }
  return missions;
}

export function getSimulatorMissions(): Mission[] {
  return collectSimulatorMissions();
}

export function getMissionById(id: string): Mission | undefined {
  return collectSimulatorMissions().find((m) => m.id === id);
}

export function getMissionIndex(id: string): number {
  return collectSimulatorMissions().findIndex((m) => m.id === id);
}

export function getDefaultMission(): Mission {
  const missions = collectSimulatorMissions();
  if (!missions.length) throw new Error('PICO_COURSE에 simulator mission이 하나도 없습니다.');
  return missions[0];
}
