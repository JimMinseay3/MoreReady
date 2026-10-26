'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const R = require('../src/renderer/reminder-engine');
const { createSystemIntegration } = require('../src/system-integration');

(async () => {
  const now = new Date(2026, 9, 6, 8, 59);
  const task = (id, due, status = 'todo', projectId = 'p') => ({ id, title: `任务 ${id}`, due, status, projectId, priority: 'p1' });
  const state = { projects: [{ id: 'p', name: '项目' }, { id: 'archived', archived: true }],
    tasks: [task('today', '2026-10-06'), task('overdue', '2026-10-05', 'waiting'),
      task('done', '2026-10-01', 'done'), task('tomorrow', '2026-10-07'), task('invalid', '2026-02-30'),
      task('archived', '2026-10-01', 'doing', 'archived'), task('missing', '2026-10-01', 'todo', 'missing')] };
  const summary = R.collect(state, now);
  assert.deepEqual(summary.taskIds, ['overdue', 'today']);
  assert.equal(summary.overdue, 1); assert.equal(summary.due, 1);
  assert.match(summary.body, /已逾期 1 项 · 今日到期 1 项/);
  assert.equal(R.validTime('24:00'), false); assert.equal(R.validTime('00:00'), true);
  let prefs = { enabled: false, time: '09:00' }, ledger = {}, sent = 0, error = '', succeed = true;
  const scheduler = () => R.createScheduler({ readState: () => state, readPreferences: () => prefs,
    readLedger: () => ledger, writeLedger: value => { ledger = value; }, now: () => now,
    send: async () => { sent++; await new Promise(resolve => setImmediate(resolve)); return { ok: succeed, error: 'blocked' }; }, onError: value => { error = value; } });
  const engine = scheduler();
  await engine.check(); assert.equal(sent, 0);
  prefs.enabled = true; await engine.check(); assert.equal(sent, 0);
  now.setHours(9, 0); await Promise.all([engine.check(), engine.check()]); assert.equal(sent, 1);
  assert.equal(ledger.lastDay, '2026-10-06');
  await engine.check(); await scheduler().check(); assert.equal(sent, 1, 'restart should not duplicate reminders');
  now.setDate(7); await engine.check(); assert.equal(sent, 2);
  now.setDate(8); succeed = false; await engine.check(); assert.equal(sent, 3); assert.equal(error, 'blocked');
  assert.equal(ledger.lastDay, '2026-10-07', 'failed delivery must not mark the day delivered');
  now.setMinutes(1); await engine.check(); assert.equal(sent, 3);
  now.setMinutes(15); succeed = true; await engine.check(); assert.equal(sent, 4);
  prefs.enabled = false; now.setDate(9); await engine.check(); assert.equal(sent, 4);
  prefs.enabled = true; const savedTasks = state.tasks; state.tasks = [];
  await engine.check(); assert.equal(sent, 4); state.tasks = savedTasks;

  assert.equal(R.parseLocalTime('2026-02-30T10:00'), null);
  assert.equal(R.parseLocalTime('2026-10-06T24:00'), null);
  assert.equal(R.parseLocalTime('2026-10-06T10:00Z'), null);
  assert.deepEqual(R.normalizeReminder({ mode: 'custom', at: 'invalid' }), { mode: 'none', at: '' });
  assert.deepEqual(R.normalizeReminder({ mode: '__proto__' }), { mode: 'none', at: '' });
  assert.equal(R.reminderDate({ due: '2026-11-01', reminder: { mode: 'before-1d' } }, { time: '08:30' }).getTime(), new Date(2026, 9, 31, 8, 30).getTime());
  assert.equal(R.reminderDate({ due: '2024-03-01', reminder: { mode: 'before-1d' } }).getTime(), new Date(2024, 1, 29, 9).getTime());
  assert.equal(R.reminderDate({ due: '2027-01-02', reminder: { mode: 'before-3d' } }).getTime(), new Date(2026, 11, 30, 9).getTime());
  assert.equal(R.reminderDate({ due: '', reminder: { mode: 'due' } }), null);

  const taskNow = new Date(2026, 9, 6, 8, 59);
  const scheduled = { projects: state.projects, tasks: [
    { ...task('early', '2026-10-07'), reminder: { mode: 'before-1d' } },
    { ...task('three', '2026-10-09'), reminder: { mode: 'before-3d' } },
    { ...task('custom', ''), reminder: { mode: 'custom', at: '2026-10-06T10:15' } },
    { ...task('off', '2026-10-06'), reminder: { mode: 'none' } },
    { ...task('done-task', '2026-10-06', 'done'), reminder: { mode: 'due' } },
    { ...task('archived-task', '2026-10-06', 'todo', 'archived'), reminder: { mode: 'due' } },
    { ...task('bad-date', '2026-02-30'), reminder: { mode: 'due' } },
  ] };
  let taskLedger = {}, taskPrefs = { enabled: false, time: '09:00' }, taskSucceed = true;
  const notifications = [];
  let lock = Promise.resolve();
  const taskEngine = () => R.createTaskScheduler({ readState: () => scheduled, readPreferences: () => taskPrefs,
    readLedger: () => taskLedger, writeLedger: value => { taskLedger = value; }, now: () => taskNow,
    withLock: run => { const next = lock.then(run); lock = next.catch(() => {}); return next; },
    send: async payload => { notifications.push(payload); await new Promise(resolve => setImmediate(resolve)); return { ok: taskSucceed, error: 'blocked' }; } });
  const taskScheduler = taskEngine();
  await taskScheduler.check(); assert.equal(notifications.length, 0);
  taskPrefs.enabled = true; await taskScheduler.check(); assert.equal(notifications.length, 0);
  taskNow.setHours(9, 0);
  await Promise.all([taskScheduler.check(), taskScheduler.check(), taskEngine().check()]);
  assert.equal(notifications.length, 1, 'concurrent tabs and checks must deduplicate inside the lock');
  assert.deepEqual(notifications[0].taskIds, ['early', 'three']); assert.equal(notifications[0].kind, 'task');
  assert.equal(taskLedger.delivered.length, 2);
  await taskEngine().check(); assert.equal(notifications.length, 1, 'delivery persists across restart');
  taskNow.setHours(10, 14); await taskScheduler.check(); assert.equal(notifications.length, 1);
  taskNow.setMinutes(15); taskSucceed = false; await taskScheduler.check(); assert.equal(notifications.length, 2);
  assert.equal(taskLedger.delivered.length, 2, 'failed task notification must not be marked delivered');
  taskNow.setMinutes(16); taskSucceed = true; await taskScheduler.check(); assert.equal(notifications.length, 2);
  taskNow.setMinutes(30); await taskScheduler.check(); assert.equal(notifications.length, 3);
  assert.deepEqual(notifications[2].taskIds, ['custom']);
  scheduled.tasks[2].reminder.at = '2026-10-06T10:31';
  taskNow.setMinutes(31); await taskScheduler.check(); assert.equal(notifications.length, 4, 'a changed schedule may remind again');
  taskPrefs.enabled = false; scheduled.tasks[2].reminder.at = '2026-10-06T10:32';
  taskNow.setMinutes(35); await taskScheduler.check(); assert.equal(notifications.length, 4);
  taskPrefs.enabled = true; await taskScheduler.check(); assert.equal(notifications.length, 5, 'missed reminders catch up once on enabling');
  scheduled.tasks[2].reminder = { mode: 'none' }; await taskScheduler.check(); assert.equal(notifications.length, 5);
  scheduled.tasks = []; await taskScheduler.check(); assert.equal(notifications.length, 5);
  // Retaining every delivered occurrence avoids replay when many reminders are imported.
  scheduled.tasks = Array.from({ length: 5001 }, (_, i) => ({ ...task('batch-' + i, '2026-10-06'), reminder: { mode: 'due' } }));
  await taskScheduler.check(); assert.equal(notifications.length, 6);
  await taskEngine().check(); assert.equal(notifications.length, 6, 'large batches must remain deduplicated after restart');

  // Test native failure/click behavior without touching the user's system settings.
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'moreready-reminders-unit-'));
  let last, launch = {}, startup = false, opened;
  class FakeNotification extends EventEmitter {
    static isSupported() { return true; }
    constructor(options) { super(); this.id = options.id; last = this; }
    show() { queueMicrotask(() => this.emit(FakeNotification.fail ? 'failed' : 'show', {}, 'blocked')); }
    close() { this.emit('close', { reason: 'applicationHidden' }); }
  }
  const native = createSystemIntegration({ app: { isPackaged: false, getPath: () => data, getName: () => 'UnitTest',
    getAppPath: () => 'E:\\项目空间\\带 空格项目',
    getLoginItemSettings: options => { assert.deepEqual(options, launch.path ? { path: launch.path, args: launch.args } : options); return { openAtLogin: startup, launchItems: [{ name: 'test-id', scope: 'user', enabled: startup }] }; },
    setLoginItemSettings: settings => { launch = settings; startup = settings.openAtLogin; } },
    Notification: FakeNotification, platform: 'win32', appId: 'test-id',
    shell: { readShortcutLink: () => ({}), writeShortcutLink: () => true }, readState: () => state,
    onOpen: value => { opened = value; } });
  assert.equal(native.info().notifications.enabled, false);
  assert.equal(native.setStartup(true).startup.enabled, true);
  assert.deepEqual(launch.args, ['"E:\\项目空间\\带 空格项目"']);
  assert.equal(native.setStartup(false).startup.enabled, false);
  assert.throws(() => native.configure({ time: '99:99' }));
  const test = await native.test(); assert.equal(test.ok, true); last.emit('click'); assert.equal(opened.test, true);
  assert.equal(native.info().notifications.enabled, false, 'test does not turn on daily reminders');
  FakeNotification.fail = true; assert.equal((await native.test()).ok, false);
  native.stop();
  console.log('PASS reminders: local/custom dates, relative offsets, daily and per-task ledgers, cross-tab locks, restart, retry, reschedule, catch-up, large batches, completed/archived/disabled filters, native failures and click routing');
})().catch(error => { console.error(error); process.exitCode = 1; });
