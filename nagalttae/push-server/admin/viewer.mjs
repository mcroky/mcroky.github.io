const eventLabels = {
  reminder_schedule: '예약 요청', reminder_cancel: '취소 요청',
  reminder_delivery: '발송 결과', reminder_apple_rejection: 'Apple 거절 사유'
};
const outcomes = {
  saved: '예약 저장', unchanged: '동일 예약 유지', rejected: '요청 거절', canceled: '취소 완료',
  no_active_plan: '활성 예약 없음', provider_accepted: '푸시 서비스 수락', provider_rejected: '푸시 서비스 거절',
  expired: '발송 기한 경과', send_error: '전송 오류', recorded: '사유 확인', unreadable: '응답 읽기 실패',
  unrecognized: '미분류 사유', missing_or_invalid: '사유 없음'
};
const kinds = { ready: '준비', leave: '출발', both: '준비·출발' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hourCycle: 'h23',
  hour: '2-digit', minute: '2-digit', second: '2-digit' });
function time(value) { return Number.isFinite(value) ? clock.format(value) : ''; }
function row(entry) {
  let item = entry.source;
  if (typeof item === 'string') { try { item = JSON.parse(item); } catch { return ''; } }
  if (!item || !Object.hasOwn(eventLabels, item.event)) return '';
  const schedule = [item.readyAt && '준비 ' + time(item.readyAt), item.leaveAt && '출발 ' + time(item.leaveAt),
    item.scheduledAt && (kinds[item.reminder] ?? '') + ' ' + time(item.scheduledAt)].filter(Boolean).join(' / ');
  const details = [outcomes[item.outcome ?? item.reasonStatus], item.reason, item.providerStatus ?? item.httpStatus,
    item.retryPlanned && '재시도 예정'].filter(Boolean).join(' · ');
  return '<tr>' + [time(entry.timestamp), eventLabels[item.event], schedule, details, item.reservationId]
    .map(cell => '<td>' + escape(cell) + '</td>').join('') + '</tr>';
}
const response = (body, status = 200, html = false) => new Response(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'Content-Type': (html ? 'text/html' : 'text/plain') + '; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'
} });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/' || !['GET','POST'].includes(request.method)) return response('찾을 수 없습니다.', 404);
    const submitted = request.method === 'POST';
    let code = /(?:^|;\s*)__Host-reminder-code=([A-Za-z0-9_-]{43})(?:;|$)/.exec(request.headers.get('Cookie') ?? '')?.[1];
    if (submitted) {
      if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded') ||
          Number(request.headers.get('Content-Length') ?? Infinity) > 128) return response('잘못된 요청입니다.', 400);
      code = new URLSearchParams(await request.text()).get('code');
    }
    let valid = false;
    if (/^[A-Za-z0-9_-]{43}$/.test(code ?? '') && /^[a-f0-9]{64}$/.test(env.ADMIN_CODE_SHA256 ?? '')) {
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
      valid = hash.every((byte, i) => byte === parseInt(env.ADMIN_CODE_SHA256.slice(2*i, 2*i+2), 16));
    }
    if (!valid) return response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>나갈때 알림 기록</title><main style="max-width:28rem;margin:12vh auto;font:18px/1.7 system-ui;padding:1rem"><h1>나갈때 알림 기록</h1><form method="post"><label>전용 코드 <input type="password" name="code" required maxlength="43" autocomplete="current-password"></label> <button>기록 열기</button></form>${submitted ? '<p>코드를 확인해 주세요.</p>' : ''}</main></html>`, submitted ? 403 : 200, true);
    if (submitted) {
      const redirect = response('', 303);
      redirect.headers.set('Location', '/');
      redirect.headers.set('Set-Cookie', '__Host-reminder-code=' + code + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800');
      return redirect;
    }
    const day = url.searchParams.get('day') ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const from = Date.parse(day + 'T00:00:00+09:00');
    const page = Number(url.searchParams.get('page') ?? 0);
    if (!/^\d{4}-\d\d-\d\d$/.test(day) || !Number.isFinite(from) || new Date(from + 9*3600_000).toISOString().slice(0,10) !== day ||
        !Number.isSafeInteger(page) || page < 0 || page >= 100)
      return response('날짜 또는 페이지를 확인해 주세요.', 400);
    let entries;
    try {
      entries = await env.ARCHIVE.getByName('nagalttae-reminder-audit-v1').reminderPage(from, page * 100);
    } catch { return response('알림 기록을 조회하지 못했습니다. 잠시 후 다시 조회해 주세요.', 502); }
    const rows = entries.slice(0,100).map(row).join('');
    const link = (number, label) => '<a href="?day=' + day + '&amp;page=' + number + '">' + label + '</a>';
    return response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>나갈때 알림 기록</title><style>body{font:16px/1.5 system-ui;margin:2rem auto;max-width:76rem;padding:0 1rem;color:#16362a}main{overflow:auto}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:.65rem;border-bottom:1px solid #ddd}th{white-space:nowrap;background:#eef5f0}input,button{font:inherit}a{margin-right:1rem}</style>
<h1>나갈때 알림 기록</h1><form><label>조회일 (한국 시간) <input type="date" name="day" value="${day}" required></label> <button>조회</button></form>
<main><table><thead><tr><th>처리 시각</th><th>기록</th><th>알림 예정</th><th>결과</th><th>예약 ID</th></tr></thead><tbody>${rows || '<tr><td colspan="5">이 페이지에 표시할 알림 기록이 없습니다.</td></tr>'}</tbody></table></main>
<nav>${page ? link(page - 1, '이전 페이지') : ''}${entries.length > 100 ? link(page + 1, '다음 페이지') : ''}</nav></html>`, 200, true);
  }
};
