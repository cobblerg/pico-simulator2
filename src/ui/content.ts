// 콘텐츠 계층 구조 scaffolding (Course → Unit → Lesson → Activity)
//
// 이 파일은 향후 "과목 → 단원 → 차시 → 활동" 구조로 콘텐츠를 확장하기 위한 기반이다.
// 지금은 어디에서도 import되지 않는다 — MISSIONS(data.ts)가 여전히 유일한 원본이며,
// 이 파일은 그 위에 계층을 "파생"만 할 뿐 아무 화면·로직에도 연결되지 않는다.
import { Mission, MISSIONS } from './data';

/** 활동의 실제 내용(payload). 지금은 시뮬레이터 과제 1종뿐이지만,
 *  향후 퀴즈·서술·토론 등 새 유형이 추가될 때 이 union에 멤버를 더하는 식으로 확장한다. */
export type ContentActivity = { id: string; type: 'simulator'; title: string; mission: Mission };
// 향후 추가 예: | { id: string; type: 'quiz'; title: string; quiz: Quiz }
//              | { id: string; type: 'reflection'; title: string; prompt: string }
//              | { id: string; type: 'discussion'; title: string; discussion: Discussion }

/** 차시. 하나의 Lesson은 여러 ContentActivity를 담을 수 있다
 *  (예: 같은 차시 안에 simulator + quiz + reflection이 함께 들어가는 구조). */
export type Lesson = {
  id: string;
  title: string;
  activities: ContentActivity[];
};

export type Unit = {
  id: string;
  title: string;
  lessons: Lesson[];
};

export type Course = {
  id: string;
  title: string;
  units: Unit[];
};

/**
 * MISSIONS를 계층으로 파생한다. MISSIONS가 유일한 원본(source of truth)이며,
 * 이 함수는 그 내용을 복제·변경하지 않고 감싸기만 한다.
 *
 * 지금은 "미션 1개 = 차시 1개 = 활동 1개"인 평면 매핑이지만,
 * 이것이 최종 구조라고 가정하지 않는다 — 실제 수업에서는 한 Lesson 안에
 * simulator/quiz/reflection/discussion 등 여러 ContentActivity가 함께 들어갈 수 있다.
 * Lesson.activities가 배열인 것은 그래서다.
 */
function buildPicoCourse(missions: Mission[]): Course {
  return {
    id: 'course-pico',
    title: '라즈베리파이 피코',
    units: [
      {
        id: 'unit-pico-basic',
        title: '기초 실습',
        lessons: missions.map((m) => ({
          id: `lesson-${m.id}`,
          title: m.title,
          activities: [{ id: m.id, type: 'simulator', title: m.title, mission: m }],
        })),
      },
    ],
  };
}

export const PICO_COURSE: Course = buildPicoCourse(MISSIONS);
