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
