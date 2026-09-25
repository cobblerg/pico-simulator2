-- Stage 0-D10-A: Teacher authentication foundation
--
-- 0-D10 architecture review(§3/§6)와 0-D10-A pre-implementation audit(§3/§7)에서
-- 검토한 설계를 그대로 옮긴 것이다.
--
-- 중요: 이 파일은 REVIEW용 migration SQL이다. 이번 단계에서는 Supabase
-- dashboard SQL editor 실행, Supabase CLI db push, 그 외 어떤 방식으로도
-- 실제(원격) 데이터베이스에 적용하지 않는다. 사용자가 검토 후 직접 적용한다.
--
-- teacher_id를 auth.users.id와 동일시하지 않고 별도 PK + UNIQUE FK로 분리한다
-- — student가 이미 "내부 PK(studentId) vs 소속 정보(Enrollment)"를 분리하는
-- 철학(school_class/student/enrollment)과 설계 일관성을 맞추고, Google/이메일
-- 등 Supabase Auth provider 종류가 무엇이든(또는 나중에 바뀌든) 이 테이블
-- schema가 전혀 영향받지 않게 한다.
--
-- Google 로그인 성공만으로 teacher row가 자동 생성되지 않는다(0-D10-A 정책
-- 3/6) — 이 migration도, 이후 어떤 애플리케이션 코드도 이 테이블에 자동
-- INSERT하는 경로를 만들지 않는다. 첫 승인 교사는 관리자가 Supabase SQL
-- Editor에서 수동으로 INSERT한다(0-D10-A audit §8, bootstrap 문제).
create table teacher (
  teacher_id   uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- auth_user_id는 이미 UNIQUE 제약으로 index를 갖는다(teacher.auth_user_id로
-- 조회하는 것이 이 테이블의 유일한 조회 패턴이므로 추가 index 불필요).

-- ---------- RLS ----------
-- 기존 4개 테이블(school_class/student/enrollment/learning_event)과 동일한
-- 패턴: RLS를 켜고 anon/authenticated용 policy는 하나도 만들지 않는다 —
-- policy가 없는 RLS 테이블은 BYPASSRLS 권한이 없는 역할에게 기본적으로
-- deny-all이다. browser는 이 테이블을 Supabase에서 직접 SELECT하지
-- 않는다(0-D10-A 정책 7) — 오직 Vercel API(service-role client)만 접근한다.
alter table teacher enable row level security;

-- ---------- grants ----------
-- anon/authenticated의 기본 privilege를 명시적으로 되돌린다(기존 테이블들과
-- 동일한 이중 방어 — grant 레벨 + RLS 레벨).
revoke all privileges on table teacher from anon, authenticated;

-- service_role에는 이번 단계(0-D10-A)에서 실제로 필요한 최소 권한만 부여한다:
--   - SELECT: GET /api/teacher/me가 auth_user_id로 승인 teacher를 조회한다.
--   - INSERT: 관리자의 수동 bootstrap INSERT(0-D10-A audit §8)에 필요하다 —
--     이 INSERT는 애플리케이션 코드가 아니라 Supabase SQL Editor에서
--     관리자가 직접 실행하지만, service_role 권한 자체가 없으면 그마저도
--     불가능하므로 grant는 필요하다.
-- UPDATE/DELETE는 0-D10-A의 어떤 코드 경로에서도 필요하지 않으므로(교사
-- 프로필 수정, 교사 삭제 기능은 이번 단계 범위 밖) 부여하지 않는다 — 나중에
-- 실제로 필요해지면 그때 별도 migration으로 최소 권한만 추가한다.
grant select, insert on table teacher to service_role;
