import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import viewer from './viewer.mjs';

test('private code, protected cookie and server-side log query', async () => {
  const code = randomBytes(32).toString('base64url');
  const url = 'https://test.invalid/';
  let reads = 0;
  const env = { ADMIN_CODE_SHA256: createHash('sha256').update(code).digest('hex'),
    ARCHIVE: { getByName(name) {
      assert.equal(name, 'nagalttae-reminder-audit-v1');
      return { reminderPage(from, offset) {
        reads++;
        assert.equal(from, Date.parse('2026-11-24T15:00:00Z'));
        assert.equal(offset, 0);
        return [
          { timestamp: from, source: { event: 'reminder_apple_rejection', reason: '<BadDeviceToken>', privateField: 'never-display' } },
          { timestamp: from, source: { event: 'reminder_schedule', outcome: 'saved', readyAt: from + 86400_000,
            leaveAt: from + 86400_000 }, unrecorded: ['both'] }
        ];
      } };
    } } };
  const get = cookie => new Request(url + '?day=2026-11-25', { headers: { Cookie: cookie } });
  const post = (value, origin = new URL(url).origin) => new Request(url, { method: 'POST', body: 'code=' + value, headers: {
    Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' } });
  const form = await viewer.fetch(get(''), env);
  assert.match(await form.text(), /전용 코드/);
  assert.equal(form.headers.get('Referrer-Policy'), 'same-origin');
  assert.equal((await viewer.fetch(post(code, 'null'), env)).status, 400);
  assert.equal((await viewer.fetch(post(code, 'https://other.invalid'), env)).status, 400);
  assert.equal((await viewer.fetch(post(code + '&padding=' + 'x'.repeat(128)), env)).status, 400);
  assert.equal((await viewer.fetch(post('x'.repeat(43)), env)).status, 403);
  assert.equal((await viewer.fetch(post(code), {})).status, 403);
  const redirect = await viewer.fetch(post(code), env);
  assert.equal(redirect.status, 303);
  const cookie = redirect.headers.get('Set-Cookie');
  assert.match(cookie, /Secure; HttpOnly; SameSite=Strict/);
  assert.equal(reads, 0);
  const page = await viewer.fetch(get(cookie.split(';')[0]), env);
  assert.match(page.headers.get('Cache-Control'), /no-store/);
  const html = await page.text();
  assert.match(html, /&lt;BadDeviceToken&gt;/);
  assert.match(html, /준비·출발 발송 결과 미기록/);
  assert.match(html, /준비·출발 11월 26일 00:00:00/);
  assert.match(html, /11월 25일 00:00:00<\/td>/);
  assert.ok(!html.includes('never-display') && !html.includes(code));
  assert.equal(reads, 1);
});
