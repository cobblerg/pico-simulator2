// 교사 학급 생성 (Stage D11-C2)
//
// D11-C0 Product Contract §D 권장안(C: 자동 생성 + 향후 재생성 가능)을
// 그대로 구현한다 — 교사가 classCode를 직접 입력하지 않는다.
//
// 이 파일은 teacher-authorization.ts/teacher-student-data.ts와 동일한
// "SupabaseClient를 직접 인자로 받는" 스타일을 따른다 — src/ui/student-data.ts의
// StudentDataSource 같은 별도 interface 계층을 새로 만들지 않는다(교사 쪽
// 기존 파일 어디에도 그런 인터페이스가 없다 — 학생 쪽에서만 쓰는 패턴이다).
// handler는 이 파일이 내보내는 함수만 부르고 Supabase query detail을 직접
// 알지 않는다.
//
// school_class 테이블의 실제 NOT NULL 컬럼은 school_year/grade/class_number/
// class_code뿐이다(migration 20260925090000, src/ui/student-domain.ts의
// SchoolClass 타입) — "name" 컬럼은 스키마에 존재하지 않으므로, 이 단계의
// 입력 계약은 D11-C0 §5의 "name"이 아니라 실제 schema가 요구하는 세 필드
// (schoolYear/grade/classNumber)를 사용한다(D11-C0 §5 자체가 "다른 필수
// school_class 필드가 실제 존재하면 source of truth를 따른다"고 명시).
import { SupabaseClient } from '@supabase/supabase-js';
import { randomInt } from 'crypto';
import { SchoolClass } from '../ui/student-domain';

// ---------- classCode 생성 ----------
//
// 혼동되는 문자(0/O, 1/I)를 제외한 대문자+숫자 32자 알파벳. 6자리 조합은
// 32^6(약 10억)개로 Pilot 규모의 충돌 확률은 무시할 수준이지만, §4 요구사항에
// 따라 충돌은 "예외가 아니라 정상적으로 예상 가능한 상황"으로 다룬다(아래
// createTeacherClassWithGeneratedCode의 retry 루프 참고).
export const CLASS_CODE_LENGTH = 6;
export const CLASS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// 테스트에서 결정론적 시퀀스를 주입할 수 있도록 random source를 seam으로
// 분리한다 — production 기본값은 Node crypto.randomInt(모듈로 편향 없는
// uniform 정수, student-session.ts와 동일하게 Node 내장 crypto만 사용).
export type RandomIntFn = (maxExclusive: number) => number;

function defaultRandomInt(maxExclusive: number): number {
  return randomInt(maxExclusive);
}

export function generateClassCode(randomIntFn: RandomIntFn = defaultRandomInt): string {
  let code = '';
  for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
    code += CLASS_CODE_ALPHABET[randomIntFn(CLASS_CODE_ALPHABET.length)];
  }
  return code;
}

// ---------- data access ----------

type SchoolClassRow = { class_id: string; school_year: string; grade: number; class_number: number; class_code: string };

function toSchoolClass(row: SchoolClassRow): SchoolClass {
  return { classId: row.class_id, schoolYear: row.school_year, grade: row.grade, classNumber: row.class_number, classCode: row.class_code };
}

// Postgres unique_violation error code — school_class에는 class_code 하나만
// UNIQUE 제약이 있으므로(migration 20260925090000), 이 테이블에 대한 insert에서
// 이 코드가 나오면 항상 class_code 충돌이다. 다른 DB 에러(연결 실패, 권한
// 오류 등)는 이 코드를 갖지 않으므로 "모든 DB 에러를 충돌로 취급"하지 않는다
// (§4 요구사항).
const UNIQUE_VIOLATION_CODE = '23505';

export type InsertSchoolClassResult =
  | { status: 'ok'; schoolClass: SchoolClass }
  | { status: 'code-collision' }
  | { status: 'error'; error: unknown };

export async function insertSchoolClassWithCode(
  client: SupabaseClient,
  input: { schoolYear: string; grade: number; classNumber: number; classCode: string }
): Promise<InsertSchoolClassResult> {
  const { data, error } = await client
    .from('school_class')
    .insert({ school_year: input.schoolYear, grade: input.grade, class_number: input.classNumber, class_code: input.classCode })
    .select('class_id, school_year, grade, class_number, class_code')
    .single();

  if (error) {
    if ((error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE) {
      return { status: 'code-collision' };
    }
    return { status: 'error', error };
  }

  return { status: 'ok', schoolClass: toSchoolClass(data as SchoolClassRow) };
}

export type LinkResult = { status: 'ok' } | { status: 'error'; error: unknown };

export async function linkTeacherToClass(client: SupabaseClient, teacherId: string, classId: string): Promise<LinkResult> {
  const { error } = await client.from('teacher_class').insert({ teacher_id: teacherId, class_id: classId });
  if (error) return { status: 'error', error };
  return { status: 'ok' };
}

export async function deleteSchoolClass(client: SupabaseClient, classId: string): Promise<LinkResult> {
  const { error } = await client.from('school_class').delete().eq('class_id', classId);
  if (error) return { status: 'error', error };
  return { status: 'ok' };
}

// 보상 삭제 자체가 실패했을 때만 남기는 operational log — D11-C0 §8 요구사항
// ("원래 오류를 숨기지 말 것", "내부 DB detail은 노출하지 말 것") 그대로.
// ai-learning-analysis.ts의 logAIProviderFailure()와 동일한 스타일(태그가 붙은
// console.error, 값 자체가 아니라 식별자만 기록)을 재사용한다 — 이 프로젝트에
// 별도 로깅 라이브러리가 없으므로 새로 도입하지 않는다.
export function logClassCreationCompensationFailure(context: { classId: string }): void {
  console.error('[teacher-class-creation] compensating delete failed after ownership link failure', context);
}

// ---------- orchestration ----------

export const MAX_CLASS_CODE_ATTEMPTS = 5;

export type CreateTeacherClassInput = { schoolYear: string; grade: number; classNumber: number };

export type CreateTeacherClassResult =
  | { status: 'ok'; schoolClass: SchoolClass }
  | { status: 'code-exhausted' }
  | { status: 'insert-failed' }
  | { status: 'ownership-failed' };

// 흐름(D11-C0 §D/§8 그대로): school_class insert(충돌이면 새 code로 재시도,
// 최대 MAX_CLASS_CODE_ATTEMPTS회) → 성공하면 teacher_class insert → 그것도
// 실패하면 방금 만든 school_class를 보상 삭제 → 항상 controlled result만
// 반환한다(원본 Supabase error는 이 함수 밖으로 나가지 않는다 — 호출부인
// handler가 client에 내부 DB detail을 노출하지 않도록).
export async function createTeacherClassWithGeneratedCode(
  client: SupabaseClient,
  teacherId: string,
  input: CreateTeacherClassInput,
  options?: { maxAttempts?: number; generateCode?: () => string }
): Promise<CreateTeacherClassResult> {
  const maxAttempts = options?.maxAttempts ?? MAX_CLASS_CODE_ATTEMPTS;
  const generateCode = options?.generateCode ?? (() => generateClassCode());

  let created: SchoolClass | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await insertSchoolClassWithCode(client, { ...input, classCode: generateCode() });
    if (result.status === 'ok') {
      created = result.schoolClass;
      break;
    }
    if (result.status === 'code-collision') {
      continue; // 무한 루프 방지: for 루프 자체가 maxAttempts로 상한을 둔다.
    }
    // collision이 아닌 DB 에러는 재시도하지 않는다(§4 요구사항).
    return { status: 'insert-failed' };
  }

  if (!created) {
    return { status: 'code-exhausted' };
  }

  const link = await linkTeacherToClass(client, teacherId, created.classId);
  if (link.status === 'ok') {
    return { status: 'ok', schoolClass: created };
  }

  const compensation = await deleteSchoolClass(client, created.classId);
  if (compensation.status !== 'ok') {
    logClassCreationCompensationFailure({ classId: created.classId });
  }
  return { status: 'ownership-failed' };
}
