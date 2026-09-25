-- Stage 0-D10-B: Teacher-Class authorization boundary
--
-- 0-D10-B design review에서 검토한 설계를 그대로 옮긴 것이다. 승인된
-- teacher(teacher 테이블에 등록됨)라는 사실만으로 모든 학급 데이터를 볼 수
-- 있으면 안 된다 — "Google 인증 성공"과 "PicoSim 교사 승인"을 분리한
-- teacher.sql(20260925110000)의 원칙을, 이번에는 "교사 승인"과 "특정 학급
-- 접근 권한" 사이에 한 번 더 적용한 것이다.
--
-- 중요: 이 파일은 REVIEW용 migration SQL이다. 이번 단계에서는 Supabase
-- dashboard SQL editor 실행, Supabase CLI db push, 그 외 어떤 방식으로도
-- 실제(원격) 데이터베이스에 적용하지 않는다. 사용자가 검토 후 직접 적용한다.
--
-- 순수 매핑 테이블이므로 role 같은 세분화된 권한 컬럼은 넣지 않는다 —
-- "담당함/안 함"이라는 이진 판단만 필요한 현재 요구사항(교사가 자신의
-- 담당 학급 데이터만 조회)에서 그 이상을 미리 설계하는 것은 과도하다.
create table teacher_class (
  teacher_id uuid not null references teacher(teacher_id) on delete restrict,
  class_id   uuid not null references school_class(class_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id)
);

-- 복합 PK(teacher_id, class_id) 자체가 "같은 교사-학급 조합 중복 방지"를
-- 보장하며, 이 테이블이 항상 그 조합으로만 조회/삽입되므로 별도 index가
-- 필요 없다.
--
-- 두 FK 모두 ON DELETE RESTRICT를 쓴다 — school_class/student/enrollment/
-- learning_event/teacher 전부가 예외 없이 RESTRICT인 것과 동일한 이유다.
-- CASCADE를 쓰면 교사나 학급을 삭제할 때 "누가 이 학급을 담당했었는지"라는
-- 배정 기록이 조용히 함께 사라지는데, 이는 이 프로젝트가 지켜온 보존 우선
-- 원칙과 맞지 않는다. 교사/학급을 실제로 삭제해야 하면 먼저 이 테이블의
-- 관련 행을 명시적으로 지우도록 강제하는 편이 안전하다.

-- ---------- RLS ----------
-- 기존 5개 테이블(school_class/student/enrollment/learning_event/teacher)과
-- 동일한 패턴: RLS를 켜고 anon/authenticated용 policy는 하나도 만들지
-- 않는다 — policy가 없는 RLS 테이블은 BYPASSRLS 권한이 없는 역할에게
-- 기본적으로 deny-all이다. 교사가 Supabase Auth로 인증됐다는 사실
-- (authenticated role)이 이 테이블 직접 조회 권한으로 이어지지 않는다 —
-- 모든 접근은 여전히 service-role을 쥔 Vercel API(GET /api/teacher/classes
-- 등)를 경유한다.
alter table teacher_class enable row level security;

-- ---------- grants ----------
revoke all privileges on table teacher_class from anon, authenticated;

-- service_role에는 이번 단계에서 실제로 필요한 최소 권한만 부여한다:
--   - SELECT: assertTeacherOwnsClass()/listTeacherClasses()가 조회한다.
--   - INSERT: 관리자가 Supabase SQL Editor에서 교사를 학급에 수동으로
--     배정할 때 필요하다(teacher.sql의 bootstrap과 동일한 이유) — 어떤
--     애플리케이션 API도 이 테이블에 자동으로 쓰지 않는다(0-D10-B 정책 5).
-- UPDATE/DELETE는 이번 단계 어떤 코드 경로도 필요로 하지 않으므로
-- 부여하지 않는다("담당 학급 해제"가 실제로 필요해지면 그때 별도
-- migration으로 최소 권한만 추가한다 — 0-D10-B design review §10 "결정
-- 필요 1"에서 이미 보류하기로 한 항목).
grant select, insert on table teacher_class to service_role;
