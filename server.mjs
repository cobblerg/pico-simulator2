// Node.js 내장 모듈(외부 설치 없이 바로 쓸 수 있는 기본 부품) 불러오기
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 현재 파일의 디렉터리 경로 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 정적 파일(웹 페이지 및 리소스)이 위치한 폴더 지정
const STATIC_DIR = path.join(__dirname, 'dist');
const PORT = 3000;

// 파일 확장자별 MIME 타입(웹 브라우저가 파일 종류를 인식하도록 돕는 정보)
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.uf2': 'application/octet-stream',
};

// HTTP 서버(웹 브라우저 요청을 받아 처리하는 프로그램) 생성
const server = http.createServer((req, res) => {
  // 요청받은 URL 정리
  let reqPath = req.url ? req.url.split('?')[0] : '/';
  if (reqPath === '/') {
    reqPath = '/index.html';
  }

  // 실제 파일 시스템 경로로 변환
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(STATIC_DIR, safePath);

  // 파일 확장자 확인
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // 파일 읽기 및 응답 전송
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // 파일을 찾을 수 없는 경우 (404 Not Found)
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 페이지를 찾을 수 없습니다.');
      } else {
        // 서버 내부 오류 (500 Internal Server Error)
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`서버 오류가 발생했습니다: ${err.code}`);
      }
      return;
    }

    // 성공적으로 파일을 읽었을 때 브라우저로 전송 (200 OK)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  });
});

// 서버 실행 및 포트 대기
server.listen(PORT, () => {
  console.log(`\n=========================================`);
  console.log(`🚀 피코 시뮬레이터 서버가 실행되었습니다!`);
  console.log(`👉 접속 주소: http://localhost:${PORT}`);
  console.log(`=========================================\n`);
});
