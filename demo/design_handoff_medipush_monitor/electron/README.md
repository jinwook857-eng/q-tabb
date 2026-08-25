# Medi-Push Monitor — Electron 통합 가이드

UI는 `Medi-Push Monitor.dc.html`(원페이지)이며, 데모는 두 방식으로 아두이노와 연결됩니다.

## 방법 1 — Web Serial (권장, 코드 수정 불필요)
Electron(Chromium)은 Web Serial API를 지원합니다. UI의 "시리얼 연결" 버튼이 그대로 동작하며,
main 프로세스에서 포트 선택 권한만 처리하면 됩니다(아래 main.js에 포함).

## 방법 2 — node-serialport + IPC
main.js에서 `serialport`로 수신 후 IPC로 렌더러에 라인을 전달하는 골격도 main.js/preload.js에 주석으로 포함.

## 시리얼 프로토콜 (9600bps, 라인 단위)
- 연결 시: `MEDICINE BOX READY`
- 1회 누름: `[A,B,TAKE]` — A=누적 복용량, B=남은 알약 (예: [1,9,TAKE], [2,8,TAKE] …)
- 길게 누름: `RESET` (내부적으로 [0,10]으로 복귀)
- 2회 누름: `[A,B,EMERGENCY]` — 응급 모드 진입
- 응급 중 1회 누름: `EMERGENCY,CANCEL` — 정상 모드 복귀

## 실행
```
npm init -y
npm i electron --save-dev
npx electron electron/main.js
```
