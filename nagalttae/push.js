(() => {
  'use strict';
  const messages = {
    ko: {
      title: '휴대폰 알림', save: '준비·출발 알림 예약', replace: '이 일정으로 변경', cancel: '예약 취소', busy: '처리 중…',
      hint: '준비할 때와 출발할 때 이 기기로 알려드려요.', active: '예약됨', ready: '준비', leave: '출발', both: '준비·출발',
      denied: '알림 권한이 필요해요. 브라우저의 이 사이트 설정에서 알림을 허용해 주세요.',
      subscription: '브라우저가 이 기기를 푸시 서비스에 등록하지 못했어요. 인터넷 연결과 브라우저 알림 설정을 확인해 주세요.',
      unavailable: '알림 서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
      invalid: '앞으로 30일 안에 출발하는 일정을 선택해 주세요.', dst: '이 날짜에 존재하지 않는 현지 시각이에요. 시간을 조정해 주세요.',
      conflict: '다른 창에서 예약을 변경했어요. 현재 예약을 확인한 뒤 다시 눌러 주세요.',
      removed: '예약을 취소했어요.', update: '나갈때 창을 모두 닫았다가 다시 열어 주세요.', saved: '예약 완료',
      limited: '잠시 후 다시 시도해 주세요.', unknown: '이 기기의 예약을 확인할 수 없어요. 다시 시도해 주세요.',
      unsupported: '이 브라우저에서는 푸시를 사용할 수 없어요. 갤럭시에서는 Chrome에서 열어 주세요.', home: '아이폰에서는 홈 화면에 나갈때를 추가하고 그 아이콘으로 열어 주세요.'
    },
    en: {
      title: 'Phone reminders', save: 'Schedule prep & departure', replace: 'Use this schedule', cancel: 'Cancel reminders', busy: 'Working…',
      hint: 'Get a notification on this device when it’s time to get ready and leave.', active: 'Scheduled', ready: 'Get ready', leave: 'Leave', both: 'Get ready & leave',
      denied: 'Allow notifications in the browser’s site settings.', unavailable: 'Couldn’t reach the reminder server. Check your connection and try again.',
      subscription: 'The browser could not register this device for push. Check your connection and browser notification settings.',
      invalid: 'Choose a departure in the next 30 days.', dst: 'This local time does not exist on that date. Adjust the time.',
      conflict: 'Another tab changed your reminders. Check the current schedule and try again.', removed: 'Reminders canceled.',
      update: 'Close all Nagalttae windows and reopen the app.', saved: 'Scheduled', limited: 'Try again in a moment.', unknown: 'Couldn’t check this device’s reminders. Try again.',
      unsupported: 'This browser does not support push. On Galaxy, open this page in Chrome.', home: 'On iPhone, add Nagalttae to your Home Screen and open it from its icon.'
    },
    ja: {
      title: '端末の通知', save: '支度・出発の通知を予約', replace: 'この予定に変更', cancel: '予約を取り消す', busy: '処理中…',
      hint: '支度と出発の時刻に、この端末へ通知します。', active: '予約済み', ready: '支度', leave: '出発', both: '支度・出発',
      denied: 'ブラウザのサイト設定で通知を許可してください。', unavailable: '通知サーバーに接続できません。接続を確認してもう一度お試しください。',
      subscription: '端末をプッシュサービスに登録できません。ネットワークとブラウザの通知設定を確認してください。',
      invalid: '今から30日以内に出発する予定を選んでください。', dst: 'その日には存在しない現地時刻です。時刻を調整してください。',
      conflict: '別のタブで予約が変更されました。現在の予約を確認してください。', removed: '予約を取り消しました。',
      update: 'Nagalttaeの画面をすべて閉じて開き直してください。', saved: '予約済み', limited: 'しばらくしてからお試しください。', unknown: '予約状況を確認できません。もう一度お試しください。',
      unsupported: 'このブラウザはプッシュ通知を利用できません。GalaxyではChromeで開いてください。', home: 'iPhoneではホーム画面に追加し、そのアイコンから開いてください。'
    },
    zh: {
      title: '手机提醒', save: '预约准备和出发提醒', replace: '改为当前计划', cancel: '取消提醒', busy: '处理中…',
      hint: '准备和出发时，这台设备会收到通知。', active: '已预约', ready: '准备', leave: '出发', both: '准备和出发',
      denied: '请在浏览器的网站设置中允许通知。', unavailable: '无法连接提醒服务器。请检查网络后重试。',
      subscription: '浏览器无法为这台设备注册推送。请检查网络和浏览器通知设置。',
      invalid: '请选择未来30天内出发的计划。', dst: '这一天没有该本地时间，请调整时间。',
      conflict: '其他标签页已更改预约。请确认当前预约后重试。', removed: '已取消提醒。', update: '请关闭所有本应用窗口后重新打开。',
      saved: '已预约', limited: '请稍后重试。', unknown: '无法查询这台设备的提醒，请重试。',
      unsupported: '此浏览器不支持推送。在 Galaxy 上请用 Chrome 打开。', home: '请在 iPhone 上添加到主屏幕，然后从图标打开。'
    }
  };

  function instant(date, minutes) {
    const wall = new Date(Date.parse(date + 'T00:00:00Z') + minutes * 60_000);
    if (!Number.isFinite(wall.getTime())) return NaN;
    const local = new Date(wall.toISOString().slice(0, 19));
    return local.getHours() === wall.getUTCHours() && local.getMinutes() === wall.getUTCMinutes() &&
      local.getDate() === wall.getUTCDate() ? local.getTime() : NaN;
  }

  function usableRegistration(reg) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const finish = ok => {
        clearTimeout(timer);
        channel.port1.close();
        if (ok) resolve(reg); else reject(new Error('update'));
      };
      const timer = setTimeout(() => finish(false), 2000);
      channel.port1.onmessage = event => finish(event.data === 'nagal-push-v1');
      reg.active?.postMessage('nagal-push-version', [channel.port2]);
    });
  }

  function mount({ plan, date, language }) {
    const configured = document.querySelector('meta[name="nagal-push-api"]').content;
    const api = location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8791' : configured;
    if (!api || !window.isSecureContext || location.protocol === 'file:') return;
    const el = id => document.getElementById(id);
    const save = el('push-save'), cancel = el('push-cancel');
    el('push-panel').hidden = false;
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const needsHome = appleMobile && !matchMedia('(display-mode: standalone)').matches && navigator.standalone !== true;
    if (needsHome || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      save.hidden = true;
      const explain = () => {
        const words = messages[language()];
        el('push-title').textContent = words.title;
        el('push-status').textContent = needsHome ? '' : words.unsupported;
      };
      explain();
      return { render: explain };
    }
    let busy = false, current = null, revision = null, notice = '', sequence = 0;
    let timer;
    const times = () => {
      const values = plan();
      return values && { ready: instant(date(), values.ready), leave: instant(date(), values.leave) };
    };
    function render() {
      const words = messages[language()], next = times();
      const same = current && next && current.ready === next.ready && current.leave === next.leave;
      el('push-title').textContent = words.title;
      save.textContent = words[busy ? 'busy' : same ? 'saved' : current ? 'replace' : 'save'];
      save.disabled = busy || !next || Boolean(same);
      cancel.hidden = !current;
      cancel.disabled = busy;
      cancel.textContent = words.cancel;
      const status = [];
      if (notice) status.push(words[notice] || words.unavailable);
      if (current) {
        const format = new Intl.DateTimeFormat(language(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        status.push(words.active + ' · ' + current.events.map(event => words[event.kind] + ' ' + format.format(event.at)).join(' / '));
      } else if (!notice) status.push(words.hint);
      el('push-status').textContent = status.join('\n');
    }
    async function request(path, data) {
      const init = { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000) };
      if (data) Object.assign(init, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const response = await fetch(api + '/' + path, init);
      if (response.status === 429) throw new Error('limited');
      if (!response.ok && response.status !== 409 && response.status !== 422) throw new Error('unavailable');
      return { status: response.status, data: await response.json() };
    }
    function accept(data) {
      current = data.plan;
      revision = data.revision;
      clearTimeout(timer);
      if (current && !document.hidden) {
        const next = Math.min(...current.events.map(event => event.at));
        timer = setTimeout(sync, Math.min(86400_000, Math.max(15000, next - Date.now() + 1500)));
      }
    }
    async function sync() {
      if (busy) return;
      const id = ++sequence;
      try {
        const reg = await navigator.serviceWorker.getRegistration(new URL('./', location.href));
        const sub = await reg?.pushManager.getSubscription();
        if (id !== sequence) return;
        if (!sub) accept({ plan: null, revision: null });
        else {
          const result = await request('status', { subscription: sub });
          if (id !== sequence) return;
          accept(result.data);
          if (notice === 'unknown') notice = '';
        }
      } catch { if (id === sequence) notice = 'unknown'; }
      if (id === sequence) render();
    }
    async function submit(action, selectedTimes) {
      if (busy) return;
      const next = selectedTimes || times(), lang = language(), expected = revision;
      busy = true; sequence++; notice = ''; render();
      try {
        if (action === 'schedule') {
          if (!next || !Number.isFinite(next.ready) || !Number.isFinite(next.leave)) throw new Error('dst');
          if (next.leave <= Date.now() || next.leave > Date.now() + 30 * 86400_000) throw new Error('invalid');
          if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') throw new Error('denied');
        }
        const reg = await navigator.serviceWorker.register('./sw.js');
        const active = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('update')), 10000);
          navigator.serviceWorker.ready.then(r => { clearTimeout(timer); resolve(r); });
        });
        if (active.scope !== reg.scope) throw new Error('update');
        await usableRegistration(active);
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription && action === 'schedule') {
          const { data } = await request('key');
          const key = Uint8Array.from(atob(data.publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
          try { subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); }
          catch (error) { throw new Error(error.name === 'NotAllowedError' ? 'denied' : 'subscription'); }
        }
        if (!subscription) throw new Error('unknown');
        const result = await request(action, { subscription, expected, ...(action === 'schedule' && { ...next, locale: lang }) });
        accept(result.data);
        if (result.status === 409) notice = 'conflict';
        else if (result.status === 422) notice = 'invalid';
        else if (action === 'cancel') notice = 'removed';
      } catch (error) {
        notice = error.name === 'NotAllowedError' ? 'denied' : Object.hasOwn(messages.ko, error.message) ? error.message : 'unavailable';
      } finally { busy = false; render(); }
    }
    save.addEventListener('click', () => submit('schedule'));
    cancel.addEventListener('click', () => submit('cancel'));
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
    render();
    sync();
    return { render, reserve: next => submit('schedule', next) };
  }
  globalThis.NagalPush = { mount, instant };
})();
