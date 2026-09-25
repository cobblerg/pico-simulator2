// Server-only Supabase client (Stage 0-D7-A)
//
// 이 모듈은 서버 실행 환경(Vercel Serverless Function 등, 0-D7-B에서 추가)에서만
// import되어야 한다. SUPABASE_SECRET_KEY는 RLS를 우회하는 서버 전용 키이므로
// 브라우저 번들에 절대 포함되면 안 된다.
//
// build.mjs는 src/ui/app.ts와 src/engine/worker.ts만 esbuild로 번들하며, 이
// 파일을 define 목록에도, entryPoints에도 넣지 않는다 — 즉 이 모듈을 browser
// 쪽 코드(src/ui/*, src/engine/*)가 import하지 않는 한, 브라우저 산출물
// (dist/index.html)에 포함될 경로 자체가 없다. src/ui/* 파일은 이 모듈을
// import하지 않는다(0-D7-A 범위).
//
// createClient() 하나만 감싼다 — Repository class, DI 컨테이너, 범용 DB
// 추상화는 만들지 않는다. secret key는 항상 process.env에서만 읽으며, 함수
// 인자로 브라우저에서 전달받는 구조는 만들지 않는다.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createServerSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 설정되어 있지 않습니다 (server-only).');
  }

  return createClient(url, secretKey, {
    auth: { persistSession: false },
  });
}
