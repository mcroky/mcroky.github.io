(() => {
  'use strict';

  const el = id => document.getElementById(id);
  const segments = [
    { key: 'prep', icon: 'bag', initial: 20 },
    { key: 'travel', icon: 'train', initial: 30 },
    { key: 'buffer', icon: 'cup', initial: 10 }
  ];
  const stops = ['ready', 'leave', 'arrive', 'target'];
  const dateInput = el('date');
  const form = el('settings-form');
  const dayButtons = [...document.querySelectorAll('[data-day]')];
  const actionButtons = [...document.querySelectorAll('.actions button:not(#alarms)')];
  const android = window.NagalAndroid;
  const storageKey = 'nagalttae.language';
  let locale = 'ko';
  let copy;
  let toastTimer;
  let minuteTimer;

  function localDay(offset, now = new Date()) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    return [String(day.getFullYear()).padStart(4, '0'), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
  }

  function formatDay(day, options) {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(day);
  }

  function durationText(value) {
    return value + (locale === 'en' ? ' ' : '') + copy.minutes;
  }

  function remainingTime(minutes) {
    const parts = [];
    for (const [unit, size] of [['day', 1440], ['hour', 60], ['minute', 1]]) {
      const count = Math.floor(minutes / size);
      if (count) parts.push(new Intl.NumberFormat(locale, {style: 'unit', unit, unitDisplay: 'short'}).format(count));
      minutes %= size;
    }
    return parts.join(' ');
  }

  function mountControls() {
    for (const { key, icon, initial } of segments) {
      const row = document.createElement('div');
      row.className = 'duration ' + key;
      row.innerHTML =
        '<label class="duration-label" for="' + key + '">' +
          '<span class="duration-icon"><svg class="ic" aria-hidden="true"><use href="#i-' + icon + '"/></svg></span>' +
          '<span data-text="' + key + '"></span></label>' +
        '<div class="stepper"><button data-step="-5" type="button">−</button>' +
          '<span class="duration-value"><input type="number" inputmode="numeric" id="' + key + '" min="0" max="240" step="1" required value="' + initial + '">' +
          '<span class="unit" data-text="minutes"></span></span>' +
          '<button data-step="5" type="button">+</button></div>' +
          '<p id="' + key + '-error" class="field-error" data-text="durationRange" role="alert" hidden></p>';
      el('durations').append(row);
      for (const button of row.querySelectorAll('[data-step]')) {
        button.addEventListener('click', () => {
          const input = el(key);
          const current = Number.isFinite(input.valueAsNumber) ? Math.round(input.valueAsNumber) : 0;
          input.value = Math.min(240, Math.max(0, current + Number(button.dataset.step)));
          updateDraft();
        });
      }
    }
    for (const key of stops) {
      const li = document.createElement('li');
      li.id = 'stop-' + key;
      li.innerHTML = '<i class="stop-dot" aria-hidden="true"></i><span class="stop-label" data-text="' +
        key + '"></span><b class="stop-time">--:--</b><span class="stop-offset"></span>';
      el('stops').append(li);
    }
  }

  function resetSettings() {
    el('target').value = '10:00';
    dateInput.value = localDay(new Date().getHours() >= 10 ? 1 : 0);
    for (const {key, initial} of segments) el(key).value = initial;
  }

  function setLocale(value) {
    locale = Object.hasOwn(NagalCopy, value) ? value : 'ko';
    copy = NagalCopy[locale];
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale;
    document.title = copy.pageTitle;
    document.querySelector('meta[name="description"]').content = copy.description;
    el('language').value = locale;
    el('language').setAttribute('aria-label', copy.lang);
    el('close-copy').setAttribute('aria-label', copy.close);
    el('close-calendar').setAttribute('aria-label', copy.close);
    el('close-install').setAttribute('aria-label', copy.close);
    el('event-name').placeholder = copy.appointment;
    dateInput.setAttribute('aria-label', copy.selectedDate);
    document.querySelector('.wordmark').setAttribute('aria-label', copy.appName);
    document.querySelector('.days').setAttribute('aria-label', copy.date);
    for (const node of document.querySelectorAll('[data-text]')) node.textContent = copy[node.dataset.text];
    for (const {key} of segments) {
      for (const button of el(key).closest('.stepper').querySelectorAll('button')) {
        const direction = Number(button.dataset.step) > 0 ? copy.increment : copy.decrement;
        const label = [copy[key], direction, '(' + durationText(5) + ')'].join(' ');
        button.setAttribute('aria-label', label);
        button.title = label;
      }
    }
    NagalStudio.render(locale);
    refresh();
  }

  function formValues() {
    const input = {date: dateInput.value, target: el('target').value};
    for (const {key} of segments) input[key] = el(key).valueAsNumber;
    return input;
  }

  function readPlan() {
    if (!dateInput.valueAsDate || !dateInput.validity.valid || !el('target').validity.valid) return null;
    return NagalPlanner.calculatePlan(formValues());
  }

  function updateDraft() {
    NagalDraft.save(formValues());
    refresh();
  }

  function eventRows(plan) {
    return stops.map(key => {
      const {time, dayOffset} = NagalPlanner.clockParts(plan[key]);
      return { label: copy[key], time, offset: dayOffset < 0 ? copy.earlierDay : '', dayOffset };
    });
  }

  function updateClock(plan) {
    const now = new Date();
    for (const button of dayButtons) {
      button.setAttribute('aria-pressed', String(dateInput.value === localDay(Number(button.dataset.day), now)));
    }
    const line = el('phase-line');
    line.hidden = !plan;
    if (!plan) return;
    // Match the planner's local-clock arithmetic even when the machine's UTC offset changes.
    const today = Date.parse(localDay(0, now) + 'T00:00:00Z');
    const nowMinute = (today - dateInput.valueAsNumber) / 60000 + now.getHours() * 60 + now.getMinutes();
    const {key, minutes} = NagalPlanner.schedulePhase(plan, nowMinute);
    line.dataset.phase = key;
    el('phase-text').textContent = copy[key].replace('{time}', remainingTime(minutes));
  }

  function scheduleClockUpdate() {
    clearTimeout(minuteTimer);
    if (document.hidden) return;
    minuteTimer = setTimeout(() => {
      updateClock(readPlan());
      scheduleClockUpdate();
    }, 60000 - Date.now() % 60000);
  }

  function refresh() {
    const date = dateInput.valueAsDate;
    const plan = readPlan();
    const rows = plan ? eventRows(plan) : [];
    const includeYear = date && date.getUTCFullYear() !== new Date().getFullYear();
    el('date-label').textContent = date ? formatDay(date, {year: includeYear ? 'numeric' : undefined, month: 'short', day: 'numeric', weekday: 'short'}) : copy.selectedDate;
    for (const input of form.querySelectorAll('input')) {
      const invalid = !input.validity.valid;
      const error = el(input.id + '-error');
      input.setAttribute('aria-invalid', String(invalid));
      if (invalid) input.setAttribute('aria-describedby', error.id);
      else input.removeAttribute('aria-describedby');
      error.hidden = !invalid;
    }
    for (const {key} of segments) {
      const input = el(key);
      const buttons = input.closest('.stepper').querySelectorAll('button');
      buttons[0].disabled = input.valueAsNumber === 0;
      buttons[1].disabled = input.valueAsNumber === 240;
    }
    for (const button of actionButtons) button.disabled = !plan;
    el('depart-time').value = plan ? rows[1].time : '--:--';
    for (const [index, id] of ['mobile-ready', 'mobile-leave'].entries()) {
      const row = rows[index];
      const value = el(id);
      value.querySelector('.summary-offset').textContent = row?.offset ? row.offset + ' ' : '';
      value.querySelector('time').textContent = row?.time ?? '--:--';
    }
    updateClock(plan);
    el('total').textContent = plan ? durationText(plan.total) : '–';
    const previousDay = Boolean(plan && rows[1].dayOffset < 0);
    el('offset-tag').hidden = !previousDay;
    el('offset-tag').textContent = previousDay ? copy.dayBefore : '';
    const departureDate = plan ? new Date(date) : null;
    if (departureDate) departureDate.setUTCDate(departureDate.getUTCDate() + rows[1].dayOffset);
    el('stub-day').textContent = departureDate ? new Intl.NumberFormat(locale).format(departureDate.getUTCDate()) : '–';
    for (const [id, options] of [['stub-month', {month:'short'}], ['stub-weekday',{weekday:'short'}]]) {
      el(id).textContent = departureDate ? formatDay(departureDate, options) : '–';
    }
    stops.forEach((key, index) => {
      const stop = el('stop-' + key);
      stop.querySelector('.stop-time').textContent = plan ? rows[index].time : '--:--';
      stop.querySelector('.stop-offset').textContent = plan ? rows[index].offset : '';
    });
  }

  function appointmentDate() {
    return formatDay(dateInput.valueAsDate, {year:'numeric', month:'short', day:'numeric', weekday:'short'});
  }

  function planText(plan) {
    const rows = eventRows(plan).map(row => [row.label, row.offset, row.time].filter(Boolean).join(' '));
    return [copy.appName + ' · ' + copy.date + ' ' + appointmentDate(), ...rows].join('\n');
  }

  function notify(message) {
    clearTimeout(toastTimer);
    el('toast').textContent = message;
    toastTimer = setTimeout(() => { el('toast').textContent = ''; }, 3200);
  }

  function mountInstall() {
    if (android || !window.isSecureContext || location.protocol === 'file:' || !('serviceWorker' in navigator)) return;
    const button = el('install-app');
    const dialog = el('install-dialog');
    const standalone = matchMedia('(display-mode: standalone)');
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let installPrompt;
    let installed = false;
    const updateButton = () => {
      button.hidden = installed || standalone.matches || navigator.standalone === true;
    };
    const openGuide = fromPrompt => {
      el('install-offer').hidden = !fromPrompt;
      el('install-apple').hidden = !appleMobile;
      el('install-browser').hidden = appleMobile;
      if (!dialog.open) dialog.showModal();
    };
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installPrompt = event;
    });
    window.addEventListener('appinstalled', () => {
      installed = true;
      installPrompt = undefined;
      if (dialog.open) dialog.close();
      updateButton();
    });
    standalone.addEventListener('change', updateButton);
    el('close-install').addEventListener('click', () => dialog.close());
    button.addEventListener('click', async () => {
      const prompt = installPrompt;
      if (!prompt) {
        openGuide(false);
        return;
      }
      installPrompt = undefined;
      button.disabled = true;
      try {
        const choice = await prompt.prompt();
        if (choice?.outcome === 'accepted') {
          installed = true;
          updateButton();
        }
      } catch {
        openGuide(true);
      } finally {
        button.disabled = false;
      }
    });
    updateButton();
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline mode unavailable:', error));
  }

  el('copy').addEventListener('click', async () => {
    const plan = readPlan();
    if (!plan) return;
    const text = planText(plan);
    try {
      if (android) {
        android.copyText(text);
        return;
      }
      await navigator.clipboard.writeText(text);
      notify(copy.copied);
    } catch {
      el('copy-text').value = text;
      el('copy-dialog').showModal();
      el('copy-text').focus();
      el('copy-text').select();
    }
  });
  el('close-copy').addEventListener('click', () => el('copy-dialog').close());
  el('calendar').addEventListener('click', () => {
    const plan = readPlan();
    if (!plan) return;
    el('calendar-date').textContent = appointmentDate() + ' · ' + el('target').value;
    const alarmRows = eventRows(plan).slice(0, 2);
    el('alarm-times').textContent = alarmRows.map(row => [row.label, row.offset, row.time].filter(Boolean).join(' ')).join('  /  ');
    el('alarm-times').hidden = !el('event-alarms').checked;
    el('calendar-dialog').showModal();
  });
  el('close-calendar').addEventListener('click', () => el('calendar-dialog').close());
  el('event-alarms').addEventListener('change', event => { el('alarm-times').hidden = !event.target.checked; });
  el('calendar-form').addEventListener('submit', async event => {
    event.preventDefault();
    const plan = readPlan();
    if (!plan || el('save-calendar').disabled) return;
    const date = dateInput.value;
    const target = el('target').value;
    const title = el('event-name').value.trim() || copy.appointment;
    const options = {date, target, plan, title, description: planText(plan), stamp: new Date(),
      reminders: el('event-alarms').checked, readyLabel: copy.ready, leaveLabel: copy.leave};
    el('save-calendar').disabled = true;
    try {
      // Re-exporting the same named appointment keeps its event identity on HTTPS and file URLs.
      const idBytes = crypto.subtle
        ? new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([date, target, title]))))
        : crypto.getRandomValues(new Uint8Array(16));
      options.uid = Array.from(idBytes, byte => byte.toString(16).padStart(2, '0')).join('') + '@nagalttae.mcroky.github.io';
      const calendar = NagalCalendar.build(options);
      if (android) {
        el('calendar-dialog').close();
        android.exportFile('calendar', calendar);
        return;
      }
      const file = URL.createObjectURL(new Blob([calendar], {type: 'text/calendar;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = file;
      link.download = 'nagalttae-' + date + '.ics';
      try {
        document.body.append(link);
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(file), 60000);
      }
      el('calendar-dialog').close();
      notify(copy.calendarSaved);
    } catch {
      el('calendar-feedback').textContent = copy.calendarError;
    } finally {
      el('save-calendar').disabled = false;
    }
  });
  el('calendar-dialog').addEventListener('close', () => { el('calendar-feedback').textContent = ''; });
  el('share').addEventListener('click', () => {
    const plan = readPlan();
    if (!plan) return;
    const url = new URL('https://x.com/intent/tweet');
    url.searchParams.set('text', planText(plan));
    if (android) {
      url.searchParams.set('url', 'https://mcroky.github.io/nagalttae/');
      android.openExternal(url.href);
      return;
    }
    if (location.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
      url.searchParams.set('url', location.origin + location.pathname);
    }
    window.open(url.href, '_blank', 'noopener,noreferrer');
  });
  el('download').addEventListener('click', async () => {
    const plan = readPlan();
    if (!plan) return;
    try {
      await NagalTicket.download({copy, locale, plan, dateLabel: appointmentDate(),
        filename: 'nagalttae-' + dateInput.value + '.png', rows: eventRows(plan),
        exportPng: android && (base64 => android.exportFile('ticket', base64))});
      if (!android) notify(copy.saved);
    } catch {
      notify(copy.imageError);
    }
  });
  el('reset').addEventListener('click', () => {
    resetSettings();
    el('event-name').value = '';
    el('event-alarms').checked = true;
    NagalDraft.clear();
    refresh();
  });
  for (const button of dayButtons) {
    button.addEventListener('click', () => { dateInput.value = localDay(Number(button.dataset.day)); updateDraft(); });
  }
  form.addEventListener('input', updateDraft);
  form.addEventListener('change', updateDraft);
  form.addEventListener('submit', event => event.preventDefault());
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
    scheduleClockUpdate();
  });
  el('language').addEventListener('change', event => {
    setLocale(event.target.value);
    try { localStorage.setItem(storageKey, locale); } catch { /* Private browsing can disable storage. */ }
  });
  mountControls();
  resetSettings();
  const draft = NagalDraft.load();
  if (draft) {
    for (const key of ['date', 'target', ...segments.map(segment => segment.key)]) el(key).value = draft[key];
  }
  try { locale = localStorage.getItem(storageKey) || 'ko'; } catch { /* Use Korean when storage is unavailable. */ }
  setLocale(locale);
  mountInstall();
  window.NagalMobile?.mount({plan: readPlan, date: () => dateInput.value, dateLabel: appointmentDate,
    rows: eventRows, strings: () => copy, language: () => locale, notify});
  scheduleClockUpdate();
})();
