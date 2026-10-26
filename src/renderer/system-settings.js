(function () {
  'use strict';
  const desktop = window.PM?.isElectron === true, R = window.PMReminders;
  const PREFS_KEY = 'moreready.system-settings.v1', LEDGER_KEY = 'moreready.reminder-state.v1';
  const TASK_LEDGER_KEY = 'moreready.task-reminder-state.v1', STORE_KEY = 'projectdesk.store.v1';
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
  let state, hooks = {}, busy = false, timer;
  const active = new Set();
  function webInfo() {
    const preferences = read(PREFS_KEY), supported = typeof window.Notification === 'function' && window.isSecureContext;
    return { desktop: false, notifications: { supported, enabled: preferences.enabled === true,
      time: R.validTime(preferences.time) ? preferences.time : '09:00', permission: supported ? Notification.permission : 'unavailable', lastResult: state?.notifications?.lastResult },
      startup: { supported: false, enabled: false } };
  }
  function changed() { hooks.changed?.(); }
  async function refresh() {
    let updated = false;
    try {
      const next = desktop ? await window.PM.systemInfo() : webInfo();
      updated = JSON.stringify(next) !== JSON.stringify(state); state = next;
    }
    catch { state ||= { desktop, notifications: { supported: false, enabled: false, time: '09:00' }, startup: { supported: false, enabled: false } }; }
    if (updated) changed(); return state;
  }
  async function permission() {
    if (!state?.notifications.supported) throw new Error('当前浏览器不支持系统通知，请使用桌面版或支持通知的浏览器');
    if (Notification.permission === 'denied') throw new Error('通知权限已被关闭，请在浏览器的网站设置中允许通知');
    const value = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (value !== 'granted') throw new Error('未获得通知权限，通知保持关闭');
  }
  async function sendWeb(payload) {
    if (Notification.permission !== 'granted') return { ok: false, error: '请在浏览器的网站设置中允许通知' };
    let result;
    try {
      const notification = new Notification(payload.title, { body: payload.body, icon: 'assets/moreready-logo.png',
        tag: payload.test ? 'moreready-test' : payload.kind === 'task' ? 'moreready-task-reminder' : 'moreready-reminder' });
      active.add(notification);
      notification.onclick = () => { window.focus(); hooks.open?.(payload); notification.close(); };
      notification.onclose = () => active.delete(notification);
      result = await new Promise(resolve => {
        let settled = false;
        const finish = value => { if (settled) return; settled = true; clearTimeout(timeout); resolve(value); };
        const timeout = setTimeout(() => finish({ ok: false, error: '浏览器未确认通知已显示，请检查系统通知权限或勿扰模式' }), 8000);
        notification.onshow = () => finish({ ok: true });
        notification.onerror = () => { active.delete(notification); finish({ ok: false, error: '通知发送失败，请检查浏览器与系统的通知设置' }); };
      });
    } catch { result = { ok: false, error: '通知发送失败，请检查浏览器通知权限' }; }
    state.notifications.lastResult = { ...result, at: Date.now() }; changed(); return result;
  }
  const scheduler = !desktop && R.createScheduler({ readState: () => window.PMStore.state, readPreferences: () => webInfo().notifications,
    readLedger: () => read(LEDGER_KEY), writeLedger: ledger => localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger)),
    send: summary => navigator.locks ? navigator.locks.request('moreready-daily-notification', async () => {
      // Recheck under the lock so two open tabs never post the same daily reminder.
      if (read(LEDGER_KEY).lastDay === summary.day) return { ok: true };
      const result = await sendWeb(summary);
      if (result.ok) localStorage.setItem(LEDGER_KEY, JSON.stringify({ lastDay: summary.day, sentAt: Date.now() }));
      return result;
    }) : sendWeb(summary), onError: error => { state.notifications.lastResult = { ok: false, error }; changed(); } });
  const taskScheduler = !desktop && R.createTaskScheduler({
    readState: () => { const saved = read(STORE_KEY); return Array.isArray(saved.tasks) ? saved : window.PMStore.state; },
    readPreferences: () => webInfo().notifications,
    readLedger: () => read(TASK_LEDGER_KEY), writeLedger: ledger => localStorage.setItem(TASK_LEDGER_KEY, JSON.stringify(ledger)),
    send: sendWeb, withLock: run => navigator.locks ? navigator.locks.request('moreready-task-notification', run) : run(),
    onError: error => { state.notifications.lastResult = { ok: false, error }; changed(); },
  });
  let checking = false;
  async function check() {
    if (desktop || checking) return { skipped: true };
    checking = true;
    try { await taskScheduler.check(); return await scheduler.check(); }
    finally { checking = false; }
  }
  function message() {
    const n = state?.notifications;
    if (!n?.supported) return '当前环境暂不支持系统通知';
    if (!desktop && n.permission === 'denied') return '浏览器已阻止通知，请在网站设置中允许';
    if (n.lastResult?.ok === false) return n.lastResult.error;
    if (n.lastResult?.ok) return '测试或提醒通知已提交系统';
    return desktop ? '应用运行或托盘常驻时，发送任务提醒与每日到期汇总' : '页面打开时发送任务提醒与每日汇总，需允许浏览器通知权限';
  }
  function html() {
    const n = state?.notifications || { time: '09:00' }, s = state?.startup || {};
    return `<div class="section-title">通知与启动</div>
      <div class="set-row"><div class="sr-txt"><b>系统通知</b><span>${esc(message())}</span></div>
        <button class="switch" data-system-action="notifications" aria-label="系统通知" aria-pressed="${n.enabled === true}" ${!n.supported || busy ? 'disabled' : ''}></button></div>
      <div class="set-row"><div class="sr-txt"><b>每日提醒时间</b><span>只提醒未完成任务；错过时间后在打开时补发，每天一次</span></div>
        <input class="input notification-time" id="notificationTime" type="time" aria-label="每日提醒时间" value="${esc(n.time)}" ${busy || !n.supported ? 'disabled' : ''}></div>
      <div class="set-row"><div class="sr-txt"><b>测试通知</b><span>发送一条测试消息，检查系统是否正常接收</span></div>
        <button class="btn tiny" data-system-action="test" ${!n.supported || busy ? 'disabled' : ''}>${busy ? '处理中…' : '发送测试'}</button></div>
      <div class="set-row"><div class="sr-txt"><b>开机自启动</b><span>${s.error ? esc(s.error) : s.blocked ? '已被系统禁用，请在启动应用列表中重新开启' : s.supported ? '登录电脑后自动打开 MoreReady' : desktop ? '当前系统暂不支持自启动设置' : '在桌面版中开启，登录电脑后自动打开 MoreReady'}</span></div>
        <button class="switch" data-system-action="startup" aria-label="开机自启动" aria-pressed="${s.enabled === true}" ${!s.supported || busy ? 'disabled' : ''}></button></div>
      <p class="system-settings-note" role="status">${desktop ? '关闭通知开关后停止提醒；退出应用后暂停，托盘常驻可继续提醒。' : '网页版需要保持页面打开；开机自启动在桌面版中设置。'}</p>`;
  }
  async function configure(patch) {
    if (desktop) state = await window.PM.setNotifications(patch);
    else {
      if (patch.enabled) await permission();
      const next = { ...webInfo().notifications, ...patch };
      // Keep the stored preferences minimal; browser permission remains authoritative.
      localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: next.enabled, time: next.time }));
      state = webInfo(); state.notifications.lastResult = null;
      setTimeout(check, 500);
    }
  }
  async function handle(action) {
    if (busy) return;
    busy = true; changed();
    try {
      if (action === 'notifications') { await configure({ enabled: !state.notifications.enabled }); hooks.notify?.(state.notifications.enabled ? '已开启系统通知' : '已关闭系统通知'); }
      if (action === 'startup') { state = await window.PM.setAutoStart(!state.startup.enabled); hooks.notify?.(state.startup.enabled ? '已开启开机自启动' : '已关闭开机自启动'); }
      if (action === 'test') {
        if (!desktop) await permission();
        const result = desktop ? await window.PM.testNotification() : await sendWeb({ title: 'MoreReady · 测试通知', body: '系统通知已接通。到期与逾期任务会按设定时间提醒。', test: true, taskIds: [] });
        hooks.notify?.(result.ok ? '测试通知已发送，请查看系统通知中心' : result.error);
      }
    } catch (error) { hooks.notify?.(error.message); }
    finally { busy = false; await refresh(); changed(); document.querySelector(`[data-system-action="${action}"]`)?.focus(); }
  }
  window.PMSystemSettings = {
    html, refresh, state: () => state,
    async init(options) {
      hooks = options; await refresh();
      if (desktop) {
        window.PM.onSystemSettingsChange(next => { state = next; changed(); });
        window.PM.onNotificationOpen(payload => hooks.open?.(payload));
      } else {
        timer = setInterval(check, 60000);
        setTimeout(check, 3000);
        window.addEventListener('storage', event => {
          if (event.key === PREFS_KEY) refresh();
          if (event.key === PREFS_KEY || event.key === STORE_KEY) check();
        });
        window.addEventListener('pm:store-saved', check);
      }
      window.addEventListener('focus', () => { refresh(); if (!desktop) check(); });
      window.addEventListener('beforeunload', () => { clearInterval(timer); active.forEach(n => n.close()); });
      document.addEventListener('click', event => {
        const button = event.target.closest('[data-system-action]');
        if (button && !button.disabled) handle(button.dataset.systemAction);
      });
      document.addEventListener('change', async event => {
        if (event.target.id !== 'notificationTime' || busy) return;
        const time = event.target.value;
        if (!R.validTime(time)) { hooks.notify?.('请输入有效的提醒时间'); changed(); return; }
        busy = true; changed();
        try { await configure({ time }); } catch (error) { hooks.notify?.(error.message); }
        finally { busy = false; await refresh(); changed(); }
      });
    },
  };
})();
