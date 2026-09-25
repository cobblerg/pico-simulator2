-- Stage 0-D10-E: Teacher feedback MVP (vertical slice)
--
-- 0-D10-E design review에서 검토한 설계를 그대로 옮긴 것이다. teacher_feedback은
-- 학생 전체 학습 과정에 대한 교사의 텍스트 피드백을 담는다 — learning_event
-- (append-only, 시스템이 자동 기록)와 완전히 별개의 테이블이며, 이 migration은
-- learning_event를 전혀 건드리지 않는다.
--
-- 중요: 이 파일은 REVIEW용 migration SQL이다. 이번 단계에서는 Supabase
-- dashboard SQL editor 실행, Supabase CLI db push, 그 외 어떤 방식으로도
-- 실제(원격) 데이터베이스에 적용하지 않는다. 사용자가 검토 후 직접 적용한다.
--
-- student_id/class_id는 이번 MVP에서 의도적으로 중복 저장하지 않는다
-- (learning_event/teacher_feedback 설계 검토 당시와 달리, 이번 확정 결정은
-- enrollment_id 하나만을 학생/학급 관계의 기준으로 삼는다 — 조회 시
-- assertStudentEnrolledInClass()가 이미 classId+studentId로부터 enrollment_id를
-- 재확인해 주므로, teacher_feedback 테이블 자체에 studentId/classId를 또
-- 저장할 필요가 없다). enrollment가 가리키는 student_id/class_id는 필요하면
-- enrollment 테이블을 JOIN해 얻는다.
--
-- event_id는 nullable FK로 스키마에만 준비한다 — 이번 D10-E API는 browser로부터
-- eventId를 받지 않으므로, 이번 단계에서 생성되는 모든 feedback의 event_id는
-- 항상 NULL이다("학생 전체 학습 과정에 대한 일반 피드백"). 특정 이벤트에 대한
-- 피드백(event_id IS NOT NULL)은 이후 단계에서 UI/API가 추가될 때 schema
-- 변경 없이 바로 쓸 수 있도록 미리 열어만 둔다.
create table teacher_feedback (
  feedback_id   uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references teacher(teacher_id) on delete restrict,
  enrollment_id uuid not null references enrollment(enrollment_id) on delete restrict,
  event_id      uuid references learning_event(event_id) on delete set null,
  content       text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 예상 조회 패턴 두 가지:
--   1. GET 목록 조회: WHERE enrollment_id = ? ORDER BY created_at
--   2. PATCH ownership 확인: WHERE feedback_id = ? AND teacher_id = ? AND
--      enrollment_id = ? — feedback_id는 PK라 이미 index가 있고, teacher_id/
--      enrollment_id는 이 UPDATE가 최대 1행만 건드리는 매우 선택적인 조건이라
--      별도 index 없이도 feedback_id의 PK index만으로 이미 충분히 빠르다.
-- 따라서 1번 패턴을 위한 (enrollment_id, created_at) 복합 index 하나만 추가한다
-- — learning_event_enrollment_created_idx와 동일한 목적/형태.
create index teacher_feedback_enrollment_created_idx on teacher_feedback(enrollment_id, created_at);

-- updated_at은 별도 trigger/function 없이 애플리케이션의 UPDATE 문이 직접
-- now()로 갱신한다(teacher-feedback-data.ts의 updateOwnFeedback()) — 이
-- 프로젝트에 DB trigger가 하나도 없는 기존 관례를 유지하고, 이 테이블
-- 하나만을 위한 전역 trigger function을 새로 만들지 않는다.

-- ---------- RLS ----------
-- 기존 6개 테이블(school_class/student/enrollment/learning_event/teacher/
-- teacher_class)과 동일한 패턴: RLS를 켜고 anon/authenticated용 policy는
-- 하나도 만들지 않는다 — policy가 없는 RLS 테이블은 BYPASSRLS 권한이 없는
-- 역할에게 기본적으로 deny-all이다. browser는 이 테이블을 Supabase에서
-- 직접 SELECT/INSERT/UPDATE하지 않는다 — 모든 접근은 service-role을 쥔
-- Vercel API(GET/POST /api/teacher/classes/:classId/students/:studentId/
-- feedback, PATCH .../feedback/:feedbackId)를 경유한다.
alter table teacher_feedback enable row level security;

-- ---------- grants ----------
revoke all privileges on table teacher_feedback from anon, authenticated;

-- service_role에는 이번 단계(0-D10-E MVP)에서 실제로 필요한 최소 권한만
-- 부여한다:
--   - SELECT: GET 목록 조회.
--   - INSERT: POST 작성.
--   - UPDATE: PATCH 수정(자신이 쓴 feedback만, 애플리케이션 코드가 WHERE
--     절로 강제).
-- DELETE는 부여하지 않는다 — 이번 MVP는 피드백 삭제를 지원하지 않는다
-- (0-D10-E 확정 결정 — 실수 삭제 방지, 교육 기록 보존 우선 원칙).
-- 필요해지면 그때 별도 migration으로 최소 권한만 추가한다.
grant select, insert, update on table teacher_feedback to service_role;
