-- Stage 0-D7-A: Student/Class/Enrollment persistence foundation
--
-- docs/PRD.md 12장(Student/Enrollment 분리 모델)과 src/ui/student-domain.ts의
-- SchoolClass/Student/Enrollment 타입을 PostgreSQL로 옮긴 것이다.
--
-- 중요: 이 파일은 REVIEW용 migration SQL이다. 이번 단계에서는 Supabase
-- dashboard SQL editor 실행, Supabase CLI db push, 그 외 어떤 방식으로도
-- 실제(원격) 데이터베이스에 적용하지 않는다. 사용자가 검토 후 직접 적용한다.
--
-- 이 migration은 anon/authenticated에 대한 RLS policy를 만들지 않는다(의도적
-- deny-by-default). 학생 입장 흐름은 secret key를 쥔 서버(0-D7-B의 Vercel
-- Function)에서만 이 테이블들에 접근한다.
--
-- 권한은 서로 다른 두 계층으로 이루어진다 — 이 둘을 혼동하지 않는다:
--   1. RLS policy: row 단위 필터. service_role은 BYPASSRLS 속성 덕분에 이
--      계층을 건너뛴다.
--   2. table privileges(GRANT/REVOKE): SELECT/INSERT/UPDATE/DELETE 같은
--      명령 자체를 실행할 수 있는지 여부. BYPASSRLS는 이 계층과 무관하다 —
--      service_role이라도 테이블에 대한 privilege가 없으면 permission
--      denied로 실패한다.
-- 따라서 anon/authenticated의 privilege는 명시적으로 revoke하고,
-- service_role의 privilege는 플랫폼 기본값에 암묵적으로 기대지 않고
-- 이 migration에서 명시적으로 grant한다(아래 grants 절 참고) — migration
-- 파일만 읽어도 최종 권한 의도가 전부 드러나게 하기 위함이다.

create table school_class (
  class_id     uuid primary key default gen_random_uuid(),
  school_year  text not null,
  grade        smallint not null,
  class_number smallint not null,
  class_code   text not null unique
);

create table student (
  student_id uuid primary key default gen_random_uuid(),
  name       text not null
);

create table enrollment (
  enrollment_id uuid primary key default gen_random_uuid(),
  student_id    uuid not null references student(student_id) on delete restrict,
  class_id      uuid not null references school_class(class_id) on delete restrict,
  student_no    text not null,
  enrolled_at   timestamptz not null default now(),
  unique (class_id, student_no)
);

-- Enrollment.studentId는 UNIQUE(class_id, student_no)에 포함되지 않으므로
-- 별도 index를 둔다 — 같은 학생의 여러 학년도 Enrollment 조회(PRD 12.11)에
-- 필요.
create index enrollment_student_id_idx on enrollment(student_id);

-- ---------- RLS ----------
-- 세 테이블 모두 RLS를 켜고, anon/authenticated용 policy는 하나도 만들지
-- 않는다. Postgres에서 RLS가 켜진 테이블은 (BYPASSRLS 권한이 없는 역할에게는)
-- 허용 policy가 없으면 기본적으로 모든 행이 보이지 않는다 — 즉 "policy가
-- 없다"는 것 자체가 이미 deny-all이다.
alter table school_class enable row level security;
alter table student      enable row level security;
alter table enrollment   enable row level security;

-- ---------- grants ----------
-- "policy가 없으니 안전하다"에만 기대지 않고, 테이블 단위 권한도 명시적으로
-- 제거해 deny-by-default 의도를 이중으로(grant 레벨 + RLS 레벨) 표현한다.
-- Supabase 프로젝트는 기본적으로 public 스키마의 테이블에 anon/authenticated
-- 역할의 CRUD 권한을 자동으로 부여하므로(그 위에서 RLS policy로 세부 제어하는
-- 것이 Supabase의 일반적인 워크플로), 이 프로젝트처럼 "학생 browser가 이
-- 테이블들을 절대 직접 호출하지 않는다"는 설계에서는 그 기본 grant를
-- 명시적으로 되돌리는 것이 안전하다.
revoke all privileges on table school_class from anon, authenticated;
revoke all privileges on table student      from anon, authenticated;
revoke all privileges on table enrollment   from anon, authenticated;

-- service_role(secret key로 인증하는 서버 클라이언트가 쓰는 역할)에는
-- BYPASSRLS와 별개로 table privilege를 명시적으로 grant한다 — "BYPASSRLS이니
-- 당연히 읽고 쓸 수 있다"는 가정에 기대지 않는다. 이 세 테이블은 향후
-- server-side에서 조회(findSchoolClassByCode/findEnrollment/findStudent)뿐
-- 아니라 교사 roster 등록(향후 Student/Enrollment 생성)에도 쓰일 예정이므로
-- SELECT/INSERT/UPDATE/DELETE를 함께 grant한다. schema 단위(USAGE ON SCHEMA
-- public 등) 권한은 이 migration에서 확장하지 않는다 — 이미 존재한다고
-- 가정되는 테이블 소유/스키마 권한 위에 테이블 단위 privilege만 추가한다.
grant select, insert, update, delete on table school_class to service_role;
grant select, insert, update, delete on table student      to service_role;
grant select, insert, update, delete on table enrollment   to service_role;
