// Requires Playwright and Chrome. NAGAL_PLAYWRIGHT may point at an existing installation.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.NAGAL_PLAYWRIGHT || 'playwright');
const localPage = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const androidUserAgent = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36';

function deferClipboard() {
  window.pendingCopies = [];
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText(text) {
      const active = navigator.userActivation.isActive;
      return new Promise((resolve, reject) => window.pendingCopies.push({ text, active, resolve, reject }));
    } }
  });
}

function finishCopy(page, index, ok) {
  return page.evaluate(([i, success]) => {
    const request = window.pendingCopies[i];
    if (success) request.resolve();
    else request.reject(new Error('Clipboard denied'));
  }, [index, ok]);
}

async function setTarget(page, value) {
  await page.locator('#time-open').click();
  await page.locator('#target').fill(value);
  await page.locator('#done-time').click();
}

async function testAndroidWeb(browser) {
  const page = await browser.newPage({
    userAgent: androidUserAgent, viewport: { width: 390, height: 760 }
  });
  try {
    await page.addInitScript(deferClipboard);
    await page.goto(localPage);
    assert.doesNotMatch(await page.content(), /gemini/i);
    await page.locator('#date-adjust summary').click();
    await page.locator('#duration-adjust summary').click();
    await page.locator('#more-details summary').click();
    await page.locator('.timeline summary').click();
    await setTarget(page, '00:10');
    for (const [field, value] of Object.entries({ date: '2028-03-01', prep: '15', travel: '10', buffer: '0' })) {
      await page.locator('#' + field).fill(value);
    }
    const quick = page.locator('#calendar-download');
    const options = page.locator('#calendar');
    const dialog = page.locator('#calendar-dialog');
    const changeTime = value => setTarget(page, value);
    const readDownload = async download => {
      assert.equal(download.suggestedFilename(), 'nagalttae-2028-03-01.ics');
      const parts = [];
      for await (const chunk of await download.createReadStream()) parts.push(chunk);
      return Buffer.concat(parts).toString('utf8').replaceAll('\r\n ', '');
    };
    const save = async trigger => {
      const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
      return readDownload(download);
    };
    const triggers = calendar => [...calendar.matchAll(/^TRIGGER:(.+)\r?$/gm)].map(match => match[1]);
    assert.equal(await page.locator('.actions button:visible').first().getAttribute('id'), 'calendar-download');
    const calendar = await save(quick);
    assert.ok(await dialog.isHidden());
    assert.equal((calendar.match(/BEGIN:VEVENT\r\n/g) || []).length, 1);
    assert.match(calendar, /^DTSTART:20280301T001000\r?$/m);
    assert.deepEqual(triggers(calendar), ['-PT25M', '-PT10M']);
    await options.click();
    assert.ok(await dialog.isVisible());
    const reminders = page.locator('#event-alarms');
    assert.ok(await reminders.isChecked());
    const preview = await page.locator('#alarm-times').innerText();
    assert.ok(preview.includes('23:45') && preview.includes('00:00'));
    await page.locator('#event-name').fill('Named visit');
    await reminders.uncheck();
    const customCalendar = await save(page.locator('#save-calendar'));
    assert.match(customCalendar, /^SUMMARY:Named visit\r?$/m);
    assert.deepEqual(triggers(customCalendar), []);
    assert.ok(await dialog.isHidden());

    await page.evaluate(() => {
      window.calendarDigests = [];
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = (...args) => new Promise((resolve, reject) => {
        window.calendarDigests.push({ finish: () => resolve(digest(...args)), reject });
      });
    });
    await quick.click();
    await changeTime('00:15');
    assert.ok(await quick.isDisabled());
    assert.ok(await options.isDisabled());
    await page.evaluate(() => {
      document.getElementById('calendar-download').dispatchEvent(new MouseEvent('click'));
      document.getElementById('calendar-form').dispatchEvent(new Event('submit', { cancelable: true }));
    });
    assert.equal(await page.evaluate(() => window.calendarDigests.length), 1);
    await page.evaluate(() => window.calendarDigests[0].reject(new Error('Digest unavailable')));
    assert.ok(await quick.isEnabled());
    assert.equal(await page.locator('#toast').innerText(), await page.evaluate(() => NagalCopy.ko.calendarError));

    await changeTime('00:10');
    await quick.click();
    await changeTime('00:15');
    const [retried] = await Promise.all([
      page.waitForEvent('download'), page.evaluate(() => window.calendarDigests[1].finish())
    ]);
    const snapshot = await readDownload(retried);
    assert.match(snapshot, /^DTSTART:20280301T001000\r?$/m);
    assert.doesNotMatch(snapshot, /Named visit/);
    assert.deepEqual(triggers(snapshot), ['-PT25M', '-PT10M']);
    assert.ok(await dialog.isHidden());
    await changeTime('00:10');
    await page.locator('#clock-quick-ready').click();
    assert.ok(await page.locator('#open-clock-app').isHidden());
    assert.deepEqual(await page.evaluate(() => window.pendingCopies.map(copy => [copy.text, copy.active])),
      [['23:45', true]]);
    await finishCopy(page, 0, true);
    assert.ok((await page.locator('#clock-feedback').innerText()).includes('23:45'));
    console.log('PASS Android web in Chrome: one-tap calendar download, customization, busy/failure/snapshot, manual Clock copy');
  } finally {
    await page.close();
  }
}

async function testClockPlatformControls(browser) {
  for (const nativeBridge of [false, true]) {
    const page = await browser.newPage({ userAgent: nativeBridge ? androidUserAgent :
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1' });
    try {
      if (nativeBridge) await page.addInitScript(() => {
        window.clockActions = [];
        window.NagalAndroid = {
          status() {},
          copyText(value) { window.clockActions.push(value); },
          openClock() { window.clockActions.push('open'); }
        };
      });
      await page.goto(localPage);
      await page.locator('#more-details summary').click();
      if (nativeBridge) assert.ok(await page.locator('#calendar-download').isHidden());
      await page.locator('#clock-transfer').click();
      assert.ok(await page.locator('#open-clock-app').isVisible());
      if (nativeBridge) {
        await page.locator('#clock-ready-copy').click();
        const time = await page.locator('#clock-ready-time').inputValue();
        assert.deepEqual(await page.evaluate(() => window.clockActions), [time, 'open']);
      }
    } finally {
      await page.close();
    }
  }
  console.log('PASS iPhone UA clock controls and simulated native JS bridge in desktop Chrome');
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(deferClipboard);
    await page.goto(localPage);
    await page.locator('#more-details summary').click();
    await page.locator('.timeline summary').click();
    const click = id => page.locator('#' + id).click();
    const feedback = () => page.locator('#clock-feedback').innerText();
    const settle = (index, ok) => finishCopy(page, index, ok);

    await click('clock-quick-ready');
    assert.ok(await page.evaluate(() => window.pendingCopies[0].active));
    assert.equal(await page.evaluate(() => window.pendingCopies[0].text), await page.locator('#clock-ready-time').inputValue());
    await page.keyboard.press('Escape');
    const guidanceBeforeCompletion = await feedback();
    await settle(0, true);
    assert.equal(await feedback(), guidanceBeforeCompletion);

    await click('clock-quick-ready');
    await click('close-clock');
    await click('clock-transfer');
    await settle(1, true);
    assert.equal(await feedback(), '');
    await click('clock-ready-copy');
    await page.keyboard.press('Escape');
    await click('clock-transfer');
    await page.locator('#clock-leave-copy').focus();
    await settle(2, false);
    assert.equal(await feedback(), '');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'clock-leave-copy');

    await click('clock-ready-copy');
    await click('clock-leave-copy');
    await settle(4, true);
    const newest = await feedback();
    assert.ok(newest.includes(await page.locator('#clock-leave-time').inputValue()));
    await settle(3, false);
    assert.equal(await feedback(), newest);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'clock-leave-copy');

    await click('clock-ready-copy');
    await settle(5, false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'clock-ready-time');
    assert.ok(await page.locator('#clock-ready-time').evaluate(
      input => input.selectionStart === 0 && input.selectionEnd === input.value.length));
    console.log('PASS Chrome ' + browser.version() + ': activation, close, same-plan reopen, reverse order, current fallback');
    await testAndroidWeb(browser);
    await testClockPlatformControls(browser);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
