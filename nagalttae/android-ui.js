(() => {
  'use strict';

  const bridge = window.NagalAndroid;
  if (!bridge) return;
  document.documentElement.dataset.channel = 'android';

  const el = id => document.getElementById(id);
  const kinds = ['ready', 'leave'];
  const messages = {
    set: 'alarmSet', cleared: 'alarmCleared', past: 'alarmPast', selection: 'alarmSelect',
    invalidTime: 'alarmInvalidTime', notificationsOff: 'alarmNotificationsOff',
    exactOff: 'alarmExactOff', failure: 'alarmFailure', pending: 'alarmPending'
  };

  function mount({ plan, date, dateLabel, rows, strings, language, notify }) {
    const dialog = el('alarm-dialog');
    const selected = kind => el('alarm-' + kind);
    let state;
    let code = '';
    let request = '';
    let statusTimer;

    function selectedMinuteIsPast(appointmentDay, minutes) {
      const clock = NagalPlanner.clockParts(minutes);
      const day = new Date(appointmentDay + 'T00:00:00Z');
      day.setUTCDate(day.getUTCDate() + clock.dayOffset);
      return new Date(day.toISOString().slice(0, 10) + 'T' + clock.time).getTime() <= Date.now();
    }

    function render(chooseDefaults = false) {
      const copy = strings();
      const current = plan();
      const schedule = current ? rows(current) : [];
      el('close-alarm').setAttribute('aria-label', copy.close);
      el('alarm-date').textContent = current ? dateLabel() : '';
      kinds.forEach((kind, index) => {
        const row = schedule[index];
        el('alarm-' + kind + '-time').textContent = row
          ? [row.offset, row.time].filter(Boolean).join(' ') : '--:--';
        const box = selected(kind);
        box.disabled = !current || selectedMinuteIsPast(date(), current[kind]);
        if (box.disabled) box.checked = false;
        else if (chooseDefaults) box.checked = true;
      });

      const active = state?.active ?? [];
      el('active-alarms').replaceChildren(...active.map(alarm => {
        const label = { ready: copy.alarmReady, leave: copy.alarmLeave, both: copy.alarmBoth }[alarm.kind];
        const item = document.createElement('li');
        const time = new Intl.DateTimeFormat(language(), {dateStyle: 'medium', timeStyle: 'short'}).format(alarm.at);
        item.textContent = label + ' · ' + time;
        return item;
      }));
      el('alarm-empty').hidden = active.length > 0;
      el('alarm-cancel').hidden = active.length === 0;
      el('alarm-cancel').disabled = Boolean(request);

      const missing = state && (!state.notifications ? 'notificationsOff' : !state.exact ? 'exactOff' : '');
      const unavailable = current && kinds.every(kind => selected(kind).disabled);
      const status = code || missing || (unavailable ? 'past' : '');
      el('alarm-feedback').textContent = copy[messages[status]] ?? (active.length ? copy.alarmReplace : '');
      el('alarm-permission').hidden = !missing;
      el('alarm-permission').disabled = Boolean(request);
      el('alarm-save').disabled = Boolean(request || !state || missing ||
        !kinds.some(kind => selected(kind).checked));
    }

    window.addEventListener('nagal-android', event => {
      state = event.detail;
      // A resume/status event can arrive before the response to a queued mutation.
      if (state.code !== 'status' || request === 'permissions') request = '';
      if (state.code !== 'status') code = state.code;
      else if (code === 'pending' && !request) code = '';
      if (code === 'set' && state.active.length === 0) code = '';
      if (dialog.open) render();
    });
    window.addEventListener('nagal-android-export', event => {
      const {kind, code} = event.detail;
      if (code === 'cancelled') return;
      const success = {calendar: 'androidCalendarSaved', ticket: 'androidTicketSaved', copy: 'copied'};
      const failure = {calendar: 'calendarError', ticket: 'imageError', copy: 'manualCopy', share: 'shareFallback'};
      const key = (code === 'saved' ? success : failure)[kind];
      if (key) notify(strings()[key]);
    });

    el('alarms').hidden = false;
    el('alarms').addEventListener('click', () => {
      code = '';
      render(true);
      dialog.showModal();
      bridge.status();
      statusTimer = window.setInterval(() => {
        if (!document.hidden && !request) bridge.status();
      }, 15000);
    });
    dialog.addEventListener('close', () => window.clearInterval(statusTimer));
    el('close-alarm').addEventListener('click', () => dialog.close());
    for (const kind of kinds) selected(kind).addEventListener('change', () => {
      code = '';
      render();
    });
    el('alarm-permission').addEventListener('click', () => {
      request = 'permissions';
      code = 'pending';
      render();
      bridge.permissions();
    });
    el('alarm-cancel').addEventListener('click', () => {
      request = 'cancel';
      code = '';
      render();
      bridge.cancel();
    });
    el('alarm-form').addEventListener('submit', event => {
      event.preventDefault();
      const current = plan();
      if (!current || el('alarm-save').disabled) return;
      request = 'schedule';
      code = '';
      render();
      bridge.schedule(JSON.stringify({ date: date(), locale: language(),
        ready: selected('ready').checked ? current.ready : null,
        leave: selected('leave').checked ? current.leave : null }));
    });
    bridge.status();
  }

  window.NagalMobile = { mount };
})();
