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
  const timeInput = el('target');
  const timeDialog = el('time-dialog');
  const savedDetails = el('saved-plans-details');
  const form = el('settings-form');
  const dayButtons = [...document.querySelectorAll('[data-day]')];
  const actionButtons = [...document.querySelectorAll('.actions button:not(#alarms), #clock-quick button')];
  const calendarDownload = el('calendar-download');
  const calendarOptions = el('calendar');
  const calendarSubmit = el('save-calendar');
  const calendarDialog = el('calendar-dialog');
  const calendarButtons = [calendarDownload, calendarOptions];
  const android = window.NagalAndroid;
  const storageKey = 'nagalttae.language';
  let locale = 'ko';
  let copy;
  let timeFormat;
  let toastTimer;
  let minuteTimer;
  let calendarSaving = false;
  let refreshPush;
  let busBoard;
  let timetable;
  let savedPlans = null;
  let savedBusy = false;
  let editingPlan = null;
  let beforeEditing = null;
  let savedNotice = '';
  let savedRead = 0;

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
    timeFormat = new Intl.DateTimeFormat(locale, {hour: 'numeric', minute: '2-digit', timeZone: 'UTC'});
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale;
    document.title = copy.pageTitle;
    document.querySelector('meta[name="description"]').content = copy.description;
    el('language').value = locale;
    el('language').setAttribute('aria-label', copy.lang);
    el('close-copy').setAttribute('aria-label', copy.close);
    el('close-calendar').setAttribute('aria-label', copy.close);
    el('close-install').setAttribute('aria-label', copy.close);
    el('close-clock').setAttribute('aria-label', copy.close);
    el('close-time').setAttribute('aria-label', copy.close);
    el('close-reminders').setAttribute('aria-label', copy.close);
    el('event-name').placeholder = copy.appointment;
    dateInput.setAttribute('aria-label', copy.selectedDate);
    document.querySelector('.wordmark').setAttribute('aria-label', copy.appName);
    document.querySelector('.days').setAttribute('aria-label', copy.date);
    document.querySelector('.settings').setAttribute('aria-label', copy.settings);
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
    busBoard?.render();
    timetable?.render();
    refresh();
    renderSavedList();
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

  function applyFormValues(values) {
    for (const key of ['date', 'target', ...segments.map(segment => segment.key)]) {
      el(key).value = Number.isNaN(values[key]) ? '' : values[key];
    }
  }

  function refreshSavedButtons(plan = readPlan()) {
    const save = el('saved-plan-save');
    save.textContent = copy[editingPlan ? 'updatePlan' : 'savePlan'];
    save.disabled = savedBusy || !plan;
    el('saved-plan-discard').hidden = !editingPlan;
    el('saved-plan-discard').disabled = savedBusy;
  }

  function renderSavedList() {
    const list = el('saved-plans-list');
    list.replaceChildren();
    el('saved-plans-empty').hidden = savedPlans?.length !== 0;
    el('saved-plans-status').textContent = savedNotice ? copy[savedNotice] : '';
    for (const record of savedPlans ?? []) {
      const row = document.createElement('li');
      const label = document.createElement('span');
      const date = new Date(record.plan.date + 'T00:00:00Z');
      label.textContent = formatDay(date, {year: 'numeric', month: 'short', day: 'numeric'}) + ' · ' + record.plan.target;
      const durations = document.createElement('small');
      durations.className = 'saved-plan-durations';
      durations.textContent = segments.map(({key}) => copy[key] + ' ' + durationText(record.plan[key])).join(' · ');
      label.append(durations);
      const actions = document.createElement('div');
      actions.className = 'saved-plan-actions';
      for (const [key, action] of [
        ['editPlan', () => editSavedPlan(record)],
        ['deletePlan', () => { if (window.confirm(copy.confirmDeletePlan)) updateSavedPlan(record); }]
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = copy[key];
        button.disabled = savedBusy;
        button.addEventListener('click', action);
        actions.append(button);
      }
      if (editingPlan?.id === record.id) row.classList.add('editing-plan');
      row.append(label, actions);
      list.append(row);
    }
  }

  function editSavedPlan(record) {
    if (!editingPlan) beforeEditing = formValues();
    editingPlan = record;
    savedNotice = '';
    applyFormValues(record.plan);
    updateDraft();
    renderSavedList();
    el('time-open').focus();
  }

  function endSavedEdit() {
    editingPlan = null;
    beforeEditing = null;
  }

  async function updateSavedPlan(remove = null) {
    if (savedBusy || (!remove && !readPlan())) return;
    const snapshot = formValues();
    const previous = editingPlan;
    savedRead++;
    savedBusy = true;
    refreshSavedButtons();
    renderSavedList();
    try {
      const stored = remove ? await NagalSavedPlans.remove(remove) : await NagalSavedPlans.save(snapshot, previous);
      savedNotice = stored ? (remove ? 'planDeleted' : 'planSaved') : 'savedPlanConflict';
      if (!remove || editingPlan?.id === remove.id) endSavedEdit();
      savedDetails.hidden = false;
      savedDetails.open = true;
      savedPlans = await NagalSavedPlans.list();
    } catch {
      savedNotice = 'savedPlanUnavailable';
    } finally {
      savedBusy = false;
      refreshSavedButtons();
      renderSavedList();
    }
  }

  async function loadSavedPlans() {
    if (savedBusy) return;
    const read = ++savedRead;
    try {
      const plans = await NagalSavedPlans.list();
      if (read !== savedRead) return;
      savedPlans = plans;
      if (savedNotice === 'savedPlanUnavailable') savedNotice = '';
    } catch {
      if (read !== savedRead) return;
      savedNotice = 'savedPlanUnavailable';
    }
    renderSavedList();
  }

  function eventRows(plan) {
    return stops.map(key => {
      const {time, dayOffset} = NagalPlanner.clockParts(plan[key]);
      return { label: copy[key], time, offset: dayOffset < 0 ? copy.earlierDay : '', dayOffset };
    });
  }

  function displayTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value ?? '')) return '--:--';
    const [hour, minute] = value.split(':').map(Number);
    return timeFormat.format(Date.UTC(2000, 0, 1, hour, minute));
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
      busBoard?.updateTimes();
      timetable?.updateTimes();
      scheduleClockUpdate();
    }, 60000 - Date.now() % 60000);
  }

  function refresh() {
    const date = dateInput.valueAsDate;
    const plan = readPlan();
    refreshSavedButtons(plan);
    refreshPush?.();
    const rows = plan ? eventRows(plan) : [];
    const includeYear = date && date.getUTCFullYear() !== new Date().getFullYear();
    const relativeDay = dateInput.value === localDay(0) ? copy.today : dateInput.value === localDay(1) ? copy.tomorrow : '';
    el('date-label').textContent = date ? [relativeDay, formatDay(date,
      {year: includeYear ? 'numeric' : undefined, month: 'short', day: 'numeric', weekday: 'short'})].filter(Boolean).join(' · ') : copy.selectedDate;
    el('time-label').textContent = displayTime(timeInput.value);
    el('duration-summary').textContent = segments.map(({key}) => {
      const value = el(key).valueAsNumber;
      return copy[key + 'Brief'] + ' ' + (el(key).validity.valid ? durationText(value) : '—');
    }).join(' · ');
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
    for (const button of actionButtons) button.disabled = !plan || (calendarSaving && calendarButtons.includes(button));
    el('depart-time').value = displayTime(rows[1]?.time);
    el('ready-time').textContent = [rows[0]?.offset, displayTime(rows[0]?.time)].filter(Boolean).join(' ');
    updateClock(plan);
    el('total').textContent = plan ? durationText(plan.total) : '–';
    const previousDay = Boolean(plan && rows[1].dayOffset < 0);
    el('offset-tag').hidden = !previousDay;
    el('offset-tag').textContent = previousDay ? copy.dayBefore : '';
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

  function isAppleMobile() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function mountInstall() {
    if (android || !window.isSecureContext || location.protocol === 'file:' || !('serviceWorker' in navigator)) return;
    const button = el('install-app');
    const refresh = el('refresh-app');
    const invite = el('push-install');
    const inviteButton = el('push-install-button');
    const dialog = el('install-dialog');
    const standalone = matchMedia('(display-mode: standalone)');
    const appleMobile = isAppleMobile();
    let installPrompt;
    let installed = false;
    const updateButton = () => {
      refresh.hidden = !(standalone.matches || navigator.standalone === true);
      button.hidden = installed || !refresh.hidden;
      invite.hidden = button.hidden;
      if (button.hidden && dialog.open) dialog.close();
      el('push-install-browser').hidden = appleMobile;
      el('push-install-apple').hidden = !appleMobile;
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
    const install = async () => {
      if (button.disabled) return;
      const prompt = installPrompt;
      if (!prompt) {
        openGuide(false);
        return;
      }
      installPrompt = undefined;
      button.disabled = inviteButton.disabled = true;
      try {
        const choice = await prompt.prompt();
        if (choice?.outcome === 'accepted') {
          installed = true;
          updateButton();
        }
      } catch {
        if (!button.hidden) openGuide(true);
      } finally {
        button.disabled = inviteButton.disabled = false;
      }
    };
    button.addEventListener('click', install);
    inviteButton.addEventListener('click', install);
    refresh.addEventListener('click', () => location.reload());
    updateButton();

    const workers = navigator.serviceWorker;
    const reloading = performance.getEntriesByType('navigation')[0]?.type === 'reload';
    if (reloading) {
      const checkVersion = () => workers.controller?.postMessage('nagal-shell-version');
      workers.addEventListener('controllerchange', checkVersion);
      workers.addEventListener('message', event => {
        if (event.source === workers.controller && event.data?.type === 'nagal-shell-version' &&
            `v${event.data.version}` !== el('app-version').textContent) location.reload();
      });
      checkVersion();
    }
    workers.register('./sw.js').then(registration => {
      if (reloading && registration.active) return registration.update();
    }).catch(error => {
      if (!workers.controller) console.warn('Offline mode unavailable:', error);
    });
  }

  function mountClockTransfer() {
    if (android && typeof android.openClock !== 'function') return;
    const kinds = ['ready', 'leave'];
    const dialog = el('clock-dialog');
    const button = el('clock-transfer');
    const feedback = el('clock-feedback');
    const apple = isAppleMobile();
    const openButton = el('open-clock-app');
    let displayedSchedule;
    let copyRequest = 0;

    function openClock() {
      if (android) {
        android.openClock();
      } else if (apple) {
        // Availability of the Clock link depends on the iOS version and browser.
        location.href = 'clock-alarm://';
      }
    }

    function showSchedule() {
      const plan = readPlan();
      if (!plan) return false;
      const schedule = [dateInput.value, plan.ready, plan.leave].join('|');
      for (const kind of kinds) {
        const {time, dayOffset} = NagalPlanner.clockParts(plan[kind]);
        const day = dateInput.valueAsDate;
        day.setUTCDate(day.getUTCDate() + dayOffset);
        el('clock-' + kind + '-day').textContent = formatDay(day,
          {year: 'numeric', month: 'short', day: 'numeric', weekday: 'short'});
        el('clock-' + kind + '-time').value = time;
        if (displayedSchedule !== schedule) el('clock-' + kind + '-done').checked = false;
      }
      displayedSchedule = schedule;
      copyRequest += 1;
      feedback.textContent = '';
      dialog.showModal();
      return true;
    }

    function copyTime(kind) {
      const field = el('clock-' + kind + '-time');
      const time = field.value;
      const request = ++copyRequest;
      feedback.textContent = copy.clockOpenGuide.replace('{time}', time);
      const copyUnavailable = () => {
        if (!dialog.open || request !== copyRequest) return;
        field.focus();
        field.setSelectionRange(0, time.length);
        feedback.textContent = copy.clockManualCopy;
      };
      if (android) {
        android.copyText(time);
      } else {
        try {
          navigator.clipboard.writeText(time).then(() => {
            if (dialog.open && request === copyRequest) {
              feedback.textContent = copy.clockTimeCopied.replace('{time}', time);
            }
          }, copyUnavailable);
        } catch {
          copyUnavailable();
        }
      }
      // Launch while the browser is still processing the user's tap.
      openClock();
    }

    button.hidden = false;
    el('clock-quick').hidden = false;
    openButton.hidden = !(android || apple);
    el('clock-open-fallback').hidden = openButton.hidden;
    openButton.addEventListener('click', () => {
      if (!feedback.textContent) feedback.textContent = copy.clockOpenTried;
      openClock();
    });
    button.addEventListener('click', showSchedule);
    for (const kind of kinds) {
      el('clock-' + kind + '-copy').addEventListener('click', () => copyTime(kind));
      el('clock-quick-' + kind).addEventListener('click', () => {
        if (showSchedule()) copyTime(kind);
      });
    }
    el('close-clock').addEventListener('click', () => dialog.close());
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
  async function saveCalendar(fromDialog) {
    const plan = readPlan();
    if (!plan || calendarSaving) return;
    const date = dateInput.value;
    const target = el('target').value;
    const title = (fromDialog ? el('event-name').value.trim() : '') || copy.appointment;
    const options = {date, target, plan, title, description: planText(plan), stamp: new Date(),
      reminders: !fromDialog || el('event-alarms').checked, readyLabel: copy.ready, leaveLabel: copy.leave};
    calendarSaving = true;
    for (const button of calendarButtons) button.disabled = true;
    calendarSubmit.disabled = true;
    try {
      // Re-exporting the same named appointment keeps its event identity on HTTPS and file URLs.
      const idBytes = crypto.subtle
        ? new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([date, target, title]))))
        : crypto.getRandomValues(new Uint8Array(16));
      options.uid = Array.from(idBytes, byte => byte.toString(16).padStart(2, '0')).join('') + '@nagalttae.mcroky.github.io';
      const calendar = NagalCalendar.build(options);
      if (android) {
        calendarDialog.close();
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
      if (fromDialog) calendarDialog.close();
      notify(copy.calendarSaved);
    } catch {
      if (fromDialog && calendarDialog.open) el('calendar-feedback').textContent = copy.calendarError;
      else notify(copy.calendarError);
    } finally {
      calendarSaving = false;
      const hasPlan = Boolean(readPlan());
      for (const button of calendarButtons) button.disabled = !hasPlan;
      calendarSubmit.disabled = false;
    }
  }

  calendarDownload.hidden = Boolean(android);
  calendarDownload.addEventListener('click', () => saveCalendar(false));
  calendarOptions.addEventListener('click', () => {
    const plan = readPlan();
    if (!plan || calendarSaving) return;
    el('calendar-date').textContent = appointmentDate() + ' · ' + el('target').value;
    const alarmRows = eventRows(plan).slice(0, 2);
    el('alarm-times').textContent = alarmRows.map(row => [row.label, row.offset, row.time].filter(Boolean).join(' ')).join('  /  ');
    el('alarm-times').hidden = !el('event-alarms').checked;
    calendarDialog.showModal();
  });
  el('close-calendar').addEventListener('click', () => calendarDialog.close());
  el('event-alarms').addEventListener('change', event => { el('alarm-times').hidden = !event.target.checked; });
  el('calendar-form').addEventListener('submit', event => {
    event.preventDefault();
    saveCalendar(true);
  });
  calendarDialog.addEventListener('close', () => { el('calendar-feedback').textContent = ''; });
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
    endSavedEdit();
    resetSettings();
    el('event-name').value = '';
    el('event-alarms').checked = true;
    NagalDraft.clear();
    refresh();
    renderSavedList();
  });
  el('saved-plan-save').addEventListener('click', () => updateSavedPlan());
  el('saved-plan-discard').addEventListener('click', () => {
    if (beforeEditing) applyFormValues(beforeEditing);
    endSavedEdit();
    updateDraft();
    renderSavedList();
  });
  const savedOpen = el('saved-plans-open');
  savedOpen.addEventListener('click', () => {
    if (savedDetails.open) savedDetails.open = false;
    else {
      savedDetails.hidden = false;
      savedDetails.open = true;
      savedDetails.querySelector('summary').focus();
    }
  });
  savedDetails.addEventListener('toggle', () => {
    savedOpen.setAttribute('aria-expanded', String(savedDetails.open));
    if (savedDetails.open) loadSavedPlans();
    else {
      if (savedDetails.contains(document.activeElement)) savedOpen.focus();
      savedDetails.hidden = true;
    }
  });
  el('time-open').addEventListener('click', () => {
    timeDialog.showModal();
    if (!isAppleMobile()) {
      try { timeInput.showPicker?.(); } catch { /* The time field can still be edited. */ }
    }
  });
  el('close-time').addEventListener('click', () => timeDialog.close());
  el('done-time').addEventListener('click', () => {
    if (timeInput.reportValidity()) timeDialog.close();
  });
  const reminderDialog = el('reminders-dialog');
  const remindersOpen = el('reminders-open');
  remindersOpen.addEventListener('click', () => {
    refreshPush?.();
    reminderDialog.showModal();
  });
  el('close-reminders').addEventListener('click', () => reminderDialog.close());
  for (const button of dayButtons) {
    button.addEventListener('click', () => { dateInput.value = localDay(Number(button.dataset.day)); updateDraft(); });
  }
  form.addEventListener('input', updateDraft);
  form.addEventListener('change', updateDraft);
  form.addEventListener('submit', event => event.preventDefault());
  window.addEventListener('focus', () => {
    refresh();
    if (el('saved-plans-details').open) loadSavedPlans();
  });
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
  if (draft) applyFormValues(draft);
  try { locale = localStorage.getItem(storageKey) || 'ko'; } catch { /* Use Korean when storage is unavailable. */ }
  setLocale(locale);
  mountInstall();
  const push = !android && window.NagalPush?.mount({ plan: readPlan, date: () => dateInput.value, language: () => locale });
  refreshPush = push?.render;
  remindersOpen.hidden = !push;
  const nearby = el('nearby-details');
  function showNearby() {
    if (!nearby.open) return;
    nearby.removeEventListener('toggle', showNearby);
    const transitOptions = { language: () => locale };
    timetable = window.NagalTimetable?.mount(transitOptions);
    busBoard = window.NagalTransit?.mount({ ...transitOptions, onPosition: timetable?.receivePosition });
  }
  nearby.addEventListener('toggle', showNearby);
  showNearby();
  mountClockTransfer();
  window.NagalMobile?.mount({plan: readPlan, date: () => dateInput.value, dateLabel: appointmentDate,
    rows: eventRows, strings: () => copy, language: () => locale, notify});
  scheduleClockUpdate();
})();
