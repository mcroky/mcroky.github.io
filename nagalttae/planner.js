(function () {
  'use strict';

  const minutesPerDay = 24 * 60;
  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

  function validDuration(value) {
    return Number.isInteger(value) && value >= 0 && value <= 240;
  }

  function calculatePlan(input) {
    if (!input || typeof input !== 'object') return null;
    const { target, prep, travel, buffer } = input;
    if (typeof target !== 'string' || ![prep, travel, buffer].every(validDuration)) return null;
    const match = timePattern.exec(target);
    if (!match) return null;

    const targetMinutes = Number(match[1]) * 60 + Number(match[2]);
    const arrive = targetMinutes - buffer;
    const leave = arrive - travel;
    const ready = leave - prep;
    return { target: targetMinutes, ready, leave, arrive, total: prep + travel + buffer };
  }

  function clockParts(minutes) {
    if (!Number.isSafeInteger(minutes)) return null;
    const dayOffset = Math.floor(minutes / minutesPerDay) || 0;
    const local = minutes - dayOffset * minutesPerDay;
    const hours = String(Math.floor(local / 60)).padStart(2, '0');
    const mins = String(local % 60).padStart(2, '0');
    return { time: hours + ':' + mins, dayOffset };
  }

  function schedulePhase(plan, nowMinute) {
    if (!plan || !Number.isSafeInteger(nowMinute)) return null;
    const { ready, leave, target } = plan;
    if (nowMinute < ready) return { key: 'beforeReady', minutes: ready - nowMinute };
    if (nowMinute < leave) return { key: 'beforeLeave', minutes: leave - nowMinute };
    if (nowMinute === leave) return { key: 'leaveNow', minutes: 0 };
    if (nowMinute < target) return { key: 'beforeAppointment', minutes: target - nowMinute };
    if (nowMinute === target) return { key: 'appointmentNow', minutes: 0 };
    return { key: 'afterAppointment', minutes: nowMinute - target };
  }

  const api = { calculatePlan, clockParts, schedulePhase };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.NagalPlanner = api;
})();
