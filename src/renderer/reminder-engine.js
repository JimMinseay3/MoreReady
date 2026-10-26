/* Shared by the desktop background process and the browser page. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMReminders = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const dayOf = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    return dayOf(new Date(year, month - 1, day)) === value;
  }
  const MODES = {
    none: { label: '不提醒' },
    due: { label: '到期当天' },
    'before-1d': { label: '提前 1 天' },
    'before-3d': { label: '提前 3 天' },
    custom: { label: '自定义时间' },
  };
  function parseLocalTime(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
      || !validDay(value.slice(0, 10)) || !validTime(value.slice(11))) return null;
    const date = new Date(value);
    // Reject nonexistent local times as well as invalid calendar dates.
    return dayOf(date) === value.slice(0, 10)
      && date.getHours() === Number(value.slice(11, 13)) && date.getMinutes() === Number(value.slice(14)) ? date : null;
  }
  function normalizeReminder(value) {
    const mode = value && Object.hasOwn(MODES, value.mode) ? value.mode : 'none';
    return mode === 'custom' ? (parseLocalTime(value.at) ? { mode, at: value.at } : { mode: 'none', at: '' }) : { mode, at: '' };
  }
  function reminderDate(task, preferences = {}) {
    const reminder = normalizeReminder(task?.reminder);
    if (reminder.mode === 'none') return null;
    if (reminder.mode === 'custom') return parseLocalTime(reminder.at);
    if (!validDay(task?.due)) return null;
    const date = new Date(task.due + 'T00:00');
    const offset = reminder.mode === 'before-3d' ? 3 : reminder.mode === 'before-1d' ? 1 : 0;
    date.setDate(date.getDate() - offset);
    const [hour, minute] = (validTime(preferences.time) ? preferences.time : '09:00').split(':').map(Number);
    date.setHours(hour, minute, 0, 0);
    return date;
  }
  function taskSchedules(state, preferences) {
    const projects = new Map((state?.projects || []).filter(p => !p.archived).map(p => [p.id, p]));
    return (state?.tasks || []).filter(t => projects.has(t.projectId) && ['todo', 'doing', 'waiting'].includes(t.status))
      .map(task => ({ task, project: projects.get(task.projectId), date: reminderDate(task, preferences) }))
      .filter(item => item.date).map(item => ({ ...item, at: item.date.getTime(), key: JSON.stringify([item.task.id, item.date.getTime()]) }))
      .sort((a, b) => a.at - b.at || String(a.task.id).localeCompare(String(b.task.id)));
  }
  function collect(state, now = new Date()) {
    const today = dayOf(now);
    const projects = new Map((state?.projects || []).filter(p => !p.archived).map(p => [p.id, p]));
    const tasks = (state?.tasks || []).filter(t => projects.has(t.projectId)
      && ['todo', 'doing', 'waiting'].includes(t.status) && validDay(t.due) && t.due <= today)
      .sort((a, b) => a.due.localeCompare(b.due) || String(a.priority).localeCompare(String(b.priority)) || String(a.id).localeCompare(String(b.id)));
    const overdue = tasks.filter(t => t.due < today).length;
    const due = tasks.length - overdue;
    const counts = [overdue ? `已逾期 ${overdue} 项` : '', due ? `今日到期 ${due} 项` : ''].filter(Boolean).join(' · ');
    const examples = tasks.slice(0, 3).map(t => `${projects.get(t.projectId).name}：${String(t.title || '未命名任务').replace(/\s+/g, ' ').slice(0, 40)}`);
    if (tasks.length > 3) examples.push(`还有 ${tasks.length - 3} 项，点击查看`);
    return { day: today, overdue, due, taskIds: tasks.map(t => t.id), title: 'MoreReady · 任务提醒', body: [counts, ...examples].join('\n') };
  }
  function createScheduler({ readState, readPreferences, readLedger, writeLedger, send, now = () => new Date(), onError = () => {} }) {
    let busy = false, lastAttempt = -Infinity;
    return {
      async check() {
        const preferences = readPreferences(), date = now();
        if (!preferences?.enabled || busy) return { skipped: true };
        const time = validTime(preferences.time) ? preferences.time : '09:00';
        const [hour, minute] = time.split(':').map(Number);
        if (date.getHours() * 60 + date.getMinutes() < hour * 60 + minute) return { skipped: true };
        const summary = collect(readState(), date);
        if (!summary.taskIds.length || readLedger()?.lastDay === summary.day || date.getTime() - lastAttempt < 15 * 60 * 1000) return { skipped: true };
        busy = true; lastAttempt = date.getTime();
        try {
          const result = await send(summary);
          if (result?.ok) { writeLedger({ lastDay: summary.day, sentAt: date.getTime() }); lastAttempt = -Infinity; }
          else onError(result?.error || '系统未确认通知已发送');
          return result;
        } catch (error) { onError(error.message); return { ok: false, error: error.message }; }
        finally { busy = false; }
      },
    };
  }
  function createTaskScheduler({ readState, readPreferences, readLedger, writeLedger, send,
    now = () => new Date(), onError = () => {}, withLock = run => run() }) {
    let busy = false;
    const attempts = new Map();
    return {
      async check() {
        if (busy) return { skipped: true };
        busy = true;
        try {
          // Read preferences, tasks and delivery records inside the same browser lock.
          return await withLock(async () => {
            const preferences = readPreferences(), date = now();
            if (!preferences?.enabled) return { skipped: true };
            const ledger = readLedger();
            const delivered = (Array.isArray(ledger?.delivered) ? ledger.delivered : [])
              .filter(item => item && typeof item.taskId === 'string' && Number.isFinite(item.at) && Number.isFinite(item.sentAt));
            const sent = new Set(delivered.map(item => JSON.stringify([item.taskId, item.at])));
            const schedules = taskSchedules(readState(), preferences);
            const keys = new Set(schedules.map(item => item.key));
            for (const key of attempts.keys()) if (!keys.has(key)) attempts.delete(key);
            const pending = schedules.filter(item => item.at <= date.getTime() && !sent.has(item.key)
              && date.getTime() - (attempts.get(item.key) ?? -Infinity) >= 15 * 60 * 1000);
            if (!pending.length) return { skipped: true };
            pending.forEach(item => attempts.set(item.key, date.getTime()));
            const examples = pending.slice(0, 3).map(item => `${item.project.name}：${String(item.task.title || '未命名任务').replace(/\s+/g, ' ').slice(0, 40)}`);
            if (pending.length > 3) examples.push(`还有 ${pending.length - 3} 项，点击查看`);
            const result = await send({ kind: 'task', title: 'MoreReady · 任务提醒',
              body: [`${pending.length} 项任务到了提醒时间`, ...examples].join('\n'), taskIds: pending.map(item => item.task.id) });
            if (result?.ok) {
              writeLedger({ delivered: [...delivered, ...pending.map(item => ({ taskId: item.task.id, at: item.at, sentAt: date.getTime() }))] });
              pending.forEach(item => attempts.delete(item.key));
            } else onError(result?.error || '系统未确认通知已发送');
            return result;
          });
        } catch (error) { onError(error.message); return { ok: false, error: error.message }; }
        finally { busy = false; }
      },
    };
  }
  return { dayOf, validTime, validDay, MODES, parseLocalTime, normalizeReminder, reminderDate, taskSchedules, collect, createScheduler, createTaskScheduler };
});
