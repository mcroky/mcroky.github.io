export const grace = 5 * 60_000;
export const horizon = 30 * 86_400_000;

export function validSubscription(value) {
  if (typeof value?.endpoint !== 'string' || value.endpoint.length > 2048) return false;
  const { auth, p256dh } = value.keys || {};
  if (!/^[\w-]{22}$/.test(auth || '') || !/^B[\w-]{86}$/.test(p256dh || '')) return false;
  let url;
  try { url = new URL(value.endpoint); } catch { return false; }
  const host = url.hostname;
  const trusted = host === 'fcm.googleapis.com' || host === 'push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' ||
    host.endsWith('.notify.windows.com');
  return trusted && url.protocol === 'https:' && !url.port && !url.username && !url.password &&
    !url.hash && url.pathname.length > 1;
}

export function snapshot(plan) {
  if (!plan) return null;
  const { revision, ready, leave, events } = plan;
  return { revision, ready, leave, events: events.map(({ kind, at }) => ({ kind, at })) };
}

// A device has one active outing. A stale tab cannot replace a newer outing.
export function change(current, action, input, now, revision, expectedRevision = current?.revision ?? null) {
  if (action === 'status') return { status: 200, plan: current };
  if (action === 'schedule') {
    const { ready, leave, locale } = input;
    if (![ready, leave].every(Number.isSafeInteger) || leave < ready || leave - ready > 2 * 86400_000 ||
        !['ko', 'en', 'ja', 'zh'].includes(locale)) return { status: 400, plan: current };
    if (leave <= now || leave > now + horizon) return { status: 422, plan: current };
    if (current && current.ready === ready && current.leave === leave && current.locale === locale) {
      return { status: 200, plan: current };
    }
  }
  if (input.expected !== expectedRevision) return { status: 409, plan: current };
  if (action === 'cancel') return { status: 200, plan: null };
  const { ready, leave, locale, subscription } = input;
  const events = ready === leave ? [{ kind: 'both', at: leave }] :
    [{ kind: 'ready', at: ready }, { kind: 'leave', at: leave }];
  return { status: 200, plan: { revision, ready, leave, locale, subscription,
    events: events.filter(event => event.at > now).map(event => ({ ...event, next: event.at })) } };
}

// Return the new pending queue after one attempt. The other reminder keeps its own due time.
export function afterAttempt(plan, event, status, now) {
  if (status === 404 || status === 410) return null;
  const retry = (status === 408 || status === 429 || status >= 500) && now + 15_000 < event.at + grace;
  const remaining = plan.events.filter(other => other !== event);
  if (retry) remaining.push({ ...event, next: now + 15_000 });
  remaining.sort((a, b) => a.next - b.next);
  return remaining.length ? { ...plan, events: remaining } : null;
}
