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
import { RosterEntryInput, RosterEntryValidation, normalizeRosterEntry, validateRosterEntry } from '../ui/student-domain';
import { UNIQUE_VIOLATION_CODE } from './teacher-class-creation';

// ---------- data access ----------

type StudentRow = { student_id: string; name: string };
type EnrollmentRow = { enrollment_id: string; student_id: string; student_no: string };

export type InsertStudentsResult = { status: 'ok'; rows: StudentRow[] } | { status: 'error'; error: unknown };

export async function insertStudentsBatch(client: SupabaseClient, students: { name: string }[]): Promise<InsertStudentsResult> {
  const { data, error } = await client
    .from('student')
    .insert(students.map((s) => ({ name: s.name })))
    .select('student_id, name');

  if (error) return { status: 'error', error };
  return { status: 'ok', rows: data as StudentRow[] };
}

export type InsertEnrollmentsResult =
  | { status: 'ok'; rows: EnrollmentRow[] }
  | { status: 'collision' }
  | { status: 'error'; error: unknown };

// enrollment의 UNIQUE(class_id, student_no) 위반만 'collision'으로 인식한다
// (§4/§13 요구사항과 동일한 원칙 — 다른 DB 에러를 충돌로 취급하지 않는다).
export async function insertEnrollmentsBatch(
  client: SupabaseClient,
  classId: string,
  entries: { studentId: string; studentNo: string }[]
): Promise<InsertEnrollmentsResult> {
  const { data, error } = await client
    .from('enrollment')
    .insert(entries.map((e) => ({ student_id: e.studentId, class_id: classId, student_no: e.studentNo })))
    .select('enrollment_id, student_id, student_no');

  if (error) {
    if ((error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE) {
      return { status: 'collision' };
    }
    return { status: 'error', error };
  }

  return { status: 'ok', rows: data as EnrollmentRow[] };
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

// 흐름(D11-C0 §E/§K, D11-C3 §7~§13 그대로):
//   1. entries가 비어 있으면 즉시 empty-entries.
//   2. normalizeRosterEntry()로 각 항목 정규화.
//   3. 이 학급에 이미 존재하는 studentNo를 한 번에 조회(findExistingStudentNos).
//   4. 각 항목을 validateRosterEntry()로 판정 — batch 내부에서 먼저 나온
//      studentNo도 "taken"으로 취급해 batch 내부 중복을 잡는다.
//   5. 하나라도 invalid면 전체를 write하지 않고 validation-failed 반환
//      (all-or-nothing, D11-C0/§11 확정 계약).
//   6. student batch insert(§12 원칙: 단일 multi-row INSERT는 그 자체로
//      원자적) → 실패 시 insert-failed.
//   7. enrollment batch insert → 성공하면 ok. UNIQUE(class_id, student_no)
//      race condition(§13, 사전 조회 이후에도 동시 요청이 끼어든 경우)이면
//      collision으로 인식하고, 그 외 에러와 마찬가지로 student batch를
//      보상 삭제한 뒤 controlled 결과만 반환한다.
//
// 참고(알려진 가정): student/enrollment 각각의 multi-row INSERT ...
// RETURNING 결과 배열이 입력 순서와 같은 순서로 반환된다고 가정하고
// 위치(index)로 매칭한다 — 이 테이블들에는 트리거/룰이 없으므로(migration
// 확인) 실제 Postgres 구현에서 이 가정이 깨질 이유가 없지만, SQL 표준이
// 이 순서를 공식적으로 보장하지는 않는다. 반환된 행 수가 입력 수와 다르면
// (그 자체로 상관관계가 깨졌다는 신호이므로) insert-failed로 처리해 최소한의
// 방어를 둔다.
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

  const studentInsert = await insertStudentsBatch(
    client,
    validated.map((e) => ({ name: e.name }))
  );
  if (studentInsert.status !== 'ok' || studentInsert.rows.length !== validated.length) {
    return { status: 'insert-failed' };
  }

  const enrollmentInsert = await insertEnrollmentsBatch(
    client,
    classId,
    validated.map((e, i) => ({ studentId: studentInsert.rows[i].student_id, studentNo: e.studentNo }))
  );

  if (enrollmentInsert.status === 'ok' && enrollmentInsert.rows.length === validated.length) {
    const entries: RegisterRosterCreatedEntry[] = enrollmentInsert.rows.map((row, i) => ({
      studentId: row.student_id,
      enrollmentId: row.enrollment_id,
      studentNo: row.student_no,
      name: validated[i].name,
    }));
    return { status: 'ok', entries };
  }

  // 여기 도달했다는 것은 enrollment batch가 실패했거나(collision/error) 또는
  // 방어적 개수 불일치가 발생했다는 뜻이다 — 두 경우 모두 방금 만든 student
  // batch를 orphan으로 남기지 않도록 보상 삭제한다.
  const compensation = await deleteStudentsBatch(
    client,
    studentInsert.rows.map((r) => r.student_id)
  );
  if (compensation.status !== 'ok') {
    logRosterCreationCompensationFailure({ studentIds: studentInsert.rows.map((r) => r.student_id) });
  }

  if (enrollmentInsert.status === 'collision') {
    return { status: 'duplicate-conflict' };
  }
  return { status: 'enrollment-failed' };
}
