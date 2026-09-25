-- Stage 0-D9-B: learning_event persistence
--
-- docs/PRD.md 7장(학습 기록)의 Event 개념을 실제 코드(src/ui/app.ts의
-- logEvent 호출 28종, 0-D9 architecture review에서 조사)와 0-D9-A1에서 만든
-- student_session 신뢰 경계에 맞춰 옮긴 것이다.
--
-- 중요: 이 파일은 REVIEW용 migration SQL이다. 이번 단계에서는 Supabase
-- dashboard SQL editor 실행, Supabase CLI db push, 그 외 어떤 방식으로도
-- 실제(원격) 데이터베이스에 적용하지 않는다. 사용자가 검토 후 직접 적용한다.
--
-- enrollment_id/student_id/class_id 세 컬럼을 모두 저장하는 것은
-- school_class/student/enrollment의 기존 스냅샷 반정규화 패턴(20260925090000
-- migration)과 동일한 이유다 — enrollment_id로 정밀 참조하고, class_id는
-- 교사 대시보드가 학급별로 조회할 때 매번 enrollment와 JOIN하지 않아도 되게
-- 하기 위함이다. 세 값의 일관성(student_id/class_id가 실제로 그
-- enrollment_id에 속하는지)은 DB 제약이 아니라 애플리케이션(server/
-- learning-event-handler.ts)이 INSERT 직전에 enrollment_id로 DB를 다시
-- 조회해 재확인하는 방식으로 보장한다 — FK만으로는 "enrollment.student_id
-- === event.student_id"까지 강제할 수 없기 때문이다.
--
-- activity_id는 현재 m1~m6 문자열을 그대로 담는 text 컬럼이며 FK가 없다 —
-- Activity가 아직 DB 테이블로 존재하지 않기 때문이다(0-D7 review, 0-D9
-- review에서 이미 이 결론을 냄). Activity가 DB 테이블로 승격되는 시점에
-- FK를 추가하는 것이 자연스럽다.
create table learning_event (
  event_id      uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollment(enrollment_id) on delete restrict,
  student_id    uuid not null references student(student_id) on delete restrict,
  class_id      uuid not null references school_class(class_id) on delete restrict,
  activity_id   text not null,
  event_type    text not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- 향후 교사 timeline 조회 패턴(enrollment별 시간순, class별 시간순,
-- class+activity 조합 필터)을 고려한 index.
create index learning_event_enrollment_created_idx on learning_event(enrollment_id, created_at);
create index learning_event_class_created_idx on learning_event(class_id, created_at);
create index learning_event_class_activity_created_idx on learning_event(class_id, activity_id, created_at);

-- ---------- RLS ----------
-- school_class/student/enrollment와 동일한 패턴: RLS를 켜고 anon/
-- authenticated용 policy는 하나도 만들지 않는다 — policy가 없는 RLS
-- 테이블은 BYPASSRLS 권한이 없는 역할에게 기본적으로 deny-all이다.
alter table learning_event enable row level security;

-- ---------- grants ----------
-- anon/authenticated의 기본 privilege를 명시적으로 되돌린다(0-D7-A와 동일한
-- 이중 방어 — grant 레벨 + RLS 레벨).
revoke all privileges on table learning_event from anon, authenticated;

-- service_role에는 SELECT/INSERT만 부여한다 — school_class/student/
-- enrollment 때와 달리 UPDATE/DELETE는 의도적으로 부여하지 않는다.
-- learning_event는 append-only로 설계됐고(교사 피드백 근거가 되는 학습
-- 기록의 신뢰성을 위해, PRD 12.14 append-only 원칙과 동일), 일상적인
-- Event API 흐름에는 UPDATE/DELETE가 전혀 필요 없다. 나중에 정말
-- 필요해지면(예: 학년도 종료 후 일괄 파기, PRD 12.13-E 미결정 정책) 그때
-- 별도 migration으로 최소 권한만 추가하는 편이, 처음부터 다 열어두고 앱이
-- 안 쓰길 바라는 것보다 안전하다.
grant select, insert on table learning_event to service_role;
