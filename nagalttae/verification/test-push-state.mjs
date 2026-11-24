import assert from 'node:assert/strict';
import { afterAttempt, change, grace, horizon } from '../push-server/schedule.js';

const now = 1_000_000;
const ready = now + 60_000;
const leave = ready + 10_000;
const input = { ready, leave, locale: 'ko', expected: null, subscription: {} };
const created = change(null, 'schedule', input, now, 'a');
assert.equal(created.status, 200);
const plan = created.plan;
assert.deepEqual(plan.events.map(e => e.kind), ['ready', 'leave']);
const partial = afterAttempt(plan, plan.events[0], 201, ready);
assert.deepEqual(partial.events.map(e => e.kind), ['leave']);
assert.equal(change(partial, 'schedule', input, ready, 'b').plan, partial);
assert.equal(change(partial, 'cancel', input, ready, 'b').status, 409);
assert.equal(change(partial, 'schedule', { ...input, leave: leave + 1 }, ready, 'b').status, 409);
assert.equal(change(partial, 'cancel', { ...input, expected: 'a' }, ready, 'tombstone').plan, null);
assert.equal(change(null, 'schedule', input, ready, 'b', 'tombstone').status, 409);
assert.equal(change(null, 'schedule', { ...input, expected: 'tombstone' }, ready, 'b', 'tombstone').status, 200);
assert.equal(change(null, 'schedule', input, ready + horizon, 'b', null).status, 422);
const edge = { ...input, ready: now + horizon, leave: now + horizon };
assert.equal(change(null, 'schedule', edge, now, 'a').status, 200);
assert.equal(change(null, 'schedule', edge, now + horizon - 1, 'b', 'tombstone').status, 409);
assert.equal(change(null, 'schedule', edge, now + horizon, 'b', null).status, 422);
const tied = change(null, 'schedule', { ...input, ready: leave }, now, 'a').plan;
assert.deepEqual(tied.events.map(e => e.kind), ['both']);
const pastPrep = change(null, 'schedule', input, ready, 'a').plan;
assert.deepEqual(pastPrep.events.map(e => e.kind), ['leave']);

const statuses = [200, 201, 204, 301, 400, 401, 403, 404, 408, 410, 429, 499, 500, 503, 599];
const elapsed = [0, 1, 15_000, grace - 15_001, grace - 15_000, grace - 14_999, grace - 1, grace, grace + 1];
let vectors = 0;
for (const event of plan.events) {
  const other = plan.events.find(candidate => candidate !== event);
  for (const status of statuses) {
    for (const delta of elapsed) {
      const clock = event.at + delta;
      const actual = afterAttempt(plan, event, status, clock);
      if (status === 404 || status === 410) {
        assert.equal(actual, null);
      } else {
        const canRetry = [408, 429].includes(status) || status >= 500;
        const expected = [other];
        if (canRetry && clock + 15_000 < event.at + 300_000) {
          expected.push({ ...event, next: clock + 15_000 });
        }
        expected.sort((left, right) => left.next - right.next);
        assert.deepEqual(actual.events, expected);
        assert.equal(actual.revision, plan.revision);
      }
      vectors++;
    }
  }
}
console.log('PASS revision conflicts, replay after cancellation, partial and merged alarms; ' + vectors + ' delivery vectors');
