(function () {
  'use strict';

  const crlf = '\r\n';
  const utf8 = new TextEncoder();

  function escapeText(text) {
    if (typeof text !== 'string') throw new TypeError('Expected calendar text');
    return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
      .replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  function foldLine(line) {
    const parts = [];
    let part = '';
    let bytes = 0;
    for (const character of line) {
      const size = utf8.encode(character).length;
      if (bytes + size > 75) {
        parts.push(part);
        part = ' ';
        bytes = 1;
      }
      part += character;
      bytes += size;
    }
    parts.push(part);
    return parts.join(crlf);
  }

  function displayAlarm(leadMinutes, label) {
    return ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escapeText(label),
      'TRIGGER:' + (leadMinutes === 0 ? 'PT0M' : '-PT' + leadMinutes + 'M'), 'END:VALARM'];
  }

  function build({ date, target, plan, title, description, reminders, readyLabel, leaveLabel, uid, stamp }) {
    const day = new Date(date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) ||
        day.toISOString().slice(0, 10) !== date || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(target)) {
      throw new RangeError('Invalid appointment date or time');
    }
    const targetMinutes = Number(target.slice(0, 2)) * 60 + Number(target.slice(3));
    if (!plan || plan.target !== targetMinutes || !Number.isSafeInteger(plan.ready) ||
        !Number.isSafeInteger(plan.leave) || plan.ready > plan.leave || plan.leave > targetMinutes) {
      throw new RangeError('Inconsistent appointment plan');
    }
    const uniqueId = escapeText(uid);
    if (!uniqueId.trim()) throw new TypeError('Expected nonempty calendar UID');
    const stampText = stamp.toISOString();
    if (!/^\d{4}-/.test(stampText)) throw new RangeError('Invalid calendar timestamp year');

    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roky Studio//Nagalttae//EN',
      'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:' + uniqueId,
      'DTSTAMP:' + stampText.slice(0, 19).replace(/[-:]/g, '') + 'Z',
      'DTSTART:' + date.replace(/-/g, '') + 'T' + target.replace(':', '') + '00',
      'SUMMARY:' + escapeText(title), 'DESCRIPTION:' + escapeText(description)];

    if (reminders) {
      const readyLead = targetMinutes - plan.ready;
      const leaveLead = targetMinutes - plan.leave;
      if (readyLead !== leaveLead) lines.push(...displayAlarm(readyLead, readyLabel));
      const label = readyLead === leaveLead ? readyLabel + ' · ' + leaveLabel : leaveLabel;
      lines.push(...displayAlarm(leaveLead, label));
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(foldLine).join(crlf) + crlf;
  }

  const api = { build };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.NagalCalendar = api;
})();
