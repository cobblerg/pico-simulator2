// 빌드: 가상 칩 Worker + 화면 + 펌웨어를 한 개의 index.html로 묶는다
import * as esbuild from 'esbuild';
import fs from 'fs';

const FW = 'micropython-v1.29.0-RPI_PICO.uf2';
const FW_VERSION = 'v1.29.0';

const worker = await esbuild.build({
  entryPoints: ['src/engine/worker.ts'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
});
const workerSrc = worker.outputFiles[0].text;
const uf2 = fs.readFileSync(FW).toString('base64');
const css = fs.readFileSync('src/ui/styles.css', 'utf8');
const tpl = fs.readFileSync('src/index.html', 'utf8');

async function app(standalone) {
  const r = await esbuild.build({
    entryPoints: ['src/ui/app.ts'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
    define: {
      __WORKER_SRC__: JSON.stringify(workerSrc),
      __UF2_B64__: JSON.stringify(uf2),
      __FW_VERSION__: JSON.stringify(FW_VERSION),
      __STANDALONE__: String(standalone),
    },
  });
  return r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

fs.mkdirSync('dist', { recursive: true });
const body = (js) => tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);

// 1) 아티팩트용 (문서 뼈대 없이 본문만)
fs.writeFileSync('dist/picosim-artifact.html', body(await app(false)));
// 2) 설치용 (GitHub Pages·Netlify에 그대로 올리는 index.html)
const full = body(await app(true));
fs.writeFileSync('dist/index.html', `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${full}\n</body>\n</html>\n`);
for (const f of ['dist/picosim-artifact.html', 'dist/index.html']) console.log(f, (fs.statSync(f).size / 1024).toFixed(0) + ' KB');

// 3) 교사 인증 진입점 (Stage 0-D10-A)
//
// 학생 시뮬레이터 번들(app.ts/worker.ts)과 완전히 분리된 별도 esbuild entry
// point다 — 위 app()이 쓰는 __WORKER_SRC__/__UF2_B64__/__STANDALONE__ define을
// 전혀 공유하지 않고, teacher-app.ts도 app.ts를 import하지 않는다. 이 블록이
// 실패해도(예: PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY 미설정) 학생용
// 산출물 두 개(dist/picosim-artifact.html, dist/index.html)는 이미 위에서
// 정상적으로 디스크에 쓰였으므로 손상되지 않는다.
//
// 다만 PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY가 없으면 이 스크립트
// 전체(`npm run build`)는 여기서 명확한 오류로 비정상 종료한다 — 조용히
// dist/teacher.html을 생략하고 넘어가지 않는다. src/server/supabase.ts의
// createServerSupabaseClient()/student-session.ts의 getSecret()이 필요한
// 환경변수 누락을 항상 명시적 오류로 다루는 것과 동일한 fail-closed 원칙이다.
// 이 값들은 Vercel에 아직 설정되지 않았을 수 있다 — 설정은 사용자가 직접
// 한다(0-D10-A 범위 밖).
const teacherSupabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const teacherSupabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
if (!teacherSupabaseUrl || !teacherSupabaseAnonKey) {
  throw new Error(
    'PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY 환경변수가 설정되어 있지 않습니다 (dist/teacher.html 빌드에 필요).'
  );
}
const teacherTpl = fs.readFileSync('src/teacher.html', 'utf8');
const teacherBuild = await esbuild.build({
  entryPoints: ['src/ui/teacher-app.ts'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
  define: {
    __TEACHER_SUPABASE_URL__: JSON.stringify(teacherSupabaseUrl),
    __TEACHER_SUPABASE_ANON_KEY__: JSON.stringify(teacherSupabaseAnonKey),
  },
});
const teacherJs = teacherBuild.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
fs.writeFileSync('dist/teacher.html', teacherTpl.replace('/*__TEACHER_JS__*/', () => teacherJs));
console.log('dist/teacher.html', (fs.statSync('dist/teacher.html').size / 1024).toFixed(0) + ' KB');
