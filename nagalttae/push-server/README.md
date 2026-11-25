# 나갈때 웹 푸시

## 버스 도착정보

브라우저가 전국 정류장 목록으로 거리를 계산하고 도착 요청에 정류소 ID와 도시코드를 사용한다. 제주 등 지원 지역의 도착 정보는 [국토교통부 TAGO 버스도착정보](https://www.data.go.kr/data/15098530/openapi.do)에서 조회한다. TAGO 도착 요청이 코드 99를 반환하면 한 번 더 조회한다. 안성 정류장은 `GBIS_SERVICE_KEY`가 설정되어 있으면 경기버스정보를 이용하고, 그 외에는 TAGO를 조회한다. 서울의 번호가 있는 정류장은 [서울시 TOPIS 공개 지도](https://topis.seoul.go.kr/map/openBusMap.do)의 정류장 조회를 이용하고, 응답에서 ARS 번호와 정류장 ID를 함께 대조한다. 도착 정보는 정류소별 30초 동안 캐시한다.

GitHub Actions **Deploy Nagalttae Worker**의 수동 실행으로 Worker 코드와 `TAGO_SERVICE_KEY`를 함께 반영한다. GitHub 저장소 `mcroky/mcroky.github.io`의 Actions Secrets에 `TAGO_SERVICE_KEY`, `CF_WORKER_DEPLOY_TOKEN`을, Actions Variables에 `CLOUDFLARE_ACCOUNT_ID`를 등록한다. 이 워크플로는 기본 브랜치에 워크플로 정의가 올라간 뒤 수동으로 실행할 수 있고, 서버 코드는 `feature/nagalttae-web-push`에서 가져온다.

정류소의 시군과 도시코드는 [국토교통부 전국 버스정류장 위치정보](https://www.data.go.kr/data/15067528/fileData.do) 2026-11-09 자료에서 가져왔다. 안성 정류장에는 [경기버스정보](https://gbis.go.kr/)의 정류소정보 및 노선경유정보(2026-11-25 조회)를 ID로 연결했다. 데이터를 갱신할 때는 `python ../verification/import-anseong-stops.py <전국 CSV> <정류소 XLSX> <노선경유 XLSX>`와 `python ../verification/import-nearby-stops.py <전국 CSV>`를 순서대로 실행하고 웹앱 캐시를 갱신한다.

## 지하철 실시간 도착정보

서울시 제공 범위의 지하철 도착 예측을 역·노선별로 조회합니다. 서울 열린데이터광장에서 발급한 지하철 인증키를 GitHub Actions Secret `SEOUL_SUBWAY_SERVICE_KEY`로 등록하면 Worker 배포 설정에서 바인딩합니다. Worker는 서울시가 명시한 HTTP 원본 주소에만 요청하며 응답의 수신 시각을 기준으로 남은 시간을 보정합니다. [서울시 지하철 실시간 도착정보](https://data.seoul.go.kr/dataList/OA-12764/A/1/datasetView.do)

로컬에서 키 없이 검증하려면 Worker를 `npm run dev -- --port 8791 --var APP_ORIGIN:http://127.0.0.1:8792 --var SEOUL_SUBWAY_SAMPLE:1`로 실행합니다. 서울역의 공개 샘플 데이터가 연결됩니다.

## 웹 푸시

Cloudflare Worker가 브라우저 구독별로 준비·출발 알림 한 일정을 보관한다. 사용자가 예약할 때 구독 정보, 두 시각과 표시 언어를 저장한다. 취소하거나 마지막 알림 전송을 마치면 해당 데이터를 삭제한다. 지연된 요청이 취소된 일정을 되살리지 못하도록 임의의 버전 표식은 30일간 남긴다. 전송용 VAPID 키는 첫 실행 시 전용 Durable Object에서 생성해 보관한다.

운영 Worker는 위 수동 워크플로로 배포한다. Worker 주소가 바뀌면 `node configure-site.mjs <Worker 주소>`로 사이트의 푸시 공개 키 조회를 확인하고 웹앱 설정과 오프라인 캐시를 갱신한다. GitHub Pages에는 갱신된 정적 앱 파일을 배포한다.

로컬에서는 `npm run dev -- --port 8791 --var APP_ORIGIN:http://127.0.0.1:8792`로 Worker를 실행한다. `node ../verification/test-push-browser.cjs`는 별도 Chrome 프로필에서 예약·변경·취소와 앱을 닫은 뒤 알림 표시를 확인한다. 이 검사에는 Playwright가 필요하며 `NAGAL_PLAYWRIGHT`로 설치 경로를 지정할 수 있다. 실제 푸시 공급자를 거치려면 테스트에 `--real`을 추가한다. `node test-delivery.mjs`는 로컬 Workers 런타임에서 두 시각에 전송한 암호문을 테스트 수신기가 복호화하는지 검사한다.

## 운영에서 알림 확인

[관리자 알림 기록](https://nagalttae-reminder-admin.cokyroky.workers.dev/)에서 전용 코드를 입력하고 한국 시간 기준 날짜를 선택한다. 별도의 로그 보관을 시작한 시점부터 최근 10,000개 이벤트를 보관한다. 보관소 쓰기는 비동기로 처리하며 실패는 Worker 로그의 `reminder_archive_write_failed`에 남는다. 관리자 Worker에는 전용 코드의 SHA-256 해시를 `ADMIN_CODE_SHA256`로 설정한다. 유효한 코드로 발급한 보안 쿠키는 8시간 동안 사용할 수 있고 코드 교체 시 기존 쿠키도 무효가 된다.

Apple로 보낼 때 모든 기기가 같은 서명 객체에서 인증 헤더를 가져온다. 토큰 유효 기간은 12시간이고 발송 시 2시간 이상 지난 토큰을 갱신한다. 푸시 본문은 매번 각 구독의 키로 암호화한다.

Cloudflare에서 `nagalttae-push`의 **Observability**를 열고 `event`로 검색한다. 로그의 자체 시각은 요청·발송 처리 시각이다. `readyAt`, `leaveAt`, `scheduledAt`은 알림 예정 시각을 Unix 밀리초로 담는다. 예약마다 발급한 `reservationId`로 다음 로그를 연결할 수 있다.

| `event` | 기록하는 정보 |
| --- | --- |
| `reminder_schedule` | 저장·동일 요청 재시도·거절, HTTP 상태, 저장된 예정 시각과 대기 중인 알림. 교체 시 기존 ID도 기록 |
| `reminder_cancel` | 취소·활성 예약 없음·거절, HTTP 상태, 취소 요청 당시 활성 일정의 ID와 예정 시각 |
| `reminder_delivery` | 준비·출발 종류, 예정 시각, 공급자 수락·거절·예외·기한 만료, 공급자 HTTP 상태, 재시도 예정 여부 |
| `reminder_apple_rejection` | Apple이 거절한 알림의 예약 ID·종류·예정 시각, HTTP 상태, Apple 문서에 있는 `reason`과 확인 결과 |

`provider_accepted`는 푸시 서비스가 요청을 수락한 상태다. 기기 화면 표시 여부는 푸시 서비스 응답에 포함되지 않는다. 구독 URL, 암호화 키, 요청 본문, IP 주소, 푸시 공급자 응답 본문은 위 로그에 담지 않는다. 저장 기간은 [Cloudflare Workers Logs의 플랜별 보관 기간](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#pricing)을 따른다. `node test-audit.mjs`로 실제 Workers 런타임에서 로그 필드와 상태 전이를 검사한다.

Apple 오류의 `reasonStatus`는 `recorded`, `missing_or_invalid`, `unrecognized`, `unreadable` 중 하나다. `reason`은 문서에 명시된 값만 기록한다. 같은 예약 ID와 `scheduledAt`으로 발송 결과와 대조한다. 진단 로그는 응답 읽기를 기다리는 동안 예약 처리나 다음 알림 저장을 지연시키지 않는다. [Apple 웹 푸시 오류 응답](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
