import { DurableObject } from 'cloudflare:workers';
import { generateVAPIDKeys, generateRequestDetails } from 'web-push';
import { afterAttempt, change, grace, horizon, snapshot, validSubscription } from './schedule.js';

function identity(env) { return env.SIGNER.getByName('nagalttae-web-push-v1'); }

export class PushIdentity extends DurableObject {
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
      if (result.plan !== current) {
        await this.save(result.plan, next);
        revision = next;
      }
      return { status: result.status, plan: snapshot(result.plan), revision };
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
        if (Date.now() < event.at + grace) {
          try {
            const vapid = await identity(this.env).keys();
            if (Date.now() >= event.at + grace) {
              plan = afterAttempt(plan, event, 204, Date.now());
              await this.save(plan, crypto.randomUUID());
              continue;
            }
            const payload = JSON.stringify({ at: event.at, kind: event.kind, locale: plan.locale });
            const { headers, body } = generateRequestDetails(plan.subscription, payload, {
              vapidDetails: { subject: 'https://mcroky.github.io/nagalttae/', ...vapid },
              TTL: Math.max(1, Math.ceil((event.at + grace - Date.now()) / 1000)),
              urgency: 'high', topic: 'nagal-' + event.kind + '-' + event.at
            });
            const reply = await fetch(plan.subscription.endpoint, {
              method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(5000)
            });
            status = reply.status;
          } catch { status = 503; }
        }
        plan = afterAttempt(plan, event, status, Date.now());
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
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    const reply = (data, status = 200) => Response.json(data, { status, headers });
    if (origin !== env.APP_ORIGIN) return reply({}, 403);
    Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const route = new URL(request.url).pathname;
    if (route === '/key' && request.method === 'GET') {
      const { publicKey } = await identity(env).keys();
      return reply({ publicKey });
    }
    if (!['/status', '/schedule', '/cancel'].includes(route) || request.method !== 'POST') return reply({}, 404);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({}, 415);
    const limited = await env.WRITES.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
    if (!limited.success) return reply({}, 429);
    const input = await readInput(request);
    if (!validSubscription(input?.subscription)) return reply({}, 400);
    const { endpoint, keys: { auth, p256dh } } = input.subscription;
    input.subscription = { endpoint, keys: { auth, p256dh } };
    // Subscription possession authorizes the device. No raw capability appears in a route or log.
    const capability = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([endpoint, auth, p256dh].join('\n')));
    const device = env.DEVICES.getByName(Array.from(new Uint8Array(capability), n => n.toString(16).padStart(2, '0')).join(''));
    const result = await device.update(route.slice(1), input);
    return reply({ plan: result.plan, revision: result.revision }, result.status);
  }
};
