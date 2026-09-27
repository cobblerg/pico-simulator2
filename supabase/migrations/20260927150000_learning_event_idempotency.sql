-- Stage D12-1B: learning_event 전송 idempotency 경계
--
-- D12-1A(설계 게이트)에서 확정한 계약을 그대로 옮긴다: 학생 브라우저가
-- 이벤트를 큐에 넣기 전 미리 생성하는 opaque delivery-idempotency key를
-- 저장할 컬럼과, 그 키를 근거로 "같은 논리적 이벤트의 재전송"을 DB
-- 레벨에서 판별할 수 있게 하는 partial unique index를 추가한다.
--
-- 중요: 이 파일은 REVIEW용 migration SQL이다. 이번 단계에서는 Supabase
-- dashboard SQL editor 실행, Supabase CLI db push, 그 외 어떤 방식으로도
-- 실제(원격) 데이터베이스에 적용하지 않는다. 사용자가 검토 후 직접 적용한다.
--
-- client_event_id는 identity가 아니다(D12-1A §G/§H) — 어느 학생/학급에
-- 귀속될지는 여전히 student_session 재확인(verifyEnrollmentConsistency)만
-- 결정한다. 이 컬럼은 오직 "같은 사건을 두 번 저장하지 않기 위한" 용도다.
--
-- nullable로 추가하는 이유: 기존(구버전 client가 만든) learning_event row는
-- client_event_id 개념 자체가 없던 시절의 기록이라 채울 값이 없다 —
-- 임의로 값을 채워 넣는 backfill은 append-only 기록을 사후에 재구성하는
-- 것이 되어 이 프로젝트의 핵심 원칙(학습 기록의 신뢰성)과 배치된다.
-- 그래서 이 migration은 기존 row를 전혀 건드리지 않는다: UPDATE 없음,
-- DELETE 없음, backfill 없음, NOT NULL 제약 없음.
alter table learning_event add column client_event_id uuid;

-- enrollment_id로 스코프된 partial unique index. client_event_id가 NULL인
-- row(기존 전체 row + client_event_id를 아직 안 보내는 구버전 client의
-- 신규 row)는 이 제약의 대상이 아니다 — Postgres UNIQUE 제약은 원래
-- 여러 NULL을 허용하지만, WHERE 절로 "idempotency는 client_event_id가
-- 실제로 있는 row에만 적용된다"는 의도를 명시적으로 드러낸다.
--
-- 왜 global UNIQUE(client_event_id)가 아니라 enrollment_id를 포함하는가
-- (D12-1A §H): client_event_id는 오직 "이 enrollment 안에서" 중복
-- 판별용이며, 서로 다른 두 학생이(사실상 불가능에 가까운 확률로) 우연히
-- 같은 UUID를 생성해도 서로 다른 namespace라 충돌하지 않아야 하기
-- 때문이다. enrollment_id는 client가 절대 지정할 수 없는(session에서만
-- 파생되는) 값이므로, 이 scope 선택 자체가 추가 보안 경계이기도 하다.
create unique index learning_event_enrollment_client_event_id_idx
  on learning_event (enrollment_id, client_event_id)
  where client_event_id is not null;

-- ---------- grants ----------
-- 새 grant가 필요하지 않다. 이 idempotency 경계는 "INSERT 시도 → unique
-- violation(23505) 발생 시 SELECT로 기존 row 조회" 패턴으로 구현하며(D12-1B
-- 구현 결정, ON CONFLICT DO UPDATE류의 upsert는 쓰지 않는다), 이는
-- learning_event에 이미 부여된 select/insert 권한만으로 충분하다 —
-- UPDATE/DELETE grant를 추가하지 않는다(append-only 원칙 유지,
-- 20260925100000_learning_event.sql의 기존 결정 그대로).
