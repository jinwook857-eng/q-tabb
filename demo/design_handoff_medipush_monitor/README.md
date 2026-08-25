# Handoff: Medi-Push Monitor (복약 모니터링 데모)

Q-Tab "Medi-Push One" 디스펜서의 Smart Monitoring 데모.
아두이노 스위치가 눌릴 때마다 시리얼로 이벤트를 수신해, 마지막 복용 후 경과시간과 복용 패턴을 보여주는 **원페이지 Electron 앱**입니다.

## About the Design Files
이 번들의 \`*.dc.html\` 파일은 **HTML로 만든 디자인 레퍼런스(프로토타입)**입니다. 그대로 배포하는 코드가 아니라,
Electron 렌더러(권장: 순수 HTML/CSS/JS 또는 React)에서 **동일한 룩과 동작을 재구현**하는 기준입니다.
프로토타입은 원 제작 환경의 런타임(support.js)에 의존하므로 단독으로는 열리지 않을 수 있습니다 — 마크업/스타일/로직을 참조용으로 읽으세요.

## Fidelity
**High-fidelity.** 색·타이포·간격·인터랙션 모두 최종안. 픽셀 단위로 재현할 것.
디자인 시스템: "Industry" — \`tokens.css\`(동봉)가 모든 토큰의 원본. 값을 하드코딩하지 말고 CSS 변수로 사용.

## 화면 구성 (최종안 = v2 Mobile)
실행 창: 세로 모바일 비율 (권장 420×880, resizable: false). 프로토타입의 iPhone 베젤은 프레젠테이션용 — 실제 앱에는 넣지 않음.

### 1. 메인 화면
- 헤더: 연결 상태 점(8px 원, 연결 시 --color-accent-500 / 미연결 --color-neutral-400) + "MEDI-PUSH ONE"(Barlow Condensed 600 16px) + 상태 텍스트(10px uppercase) + 우측 톱니 아이콘 버튼(Lucide settings, stroke 1.5)
- 히어로(세로 중앙 정렬):
  - 킥커 "마지막 복용 후 경과" (10-11px, letter-spacing 0.14em, uppercase, --color-accent)
  - 경과시간 대형 숫자: Barlow Condensed 600, 76px, line-height 1 (예: "2시간 14분")
  - "마지막 복용 오늘 08:12" (14px), "다음 복용 예상 오늘 17:20 · 평균 간격 9시간" (13px, 예상 시각은 --color-accent-700)
- 오늘 24h 스트립 (max-width 340px): 좌우 1px 보더, 중앙 수평 1px 라인, 25/50/75% 세로 눈금, 복용 시각마다 9px 원(--color-accent-500 채움 + --color-accent-700 1px 보더), 현재 시각 세로 1px 라인(--color-accent-700). 라벨 "오늘 0시 / 6 / 12 / 18 / 24시" (10px)
- 잔여 알약: 11px 정사각형 칸 × 총량(채워진 칸 = --color-accent-500, 빈 칸 = 보더만), "잔여 n/10정" (12px). 잔량 ≤20%면 "잔량 부족 — 리필 필요" (--color-accent-700)
- 하단: 전체폭 프라이머리 버튼 "상세 리포트" (높이 46px, --color-accent 채움, 흰 글자, 모서리 직각 + 네 모서리 "+" 레지스트레이션 마크)

### 2. 설정 바텀 시트 (톱니 클릭)
- 반투명 백드롭(neutral-900 40%) + 하단 시트(--color-bg, 위 모서리에 "+" 마크), slide-up 0.25s ease
- 시리얼 연결/해제 버튼, 데모 시뮬레이터 3버튼(1회—복용 / 길게—리셋 / 2회—응급), 안내문 11px

### 3. 상세 리포트 (풀스크린 오버레이)
제목 "복용 패턴 분석" (Barlow Condensed 22px). 섹션 순서:
1. **복용 간격 추이**: 최근 ≤10개 간격 막대(높이 ∝ 시간, 최대 68px), 평균 점선(1px dashed --color-accent-700, bottom = 평균/최대 × 68px), 평균 대비 ±35% 초과 막대는 --color-accent-200(그 외 --color-accent-500), 막대 위 "9.3h" 라벨 9px
2. **시간대별 분포**: 24칸 막대(--color-accent-400 + 상단 2px --color-accent-600)
3. **최근 7일 복용 시각**: 날짜별 24h 라인에 7px 점 (메인 스트립과 동일 문법) + 우측 "n회"
4. **일별 로그** 테이블 (날짜 / 복용 시각 / 횟수)
5. **타임라인** 최신순 (HH:MM + 제목/메타 + 태그: 복용=tag-accent, 리셋=tag-neutral, 응급=accent-900 배경/accent-100 글자, 해제=tag-outline)
6. **보호자 알림 (모의)** 목록
하단: "기록 초기화"(ghost) / "확인"(primary)

### 4. 응급 배너 (EMERGENCY 수신 시)
헤더 아래 --color-accent-900 배경, --color-accent-100 글자, opacity 1↔0.55 펄스 1.6s. "응급 상황 / 보호자 알림 발송됨 (모의)" + 해제 버튼(아웃라인, accent-100)

## 복용 애니메이션 (TAKE 수신 시, 부드럽고 절제됨)
- 숫자 주위 링 2겹: 1px 보더(accent-400/300) 사각형이 scale 0.6→1.7, opacity 0.45→0으로 1.5s ease-out 확산(둘째 링은 0.35s 지연)
- 상단 토스트 2.4s: "복용 기록됨 · HH:MM" + 체크 원 아이콘, fade in→hold→fade out, translateY(-8px)→0
- 숫자 색이 --color-accent-600에서 원색으로 1.4s 가라앉음

## 시리얼 프로토콜 (9600bps, 라인 단위 \\n)
- 연결 시: \`MEDICINE BOX READY\`
- 1회 누름: \`[A,B,TAKE]\` — A=누적 복용, B=잔여 (예: [1,9,TAKE], [2,8,TAKE]…)
- 길게 누름: \`RESET\` (내부적으로 [0,10] 복귀)
- 2회 누름: \`[A,B,EMERGENCY]\` — 응급 진입 / 응급 중 1회: \`EMERGENCY,CANCEL\`
파싱은 대소문자 무시, 대괄호·공백 허용. 미매칭 라인은 INFO 이벤트로 타임라인에 표시.

## State
- \`events[]\`: {type: TAKE|RESET|EMERGENCY|EMERGENCY_CANCEL|READY|INFO, ts, taken?, remaining?, text?} — localStorage 영속
- \`portState\`, \`emergency\`, \`showReport\`, \`showSettings\`, 1초 tick으로 경과시간 갱신
- 파생값: 마지막 TAKE 기준 경과, 최근 14일 간격(48h 초과 제외) 평균 → "다음 복용 예상" = 마지막 복용 + 평균 간격. 경과가 평균×1.5 초과 시 숫자를 --color-accent-700으로
- 스케줄/순응도% 개념 없음 (심부전약: 정시 복용이 아니라 패턴 분석이 목적)

## Design Tokens (요약 — 전체는 tokens.css)
- 바탕 #f2f2f3, 텍스트 #1d1f20, 액센트 #5980a6 (모노 스킴)
- 액센트 램프: 100 #eef6ff / 200 #d6ebff / 300 #b5d9fd / 400 #94bce3 / 500 #749dc4 / 600 #597ea3 / 700 #416180 / 800 #2c455d / 900 #1d2d3d
- 뉴트럴 램프: 200 #e7e7ea / 300 #d4d4d7 / 400 #b7b7ba / 600 #7a7a7d / 900 #2b2b2d
- 폰트: Barlow Condensed(제목, 600) / Barlow(본문) — Google Fonts
- 아이콘: Lucide, stroke-width 1.5
- 스타일 문법: 모든 카드·버튼 직각 모서리, 1px 헤어라인 보더, 주요 오브젝트에 네 모서리 "+" 마크(11px 십자, 텍스트색 55%). 프라이머리 버튼만 채움
- 포커스: \`:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }\`

## Electron 아키텍처 (권장)
- **방법 1 (권장)**: 렌더러에서 Web Serial API 직접 사용. main에서 \`select-serial-port\` 이벤트로 포트 자동 승인 (electron/main.js 참조)
- **방법 2**: main에서 node-serialport 수신 → IPC(preload contextBridge)로 라인 전달 (스켈레톤 동봉)
- 창: 420×880 고정, 타이틀 "Medi-Push One — Smart Monitoring"

## Files
- \`Medi-Push Monitor v2 Mobile.dc.html\` — **최종안** (모바일, 이걸 구현)
- \`Medi-Push Monitor.dc.html\` — 이전 데스크톱 버전 (참고용)
- \`tokens.css\` — Industry 디자인 시스템 토큰 + 컴포넌트 클래스 (원본 그대로)
- \`electron/main.js\`, \`electron/preload.js\`, \`electron/README.md\` — Electron 통합 스켈레톤
