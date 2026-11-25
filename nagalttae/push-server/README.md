# 나갈때 웹 푸시

## 안성 버스

브라우저가 안성 정류장 목록으로 거리를 계산한다. 서버에는 사용자가 선택한 정류소 ID를 보낸다. 실시간 도착 API는 공공데이터포털에서 **경기도_버스도착정보 조회** 활용 승인을 받은 뒤 이 디렉터리에서 `npx wrangler secret put GBIS_SERVICE_KEY`의 비공개 입력창으로 등록한다. 같은 Worker의 Cloudflare 대시보드 설정에서도 Secret으로 등록할 수 있다. 다음 조회부터 적용된다. 배차 정보는 정류소별 30초 동안 공유하며 원천 조회 시각을 함께 표시한다.

정류소의 시군은 [국토교통부 전국 버스정류장 위치정보](https://www.data.go.kr/data/15067528/fileData.do) 2026-11-09 자료에서 확인하고, [경기버스정보](https://gbis.go.kr/)의 정류소정보 및 노선경유정보 다운로드(2026-11-25 조회)와 ID로 연결했다. 세 파일을 갱신하려면 `python ../verification/import-anseong-stops.py <전국 CSV> <정류소 XLSX> <노선경유 XLSX>`를 실행한 뒤 웹앱 캐시와 Worker를 함께 갱신한다.

## 웹 푸시

Cloudflare Worker가 브라우저 구독별로 준비·출발 알림 한 일정을 보관한다. 사용자가 예약할 때 구독 정보, 두 시각과 표시 언어를 저장한다. 취소하거나 마지막 알림 전송을 마치면 해당 데이터를 삭제한다. 지연된 요청이 취소된 일정을 되살리지 못하도록 임의의 버전 표식은 30일간 남긴다. 전송용 VAPID 키는 첫 실행 시 전용 Durable Object에서 생성해 보관한다.

이 디렉터리에서 `npm ci`를 실행한 뒤 `npm run deploy`로 전용 Worker를 배포한다. Wrangler가 출력한 공개 주소를 `node configure-site.mjs <Worker 주소>`에 전달하면 나갈때 사이트에서 공개 키를 조회할 수 있는지 확인한 뒤 웹앱 설정과 오프라인 캐시를 갱신한다. GitHub Pages에는 갱신된 정적 앱 파일을 배포한다.

로컬에서는 `npm run dev -- --port 8791 --var APP_ORIGIN:http://127.0.0.1:8792`로 Worker를 실행한다. `node ../verification/test-push-browser.cjs`는 별도 Chrome 프로필에서 예약·변경·취소와 앱을 닫은 뒤 알림 표시를 확인한다. 이 검사에는 Playwright가 필요하며 `NAGAL_PLAYWRIGHT`로 설치 경로를 지정할 수 있다. 실제 푸시 공급자를 거치려면 테스트에 `--real`을 추가한다. `node test-delivery.mjs`는 로컬 Workers 런타임에서 두 시각에 전송한 암호문을 테스트 수신기가 복호화하는지 검사한다.
