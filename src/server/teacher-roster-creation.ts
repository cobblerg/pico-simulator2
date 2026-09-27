// 교사 학급 로스터(학생 명단) 등록 (Stage D11-C3)
//
// D11-C0 Product Contract §E/§K, D11-C2의 compensation 패턴을 그대로
// 따른다. teacher-class-creation.ts와 동일하게 SupabaseClient를 직접 받는
// 스타일이다 — src/ui/student-data.ts류의 별도 DataSource interface를
// 새로 만들지 않는다.
//
// raw pasted text("1 김민준\n2 이서연" 같은 presentation-format 문자열)는
// 이 파일이 다루지 않는다 — 그 파싱은 C4 UI(교사 브라우저)의 책임으로 남기고,
// 서버는 항상 structured entries(RegisterRosterEntry[])만 받는다(D11-C3 §2
// 확정 결정).
//
// 단건 등록도 bulk와 동일한 경로(entries 배열 길이 1)로 처리한다 — 두 개의
// 별도 오케스트레이션을 만들지 않는다(D11-C3 §14 권장안).
//
// normalizeRosterEntry()/validateRosterEntry()(student-domain.ts, Stage
// 0-D5-C2)는 이 단계 전까지 어디서도 호출되지 않던 dead code였으나 현재
// schema/타입과 여전히 정합함을 D11-C0 §B에서 확인했다 — 새 validation을
// 만들지 않고 그대로 재사용한다.
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { RosterEntryInput, RosterEntryValidation, normalizeRosterEntry, validateRosterEntry } from '../ui/student-domain';
import { UNIQUE_VIOLATION_CODE } from './teacher-class-creation';

// ---------- data access ----------
//
// D11-C6 §4/§5 mandatory review: 이전 구현은 multi-row INSERT ... RETURNING이
// 입력 순서와 같은 순서로 행을 반환한다고 가정하고, 그 배열 index로
// studentInsert.rows[i] ↔ validated[i]를 대응시켰다. Postgres가 실무적으로
// 이 순서를 지키는 경우가 대부분이지만, SQL 표준이나 Supabase client API
// 계약 어느 쪽도 이를 공식적으로 보장하지 않는다 — 순서가 어긋나면 학번
// A의 enrollment가 실제로는 학번 B의 student_id를 가리키는 identity
// mis-link가 조용히 발생할 수 있었다(교사가 눈치채기 전까지는 절대 드러나지
// 않는 종류의 결함).
//
// 수정: student_id/enrollment_id를 DB의 gen_random_uuid() 기본값에 맡기지
// 않고, 애플리케이션이 insert 직전에 crypto.randomUUID()로 직접 생성해
// INSERT 문에 명시적으로 넣는다. uuid 컬럼은 임의의 값을 받아들이므로
// 스키마 변경이 필요 없다. 이렇게 하면 어떤 studentNo/name이 어떤
// studentId/enrollmentId를 갖는지 애플리케이션이 처음부터 알고 있으므로,
// RETURNING 결과의 순서에 전혀 의존할 필요가 없어진다(응답 상관관계 자체가
// 구조적으로 사라짐 — "보장되지 않는 순서에 의존한다면 제거하는 것을
// 우선한다"는 §4/§5 원칙을 가장 작은 변경으로 만족).
//
// name/studentNo는 여전히 correlation key로 쓰지 않는다(동명이인 허용,
// studentNo도 class 밖에서는 global하지 않음 — §5 원칙 그대로 유지).
//
// 부수 효과: 이제 insert 성공 여부는 오직 error 유무로만 판단한다 — 단일
// multi-row INSERT 문은 Postgres에서 그 자체로 원자적이므로(공식 보장,
// RETURNING 순서와 달리 이것은 실제 계약이다), error가 없으면 N행 전부가
// 삽입됐다는 뜻이고, 반환된 행 수를 다시 세어 방어적으로 확인할 필요도
// 없어졌다(이전의 rows.length 방어 코드도 함께 제거한다).

export type InsertResult = { status: 'ok' } | { status: 'error'; error: unknown };

export async function insertStudentsBatch(client: SupabaseClient, students: { studentId: string; name: string }[]): Promise<InsertResult> {
  const { error } = await client.from('student').insert(students.map((s) => ({ student_id: s.studentId, name: s.name })));

  if (error) return { status: 'error', error };
  return { status: 'ok' };
}

export type InsertEnrollmentsResult = { status: 'ok' } | { status: 'collision' } | { status: 'error'; error: unknown };

// enrollment의 UNIQUE(class_id, student_no) 위반만 'collision'으로 인식한다
// (§4/§13 요구사항과 동일한 원칙 — 다른 DB 에러를 충돌로 취급하지 않는다).
export async function insertEnrollmentsBatch(
  client: SupabaseClient,
  classId: string,
  entries: { studentId: string; enrollmentId: string; studentNo: string }[]
): Promise<InsertEnrollmentsResult> {
  const { error } = await client
    .from('enrollment')
    .insert(entries.map((e) => ({ enrollment_id: e.enrollmentId, student_id: e.studentId, class_id: classId, student_no: e.studentNo })));

  if (error) {
    if ((error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE) {
      return { status: 'collision' };
    }
    return { status: 'error', error };
  }

  return { status: 'ok' };
}

export type DeleteStudentsResult = { status: 'ok' } | { status: 'error'; error: unknown };

// student 생성은 성공했지만 enrollment 생성이 실패(또는 race condition으로
// 충돌)했을 때 orphan student가 남지 않도록 보상 삭제한다 — 이 시점에는
// 해당 studentId를 참조하는 enrollment가 아직 없으므로(방금 실패했으므로)
// ON DELETE RESTRICT에 걸리지 않는다.
export async function deleteStudentsBatch(client: SupabaseClient, studentIds: string[]): Promise<DeleteStudentsResult> {
  const { error } = await client.from('student').delete().in('student_id', studentIds);
  if (error) return { status: 'error', error };
  return { status: 'ok' };
}

// 이미 그 학급에 등록된 studentNo 집합을 미리 조회한다 — DB UNIQUE 제약이
// 최종 방어선이라는 원칙(§8)은 유지하되, 사전 조회로 "친절한" validation
// 결과를 먼저 제공한다(같은 원칙을 이미 쓰는 validateRosterEntry의
// studentNoTaken 계약을 그대로 따른다).
export async function findExistingStudentNos(client: SupabaseClient, classId: string, studentNos: string[]): Promise<Set<string>> {
  if (studentNos.length === 0) return new Set();

  const { data, error } = await client.from('enrollment').select('student_no').eq('class_id', classId).in('student_no', studentNos);

  if (error) throw error;
  return new Set((data as { student_no: string }[]).map((row) => row.student_no));
}

// D11-C2의 logClassCreationCompensationFailure()와 동일한 스타일 — 태그가
// 붙은 console.error, 값 자체가 아니라 식별자만 기록한다.
export function logRosterCreationCompensationFailure(context: { studentIds: string[] }): void {
  console.error('[teacher-roster-creation] compensating delete failed after enrollment write failure', context);
}

// ---------- orchestration ----------

export type RegisterRosterEntry = RosterEntryInput; // { studentNo: string; name: string }

// validateRosterEntry()의 실패 사유 문자열을 그대로 재사용한다 — 새 오류
// 분류를 만들지 않는다.
export type RegisterRosterValidationError = {
  index: number;
  studentNo: string;
  reason: Exclude<RosterEntryValidation['status'], 'valid'>;
};

export type RegisterRosterCreatedEntry = { studentId: string; enrollmentId: string; studentNo: string; name: string };

export type RegisterRosterResult =
  | { status: 'ok'; entries: RegisterRosterCreatedEntry[] }
  | { status: 'empty-entries' }
  | { status: 'validation-failed'; errors: RegisterRosterValidationError[] }
  | { status: 'infra-error' }
  | { status: 'insert-failed' }
  | { status: 'duplicate-conflict' }
  | { status: 'enrollment-failed' };

// 흐름(D11-C0 §E/§K, D11-C3 §7~§13, D11-C6 §4/§5 RETURNING-order 제거 그대로):
//   1. entries가 비어 있으면 즉시 empty-entries.
//   2. normalizeRosterEntry()로 각 항목 정규화.
//   3. 이 학급에 이미 존재하는 studentNo를 한 번에 조회(findExistingStudentNos).
//   4. 각 항목을 validateRosterEntry()로 판정 — batch 내부에서 먼저 나온
//      studentNo도 "taken"으로 취급해 batch 내부 중복을 잡는다.
//   5. 하나라도 invalid면 전체를 write하지 않고 validation-failed 반환
//      (all-or-nothing, D11-C0/§11 확정 계약).
//   6. 통과한 각 항목에 studentId/enrollmentId를 미리 생성한다(randomUUID) —
//      이 값들이 곧 최종 응답이 되므로, 이후 어떤 DB 응답의 행 순서에도
//      의존하지 않는다.
//   7. student batch insert(§12 원칙: 단일 multi-row INSERT는 그 자체로
//      원자적, error 없으면 N행 전부 성공) → 실패 시 insert-failed.
//   8. enrollment batch insert → 성공하면 ok(미리 만든 값 그대로 응답).
//      UNIQUE(class_id, student_no) race condition(§13, 사전 조회 이후에도
//      동시 요청이 끼어든 경우)이면 collision으로 인식하고, 그 외 에러와
//      마찬가지로 student batch를 보상 삭제한 뒤 controlled 결과만
//      반환한다.
export async function registerRosterEntries(
  client: SupabaseClient,
  classId: string,
  rawEntries: RegisterRosterEntry[]
): Promise<RegisterRosterResult> {
  if (rawEntries.length === 0) {
    return { status: 'empty-entries' };
  }

  const normalized = rawEntries.map((entry) => normalizeRosterEntry(entry));

  let existing: Set<string>;
  try {
    existing = await findExistingStudentNos(
      client,
      classId,
      normalized.map((e) => e.studentNo)
    );
  } catch {
    return { status: 'infra-error' };
  }

  const seen = new Set<string>();
  const errors: RegisterRosterValidationError[] = [];
  const validated: RegisterRosterEntry[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const entry = normalized[i];
    const taken = existing.has(entry.studentNo) || seen.has(entry.studentNo);
    const result = validateRosterEntry(entry, { studentNoTaken: taken });

    if (result.status === 'valid') {
      seen.add(entry.studentNo);
      validated.push(entry);
    } else {
      errors.push({ index: i, studentNo: entry.studentNo, reason: result.status });
    }
  }

  if (errors.length > 0) {
    return { status: 'validation-failed', errors };
  }

  // studentId/enrollmentId를 여기서 확정한다 — 이후 두 insert의 응답 행
  // 순서와 완전히 무관하게, 이 배열(prepared)만이 최종 identity의 유일한
  // source of truth다.
  const prepared: RegisterRosterCreatedEntry[] = validated.map((e) => ({
    studentId: randomUUID(),
    enrollmentId: randomUUID(),
    studentNo: e.studentNo,
    name: e.name,
  }));

  const studentInsert = await insertStudentsBatch(
    client,
    prepared.map((p) => ({ studentId: p.studentId, name: p.name }))
  );
  if (studentInsert.status !== 'ok') {
    return { status: 'insert-failed' };
  }

  const enrollmentInsert = await insertEnrollmentsBatch(
    client,
    classId,
    prepared.map((p) => ({ studentId: p.studentId, enrollmentId: p.enrollmentId, studentNo: p.studentNo }))
  );

  if (enrollmentInsert.status === 'ok') {
    return { status: 'ok', entries: prepared };
  }

  // 여기 도달했다는 것은 enrollment batch가 실패했다는(collision/error) 뜻이다
  // — 방금 만든 student batch를 orphan으로 남기지 않도록 보상 삭제한다.
  // 삭제 대상은 이번 요청에서 우리가 직접 생성한 studentId(prepared)로만
  // 한정되므로 다른 요청/기존 row를 건드릴 방법이 없다.
  const compensation = await deleteStudentsBatch(
    client,
    prepared.map((p) => p.studentId)
  );
  if (compensation.status !== 'ok') {
    logRosterCreationCompensationFailure({ studentIds: prepared.map((p) => p.studentId) });
  }

  if (enrollmentInsert.status === 'collision') {
    return { status: 'duplicate-conflict' };
  }
  return { status: 'enrollment-failed' };
}
