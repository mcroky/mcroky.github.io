import { DurableObject } from 'cloudflare:workers';
import { busResponse } from './anseong.js';
import { railArrivalsResponse } from './rail-arrivals.js';
import { seoulResponse } from './seoul.js';
import { tagoResponse } from './tago.js';
import { generateVAPIDKeys, generateRequestDetails, getVapidHeaders } from 'web-push';
import { afterAttempt, change, grace, horizon, snapshot, validSubscription } from './schedule.js';

function identity(env) { return env.SIGNER.getByName('nagalttae-web-push-v1'); }

const applePushOrigin = 'https://web.push.apple.com';
const vapidSubject = 'https://mcroky.github.io/nagalttae/';
const hour = 60 * 60;

function logReminder(record, env, ctx) {
  try { console.log(record); } catch { /* Logging cannot interrupt a reservation or delivery. */ }
  try {
    const archive = env.SIGNER.getByName('nagalttae-reminder-audit-v1');
    ctx.waitUntil(archive.appendReminder(Date.now(), record).catch(() => console.warn('reminder_archive_write_failed')));
  } catch { console.warn('reminder_archive_write_failed'); }
}

const applePushReasons = new Set([
  'BadTtl', 'BadUrgency', 'BadWebPushRequest', 'BadWebPushTopic', 'VapidPkHashMismatch',
  'IdleTimeout', 'BadAuthorizationHeader', 'BadJwtToken', 'BadVapidPublicKey', 'BadPath', 'BadDeviceToken',
  'MethodNotAllowed', 'PayloadTooLarge', 'TooManyRequests', 'InternalServerError', 'ServiceUnavailable', 'Shutdown'
]);

async function logAppleRejection(response, reminder, env, ctx) {
  let reason = null;
  let reasonStatus = 'missing_or_invalid';
  try {
    const body = await readInput(response);
    if (typeof body?.reason === 'string') {
      if (applePushReasons.has(body.reason)) {
        reason = body.reason;
        reasonStatus = 'recorded';
      } else {
        reasonStatus = 'unrecognized';
      }
    }
  } catch {
    reasonStatus = 'unreadable';
  }
  logReminder({ event: 'reminder_apple_rejection', ...reminder, reason, reasonStatus }, env, ctx);
}

export class PushIdentity extends DurableObject {
  reminderTable() {
    const sql = this.ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, record TEXT NOT NULL)');
    return sql;
  }

  async appendReminder(at, record) {
    const sql = this.reminderTable();
    this.ctx.storage.transactionSync(() => {
      sql.exec('INSERT INTO reminders(at,record) VALUES (?,?)', at, JSON.stringify(record));
      sql.exec('DELETE FROM reminders WHERE id <= last_insert_rowid() - 10000');
    });
  }

  async reminderPage(from, offset) {
    return this.reminderTable().exec('SELECT at,record FROM reminders WHERE at >= ? AND at < ? ORDER BY at DESC,id DESC LIMIT 101 OFFSET ?',
      from, from + 86400_000, offset).toArray().map(({ at, record }) => ({ timestamp: at, source: JSON.parse(record) }));
  }

  async keys() {
    return this.ctx.blockConcurrencyWhile(async () => {
      let keys = await this.ctx.storage.get('keys');
      if (!keys) {
        keys = generateVAPIDKeys();
        await this.ctx.storage.put('keys', keys);
      }
      return keys;
    });
  }

  async appleAuthorization() {
    const keys = await this.keys();
    return this.ctx.blockConcurrencyWhile(async () => {
      const cached = await this.ctx.storage.get('appleAuthorization');
      const now = Math.floor(Date.now() / 1000);
      // Reuse one Apple token across devices and Worker restarts. Apple asks for at least one hour between refreshes.
      if (cached?.refreshAt > now) return cached.header;
      const { Authorization: header } = getVapidHeaders(
        applePushOrigin, vapidSubject, keys.publicKey, keys.privateKey, 'aes128gcm', now + 12 * hour
      );
      await this.ctx.storage.put('appleAuthorization', { header, refreshAt: now + 2 * hour });
      return header;
    });
  }
}

export class ReminderDevice extends DurableObject {
  async save(plan, revision) {
    await this.ctx.storage.transaction(async tx => {
      if (plan) {
        await tx.delete('closed');
        await tx.put('plan', plan);
        await tx.setAlarm(plan.events[0].next);
      } else {
        await tx.delete('plan');
        // Retain only a random version until all schedules from before this change have expired.
        const until = Date.now() + horizon;
        await tx.put('closed', { revision, until });
        await tx.setAlarm(until);
      }
    });
  }

  async update(action, input) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const current = await this.ctx.storage.get('plan') ?? null;
      let revision = current?.revision ?? (await this.ctx.storage.get('closed'))?.revision ?? null;
      const next = crypto.randomUUID();
      const result = change(current, action, input, Date.now(), next, revision);
      const changed = result.plan !== current;
      if (changed) {
        await this.save(result.plan, next);
        revision = next;
      }
      const plan = snapshot(result.plan);
      if (action === 'schedule') {
        const accepted = result.status === 200;
        logReminder({ event: 'reminder_schedule', httpStatus: result.status,
          outcome: !accepted ? 'rejected' : changed ? 'saved' : 'unchanged',
          reservationId: accepted ? plan.revision : null,
          ...(accepted && { readyAt: plan.ready, leaveAt: plan.leave, pending: plan.events.map(event => event.kind) }),
          ...(accepted && changed && current && { previousReservationId: current.revision }) }, this.env, this.ctx);
      } else if (action === 'cancel') {
        logReminder({ event: 'reminder_cancel', httpStatus: result.status,
          outcome: result.status !== 200 ? 'rejected' : current ? 'canceled' : 'no_active_plan',
          reservationId: current?.revision ?? null,
          ...(current && { readyAt: current.ready, leaveAt: current.leave }) }, this.env, this.ctx);
      }
      return { status: result.status, plan, revision };
    });
  }

  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      let plan = await this.ctx.storage.get('plan');
      if (!plan) {
        const closed = await this.ctx.storage.get('closed');
        if (closed && closed.until <= Date.now()) await this.ctx.storage.delete('closed');
        else if (closed) await this.ctx.storage.setAlarm(closed.until);
        return;
      }
      while (plan && plan.events[0].next <= Date.now()) {
        const event = plan.events[0];
        let status = 204;
        let providerStatus = null;
        let outcome = 'expired';
        let appleRejection = null;
        if (Date.now() < event.at + grace) {
          try {
            const apple = new URL(plan.subscription.endpoint).origin === applePushOrigin;
            const signer = identity(this.env);
            const appleAuthorization = apple ? await signer.appleAuthorization() : null;
            const vapid = apple ? null : { subject: vapidSubject, ...await signer.keys() };
            // The reminder can expire while the signing key is being loaded.
            if (Date.now() < event.at + grace) {
              const payload = JSON.stringify({ at: event.at, kind: event.kind, locale: plan.locale });
              const { headers, body } = generateRequestDetails(plan.subscription, payload, {
                vapidDetails: vapid,
                TTL: Math.max(1, Math.ceil((event.at + grace - Date.now()) / 1000)),
                urgency: 'high', topic: 'nagal-' + event.kind + '-' + event.at
              });
              if (apple) headers.Authorization = appleAuthorization;
              const reply = await fetch(plan.subscription.endpoint, {
                method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(5000)
              });
              status = providerStatus = reply.status;
              outcome = reply.ok ? 'provider_accepted' : 'provider_rejected';
              if (!reply.ok && apple) {
                appleRejection = reply;
              }
            }
          } catch { status = 503; outcome = 'send_error'; }
        }
        const remaining = afterAttempt(plan, event, status, Date.now());
        // Record the provider result even if committing the next queue state fails.
        const reminder = { reservationId: plan.revision, reminder: event.kind, scheduledAt: event.at };
        logReminder({ event: 'reminder_delivery', ...reminder, outcome, providerStatus,
          retryPlanned: remaining?.events.some(item => item.kind === event.kind) ?? false }, this.env, this.ctx);
        if (appleRejection) this.ctx.waitUntil(logAppleRejection(appleRejection, { ...reminder, providerStatus }, this.env, this.ctx));
        plan = remaining;
        await this.save(plan, crypto.randomUUID());
      }
      if (plan) await this.ctx.storage.setAlarm(plan.events[0].next);
    });
  }
}

async function readInput(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = '', size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); return null; }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { return null; }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const headers = { 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    const reply = (data, status = 200) => Response.json(data, { status, headers });
    if (origin !== env.APP_ORIGIN) return reply({}, 403);
    Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const route = new URL(request.url).pathname;
    if (request.method === 'GET' && /^\/anseong\/arrivals\/\d{9}$/.test(route)) return busResponse(request, env, headers);
    const seoul = /^\/seoul\/arrivals\/(SEB\d{9})\/(\d{5})$/.exec(route);
    if (request.method === 'GET' && seoul) return seoulResponse(request, env, headers, seoul[1], seoul[2]);
    const tago = /^\/tago\/arrivals\/(\d{1,9})\/([A-Za-z0-9_-]{1,30})$/.exec(route);
    if (request.method === 'GET' && tago) return tagoResponse(request, env, headers, tago[1], tago[2]);
    const rail = /^\/rail\/arrivals\/([A-Za-z0-9-]{1,20}:[A-Za-z0-9-]{1,20})$/.exec(route);
    if (request.method === 'GET' && rail) return railArrivalsResponse(request, env, headers, rail[1]);
    if (route === '/key' && request.method === 'GET') {
      const { publicKey } = await identity(env).keys();
      return reply({ publicKey });
    }
    if (!['/status', '/schedule', '/cancel'].includes(route) || request.method !== 'POST') return reply({}, 404);
    const action = route.slice(1);
    function logUnresolved(httpStatus, outcome) {
      if (action !== 'status') logReminder({ event: 'reminder_' + action, httpStatus, outcome, reservationId: null }, env, ctx);
    }
    function reject(httpStatus) {
      logUnresolved(httpStatus, 'rejected');
      return reply({}, httpStatus);
    }
    try {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reject(415);
      const limited = await env.WRITES.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
      if (!limited.success) return reject(429);
      const input = await readInput(request);
      if (!validSubscription(input?.subscription)) return reject(400);
      const { endpoint, keys: { auth, p256dh } } = input.subscription;
      input.subscription = { endpoint, keys: { auth, p256dh } };
      // Subscription possession authorizes the device. No raw capability appears in a route or log.
      const capability = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([endpoint, auth, p256dh].join('\n')));
      const device = env.DEVICES.getByName(Array.from(new Uint8Array(capability), n => n.toString(16).padStart(2, '0')).join(''));
      const result = await device.update(action, input);
      return reply({ plan: result.plan, revision: result.revision }, result.status);
    } catch (error) {
      logUnresolved(500, 'server_error');
      throw error;
    }
  }
};
