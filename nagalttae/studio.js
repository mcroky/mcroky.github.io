(() => {
  'use strict';

  const kakaoAccount = '3333071025774';
  const strings = {
    ko: {
      nav: 'Roky Studio 안내', updates: '업데이트', feedback: '의견 보내기', books: '전자책',
      support: '후원하기', close: '닫기', newTab: '새 탭에서 열기',
      version: '웹 버전 1.4.6', change: '안드로이드에서 준비·출발 시각을 누르면 알람 요청을 복사하고 Gemini 앱 열기를 시도해요. Gemini 앱에 붙여넣고 전송하세요.',
      choice: '더 좋은 앱을 위한 후원', about: '나갈때는 무료입니다. 원하시면 다음 업데이트를 후원할 수 있어요.',
      coffee: 'Buy Me a Coffee로 후원', bank: '카카오뱅크 계좌번호 복사', number: '카카오뱅크 계좌번호',
      copied: '계좌번호를 복사했습니다.', manual: '계좌번호를 직접 선택해 복사해 주세요.'
    },
    en: {
      nav: 'Roky Studio links', updates: 'Updates', feedback: 'Feedback', books: 'E-books',
      support: 'Support the app', close: 'Close', newTab: 'opens in a new tab',
      version: 'Web version 1.4.6', change: 'On Android, copy a prep or departure time to copy an alarm request and try opening Gemini. Paste and send it in the Gemini app.',
      choice: 'Support development', about: 'Nagalttae is free. You can help fund future updates if you like.',
      coffee: 'Support via Buy Me a Coffee', bank: 'Copy KakaoBank account number', number: 'KakaoBank account number',
      copied: 'Account number copied.', manual: 'Select the account number and copy it manually.'
    },
    ja: {
      nav: 'Roky Studioのリンク', updates: '更新履歴', feedback: 'ご意見', books: '電子書籍',
      support: '開発を応援', close: '閉じる', newTab: '新しいタブで開く',
      version: 'Web版 1.4.6', change: 'Androidで支度や出発の時刻をコピーすると、アラームの依頼文をコピーして Gemini アプリを開きます。貼り付けて送信してください。',
      choice: '開発を応援する', about: 'このアプリは無料です。ご希望の方は今後の開発を応援していただけます。',
      coffee: 'Buy Me a Coffeeで応援', bank: 'カカオバンクの口座番号をコピー', number: 'カカオバンクの口座番号',
      copied: '口座番号をコピーしました。', manual: '口座番号を選択して手動でコピーしてください。'
    },
    zh: {
      nav: 'Roky Studio 链接', updates: '更新记录', feedback: '意见反馈', books: '电子书',
      support: '支持开发', close: '关闭', newTab: '在新标签页中打开',
      version: '网页版 1.4.6', change: '在 Android 上，复制准备或出门时间时会复制闹钟指令并尝试打开 Gemini 应用。请粘贴并发送。',
      choice: '支持应用开发', about: '本应用免费使用。如果愿意，你可以支持后续开发。',
      coffee: '通过 Buy Me a Coffee 支持', bank: '复制 KakaoBank 账号', number: 'KakaoBank 账号',
      copied: '账号已复制。', manual: '请选中账号并手动复制。'
    }
  };

  function link(label, url, words, profile = false) {
    const rel = profile ? 'me noopener noreferrer' : 'noopener noreferrer';
    const name = profile ? `${label} @loki60542` : label;
    return `<a href="${url}" target="_blank" rel="${rel}" aria-label="${name} · ${words.newTab}">${label} <span aria-hidden="true">↗</span></a>`;
  }

  function showPanel(footer, trigger, kind, words, locale) {
    const dialog = document.createElement('dialog');
    dialog.className = 'nagal-studio-dialog';
    dialog.setAttribute('aria-labelledby', 'nagal-studio-heading');
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' })
      .format(new Date('2026-11-24T12:00:00Z'));
    const updates = kind === 'updates';
    dialog.innerHTML = `
      <header class="nagal-studio-dialog-head">
        <h2 id="nagal-studio-heading">${updates ? words.updates : words.choice}</h2>
        <button type="button" class="nagal-studio-close" aria-label="${words.close}" autofocus>×</button>
      </header>
      ${updates ? `
        <p class="nagal-studio-version">${words.version}</p>
        <time datetime="2026-11-24">${date}</time>
        <p>${words.change}</p>` : `
        <p>${words.about}</p>
        <div class="nagal-studio-choices">
          ${link(words.coffee, 'https://buymeacoffee.com/roky.studio', words)}
          <button type="button" class="nagal-studio-bank">${words.bank}</button>
        </div>
        <input class="nagal-studio-number" type="text" aria-label="${words.number}" value="${kakaoAccount}" readonly hidden>
        <p class="nagal-studio-status" role="status"></p>`}`;
    footer.append(dialog);
    dialog.querySelector('.nagal-studio-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (trigger.isConnected) trigger.focus();
    }, { once: true });
    if (!updates) {
      const status = dialog.querySelector('.nagal-studio-status');
      const field = dialog.querySelector('.nagal-studio-number');
      dialog.querySelector('.nagal-studio-bank').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(kakaoAccount);
          status.textContent = words.copied;
          field.hidden = true;
        } catch {
          if (!dialog.open) return;
          field.hidden = false;
          field.focus();
          field.select();
          status.textContent = words.manual;
        }
      });
    }
    dialog.showModal();
  }

  function render(locale = 'ko') {
    const footer = document.getElementById('studio-footer');
    if (!footer) return;
    const requested = String(locale).split('-')[0];
    const language = Object.hasOwn(strings, requested) ? requested : 'ko';
    const channel = document.documentElement.dataset.channel || 'web';
    if (footer.dataset.language === language && footer.dataset.channel === channel) return;
    footer.querySelector('dialog[open]')?.close();
    const words = strings[language];
    const web = channel === 'web';
    footer.dataset.language = language;
    footer.dataset.channel = channel;
    footer.innerHTML = `
      <div class="nagal-studio-row">
        <span class="nagal-studio-brand">© Roky Studio</span>
        <nav class="nagal-studio-links" aria-label="${words.nav}">
          <button type="button" data-nagal-panel="updates" aria-haspopup="dialog">${words.updates}</button>
          ${link(words.feedback, 'https://mcroky.github.io/roky-studio/#feedback', words)}
          ${link('X', 'https://x.com/loki60542', words, true)}
          ${link('Threads', 'https://www.threads.com/@loki60542', words, true)}
          ${web ? link(words.books, 'https://litt.ly/roky.studio', words) : ''}
          ${web ? `<button type="button" data-nagal-panel="support" aria-haspopup="dialog">${words.support}</button>` : ''}
        </nav>
      </div>`;
    for (const button of footer.querySelectorAll('[data-nagal-panel]')) {
      button.addEventListener('click', () => showPanel(footer, button, button.dataset.nagalPanel, words, language));
    }
  }

  globalThis.NagalStudio = { render };
})();
