(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PMShortcuts = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const key = (code, ctrl = false, shift = false, alt = false) => ({ code, ctrl, shift, alt, meta: false });
  const actions = [
    { id: 'newTask', label: '新建任务', keyboard: key('KeyN', true) },
    { id: 'newProject', label: '新建项目', keyboard: key('KeyN', true, true) },
    { id: 'search', label: '搜索任务', keyboard: key('KeyF', true) },
    { id: 'projects', label: '打开项目', keyboard: key('KeyK', true) },
    { id: 'previousPage', label: '上一个页面', keyboard: key('ArrowLeft', false, false, true), mouse: 3 },
    { id: 'nextPage', label: '下一个页面', keyboard: key('ArrowRight', false, false, true), mouse: 4 },
    { id: 'save', label: '保存当前编辑', keyboard: key('Enter', true) },
    { id: 'toggleView', label: '切换详细 / 简洁', keyboard: key('KeyV', true, true) },
    { id: 'toggleAI', label: '展开 / 收起 Miss.MR', keyboard: key('KeyA', true, true) },
  ];
  const allowedCode = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Arrow(Left|Right|Up|Down)|Enter|Space|Tab|Backspace|Delete|Home|End|PageUp|PageDown|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Minus|Equal|Backquote|Numpad[0-9])$/;
  function keyboard(raw) {
    if (!raw || typeof raw.code !== 'string' || !allowedCode.test(raw.code)) return null;
    const value = { code: raw.code, ctrl: raw.ctrl === true, alt: raw.alt === true, shift: raw.shift === true, meta: raw.meta === true };
    if (!value.ctrl && !value.alt && !value.meta && !/^F\d+$/.test(value.code)) return null;
    if (value.code === 'Space' && value.shift && (value.ctrl || value.meta) && !value.alt) return null;
    return value;
  }
  const signature = value => value ? [value.code, value.ctrl, value.alt, value.shift, value.meta].join(':') : '';
  function normalize(raw) {
    const result = {}, seenKeys = new Set(), seenMouse = new Set();
    for (const action of actions) {
      const item = raw && Object.prototype.hasOwnProperty.call(raw, action.id) && raw[action.id] && typeof raw[action.id] === 'object' ? raw[action.id] : action;
      let binding = keyboard(item.keyboard), mouse = [3, 4].includes(item.mouse) ? item.mouse : null;
      if (binding && seenKeys.has(signature(binding))) binding = null;
      if (mouse !== null && seenMouse.has(mouse)) mouse = null;
      if (binding) seenKeys.add(signature(binding));
      if (mouse !== null) seenMouse.add(mouse);
      result[action.id] = { keyboard: binding, mouse };
    }
    return result;
  }
  function conflict(map, id, kind, value) {
    if (value === null) return null;
    return actions.find(action => action.id !== id && (kind === 'keyboard' ? signature(map[action.id].keyboard) === signature(value) : map[action.id].mouse === value))?.id || null;
  }
  function assign(map, id, kind, value) {
    if (!actions.some(action => action.id === id) || !['keyboard', 'mouse'].includes(kind)) throw new Error('快捷键操作无效');
    if (value !== null && (kind === 'keyboard' ? !keyboard(value) : ![3, 4].includes(value))) throw new Error('快捷键格式无效');
    const next = normalize(map), previous = conflict(next, id, kind, value);
    if (previous) next[previous][kind] = null;
    next[id][kind] = kind === 'keyboard' ? keyboard(value) : value;
    return next;
  }
  function fromEvent(event) { return keyboard({ code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey }); }
  function format(value, kind = 'keyboard') {
    if (value === null || value === undefined) return '未设置';
    if (kind === 'mouse') return value === 3 ? '侧键 4 · 后退' : '侧键 5 · 前进';
    const labels = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: '空格', Backspace: '退格', Delete: 'Delete', PageUp: 'Page Up', PageDown: 'Page Down', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=', Backquote: '`' };
    const name = labels[value.code] || value.code.replace(/^Key|^Digit/, '').replace(/^Numpad/, '小键盘 ');
    return [value.ctrl && 'Ctrl', value.alt && 'Alt', value.shift && 'Shift', value.meta && '⌘', name].filter(Boolean).join(' + ');
  }
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let store, hooks, recorder = null, lastMouse = null;
  const map = () => normalize(store.state.settings.keybindings);
  function html() {
    const bindings = map();
    return `<div class="section-title">快捷键与鼠标</div><p class="shortcut-hint">点击绑定即可重新设置。鼠标侧键 4、5 也可映射；只在当前工作窗口生效。</p>
      <div class="shortcut-table"><div class="shortcut-table-head"><span>操作</span><span>键盘</span><span>鼠标侧键</span></div>
      ${actions.map(action => `<div class="shortcut-row"><b>${action.label}</b>${['keyboard', 'mouse'].map(kind => `<button class="btn shortcut-binding" data-shortcut="${action.id}" data-kind="${kind}" aria-label="设置${action.label}的${kind === 'keyboard' ? '键盘快捷键' : '鼠标侧键'}">${escape(format(bindings[action.id][kind], kind))}</button>`).join('')}</div>`).join('')}</div>
      <div class="shortcut-bottom"><span>Esc 取消录入 · 键盘组合需包含 Ctrl、Alt 或 ⌘，也可使用功能键 F1–F24。</span><button class="btn tiny" data-shortcut-reset>恢复默认</button></div>`;
  }
  function close() {
    if (!recorder) return;
    const button = recorder.button; recorder.host.remove(); recorder = null;
    if (button?.isConnected) button.focus();
  }
  function updateCandidate(value) {
    recorder.candidate = value;
    const other = conflict(map(), recorder.id, recorder.kind, value);
    recorder.host.querySelector('[data-shortcut-candidate]').textContent = format(value, recorder.kind);
    recorder.host.querySelector('[data-shortcut-warning]').textContent = other ? `已用于「${actions.find(action => action.id === other).label}」。保存会替换原绑定。` : '保存后立即生效。';
    const button = recorder.host.querySelector('[data-shortcut-save]'); button.disabled = false; button.textContent = other ? '替换并保存' : '保存';
  }
  function record(button) {
    close();
    const id = button.dataset.shortcut, kind = button.dataset.kind, action = actions.find(item => item.id === id);
    const host = document.createElement('div'); host.id = 'shortcutRecorder'; host.className = 'shortcut-mask';
    host.innerHTML = `<section class="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcutDialogTitle" tabindex="-1"><h2 id="shortcutDialogTitle">设置${action.label}</h2><p>${kind === 'keyboard' ? '按下想使用的键盘组合' : '按下鼠标侧键 4 或 5'}</p><output data-shortcut-candidate>等待录入…</output><p data-shortcut-warning role="status">Esc 取消；Ctrl + Shift + Space 保留用于显示或隐藏桌面窗口。</p><footer><button class="btn tiny" data-shortcut-clear>清除绑定</button><span></span><button class="btn" data-shortcut-cancel>取消</button><button class="btn primary" data-shortcut-save disabled>保存</button></footer></section>`;
    recorder = { id, kind, button, host, candidate: undefined }; document.body.append(host); host.querySelector('section').focus();
  }
  function dispatchMouse(button, source) {
    if (recorder) { if (recorder.kind === 'mouse') updateCandidate(button); return; }
    const now = performance.now();
    if (lastMouse && lastMouse.button === button && lastMouse.source !== source && now - lastMouse.time < 250) return;
    lastMouse = { button, source, time: now };
    const action = actions.find(item => map()[item.id].mouse === button);
    if (action) hooks.run(action.id);
  }
  function init(options) {
    store = options.store; hooks = options;
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-shortcut]');
      if (button) { record(button); return; }
      if (event.target.closest('[data-shortcut-reset]')) { store.state.settings.keybindings = normalize(); store.save(); hooks.refresh(); hooks.notify('已恢复默认快捷键'); return; }
      if (!recorder) return;
      if (event.target.closest('[data-shortcut-cancel]') || event.target === recorder.host) close();
      else if (event.target.closest('[data-shortcut-clear]')) updateCandidate(null);
      else if (event.target.closest('[data-shortcut-save]') && recorder.candidate !== undefined) {
        store.state.settings.keybindings = assign(map(), recorder.id, recorder.kind, recorder.candidate); store.save(); close(); hooks.refresh(); hooks.notify('绑定已保存');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.isComposing || event.repeat) return;
      if (recorder) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
        if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
          const items = [...recorder.host.querySelectorAll('button:not(:disabled)')];
          const index = items.indexOf(document.activeElement), next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
          event.preventDefault(); event.stopImmediatePropagation(); items[next].focus(); return;
        }
        if (/^(Control|Shift|Alt|Meta)$/.test(event.key)) return;
        if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey && document.activeElement?.tagName === 'BUTTON') return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (recorder.kind !== 'keyboard') return;
        const value = fromEvent(event);
        if (value) updateCandidate(value);
        else recorder.host.querySelector('[data-shortcut-warning]').textContent = '请使用 Ctrl、Alt、⌘ 组合或 F1–F24；窗口显示快捷键已保留。';
        return;
      }
      const binding = fromEvent(event);
      if (!binding) return;
      const action = actions.find(item => signature(map()[item.id].keyboard) === signature(binding));
      if (!action) return;
      if (!binding.ctrl && !binding.alt && !binding.meta && event.target.closest('input, textarea, [contenteditable="true"]') && action.id !== 'save') return;
      if (hooks.run(action.id) !== false) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    for (const type of ['mousedown', 'mouseup', 'auxclick']) document.addEventListener(type, event => {
      if (![3, 4].includes(event.button)) return;
      if (!recorder && !actions.some(action => map()[action.id].mouse === event.button)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (type === 'mouseup') dispatchMouse(event.button, 'dom');
    }, true);
    window.PM?.onMouseSideButton?.(button => { if ([3, 4].includes(button)) dispatchMouse(button, 'native'); });
  }
  return { actions, normalize, keyboard, signature, conflict, assign, fromEvent, format, html, init, recording: () => !!recorder };
});
