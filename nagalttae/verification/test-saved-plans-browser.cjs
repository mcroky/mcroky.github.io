const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.NAGAL_PLAYWRIGHT || 'playwright');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' };

async function run() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'nagal-saved-plans-'));
  const server = http.createServer(async (request, response) => {
    try {
      const name = /^\/nagalttae\/([\w./-]*)$/.exec(request.url.split('?')[0])?.[1];
      if (name === undefined || name.split('/').includes('..')) throw Error();
      const asset = path.join(root, name || 'index.html');
      const data = await fs.readFile(asset);
      response.writeHead(200, { 'Content-Type': types[path.extname(asset)] || 'application/octet-stream' }).end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  let context;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = process.env.NAGAL_SAVED_PLANS_URL ?? `http://127.0.0.1:${server.address().port}/nagalttae/`;
    const options = { channel: 'chrome', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
    const controls = page => ({
      save: page.locator('#saved-plan-save'), list: page.locator('#saved-plans-list'),
      row: name => page.locator('#saved-plans-list li').filter({ hasText: name }),
      notice: page.locator('#saved-plans-status')
    });
    async function openList(page) {
      const details = page.locator('#saved-plans-details');
      if (await details.getAttribute('open') === null) await details.locator('summary').click();
    }
    async function setPlan(page, target, prep) {
      await page.locator('#date').fill('2026-11-28');
      await page.locator('#target').fill(target);
      await page.locator('#prep').fill(String(prep));
      await page.locator('#travel').fill('35');
      await page.locator('#buffer').fill('12');
    }

    context = await chromium.launchPersistentContext(profile, options);
    let page = context.pages()[0];
    await page.goto(url);
    await setPlan(page, '13:20', 21);
    await controls(page).save.click();
    await controls(page).row('13:20').waitFor();
    await setPlan(page, '14:30', 26);
    await controls(page).save.click();
    await controls(page).row('14:30').waitFor();
    assert.ok(await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)));
    await context.close();

    context = await chromium.launchPersistentContext(profile, options);
    page = context.pages()[0];
    await page.goto(url);
    await openList(page);
    const plan = controls(page);
    await plan.row('13:20').getByRole('button', { name: '편집' }).click();
    assert.equal(await page.locator('#prep').inputValue(), '21');
    assert.equal(await page.locator('#travel').inputValue(), '35');
    assert.equal(await page.locator('#buffer').inputValue(), '12');
    assert.equal(await page.locator('#date').inputValue(), '2026-11-28');

    const second = await context.newPage();
    await second.goto(url);
    await openList(second);
    const other = controls(second);
    await other.row('13:20').getByRole('button', { name: '편집' }).click();
    await second.locator('#target').fill('15:15');
    await other.save.click();
    await other.row('15:15').waitFor();
    await page.locator('#target').fill('15:30');
    await plan.save.click();
    await page.getByText('다른 탭에서 이 일정이 변경됐어요.', { exact: false }).waitFor();
    await plan.row('15:15').waitFor();
    assert.equal(await plan.row('15:30').count(), 0);

    await plan.row('15:15').getByRole('button', { name: '편집' }).click();
    await page.locator('#target').fill('16:00');
    await plan.save.click();
    await plan.row('16:00').waitFor();
    assert.equal(await plan.row('15:15').count(), 0);
    await plan.row('14:30').getByRole('button', { name: '편집' }).click();
    await page.locator('#saved-plan-discard').click();
    assert.equal(await page.locator('#target').inputValue(), '16:00');
    page.once('dialog', dialog => dialog.accept());
    await plan.row('14:30').getByRole('button', { name: '삭제' }).click();
    await page.getByText('저장한 일정을 삭제했어요.').waitFor();
    assert.equal(await plan.row('14:30').count(), 0);
    await page.locator('#reset').click();
    await plan.row('16:00').waitFor();
    await context.setOffline(true);
    await page.reload();
    await openList(page);
    await plan.row('16:00').waitFor();
    assert.equal(await plan.row('14:30').count(), 0);
    console.log('PASS Chrome: persistence across restarts, edit, conflict, cancel edit, deletion, reset and offline reading');
  } finally {
    await context?.close();
    server.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
