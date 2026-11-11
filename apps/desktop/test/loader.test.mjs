import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../src/loader.mjs';

function harness(load) {
  let next = 0;
  const timers = new Map();
  let failures = 0;
  const loader = createLoader({ load, stop() {}, failed() { failures++; },
    setTimer(fn, ms) { timers.set(++next, { fn, ms }); return next; },
    clearTimer(id) { timers.delete(id); },
  });
  return { loader, timers, get failures() { return failures; },
    fire(ms) {
      const timer = [...timers].find(([, timer]) => timer.ms === ms);
      assert.ok(timer, `Timer ${ms} harus ada`);
      timers.delete(timer[0]); timer[1].fn();
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test('timeout 15 detik, retry 10 detik, cancel mencegah retry berikutnya', async () => {
  let calls = 0;
  const h = harness(() => { calls++; return new Promise(() => {}); });
  h.loader.start('http://localhost/device/a'); await flush();
  assert.equal(calls, 1);
  h.fire(15_000); assert.equal(h.failures, 1);
  h.fire(10_000); await flush(); assert.equal(calls, 2);
  h.loader.cancel(); assert.equal(h.timers.size, 0);
});
test('hasil load lama tidak memicu pemulihan dan sukses membatalkan timeout', async () => {
  let rejectOld;
  let calls = 0;
  const h = harness(() => ++calls === 1 ? new Promise((_, reject) => { rejectOld = reject; }) : Promise.resolve());
  h.loader.start('old'); await flush();
  h.loader.start('new'); await flush();
  rejectOld(new Error('old')); await flush();
  assert.equal(h.failures, 0); assert.equal(h.timers.size, 0);
});
