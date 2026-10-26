/* ==================================================================
 * ui.js — 界面逻辑
 * 桌面导航（rail）+ 主工作区（panel）+ 任务画布与编辑抽屉
 * ================================================================== */
(function () {
  'use strict';

  const S = window.PMStore;
  const isDesktop = window.PM?.isElectron === true;
  const C = window.PMConst;
  const R = window.PMReminders;
  const { STATUS, PRIORITY, THEMES, day, parseDay, fmtDay } = C;
  const $ = (id) => document.getElementById(id);

  const app = $('app');
  const railNav = $('railNav');
  const panel = $('panel');
  const panelHead = $('panelHead');
  const panelBody = $('panelBody');
  const detailPanel = $('detailPanel');
  const detailBody = $('detailBody');
  const taskDrawerMask = $('taskDrawerMask');
  const taskDrawerBody = $('taskDrawerBody');
  let drawerReturnFocus = null;
  const G = window.PMTaskGraph;
  const DAG = window.PMDAGView;
  const sheetMask = $('sheetMask');
  const sheet = $('sheet');
  const toastWrap = $('toastWrap');
  let accentPickerCleanup = null;

  const APP_NAME = 'MoreReady';

  /* ---------------- 图标 ---------------- */
  const svg = (d, fill) => `<svg viewBox="0 0 24 24" class="ico" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    extension: svg('<path d="M9 3H5a2 2 0 0 0-2 2v4h2a3 3 0 0 1 0 6H3v4a2 2 0 0 0 2 2h4v-2a3 3 0 0 1 6 0v2h4a2 2 0 0 0 2-2v-4h-2a3 3 0 0 1 0-6h2V5a2 2 0 0 0-2-2h-4v2a3 3 0 0 1-6 0V3Z"/>'),
    today: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>'),
    project: svg('<path d="M3 7.5A2 2 0 0 1 5 5.5h4l2 2.5h6a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z"/>'),
    board: svg('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="10" rx="1.5"/><rect x="16" y="4" width="5" height="13" rx="1.5"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    inbox: svg('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6l2-8Z"/>'),
    archive: svg('<rect x="3" y="3" width="18" height="5" rx="1.5"/><path d="M5 8v12h14V8M9 12h6"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.05A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.33-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.05A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.05a1.7 1.7 0 0 0-1.55 1Z"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    check: svg('<path d="M4 12.5l5 5L20 6.5"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>'),
    bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'),
    trash: svg('<path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12"/>'),
    edit: svg('<path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5Z"/>'),
    chevL: svg('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
    chevR: svg('<path d="M9.5 5.5L16 12l-6.5 6.5"/>'),
    arrowR: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    arrowL: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    x: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
    down: svg('<path d="M8 10l4 4 4-4"/>'),
    link: svg('<path d="M9.5 14.5l5-5"/><path d="M12.5 7.5l1.8-1.8a3.5 3.5 0 0 1 5 5L17.5 12.5"/><path d="M11.5 16.5l-1.8 1.8a3.5 3.5 0 0 1-5-5L6.5 11.5"/>'),
    up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    export: svg('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),
    import: svg('<path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>'),
    search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'),
    sparkle: svg('<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6h.01"/>'),
    restore: svg('<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 5v4h4"/>'),
    broom: svg('<path d="M13 4l7 7-4.5 4.5-7-7L13 4Z"/><path d="M8.5 8.5L4 20l11.5-4.5"/>'),
  };

  /* ---------------- 模块定义 ---------------- */
  // 顺序就是竖栏里的显示顺序；short 是竖栏里的 2 字短名，label 用于标题与 tooltip
  const MODULES = [
    { key: 'today', short: '概览', label: '今日概览', icon: I.today, subtitle: () => {
      const st = S.stats();
      return st.total ? `共 ${st.total} 项任务 · 完成 ${st.progress}%` : '还没有任务，先建一个吧';
    } },
    { key: 'calendar', short: '日历', label: '日历', icon: I.calendar, subtitle: () => '按截止日期排布任务' },
    { key: 'projects', short: '项目', label: '项目', icon: I.project,
      title: () => '全部项目',
      subtitle: () => `${S.projects(true).length} 个项目` },
    { key: 'board', short: '看板', label: '看板', icon: I.board, subtitle: () => `${taskScopeLabel()} · 已过期 / 待办 / 已完成 / 归档` },
    { key: 'stats', short: '统计', label: '统计', icon: I.chart, subtitle: () => '完成率 · 优先级 · 标签分布' },
    { key: 'trash', short: '回收站', label: '回收站', icon: I.trash, subtitle: () => `${S.trashCount()} 项待清理` },
    { key: 'task', short: '新建任务', label: '新建任务', icon: I.plus, nav: false,
      title: () => (editingTaskId ? '编辑任务' : '新建任务'),
      subtitle: () => '填写后保存，或按 Ctrl+Enter' },
    { key: 'project', label: '新建项目', icon: I.project, nav: false,
      title: () => (editingProjectId ? '编辑项目' : '新建项目'),
      subtitle: () => '填写后保存，取消返回项目列表' },
    { key: 'extensions', short: '扩展', label: '扩展', icon: I.extension, subtitle: () => '扩展管理' },
    { key: 'about', short: '关于', label: '关于', icon: I.info },
    { key: 'settings', short: '设置', label: '设置', icon: I.gear, subtitle: () => isDesktop ? '外观 · 数据 · 窗口' : '外观 · 使用偏好 · 数据' },
  ];
  const NAV_MODULES = MODULES.filter((m) => m.nav !== false);
  const workspaceTabKey = () => NAV_MODULES.some(m => m.key === S.state.activeModule) ? S.state.activeModule : 'projects';
  function workspaceTabs() {
    const saved = S.state.settings.workspaceTabs;
    return [...new Set((Array.isArray(saved) ? saved : []).filter(key => NAV_MODULES.some(m => m.key === key)))];
  }
  function ensureWorkspaceTab(key = workspaceTabKey()) {
    const tabs = workspaceTabs();
    if (!tabs.includes(key)) tabs.push(key);
    const changed = JSON.stringify(S.state.settings.workspaceTabs) !== JSON.stringify(tabs);
    S.state.settings.workspaceTabs = tabs;
    return changed;
  }
  function workspaceTabTitle(key) {
    const module = byKey(key === workspaceTabKey() ? S.state.activeModule : key);
    return module.title ? module.title() : module.label;
  }
  function renderWorkspaceTabs() {
    if (ensureWorkspaceTab()) S.save();
    const tabs = workspaceTabs(), active = workspaceTabKey(), host = $('workspaceTabs');
    host.innerHTML = tabs.map(key => `<div class="workspace-tab${key === active ? ' active' : ''}"><button type="button" role="tab" id="workspaceTab-${key}" data-tab-select="${key}" aria-selected="${key === active}" aria-controls="panel" tabindex="${key === active ? 0 : -1}" title="${esc(workspaceTabTitle(key))}">${byKey(key).icon}<span class="workspace-tab-label">${esc(workspaceTabTitle(key))}</span></button>${tabs.length > 1 || key !== 'today' ? `<button type="button" class="workspace-tab-close" data-tab-close="${key}" aria-label="关闭${esc(workspaceTabTitle(key))}标签页" title="关闭标签页">${I.x}</button>` : ''}</div>`).join('');
    document.title = workspaceTabTitle(active) + ' · MoreReady';
    const selected = host.querySelector('[aria-selected="true"]');
    if (selected) {
      const tab = selected.getBoundingClientRect(), strip = host.getBoundingClientRect();
      if (tab.left < strip.left) host.scrollLeft -= strip.left - tab.left;
      else if (tab.right > strip.right) host.scrollLeft += tab.right - strip.right;
    }
  }
  function closeWorkspaceTab(key) {
    const tabs = workspaceTabs(), index = tabs.indexOf(key), active = workspaceTabKey();
    if (index < 0 || (key === active && editingGuard())) return;
    tabs.splice(index, 1);
    S.state.settings.workspaceTabs = tabs;
    if (key === active) {
      const next = tabs[Math.min(index, tabs.length - 1)] || 'today';
      if (next !== S.state.activeModule) openModule(next);
      else { ensureWorkspaceTab(next); S.save(); renderWorkspaceTabs(); }
    } else { S.save(); renderWorkspaceTabs(); }
    $('workspaceTabs').querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
  }

  /** 看板的四个状态桶（按截止日期与工作流状态归桶） */
  const BUCKETS = [
    { key: 'expired', label: '已过期', color: 'var(--danger)' },
    { key: 'todo', label: '待办', color: '#8b95a7' },
    { key: 'done', label: '已完成', color: 'var(--status-done)' },
    { key: 'archived', label: '归档', color: '#b58cff' },
  ];

  function bucketOf(t) {
    if (t.status === 'done') return 'done';
    if (t.status === 'doing') return 'todo';
    if (t.due && t.due < day(0)) return 'expired';
    return 'archived';
  }
  const byKey = (k) => MODULES.find((m) => m.key === k) || MODULES[0];

  /* ---------------- 视图状态 ---------------- */
  const view = {
    lastModule: null,
    scroll: {},               // 每个模块的滚动位置
    calMonth: null,           // {y,m}
    calSel: null,             // 'YYYY-MM-DD'
    boardPage: { todo: 0, doing: 0, waiting: 0, done: 0 },
    boardSize: 6,
    busy: false,
    projectQuery: '',
    projectFilter: 'all',
    projectLayout: 'cards',
    projectScroll: 0,
    detailProjectId: null,
    detailViewport: {},
  };

  /* ---------------- 小工具 ---------------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const currentProject = () => S.state.projects.find((p) => p.id === S.state.activeProjectId) || null;
  const currentProjectName = () => (currentProject() ? currentProject().name : '全部项目');
  const taskScopeLabel = () => (S.state.activeProjectId === 'all' ? '全部项目' : currentProjectName());
  const uncategorized = () => S.state.tasks.filter((t) => !S.state.projects.some((p) => p.id === t.projectId));
  const projOf = (t) => S.state.projects.find((p) => p.id === t.projectId) || { name: '未归类', color: '#8b95a7' };
  const projectNameOf = (id) => {
    const p = S.state.projects.find((x) => x.id === id);
    return p ? p.name : '未归类';
  };

  function dueMeta(t) {
    if (!t.due) return { text: '', cls: '' };
    const diff = Math.round((parseDay(t.due) - parseDay(day(0))) / 864e5);
    if (t.status === 'done') return { text: fmtShort(t.due), cls: '' };
    if (diff < 0) return { text: `逾期 ${-diff} 天`, cls: 'late' };
    if (diff === 0) return { text: '今天', cls: 'today' };
    if (diff === 1) return { text: '明天', cls: '' };
    if (diff <= 6) return { text: `${diff} 天后`, cls: '' };
    return { text: fmtShort(t.due), cls: '' };
  }
  const fmtShort = (d) => { const x = parseDay(d); return `${x.getMonth() + 1}/${x.getDate()}`; };

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, 1500);
  }

  /* ================================================================
   * 竖向菜单
   * ================================================================ */
  function railBadge(key) {
    const st = S.stats();
    if (key === 'today') return st.dueToday + st.overdue ? { n: st.dueToday + st.overdue, hot: true } : null;
    if (key === 'board') return st.doing ? { n: st.doing } : null;
    if (key === 'inbox') { const n = uncategorized().length; return n ? { n } : null; }
    if (key === 'calendar') return st.overdue ? { n: st.overdue, hot: true } : null;
    if (key === 'trash') { const n = S.trashCount(); return n ? { n, hot: true } : null; }
    return null;
  }

  /* 幽灵点击防护：
   * 处理点击时重建菜单/详情会移除被点中的节点，Chromium 会把同一次点击
   * 重新派发到该坐标下新出现的元素上，导致「点一下触发两次」（例如展开后立刻收起）。
   * 因此每次重建 DOM 后打一个时间戳，紧随其后的重复点击直接忽略。 */
  let lastRebuild = 0;
  const markRebuild = () => { lastRebuild = performance.now(); };

  function renderRail() {
    // 整条竖栏里放文字按钮；完整名称走 tooltip。主导航之后用一条细分隔线接次要入口
    const item = (m) => {
      const b = railBadge(m.key);
      const cur = S.state.activeModule === m.key;
      return `<button class="nav-item" data-nav="${m.key}" aria-current="${cur}" title="${esc(m.label)}" aria-label="${esc(m.label)}">
        ${m.icon}<span class="nav-label">${esc(m.short)}</span>
        ${b ? `<span class="badge${b.hot ? '' : ' soft'}">${b.n}</span>` : ''}
      </button>`;
    };
    railNav.innerHTML = `<div class="rail-nav-section"><span class="rail-nav-caption">工作空间</span>${NAV_MODULES.filter(m => ['today', 'calendar', 'projects', 'board', 'stats'].includes(m.key)).map(item).join('')}</div>
      <div class="rail-nav-section"><span class="rail-nav-caption">工具与设置</span>${NAV_MODULES.filter(m => !['today', 'calendar', 'projects', 'board', 'stats'].includes(m.key)).map(item).join('')}</div>`;
    markRebuild();
  }

  /* ================================================================
   * 页面导航
   * ================================================================ */
  function openModule(key) {
    if (!NAV_MODULES.some(m => m.key === key)) return false;
    if (S.state.activeModule === key) { closeDropMenu(); return true; }
    if (editingGuard()) return false;
    closeDropMenu();
    dismissDrawer();
    if (key === 'settings') window.PMSystemSettings?.refresh();
    resetDetail();
    S.state.activeModule = key;
    ensureWorkspaceTab(key);
    pendingProjectForTask = false;
    S.save();
    renderRail(); render();
    return true;
  }
  function showSystemSettings() {
    openModule('settings');
    const section = $('systemSettings');
    if (!section) return;
    const body = panelBody.getBoundingClientRect(), box = section.getBoundingClientRect();
    panelBody.scrollTop += box.top - body.top - Math.max(0, (body.height - box.height) / 2);
  }

  /* ================================================================
   * 应用内下拉菜单（替代原生 <select>）
   * 原生 select 的系统弹层在无边框窗口里会被重绘打断（表现为「点一下马上收回」），
   * 而且外观不受主题控制，所以自己画一个：按钮 + 浮层。
   * ================================================================ */
  let dropMenu = null;
  let dropBackdrop = null;
  let dropOwner = null;

  function ensureDropMenu() {
    if (dropMenu) return dropMenu;
    // 透明遮罩：点浮层以外的任何地方都关闭
    dropBackdrop = document.createElement('div');
    dropBackdrop.className = 'drop-backdrop';
    dropBackdrop.hidden = true;
    dropBackdrop.addEventListener('mousedown', (e) => { e.preventDefault(); closeDropMenu(); });
    document.body.appendChild(dropBackdrop);

    dropMenu = document.createElement('div');
    dropMenu.className = 'drop-menu';
    dropMenu.hidden = true;
    // 用捕获阶段处理，避免冒泡到全局动作分发里
    dropMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.drop-item');
      if (!item || item.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const owner = dropOwner;
      closeDropMenu();
      const action = item.dataset.dropAction;
      if (action && ACTIONS[action]) ACTIONS[action](item.dataset.value, item);
      else if (owner) {
        // 没绑动作时，直接把值写回触发按钮的文本
        const label = owner.querySelector('[data-drop-label]');
        if (label) label.textContent = item.textContent.trim();
      }
    }, true);
    document.body.appendChild(dropMenu);
    return dropMenu;
  }

  function closeDropMenu() {
    if (!dropMenu) return;
    dropMenu.hidden = true;
    if (dropBackdrop) dropBackdrop.hidden = true;
    if (dropOwner) dropOwner.setAttribute('aria-expanded', 'false');
    dropOwner = null;
  }

  function openDropMenu(btn, rows) {
    const menu = ensureDropMenu();
    const theme = getComputedStyle(app);
    ['--sheet-bg', '--text', '--dim', '--dim2', '--line'].forEach((name) => menu.style.setProperty(name, theme.getPropertyValue(name)));
    if (dropOwner === btn && !menu.hidden) { closeDropMenu(); return; }
    if (dropOwner) dropOwner.setAttribute('aria-expanded', 'false');
    dropOwner = btn;
    menu.dataset.kind = btn.dataset.drop || '';
    btn.setAttribute('aria-expanded', 'true');

    menu.innerHTML = rows.map((r) => {
      if (r.type === 'group') return `<div class="drop-group">${esc(r.label)}</div>`;
      if (r.type === 'sep') return `<div class="drop-sep"></div>`;
      return `<button class="drop-item" type="button" data-value="${esc(r.value)}"
        ${r.action ? `data-drop-action="${esc(r.action)}"` : ''}
        aria-selected="${r.selected ? 'true' : 'false'}">
        <span class="di-check">${I.check}</span><span>${esc(r.label)}</span>
      </button>`;
    }).join('');

    // 先显示再量尺寸，保证定位准确
    menu.hidden = false;
    if (dropBackdrop) dropBackdrop.hidden = false;
    menu.style.visibility = 'hidden';
    positionDropMenu();
    menu.style.visibility = '';
  }

  function positionDropMenu() {
    if (!dropOwner || !dropMenu || dropMenu.hidden) return;
    const b = dropOwner.getBoundingClientRect();
    if (b.bottom <= 0 || b.top >= window.innerHeight) { closeDropMenu(); return; }
    const mw = dropMenu.offsetWidth;
    const mh = dropMenu.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = b.right - mw;                       // 右对齐触发按钮
    left = Math.max(6, Math.min(left, vw - mw - 6));
    let top = b.bottom + 6;
    if (top + mh > vh - 6) top = Math.max(6, b.top - mh - 6);   // 下面放不下就往上弹
    dropMenu.style.left = `${Math.round(left)}px`;
    dropMenu.style.top = `${Math.round(top)}px`;
  }

  /** 用按钮文本里记录的值判断当前项 */
  const dropCurrent = (btn) => btn.dataset.value || '';

  function themeDropRows(current) {
    const rows = [{ type: 'group', label: '浅色' }];
    rows.push({ label: THEMES.daylight.label, value: 'daylight', selected: current === 'daylight', action: 'theme' });
    rows.push({ type: 'group', label: '深色' });
    rows.push({ label: THEMES.aurora.label, value: 'aurora', selected: current === 'aurora', action: 'theme' });
    rows.push({ type: 'group', label: '主题色' });
    ['graphite', 'ocean', 'sakura'].forEach((k) => {
      rows.push({ label: THEMES[k].label, value: k, selected: current === k, action: 'theme' });
    });
    rows.push({ type: 'sep' });
    rows.push({ label: '跟随系统', value: 'system', selected: current === 'system', action: 'theme' });
    return rows;
  }

  function scopeDropRows(current) {
    const rows = [{ label: '全部项目', value: 'all', selected: current === 'all', action: 'scope' }];
    S.state.projects.forEach((p) => rows.push({ label: p.name, value: p.id, selected: current === p.id, action: 'scope' }));
    return rows;
  }

  const PROJECT_FILTERS = [{ key: 'all', label: '全部项目' }, { key: 'active', label: '进行中' },
    { key: 'done', label: '已完成' }, { key: 'archived', label: '已归档' }];
  function projectFilterRows() {
    return PROJECT_FILTERS.map((item) => ({
      label: item.label, value: item.key, selected: view.projectFilter === item.key, action: 'project-filter',
    }));
  }
  function projectLayoutRows() {
    return [{ key: 'cards', label: '卡片' }, { key: 'compact', label: '紧凑列表' }].map((item) => ({
      label: item.label, value: item.key, selected: view.projectLayout === item.key, action: 'project-layout',
    }));
  }

  /** 任务编辑弹层里的「所属项目」：末尾带一个新建项目入口 */
  function taskProjectDropRows(current) {
    const rows = S.state.projects.map((p) => ({
      label: p.name, value: p.id, selected: current === p.id, action: 'task-project',
    }));
    if (!rows.length) rows.push({ label: '（还没有项目）', value: '', selected: true, action: 'task-project' });
    rows.push({ type: 'sep' });
    rows.push({ label: '＋ 新建项目', value: '__new__', action: 'new-project-inline' });
    return rows;
  }

  const weekDropRows = (current) => ([
    { label: '周一', value: '1', selected: String(current) === '1', action: 'weekstart' },
    { label: '周日', value: '0', selected: String(current) === '0', action: 'weekstart' },
  ]);

  const themeLabel = (v) => (v === 'system' ? '跟随系统' : (THEMES[v] ? THEMES[v].label : '跟随系统'));

  /* ================================================================
   * 动作表：供点击分发与下拉菜单共用
   * ================================================================ */
  const ACTIONS = {
    'workspace-tab'(key) { openModule(key); },
    scope(value) {
      S.state.activeProjectId = value;
      S.save();
      renderRail();
      render();
    },
    theme(value) {
      S.state.settings.theme = value;
      applySettings();
      S.save();
      render();
    },
    weekstart(value) {
      S.state.settings.weekStart = Number(value);
      S.save();
      render();
    },
    'board-sort'(value) {
      view.boardSort = value;
      render();
    },
    'board-view'(value) { S.state.settings.boardView = value; S.save(); render(); },
    'canvas-view'(value) {
      S.state.settings.canvasView = value; S.save();
      const viewport = view.detailViewport[view.detailProjectId];
      if (viewport) viewport.manual = false;
      renderDetail();
    },
    'project-filter'(value) { view.projectFilter = value; view.projectScroll = 0; const results = $('projectResults'); if (results) results.scrollTop = 0; render(); },
    'project-layout'(value) { view.projectLayout = value; render(); },
    'task-reminder'(value) { setTaskChoice('reminder', value, R.MODES); refreshReminderField(); },
    'task-priority'(value) { setTaskChoice('priority', value, PRIORITY); },
    'task-project'(value) {
      if (editingTaskId) return;
      if (draftProjectId !== value) draftDependencies = [];
      draftProjectId = value;
      refreshTaskParents();
      const btn = $q('[data-drop="task-project"]');
      if (btn) {
        btn.dataset.value = value;
        const label = btn.querySelector('[data-drop-label]');
        if (label) label.textContent = projectNameOf(value);
      }
      const subtitle = $('taskDrawerHead').querySelector('.ph-title p');
      if (subtitle) subtitle.textContent = projectNameOf(value);
      refreshReminderField();
    },
    /** 任务表单里点「＋ 新建项目」：切到新建项目页，建好后回到任务表单并自动选中 */
    'new-project-inline'() {
      pendingProjectForTask = true;
      openProjectPage(null);
    },
  };

  /* ================================================================
   * 渲染
   * ================================================================ */
  function render() {
    closeAccentPicker();
    app.dataset.module = S.state.activeModule;
    app.classList.toggle('projects-workspace', S.state.activeModule === 'projects');
    if (S.state.activeModule === 'projects' && !S.state.projects.some((project) => project.id === view.detailProjectId)) {
      view.detailProjectId = S.state.projects.some((project) => project.id === S.state.workspaceProjectId)
        ? S.state.workspaceProjectId : S.projects(true)[0]?.id || null;
    }
    const projectResults = panelBody.querySelector('#projectResults');
    if (projectResults) view.projectScroll = projectResults.scrollTop;
    const m = byKey(S.state.activeModule);
    const title = m.title ? m.title() : m.label;
    renderWorkspaceTabs();
    panelHead.hidden = S.state.activeModule !== 'projects';

    panelHead.innerHTML = `
      <div class="ph-title">
        <h1>${esc(title)}</h1>
        ${m.subtitle ? `<p>${esc(m.subtitle())}</p>` : ''}
      </div>
      <div class="ph-spacer"></div>`;

    window.PMOverviewLayout.detach(panelBody);
    const keep = view.scroll[S.state.activeModule] || 0;
    const pageHeading = ['projects', 'task', 'project'].includes(S.state.activeModule) ? '' : `<header class="workspace-page-heading"><span class="workspace-page-icon" aria-hidden="true">${m.icon}</span><div><h2>${esc(S.state.activeModule === 'board' ? (currentProject() ? currentProjectName() : '任务工作区') : title)}</h2>${m.subtitle ? `<p>${esc(m.subtitle())}</p>` : ''}</div></header>`;
    panelBody.innerHTML = pageHeading + (VIEWS[S.state.activeModule] ? VIEWS[S.state.activeModule]() : '');
    panelBody.classList.toggle('projects-body', S.state.activeModule === 'projects');
    panelBody.scrollTop = keep;
    bindViewEvents();
    if (S.state.activeModule === 'projects') {
      detailPanel.hidden = false;
      renderDetail();
    } else detailPanel.hidden = true;
    markRebuild();
  }
  function bindViewEvents() {
    if (S.state.activeModule === 'today') window.PMOverviewLayout.mount(panelBody, S);
    const projectSearch = panelBody.querySelector('#projectSearch');
    if (projectSearch) projectSearch.addEventListener('input', () => {
      view.projectQuery = projectSearch.value;
      view.projectScroll = 0;
      refreshProjectResults();
    });
    const projectResults = panelBody.querySelector('#projectResults');
    if (projectResults) {
      projectResults.scrollTop = view.projectScroll;
      projectResults.addEventListener('scroll', () => { view.projectScroll = projectResults.scrollTop; });
    }
    // 看板搜索：只重绘列，不整页重绘（否则输入框会丢焦点）
    const bsearch = panelBody.querySelector('#boardSearch');
    if (bsearch) {
      bsearch.addEventListener('input', () => {
        view.boardQuery = bsearch.value;
        const grid = panelBody.querySelector('#boardGrid');
        if (grid) grid.innerHTML = boardColsHTML(boardTasks());
      });
    }
    const search = panelBody.querySelector('#searchInput');
    if (search) {
      search.addEventListener('input', () => {
        const box = panelBody.querySelector('#searchResults');
        if (box) box.innerHTML = searchResultsHTML(search.value);
      });
    }
  }

  /* ---------------- 通用片段 ---------------- */
  function ringHTML(pct) {
    const r = 27, c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);
    return `<div class="ring">
      <svg width="68" height="68">
        <circle cx="34" cy="34" r="${r}" fill="none" stroke="var(--line)" stroke-width="7"/>
        <circle cx="34" cy="34" r="${r}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
      </svg>
      <div class="val">${pct}<small>%</small></div>
    </div>`;
  }

  function taskRowHTML(t, opts) {
    const o = opts || {};
    const p = projOf(t);
    const due = dueMeta(t);
    const done = t.status === 'done';
    const subs = t.subtasks || [];
    const subDone = subs.filter((x) => x.done).length;
    return `<div class="task-row${done ? ' done' : ''}" data-task="${t.id}">
      <button class="tick${done ? ' on' : ''}" data-action="toggle" data-id="${t.id}" title="切换完成">${I.check}</button>
      <div class="t-main">
        <div class="t-title">${esc(t.title)}</div>
        <div class="t-meta">
          ${o.hideProject ? '' : `<span class="pdot" style="background:${p.color}"></span><span>${esc(p.name)}</span>`}
          ${t.due ? `<span class="sep"></span><span class="due ${due.cls}">${I.clock}${esc(due.text)}</span>` : ''}
          ${subs.length ? `<span class="sep"></span><span>${subDone}/${subs.length} 子项</span>` : ''}
          ${(t.tags || []).length ? `<span class="sep"></span><span>${esc(t.tags.join(' · '))}</span>` : ''}
        </div>
      </div>
      <div class="t-right">
        <span class="t-pri" style="color:${PRIORITY[t.priority].color};background:color-mix(in srgb, ${PRIORITY[t.priority].color} 18%, transparent)">${PRIORITY[t.priority].label.split(' ')[0]}</span>
        <span class="pager">
          ${t.status !== 'done' ? `<button data-action="advance" data-id="${t.id}" title="推进到下一状态">${I.arrowR}</button>` : `<button data-action="reopen" data-id="${t.id}" title="重新打开">${I.up}</button>`}
        </span>
      </div>
    </div>`;
  }

  function listHTML(tasks, opts) {
    const o = opts || {};
    if (!tasks.length) return `<div class="empty"><b>${esc(o.emptyTitle || '这里是空的')}</b><span>${esc(o.emptyHint || '')}</span></div>`;
    return tasks.map((t) => taskRowHTML(t, o)).join('');
  }

  const sortTasks = (a) => a.slice().sort((x, y) => {
    if ((x.status === 'done') !== (y.status === 'done')) return x.status === 'done' ? 1 : -1;
    const px = ['p0', 'p1', 'p2', 'p3'].indexOf(x.priority), py = ['p0', 'p1', 'p2', 'p3'].indexOf(y.priority);
    if (px !== py) return px - py;
    if (x.due && y.due) return x.due < y.due ? -1 : 1;
    if (x.due) return -1;
    if (y.due) return 1;
    return 0;
  });

  /* ================================================================
   * 视图：今日概览
   * ================================================================ */
  const VIEWS = {};

  VIEWS.today = function () {
    const st = S.stats();
    const all = S.tasksIn();
    const overdue = all.filter((t) => t.status !== 'done' && t.due && t.due < day(0));
    const dueToday = all.filter((t) => t.status !== 'done' && t.due === day(0));
    const doing = all.filter((t) => t.status === 'doing');
    const next = sortTasks(all.filter((t) => t.status !== 'done' && t.due && t.due > day(0))).slice(0, 5);
    const recentDone = all.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 4);

    const hello = (() => {
      const h = new Date().getHours();
      if (h < 6) return '夜深了'; if (h < 11) return '早上好'; if (h < 14) return '中午好'; if (h < 18) return '下午好'; return '晚上好';
    })();
    const tip = st.overdue
      ? `${st.overdue} 项已逾期，建议先处理。`
      : st.dueToday ? `今天有 ${st.dueToday} 项到期。`
      : st.doing ? `${st.doing} 项进行中，保持节奏。` : '今天没有到期任务，可以推进长期目标。';

    return `
      <div class="today-hero">
        <div class="hero-txt">
          <h2>${hello}，${esc(scopeLabelOwner())}</h2>
          <p>${esc(tip)}</p>
        </div>
        ${ringHTML(st.progress)}
      </div>

      <div class="kpis">
        <div class="kpi"><div class="n">${st.doing}</div><div class="k">进行中</div></div>
        <div class="kpi"><div class="n">${st.dueToday}</div><div class="k">今日到期</div></div>
        <div class="kpi${st.overdue ? ' warn' : ''}"><div class="n">${st.overdue}</div><div class="k">已逾期</div></div>
        <div class="kpi ok"><div class="n">${st.done}</div><div class="k">已完成</div></div>
      </div>

      <div class="overview-layout-tools"><span>拖动手柄排序 · 拖动右下角调整大小</span><button class="btn tiny" data-overview-reset>恢复布局</button></div>
      <div class="overview-grid">
        ${overdue.length ? overviewCardHTML('urgent', '需要马上处理', sortTasks(overdue), 'urgent') : ''}
        ${overviewCardHTML('due', '今天到期', sortTasks(dueToday), '', '今天没有到期任务')}
        ${overviewCardHTML('doing', '正在进行', sortTasks(doing), '', '暂无进行中的任务')}
        ${overviewCardHTML('next', '接下来', next, '', '暂无即将到期的任务')}
        ${overviewCardHTML('done', '最近完成', recentDone, '', '暂无已完成的任务')}
        <section class="overview-section overview-progress" data-overview-card="projects">${overviewHeaderHTML('项目进度', S.projects().length + ' 个项目')}<div class="overview-content">${projectLinesHTML()}</div>${overviewResizeHTML('项目进度')}</section>
      </div>`;

  };

  function overviewHeaderHTML(title, count) {
    return `<header><button class="overview-drag-handle" data-overview-drag aria-label="拖动${title}调整顺序" title="拖动调整顺序，Alt + 上下箭头也可调整">⠿</button><h3>${title}</h3><span>${count}</span></header>`;
  }
  function overviewResizeHTML(title) {
    return `<button class="overview-resize-handle" data-overview-resize aria-label="调整${title}卡片大小" title="拖动调整宽高，方向键也可调整大小"></button>`;
  }
  function overviewCardHTML(key, title, tasks, className = '', emptyTitle = '暂无任务') {
    return `<section class="overview-section ${className}" data-overview-card="${key}">${overviewHeaderHTML(title, tasks.length + ' 项')}<div class="overview-content">${listHTML(tasks, { emptyTitle })}</div>${overviewResizeHTML(title)}</section>`;
  }

  function scopeLabelOwner() {
    return S.state.activeProjectId === 'all' ? '这是你的工作台' : currentProjectName();
  }

  function projectLinesHTML() {
    const list = S.projects();
    if (!list.length) return `<div class="empty"><b>还没有项目</b><span>在「项目」里新建一个</span></div>`;
    return list.map((p) => {
      const st = S.stats(p.id);
      return `<div class="proj-line" data-goto-project="${p.id}">
        <span class="pdot" style="background:${p.color};width:8px;height:8px;border-radius:3px"></span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="pl-name">${esc(p.name)}</span>
            <span class="pl-num">${st.done}/${st.total}</span>
          </div>
          <div class="bar" style="margin-top:6px"><i style="width:${st.progress}%;background:${p.color}"></i></div>
        </div>
        <span class="pl-num">${st.progress}%</span>
      </div>`;
    }).join('');
  }

  /* ================================================================
   * 视图：项目
   * ================================================================ */
  function filteredProjects() {
    const query = view.projectQuery.trim().toLowerCase();
    return S.projects(true).filter((p) => {
      const stats = S.stats(p.id);
      const done = stats.total > 0 && stats.total === stats.done;
      const matches = view.projectFilter === 'all' || (view.projectFilter === 'archived' ? p.archived
        : !p.archived && (view.projectFilter === 'done' ? done : !done));
      return matches && `${p.name} ${p.desc || ''}`.toLowerCase().includes(query);
    });
  }
  function projectResultsHTML() {
    const list = filteredProjects();
    const cards = new Map(list.map((p) => {
      const st = S.stats(p.id);
      const soon = sortTasks(S.tasksIn(p.id).filter((t) => t.status !== 'done' && t.due)).slice(0, 2);
      return [p.id, `<div class="card project-card${view.detailProjectId === p.id ? ' selected' : ''}" data-open-project="${esc(p.id)}" draggable="true" role="button" tabindex="0" aria-pressed="${view.detailProjectId === p.id}" style="border-left:3px solid ${p.color}">
        <div class="project-card-head">
          <b>${esc(p.name)}</b>
          <div class="project-card-actions">
            <button class="icon-btn" data-action="edit-project" data-id="${esc(p.id)}" title="编辑项目" aria-label="编辑项目">${I.edit}</button>
            <button class="icon-btn" data-action="archive-project" data-id="${esc(p.id)}" title="${p.archived ? '取消归档' : '归档项目'}" aria-label="${p.archived ? '取消归档' : '归档项目'}" aria-pressed="${!!p.archived}">${p.archived ? I.restore : I.archive}</button>
            <button class="icon-btn project-delete" data-action="delete-project" data-id="${esc(p.id)}" title="删除项目" aria-label="删除项目">${I.trash}</button>
          </div>
        </div>
        ${p.desc ? `<p class="project-desc" style="font-size:11px;color:var(--dim);margin-top:4px">${esc(p.desc)}</p>` : ''}
        ${p.archived ? '<span class="project-status">已归档</span>' : (st.total && st.done === st.total ? '<span class="project-status">已完成</span>' : '')}
        <div class="bar" style="margin:9px 0 7px"><i style="width:${st.progress}%;background:${p.color}"></i></div>
        <div style="display:flex;gap:10px;font-size:10.5px;color:var(--dim)">
          <span>${st.progress}% 完成</span><span>${st.done}/${st.total} 项</span>
          ${st.overdue ? `<span style="color:var(--danger)">${st.overdue} 逾期</span>` : ''}
        </div>
        ${soon.length ? `<div class="project-soon" style="margin-top:9px;padding-top:8px;border-top:1px solid var(--line)">
          ${soon.map((t) => `<div style="display:flex;gap:6px;align-items:center;font-size:11px;color:var(--dim);margin-top:4px">
            <span class="pdot" style="background:${PRIORITY[t.priority].color}"></span>
            <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</span>
            <span class="${dueMeta(t).cls === 'late' ? 'due late' : 'due'}">${esc(dueMeta(t).text)}</span>
          </div>`).join('')}
        </div>` : ''}
      </div>`];
    }));

    return window.PMProjectGroups.resultsHTML(list, cards) || `<div class="empty"><b>${S.projects(true).length ? '没有匹配的项目' : '还没有项目'}</b><span>${S.projects(true).length ? '试试其他关键词或筛选条件' : '点击上方「新建项目」即可创建'}</span></div>`;
  }
  function refreshProjectResults() {
    const results = $('projectResults');
    if (!results) return;
    results.innerHTML = projectResultsHTML();
    results.scrollTop = view.projectScroll;
  }
  VIEWS.projects = function () {
    return `<div class="project-toolbar">
      <button class="rail-cta project-new-button" data-action="new-project-page" title="新建项目">${I.project}<span>新建项目</span></button>
      <div class="project-search-row"><input class="input" id="projectSearch" aria-label="搜索项目" placeholder="搜索项目名称、描述…" value="${esc(view.projectQuery)}" autocomplete="off" />
      <div class="project-filter-controls">
        <div class="project-filter-control"><span class="project-filter-label" id="projectStatusLabel">项目状态</span><button class="select drop-trigger" data-drop="project-status" aria-labelledby="projectStatusLabel" aria-haspopup="listbox" aria-expanded="false" title="项目状态"><span data-drop-label>${esc(PROJECT_FILTERS.find((x) => x.key === view.projectFilter).label)}</span>${I.down}</button></div>
        <div class="project-filter-control"><span class="project-filter-label" id="projectLayoutLabel">视图</span><button class="select drop-trigger" data-drop="project-layout" aria-labelledby="projectLayoutLabel" aria-haspopup="listbox" aria-expanded="false" title="视图"><span data-drop-label>${view.projectLayout === 'cards' ? '卡片' : '紧凑列表'}</span>${I.down}</button></div>
      </div></div>
      <div class="project-canvas-tools" id="projectCanvasTools" role="toolbar" aria-label="项目画布操作" hidden></div>
      ${window.PMProjectGroups.toolbarHTML()}
    </div><div class="project-results ${view.projectLayout}" id="projectResults">${projectResultsHTML()}</div>`;
  };

  /* 第三栏：依赖图中每项任务只出现一次，支持并行分支和多前置任务汇合。 */
  function resetDetail() {
    DAG.detach(detailBody);
    view.detailProjectId = null;
    detailPanel.hidden = true;
    dismissDrawer();
  }
  async function openProjectTree(id) {
    if (!S.state.projects.some((p) => p.id === id)) return;
    closeDropMenu();
    dismissDrawer();
    view.detailProjectId = id;
    sheetMode = 'module';
    S.state.activeModule = 'projects';
    S.save();

    detailPanel.hidden = false;
    renderRail();
    if (!$('projectResults')) render();
    else refreshProjectResults();
    renderDetail();
    S.state.workspaceProjectId = id; S.save();
  }
  function treeNodeHTML(task, graph) {
    const parents = G.dependencies(task);
    const unavailable = graph.missing.get(task.id).length;
    const blocked = parents.some((id) => !graph.byId.has(id) || graph.byId.get(id).status !== 'done');
    const problem = graph.unresolved.includes(task.id);
    const label = problem ? '依赖关系需修复' : unavailable ? '前置任务不可用' : blocked && task.status !== 'done'
      ? '等待前置任务' : task.status === 'done' ? '已完成' : parents.length ? '前置任务已完成' : '独立起点';
    const preview = S.state.settings.canvasView === 'simple' ? '' : subtasksPreviewHTML(task, 'tree-node-subs');
    return `<span class="tree-node-title">${esc(task.title)}</span>${preview}<span class="tree-node-meta"><span style="color:${STATUS[task.status].color}">${esc(STATUS[task.status].label)}</span><span class="${dueMeta(task).cls === 'late' ? 'due late' : ''}">${esc(dueMeta(task).text || '无截止日期')}</span></span><span class="tree-node-hint${blocked || problem ? ' blocked' : ''}">${esc(label)}</span>`;
  }
  function renderDetail() {
    DAG.detach(detailBody);
    const project = S.state.projects.find((p) => p.id === view.detailProjectId);
    const tools = $('projectCanvasTools');
    if (tools) {
      tools.hidden = !project;
      tools.innerHTML = project ? `<button class="btn tiny" data-ai-work="review" data-project-id="${esc(project.id)}">✦ AI 建议</button>${viewModeHTML('canvas-view', S.state.settings.canvasView)}` : '';
    }
    detailPanel.setAttribute('aria-label', project ? `${project.name} · 项目任务画布` : '项目任务画布');
    if (!project) {
      detailBody.innerHTML = '<div class="workspace-placeholder"><b>开始规划你的项目</b><p>创建一个项目，再添加任务与依赖关系</p><button class="btn primary" data-action="new-project-page">新建项目</button></div>';
      return;
    }
    const tasks = S.tasksIn(project.id);
    const graph = G.analyze(tasks);
    detailBody.innerHTML = '<div class="dag-host"></div>';
    const viewport = view.detailViewport[project.id] ||= { manual: false };
    DAG.mount(detailBody, { tasks, graph, state: viewport, selectedId: taskDrawerMask.hidden ? null : editingTaskId,
      onNewTask: () => { closeDropMenu(); openTaskSheet(null); },
      onLink: (from, to) => {
        const task = S.state.tasks.find((item) => item.id === to && item.projectId === project.id);
        if (!task) return false;
        if (G.dependencies(task).includes(from)) { toast('这两个任务已连接'); return false; }
        try {
          S.updateTask(to, { dependsOn: [...G.dependencies(task), from] });
        } catch (err) { toast(err.message); return false; }
        viewport.manual = false;
        renderDetail();
        refreshTaskParents();
        toast('任务已连接');
        return true;
      },
      nodeHTML: (task) => treeNodeHTML(task, graph), nodeColor: (task) => STATUS[task.status].color });
  }

  /* ================================================================
   * 视图：看板（四列横向画廊：已过期 / 待办 / 已完成 / 归档）
   * ================================================================ */
  const SORTS = [
    { key: 'smart', label: '智能排序' },
    { key: 'due', label: '按截止日期' },
    { key: 'priority', label: '按优先级' },
    { key: 'title', label: '按标题' },
  ];

  function viewModeHTML(kind, value) {
    const current = value === 'simple' ? 'simple' : 'detailed';
    if (kind === 'board-view') return `<button class="select view-mode" data-action="toggle-board-view" data-value="${current}" aria-label="看板视图模式" title="点击切换为${current === 'simple' ? '详细' : '简洁'}模式"><span>${current === 'simple' ? '简洁' : '详细'}</span></button>`;
    return `<button class="select drop-trigger view-mode" data-drop="${kind}" data-value="${current}" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="${kind === 'canvas-view' ? '画布' : '看板'}视图模式" title="视图模式"><span data-drop-label>${current === 'simple' ? '简洁' : '详细'}</span>${I.down}</button>`;
  }
  function subtasksPreviewHTML(task, className) {
    const subs = task.subtasks || [];
    return subs.length ? `<span class="${className}" aria-label="子任务">${subs.map(sub => `<span class="task-sub-preview${sub.done ? ' done' : ''}"><span aria-hidden="true">${sub.done ? '✓' : '○'}</span><span>${esc(sub.title)}</span></span>`).join('')}</span>` : '';
  }

  /** 看板的搜索 / 筛选 / 排序（保留原始列表，过滤在渲染时做） */
  view.boardQuery = '';
  view.boardSort = 'smart';

  function boardTasks() {
    let list = S.tasksIn();

    // 搜索
    const kw = view.boardQuery.trim().toLowerCase();
    if (kw) {
      list = list.filter((t) => (t.title + ' ' + (t.notes || '') + ' ' + (t.tags || []).join(' ') + ' ' + projOf(t).name)
        .toLowerCase().includes(kw));
    }

    // 排序
    const s = view.boardSort;
    if (s === 'due') {
      list.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    } else if (s === 'priority') {
      list.sort((a, b) => ['p0', 'p1', 'p2', 'p3'].indexOf(a.priority) - ['p0', 'p1', 'p2', 'p3'].indexOf(b.priority));
    } else if (s === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
    } else {
      list = sortTasks(list);
    }
    return list;
  }

  VIEWS.board = function () {
    const list = boardTasks();
    return `${boardToolsHTML()}
      <div class="board" id="boardGrid">${boardColsHTML(list)}</div>`;
  };

  function boardColsHTML(list) {
    return BUCKETS.map((b) => colHTML(b, list.filter((t) => bucketOf(t) === b.key))).join('');
  }

  function boardToolsHTML() {
    return `<div class="board-tools">
      <button class="select drop-trigger" data-drop="scope" data-value="${esc(S.state.activeProjectId)}"
        role="combobox" aria-haspopup="listbox" aria-expanded="false" title="项目筛选">
        <span data-drop-label>${esc(currentProjectName())}</span></button>
      <span class="board-view-title">${I.board}<span>任务看板</span></span>
      <input class="input" id="boardSearch" placeholder="搜索任务…" autocomplete="off" value="${esc(view.boardQuery)}" />
      <button class="select drop-trigger" data-drop="board-sort" data-value="${esc(view.boardSort)}"
        role="combobox" aria-haspopup="listbox" aria-expanded="false" title="排序">
        <span data-drop-label>${esc((SORTS.find((x) => x.key === view.boardSort) || SORTS[0]).label)}</span></button>
      ${viewModeHTML('board-view', S.state.settings.boardView || 'simple')}
      <button class="btn primary board-new-task" data-action="new-task">新建 ${I.plus}</button>
    </div>`;
  }

  function colHTML(bucket, items) {
    const size = view.boardSize;
    const pages = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(view.boardPage[bucket.key] || 0, pages - 1);
    const slice = items.slice(page * size, page * size + size);

    return `<div class="col" data-bucket="${bucket.key}">
      <div class="col-head">
        <span class="col-status"><span class="pdot" style="background:${bucket.color}"></span>${bucket.label}</span>
        <span class="n">${items.length}</span>
      </div>
      <div class="col-body">
      ${slice.length ? slice.map((t) => {
        const p = projOf(t); const due = dueMeta(t);
        const cls = bucket.key === 'done' ? ' done' : bucket.key === 'archived' ? ' arch' : bucket.key === 'expired' ? ' expired' : '';
        return `<div class="mini${cls}" data-task="${t.id}">
          <div class="m-title">${esc(t.title)}</div>
          ${S.state.settings.boardView === 'detailed' ? subtasksPreviewHTML(t, 'board-subtasks') : ''}
          <div class="m-foot">
            <span class="pdot" style="background:${p.color}"></span>
            <span style="max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span>
            <span class="sp"></span>
            <span class="t-pri" style="color:${PRIORITY[t.priority].color}">${PRIORITY[t.priority].label.split(' ')[0]}</span>
            ${t.due ? `<span class="due ${due.cls}">${esc(due.text)}</span>` : ''}
            <span class="pager">
              ${t.status !== 'todo' ? `<button data-action="back" data-id="${t.id}" title="回退" aria-label="回退">${I.arrowL}</button>` : ''}
              ${t.status !== 'done' ? `<button data-action="advance" data-id="${t.id}" title="推进" aria-label="推进">${I.arrowR}</button>` : ''}
            </span>
          </div>
        </div>`;
      }).join('') : `<div class="empty" style="padding:14px 4px">空</div>`}
      </div>
      <button class="board-add-task" data-action="new-task" aria-label="新建任务">${I.plus}<span>新页面</span></button>
      ${pages > 1 ? `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px">
        <button class="btn tiny ghost" data-action="board-page" data-col="${bucket.key}" data-dir="-1">‹</button>
        <span style="font-size:10px;color:var(--dim)">${page + 1}/${pages}</span>
        <button class="btn tiny ghost" data-action="board-page" data-col="${bucket.key}" data-dir="1">›</button>
      </div>` : ''}
    </div>`;
  }

  /* ================================================================
   * 视图：日历
   * ================================================================ */
  let calendarClickOnControl = false;
  function calendarDayTasksHTML(key) {
    const tasks = sortTasks(S.tasksIn().filter(task => task.due === key));
    return `<div class="section-title">${esc(key === day(0) ? '今天' : fmtShort(key) + ' 的任务')} <span style="font-size:10px;letter-spacing:0;text-transform:none">共 ${tasks.length} 项</span></div>
      ${tasks.length ? listHTML(tasks) : '<div class="empty"><b>这天没有任务</b><span>双击日期可新建任务</span></div>'}`;
  }
  function selectCalendarDay(key) {
    if (!R.validDay(key)) return;
    view.calSel = key;
    // Preserve the clicked cell so the browser can deliver its second click and dblclick.
    panelBody.querySelectorAll('.cal-cell').forEach(cell => {
      const selected = cell.dataset.day === key;
      cell.classList.toggle('sel', selected);
      (cell.matches('button') ? cell : cell.querySelector('.cal-day-select'))?.setAttribute('aria-pressed', String(selected));
    });
    const list = $('calendarDayTasks');
    if (list) list.innerHTML = calendarDayTasksHTML(key);
  }
  function newCalendarTask(key) {
    if (!R.validDay(key)) return;
    if (!taskDrawerMask.hidden && $q('#f-title')) {
      if (taskEditorSignature() !== taskEditorBaseline) { toast('请先保存或取消当前编辑'); return; }
    } else if (editingGuard()) return;
    selectCalendarDay(key);
    openTaskSheet(null, { due: key });
  }
  VIEWS.calendar = function () {
    const detailed = S.state.settings.calendarView === 'detailed';
    const base = view.calMonth || (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
    view.calMonth = base;
    const first = new Date(base.y, base.m, 1);
    const startPad = (first.getDay() - (S.state.settings.weekStart === 1 ? 1 : 0) + 7) % 7;
    const start = new Date(base.y, base.m, 1 - startPad);
    const dows = S.state.settings.weekStart === 1 ? ['一', '二', '三', '四', '五', '六', '日'] : ['日', '一', '二', '三', '四', '五', '六'];

    const tasks = S.tasksIn().filter((t) => t.due);
    const byDay = {};
    tasks.forEach((t) => { (byDay[t.due] = byDay[t.due] || []).push(t); });

    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = fmtDay(d);
      const list = sortTasks(byDay[key] || []);
      const out = d.getMonth() !== base.m;
      const isToday = key === day(0);
      const sel = key === (view.calSel || day(0));
      const cellClass = `cal-cell${out ? ' out' : ''}${isToday ? ' today' : ''}${sel ? ' sel' : ''}`;
      const label = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日，${list.length} 项任务`;
      const count = list.length ? `<span class="cnt">${list.length}</span>` : '';
      if (detailed) {
        cells += `<div class="${cellClass}" data-day="${key}" role="group" aria-label="${label}">
          <button type="button" class="cal-day-select" aria-label="${label}" aria-pressed="${sel}"><span class="d">${d.getDate()}</span>${count}</button>
          <div class="cal-events">${list.slice(0, 2).map(t => {
            const project = projOf(t);
            const note = String(t.notes || '').replace(/\s+/g, ' ').trim() || project.name;
            return `<button type="button" class="cal-event${t.status === 'done' ? ' done' : ''}" data-task="${esc(t.id)}" style="--cal-event-color:${project.color}" title="${esc(t.title + '\n' + note)}"><span class="cal-event-title">${esc(t.title)}</span><span class="cal-event-note">${esc(note)}</span></button>`;
          }).join('')}</div>
          ${list.length > 2 ? `<button type="button" class="cal-more" aria-label="查看这一天全部 ${list.length} 项任务">还有 ${list.length - 2} 项</button>` : ''}
        </div>`;
      } else {
        cells += `<button type="button" class="${cellClass}" data-day="${key}" aria-label="${label}" aria-pressed="${sel}">
          <span class="d">${d.getDate()}</span>
          ${list.length ? `<span class="cal-dots">${list.slice(0, 4).map(t => `<i style="background:${t.status === 'done' ? STATUS.done.color : PRIORITY[t.priority].color}"></i>`).join('')}</span>` : ''}${count}
        </button>`;
      }
    }

    const selKey = view.calSel || day(0);

    return `
      <div class="cal-head">
        <div class="calendar-view-switch" role="group" aria-label="日历视图">
          <button type="button" data-action="calendar-view" data-value="simple" aria-pressed="${!detailed}">简约</button>
          <button type="button" data-action="calendar-view" data-value="detailed" aria-pressed="${detailed}">详细</button>
        </div>
        <div class="cal-nav">
          <button class="btn tiny" data-action="cal-move" data-dir="-1" aria-label="上个月">${I.chevL}</button>
          <span class="mon">${base.y} 年 ${base.m + 1} 月</span>
          <button class="btn tiny" data-action="cal-move" data-dir="1" aria-label="下个月">${I.chevR}</button>
        </div>
        <button class="btn tiny ghost cal-today" data-action="cal-today">回到今天</button>
      </div>
      <div class="cal-grid${detailed ? ' cal-grid-detailed' : ''}">
        ${dows.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <section id="calendarDayTasks" aria-label="所选日期的任务" aria-live="polite">${calendarDayTasksHTML(selKey)}</section>`;
  };

  /* ================================================================
   * 视图：统计
   * ================================================================ */
  VIEWS.stats = function () {
    const st = S.stats('all');
    const all = S.state.tasks;
    const maxStatus = Math.max(1, st.total);
    const statusRows = Object.entries(STATUS).map(([k, v]) => {
      const n = k === 'done' ? st.done : k === 'doing' ? st.doing : k === 'waiting' ? st.waiting : st.todo;
      return statRow(v.label, n, Math.round((n / maxStatus) * 100), v.color);
    }).join('');
    const maxPri = Math.max(1, ...st.priority.map((p) => p.count));
    const priRows = st.priority.map((p) => statRow(p.label, p.count, Math.round((p.count / maxPri) * 100), p.color)).join('');

    const week = [0, 0, 0, 0, 0, 0, 0];
    all.filter((t) => t.status === 'done').forEach((t) => { week[parseDay(t.due || day(0)).getDay()]++; });
    const maxWeek = Math.max(1, ...week);
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];

    return `
      <div class="kpis" style="margin-top:0">
        <div class="kpi"><div class="n">${st.total}</div><div class="k">全部任务</div></div>
        <div class="kpi ok"><div class="n">${st.progress}%</div><div class="k">完成率</div></div>
        <div class="kpi${st.overdue ? ' warn' : ''}"><div class="n">${st.overdue}</div><div class="k">逾期</div></div>
        <div class="kpi"><div class="n">${S.projects().length}</div><div class="k">项目</div></div>
      </div>

      ${completionHeatmapHTML(all)}

      <div class="section-title">状态分布</div>
      ${statusRows}

      <div class="section-title">未完成任务的优先级</div>
      ${priRows}

      <div class="section-title">本周完成分布</div>
      ${week.map((n, i) => statRow(`周${weekNames[i]}`, n, Math.round((n / maxWeek) * 100), 'var(--accent)')).join('')}

      <div class="section-title">标签分布</div>
      <div class="tags-wrap">
        ${st.tags.length ? st.tags.map((g) => `<span class="chip">${esc(g.name)} <b style="color:var(--dim2)">${g.count}</b></span>`).join('') : '<span class="chip">暂无标签</span>'}
      </div>

      <div class="section-title">消耗注意力的前三名</div>
      ${S.projects().map((p) => ({ p, s: S.stats(p.id) })).sort((a, b) => b.s.total - a.s.total).slice(0, 3)
        .map(({ p, s }) => `<div class="proj-line" data-goto-project="${p.id}">
          <span class="pdot" style="background:${p.color}"></span>
          <span class="pl-name">${esc(p.name)}</span>
          <span class="pl-num">${s.total} 项 · ${s.progress}%</span></div>`).join('')}`;
  };

  function completionHeatmapHTML(tasks) {
    const counts = new Map();
    tasks.filter(task => task.status === 'done' && task.due).forEach(task => counts.set(task.due, (counts.get(task.due) || 0) + 1));
    const days = Array.from({ length: 14 }, (_, i) => ({ date: day(i - 13), count: counts.get(day(i - 13)) || 0 }));
    const peak = Math.max(1, ...days.map(item => item.count));
    const total = days.reduce((sum, item) => sum + item.count, 0);
    const weekStart = S.state.settings.weekStart === 0 ? 0 : 1;
    const padding = (parseDay(days[0].date).getDay() - weekStart + 7) % 7;
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const labels = Array.from({ length: 7 }, (_, i) => weekdays[(i + weekStart) % 7]);
    const blanks = count => '<span class="heatmap-blank" aria-hidden="true"></span>'.repeat(count);
    const cells = days.map(({ date, count }) => {
      const level = count ? Math.max(1, Math.ceil(count / peak * 4)) : 0;
      return `<span class="heatmap-cell" data-date="${date}" data-count="${count}" data-level="${level}" tabindex="0" aria-label="${date}，${count} 项已完成任务到期${date === day(0) ? '，今天' : ''}" title="${date} · ${count} 项已完成任务到期" ${date === day(0) ? 'aria-current="date"' : ''}><span class="heatmap-date">${date.slice(5).replace('-', '/')}</span><span class="heatmap-count">${count}</span></span>`;
    }).join('');
    return `<section class="stats-heatmap" aria-labelledby="statsHeatmapTitle">
      <header class="heatmap-head"><h2 id="statsHeatmapTitle">近 14 天到期完成量</h2><span>${days[0].date} — ${days[13].date}</span></header>
      <div class="heatmap-body"><div class="heatmap-calendar">
        <div class="heatmap-weekdays">${labels.map(label => `<span>周${label}</span>`).join('')}</div>
        <div class="heatmap-grid">${blanks(padding)}${cells}${blanks((7 - (padding + 14) % 7) % 7)}</div>
      </div><div class="heatmap-summary"><span>近 14 天合计</span><strong>${total}<small> 项</small></strong><p>统计已完成任务，按截止日期归组。<br>颜色越深，当天数量越多。</p>
        <div class="heatmap-legend" aria-label="颜色由浅到深表示数量由少到多"><span>少</span>${[0, 1, 2, 3, 4].map(level => `<i data-level="${level}" aria-hidden="true"></i>`).join('')}<span>多</span></div>
      </div></div>
    </section>`;
  }

  function statRow(label, n, pct, color) {
    return `<div class="stat-row">
      <span class="lbl">${esc(label)}</span>
      <span class="bar"><i style="width:${pct}%;background:${color}"></i></span>
      <span class="num">${n}</span>
    </div>`;
  }

  /* ================================================================
   * 视图：回收站
   * ================================================================ */
  VIEWS.trash = function () {
    const list = S.trashList();
    if (!list.length) {
      return `<div class="empty" style="padding:48px 10px"><b>回收站是空的</b>
        <span>删除的任务和项目会先放到这里，可以随时还原</span></div>`;
    }
    const rows = list.map((rec) => {
      const when = new Date(rec.deletedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isProject = rec.type === 'project';
      const title = isProject ? rec.project.name : rec.task.title;
      const sub = isProject
        ? `项目 · 含 ${(rec.tasks || []).length} 项任务`
        : `任务 · ${esc((projOf(rec.task) || {}).name || '未归类')}`;
      return `<div class="trash-row">
        <span class="tr-dot" style="background:${isProject ? rec.project.color : '#8b95a7'}"></span>
        <div class="tr-main">
          <div class="tr-title">${esc(title)}</div>
          <div class="tr-meta">${sub} · ${esc(when)}</div>
        </div>
        <button class="btn tiny" data-action="restore" data-key="${rec.deletedAt}">${I.restore}<span>还原</span></button>
        <button class="btn tiny danger" data-action="purge" data-key="${rec.deletedAt}" title="彻底删除">${I.x}</button>
      </div>`;
    }).join('');
    return `
      <div class="trash-bar">
        <span>共 ${list.length} 项</span>
        <span style="flex:1"></span>
        <button class="btn tiny danger" data-action="empty-trash">${I.broom}<span>清空回收站</span></button>
      </div>
      ${rows}
      <p class="trash-note">还原项目会把它原本的任务一起恢复；彻底删除不可撤销。</p>`;
  };

  /* ================================================================
   * 视图：表单页（新建/编辑任务、新建/编辑项目都在右侧展开区里显示）
   * ================================================================ */
  VIEWS.task = function () {
    return taskFormHTML(editingTaskId ? S.state.tasks.find((x) => x.id === editingTaskId) : null);
  };

  VIEWS.project = function () {
    return projectFormHTML(editingProjectId ? S.state.projects.find((x) => x.id === editingProjectId) : null);
  };
  /* ================================================================
   * 视图：关于（居中的四行：Logo / 版本 / 检查更新 / 版权）
   * ================================================================ */
  VIEWS.extensions = function () {
    return window.PMAI.configHTML();
  };

  VIEWS.about = function () {
    const info = window.__PM_INFO || {};
    const ver = info.version || '0.2.0';
    return `
      <div class="about-page">
        <span class="brand-logo" role="img" aria-label="${esc(APP_NAME)}"></span>
        <p class="about-version">v${esc(ver)}</p>
        ${window.PMUpdates.html()}
        <p class="about-copyright">© ${new Date().getFullYear()} ${esc(APP_NAME)} · MIT License</p>
      </div>`;
  };

  /* ================================================================
   * 视图：收件箱（已从主菜单移除，保留供 Ctrl+F 搜索使用）
   * ================================================================ */
  VIEWS.inbox = function () {
    const unc = uncategorized();
    const recent = S.state.activity.slice(0, 8);
    return `
      <div class="search-row">
        <input class="input big" id="searchInput" placeholder="搜索任务标题、备注、标签…" autocomplete="off" />
      </div>
      <div id="searchResults"><div class="result-hint">输入关键词开始搜索全部项目</div></div>

      <div class="section-title">未归类任务</div>
      ${unc.length ? listHTML(sortTasks(unc)) : `<div class="empty"><b>没有未归类任务</b><span>所有任务都归属到项目了</span></div>`}

      <div class="section-title">最近动态</div>
      ${recent.length ? `<div class="card" style="padding:8px 10px">${recent.map((a) => `<div style="display:flex;gap:8px;font-size:11.5px;color:var(--dim);padding:3px 0">
          <span style="flex:1;color:var(--text)">${esc(a.text)}</span>
          <span>${esc(new Date(a.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>
        </div>`).join('')}</div>` : `<div class="empty"><b>还没有记录</b><span>创建或完成任务后会显示在这里</span></div>`}`;
  };

  function searchResultsHTML(q) {
    if (!q.trim()) return `<div class="result-hint">输入关键词开始搜索全部项目</div>`;
    const res = S.search(q);
    if (!res.length) return `<div class="empty" style="padding:14px"><b>没有匹配「${esc(q)}」的任务</b></div>`;
    return `<div class="result-hint">找到 ${res.length} 条结果</div>` + res.map((t) => taskRowHTML(t, { hideProject: false })).join('');
  }

  /* ================================================================
   * 视图：设置
   * ================================================================ */
  const ACCENTS = ['#c18b38', '#5b8cff', '#38d39f', '#f7b955', '#ff6b81', '#c084fc', '#4dd0e1'];
  const ACCENT_NAMES = ['琥珀金（品牌色）', '蓝色', '青绿色', '浅金色', '珊瑚红', '紫色', '青蓝色'];

  VIEWS.settings = function () {
    const s = S.state.settings;
    const info = window.__PM_INFO || {};
    return `
      <div class="settings-grid">
      <section class="settings-section settings-appearance" aria-label="外观设置">
      <div class="section-title">外观</div>
      <div class="appearance-preview" aria-label="当前主题预览">
        <div class="appearance-preview-rail" aria-hidden="true"><b>MoreReady</b><span></span><span></span><span></span></div>
        <div class="appearance-preview-main"><h2>${effectiveTheme() === 'daylight' ? '晨光 · 轻盈的工作空间' : '夜幕 · 专注的工作空间'}</h2><p>统一的导航、卡片与画布配色，随主题切换。</p><div class="appearance-preview-states"><span style="color:var(--status-doing)">● 进行中</span><span style="color:var(--status-waiting)">● 等待中</span><span style="color:var(--status-done)">● 已完成</span></div></div>
      </div>
      <div class="set-row">
        <div class="sr-txt"><b>主题</b><span>晨光与夜幕，也可跟随系统自动切换</span></div>
        <button class="select drop-trigger" data-drop="theme" data-value="${esc(s.theme || 'system')}"
          role="combobox" aria-haspopup="listbox" aria-expanded="false" title="主题"
          ><span data-drop-label>${esc(themeLabel(s.theme || 'system'))}</span></button>
      </div>
      <div class="set-row">
        <div class="sr-txt"><b>强调色</b><span>标签、图表与任务进度</span></div>
        <div class="brand-accent-tools"><div class="swatches">
          ${ACCENTS.map((c, i) => `<button class="swatch" data-action="accent" data-color="${c}" aria-label="${ACCENT_NAMES[i]}" title="${ACCENT_NAMES[i]}" aria-pressed="${s.accent === c}" style="background:${c}"></button>`).join('')}
        </div><button class="btn tiny custom-accent-button" data-action="accent-custom" aria-controls="accentPickerContainer" aria-expanded="false"><i style="background:${esc(s.accent)}" aria-hidden="true"></i>自定义</button>
        </div>
      </div>
      <div id="accentPickerContainer" hidden></div>
      <div class="set-row">
        <div class="sr-txt"><b>紧凑模式</b><span>缩小行高，一屏看到更多任务</span></div>
        <button class="switch" data-action="compact" aria-pressed="${s.compact}"></button>
      </div>

      </section>
      <section class="settings-section" id="shortcutSettings" aria-label="快捷键与鼠标设置">${window.PMShortcuts.html()}</section>
      <section class="settings-section settings-system" id="systemSettings" aria-label="通知与启动设置">${window.PMSystemSettings.html()}</section>
      <section class="settings-section" aria-label="使用偏好">
      <div class="section-title">${isDesktop ? '窗口与托盘' : '使用偏好'}</div>
      ${isDesktop ? `
      <div class="set-row">
        <div class="sr-txt"><b>始终置顶</b><span>让主窗口保持在其他窗口上方，默认关闭</span></div>
        <button class="switch" data-action="pin-switch" aria-pressed="${s.alwaysOnTop}"></button>
      </div>
      <div class="set-row">
        <div class="sr-txt"><b>关闭时收进托盘常驻</b><span>关掉窗口不退出，托盘图标 / Ctrl+Shift+Space 唤回</span></div>
        <button class="switch" data-action="close-to-tray" aria-pressed="${s.closeToTray === true}"></button>
      </div>
      ` : ''}
      <div class="set-row">
        <div class="sr-txt"><b>记住上次页面</b><span>启动时回到上次使用的页面；关闭则打开项目工作区</span></div>
        <button class="switch" data-action="remember" aria-pressed="${s.rememberLast === true}"></button>
      </div>
      ${isDesktop ? `<div class="set-row">
        <div class="sr-txt"><b>快捷键</b><span>Ctrl + Shift + Space 显示 / 隐藏主窗口</span></div>
        <span class="chip">全局</span>
      </div>
      <div class="set-row">
        <div class="sr-txt"><b>立即收进托盘</b><span>隐藏主窗口，稍后从托盘唤回</span></div>
        <button class="btn tiny" data-action="tray">收进托盘</button>
      </div>` : ''}
      <div class="set-row">
        <div class="sr-txt"><b>本周起始日</b><span>影响日历排列</span></div>
        <button class="select drop-trigger" data-drop="weekstart" data-value="${esc(String(s.weekStart))}"
          role="combobox" aria-haspopup="listbox" aria-expanded="false" title="本周起始日"
          ><span data-drop-label>${s.weekStart === 0 ? '周日' : '周一'}</span></button>
      </div>

      </section>
      <section class="settings-section" aria-label="数据设置">
      <div class="section-title">数据</div>
      <div class="set-row">
        <div class="sr-txt"><b>导出备份</b><span>保存为 JSON 文件</span></div>
        <button class="btn tiny" data-action="export">${I.export}<span>导出</span></button>
      </div>
      <div class="set-row">
        <div class="sr-txt"><b>导入备份</b><span>用 JSON 覆盖当前数据</span></div>
        <button class="btn tiny" data-action="import">${I.import}<span>导入</span></button>
      </div>
      <div class="set-row">
        <div class="sr-txt"><b>数据位置</b><span style="word-break:break-all">${isDesktop ? esc(info.storePath || '本机数据目录') : '保存在当前浏览器中；清理网站数据会移除内容，请定期导出备份。'}</span></div>
        ${isDesktop ? '<button class="btn tiny ghost" data-action="open-folder">打开</button>' : '<span class="chip">本地保存</span>'}
      </div>
      <div class="set-row">
        <div class="sr-txt"><b>恢复示例数据</b><span>清空当前内容并载入演示项目</span></div>
        <button class="btn tiny danger" data-action="reset">重置</button>
      </div></section></div>`;
  };

  function closeAccentPicker(focus = false) {
    if (!accentPickerCleanup) return;
    accentPickerCleanup(); accentPickerCleanup = null;
    const host = $('accentPickerContainer'); if (host) host.hidden = true;
    window.PMAppearance.apply(document, S.state.settings.accent);
    const button = document.querySelector('[data-action="accent-custom"]');
    button?.setAttribute('aria-expanded', 'false');
    if (focus) button?.focus();
  }
  function openAccentPicker() {
    if (accentPickerCleanup) { closeAccentPicker(true); return; }
    const host = $('accentPickerContainer'); if (!host) return;
    host.hidden = false;
    document.querySelector('[data-action="accent-custom"]').setAttribute('aria-expanded', 'true');
    accentPickerCleanup = window.PMColorPicker.mount(host, {
      color: S.state.settings.accent,
      onPreview: color => window.PMAppearance.apply(document, color),
      onApply: color => { S.state.settings.accent = color; S.save(); closeAccentPicker(); render(); document.querySelector('[data-action="accent-custom"]').focus(); },
      onCancel: () => closeAccentPicker(true),
    });
  }

  /* ================================================================
   * 表单宿主：新建/编辑任务与项目都是"页面"，表单渲染在右侧展开区里
   * （.sheet 居中弹层保留给个别小确认场景）
   * ================================================================ */
  let sheetMode = 'module';                 // module=第二栏 | detail=第三栏 | sheet=弹层
  const formHost = () => (sheetMode === 'sheet' ? sheet : sheetMode === 'detail' ? $('taskDrawer') : panelBody);
  const $q = (sel) => formHost().querySelector(sel);
  const $qa = (sel) => formHost().querySelectorAll(sel);

  /** 表单页：在右侧展开区里渲染（和其他页面一致） */
  function openFormPage() {
    markRebuild();          // 表单是自己填的，避免重绘后紧跟的点击被当成"幽灵点击"吞掉
  }

  /** 居中弹层（暂留，供将来的小确认使用） */
  function openModalSheet(html) {
    sheetMode = 'sheet';
    sheet.innerHTML = html;
    sheetMask.hidden = false;
  }

  function closeSheet() {
    if (sheetMode === 'detail') {
      editingProjectId = null;
      dismissDrawer();
      render();
      return;
    }
    if (sheetMode === 'sheet') {
      sheetMask.hidden = true;
      sheet.innerHTML = '';
      return;
    }
    // 独立项目表单关闭后返回项目列表，任务表单关闭后返回概览。
    const back = S.state.activeModule === 'project' ? 'projects' : 'today';
    pendingProjectForTask = false;
    editingProjectId = null;
    S.state.activeModule = back;
    S.save();
    renderRail();
    render();
  }

  function taskFormHTML(t, options = {}) {
    const isNew = !t;    const task = t || { title: '', projectId: draftProjectId, status: 'todo', priority: 'p2', due: R.validDay(options.due) ? options.due : day(0), notes: '', tags: [], subtasks: [] };
    const reminder = R.normalizeReminder(task.reminder);
    return `
      <div class="field">
        <label>任务标题</label>
        <input class="input" id="f-title" value="${esc(task.title)}" placeholder="要做什么？" autocomplete="off" />
      </div>
      <div class="grid2 task-meta">
        <div class="field">
          <label>所属项目</label>
          ${isNew ? `<button class="select drop-trigger" data-drop="task-project" data-value="${esc(task.projectId || '')}"
            role="combobox" aria-haspopup="listbox" aria-expanded="false" title="所属项目"
            ><span data-drop-label>${esc(projectNameOf(task.projectId))}</span></button>` : `<input class="input task-project-display" id="f-project" aria-label="所属项目" value="${esc(projectNameOf(task.projectId))}" readonly />`}
        </div>
        <div class="field">
          <label>截止日期</label>
          <input class="input" id="f-due" type="date" value="${esc(task.due || '')}" />
        </div>
      </div>
      <div class="grid2 task-meta">
        <div class="field">
          <label>优先级</label>
          <button class="select drop-trigger task-choice" id="f-priority" data-drop="task-priority" data-value="${esc(task.priority)}" value="${esc(task.priority)}" role="combobox" aria-label="优先级" aria-haspopup="listbox" aria-expanded="false"><span data-drop-label>${esc(PRIORITY[task.priority].label)}</span>${I.down}</button>
        </div>
        <div class="field">
          <label>提醒</label>
          <button class="select drop-trigger task-choice" id="f-reminder" data-drop="task-reminder" data-value="${esc(reminder.mode)}" value="${esc(reminder.mode)}" role="combobox" aria-label="提醒" aria-describedby="f-reminder-hint" aria-haspopup="listbox" aria-expanded="false"><span data-drop-label>${esc(R.MODES[reminder.mode].label)}</span>${I.down}</button>
        </div>
      </div>
      <div class="field task-reminder-time" id="f-reminder-custom" ${reminder.mode === 'custom' ? '' : 'hidden'}>
        <label for="f-reminder-at">提醒时间</label>
        <input class="input" id="f-reminder-at" type="datetime-local" value="${esc(reminder.at)}" aria-describedby="f-reminder-hint" />
      </div>
      <p class="field-hint task-reminder-hint" id="f-reminder-hint" role="status" hidden></p>
      <div class="field subtask-field">
        <label>子任务</label>
        <div class="sub-list" id="f-subs"></div>
        <input class="input" id="f-sub-input" placeholder="添加子任务后回车" />
      </div>
      <section class="field task-parents-field" aria-label="前置任务">
        <label>前置任务</label>
        <div id="f-parents">${taskParentsHTML(task)}</div>
      </section>
      <div class="field">
        <label>标签</label>
        <div class="pick-row" id="f-tags">
          ${S.state.tags.map((g) => `<span class="chip${(task.tags || []).includes(g) ? ' on' : ''}" role="button" data-tag="${esc(g)}">${esc(g)}</span>`).join('')}
          <button class="chip" type="button" id="f-newtag">+ 新标签</button>
          <input class="input tag-input" id="f-tag-input" aria-label="新标签名称" placeholder="新标签名称" maxlength="40" autocomplete="off" hidden />
        </div>
      </div>
      <div class="field">
        <label>备注</label>
        <textarea class="textarea" id="f-notes" placeholder="背景、验收标准、相关链接…">${esc(task.notes || '')}</textarea>
      </div>
      <div class="sheet-foot">
        ${!isNew ? `<button class="btn tiny danger" data-action="delete-task" data-id="${task.id}">${I.trash}<span>删除</span></button>` : ''}
        ${!isNew && task.status !== 'done' ? `<button class="btn tiny" data-ai-work="task-breakdown" data-project-id="${esc(task.projectId)}" data-task-id="${esc(task.id)}">✦ 拆解</button>` : ''}
        <span class="sp"></span>
        <button class="btn" data-action="sheet-cancel">取消</button>
        <button class="btn primary" data-action="save-task" data-id="${isNew ? '' : task.id}">保存</button>
      </div>`;
  }

  let editingTaskId = null;
  let draftTags = [];
  let draftSubtasks = [];
  let draftProjectId = '';
  let draftDependencies = [];
  let taskEditorBaseline = null;
  let pendingProjectForTask = false;   // 从任务表单里点「新建项目」时置位

  function taskParentsHTML(task) {
    const ids = G.dependencies(task);
    if (!ids.length) return '<p class="parents-empty">无前置任务</p>';
    return ids.map(id => {
      const parent = S.state.tasks.find(t => t.id === id && t.projectId === task.projectId);
      return parent ? `<div class="task-parent-row"><span class="parent-name">${esc(parent.title)}</span><span style="color:${STATUS[parent.status].color}">${esc(STATUS[parent.status].label)}</span></div>`
        : '<div class="task-parent-row unavailable">前置任务已移除或不可用</div>';
    }).join('');
  }
  function refreshTaskParents() {
    const box = $q('#f-parents');
    if (!box) return;
    const task = S.state.tasks.find(t => t.id === editingTaskId);
    box.innerHTML = taskParentsHTML(task && task.projectId === draftProjectId ? task : { projectId: draftProjectId, dependsOn: draftDependencies });
  }

  function taskEditorSignature() {
    if (!$q('#f-title')) return null;
    return JSON.stringify({ title: $q('#f-title').value, projectId: draftProjectId, due: $q('#f-due').value,
      priority: $q('#f-priority').value, reminder: draftReminder(), notes: $q('#f-notes').value,
      tags: draftTags, subtasks: draftSubtasks, pendingSubtask: $q('#f-sub-input').value, pendingTag: $q('#f-tag-input').value });
  }
  function openTaskSheet(id, options = {}) {
    if (!taskDrawerMask.hidden && editingTaskId) window.PMAI.editorClosed(editingTaskId);
    editingProjectId = null;
    editingTaskId = id || null;
    const t = id ? S.state.tasks.find((x) => x.id === id) : null;
    draftTags = t ? (t.tags || []).slice() : [];
    draftSubtasks = t ? (t.subtasks || []).map((x) => ({ ...x })) : [];
    draftProjectId = t ? t.projectId : ((S.state.activeModule === 'calendar' ? '' : view.detailProjectId) || (S.state.activeProjectId !== 'all' ? S.state.activeProjectId : (S.projects()[0] || {}).id || ''));
    draftDependencies = t ? G.dependencies(t) : [];
    const focusForm = () => {
      // 用草稿替换标签/子任务的初始渲染状态
      const tagBox = $q('#f-tags');
      if (tagBox) syncTagChips(tagBox);
      renderDraftSubs();
      refreshReminderField();
      const input = $q('#f-title');
      if (input) { input.focus(); input.select(); }
    };
    drawerReturnFocus = document.activeElement;
    sheetMode = 'detail';
    $('taskDrawerHead').innerHTML = '<div class="ph-title"><h1 id="taskDrawerTitle">' + (id ? '编辑任务' : '新建任务') + '</h1><p>' + esc(projectNameOf(draftProjectId)) + '</p></div><button class="icon-btn" data-action="sheet-cancel" aria-label="关闭任务详情">' + I.x + '</button>';
    taskDrawerBody.innerHTML = taskFormHTML(t, { due: options.due || (S.state.activeModule === 'calendar' ? view.calSel : '') });
    $('taskDrawerActions').replaceChildren(taskDrawerBody.querySelector('.sheet-foot'));
    taskDrawerMask.hidden = false;
    app.classList.add('task-card-open');
    DAG.select(detailBody, editingTaskId);
    focusForm();
    taskEditorBaseline = taskEditorSignature();
    return Promise.resolve();
  }
  function dismissDrawer() {
    if (!taskDrawerMask || taskDrawerMask.hidden) return;
    if (editingTaskId) window.PMAI.editorClosed(editingTaskId);
    taskDrawerMask.hidden = true;
    taskDrawerBody.innerHTML = '';
    taskEditorBaseline = null;
    $('taskDrawerActions').replaceChildren();
    app.classList.remove('task-card-open');
    DAG.select(detailBody, null);
    sheetMode = 'module';
    if (drawerReturnFocus?.isConnected) drawerReturnFocus.focus({ preventScroll: true });
  }

  function closeTagEntry(restoreFocus = false) {
    const input = $q('#f-tag-input');
    if (!input || input.hidden) return;
    input.hidden = true; input.value = '';
    const button = $q('#f-newtag'); button.hidden = false;
    if (restoreFocus) button.focus();
  }
  function addDraftTag() {
    const input = $q('#f-tag-input');
    if (!input || !input.value.trim()) { toast('请输入标签名称'); input?.focus(); return; }
    const name = S.addTag(input.value.trim());
    draftTags = [...new Set([...draftTags, name])];
    const box = $q('#f-tags');
    box.querySelectorAll('[data-tag]').forEach((chip) => chip.remove());
    S.state.tags.forEach((tag) => {
      const chip = document.createElement('button'); chip.type = 'button';
      chip.className = 'chip'; chip.dataset.tag = tag; chip.textContent = tag;
      box.insertBefore(chip, box.querySelector('#f-newtag'));
    });
    syncTagChips(box); closeTagEntry(true);
  }

  function syncTagChips(box) {
    box.querySelectorAll('[data-tag]').forEach((c) => c.classList.toggle('on', draftTags.includes(c.dataset.tag)));
  }
  function setTaskChoice(kind, value, choices) {
    if (!choices[value]) return;
    const button = $q(`#f-${kind}`);
    if (!button) return;
    button.value = value;
    button.dataset.value = value;
    button.querySelector('[data-drop-label]').textContent = choices[value].label;
  }
  function draftReminder() {
    const mode = $q('#f-reminder')?.value || 'none';
    return { mode, at: mode === 'custom' ? ($q('#f-reminder-at')?.value || '') : '' };
  }
  function refreshReminderField() {
    const button = $q('#f-reminder'), custom = $q('#f-reminder-custom'), hint = $q('#f-reminder-hint');
    if (!button || !custom || !hint) return;
    const reminder = draftReminder(), preferences = window.PMSystemSettings.state()?.notifications || {};
    custom.hidden = reminder.mode !== 'custom';
    hint.hidden = reminder.mode === 'none';
    const date = R.reminderDate({ reminder, due: $q('#f-due').value }, preferences);
    const planned = date ? `提醒时间：${R.dayOf(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}。` : reminder.mode === 'custom' ? '请填写提醒时间。' : '请先填写截止日期。';
    const daily = !['none', 'custom'].includes(reminder.mode) ? '使用设置中的每日提醒时间。' : '';
    const task = S.state.tasks.find(item => item.id === editingTaskId), project = S.state.projects.find(item => item.id === draftProjectId);
    const availability = task?.status === 'done' ? '已完成任务暂停提醒。' : project?.archived ? '归档项目暂停提醒。' : !preferences.enabled ? '需在设置中开启系统通知。' : !isDesktop && preferences.permission !== 'granted' ? '需在浏览器中允许通知权限。' : isDesktop ? '应用运行或托盘常驻时提醒。' : '请保持页面打开以接收提醒。';
    const late = date && date.getTime() <= Date.now() ? '错过时间时补发一次。' : '';
    hint.textContent = planned + daily + late + availability;
  }
  function renderDraftSubs() {
    const box = $q('#f-subs');
    if (!box) return;
    box.innerHTML = draftSubtasks.length
      ? draftSubtasks.map((sb) => `<div class="sub-item${sb.done ? ' done' : ''}">
          <button class="tick${sb.done ? ' on' : ''}" data-sub-toggle="${sb.id}">${I.check}</button>
          <span class="txt">${esc(sb.title)}</span>
          <button class="icon-btn" data-sub-del="${sb.id}" style="width:22px;height:22px;color:var(--dim2)">${I.x}</button>
        </div>`).join('')
      : '';
  }

  function addDraftSubtask() {
    const input = $q('#f-sub-input');
    const title = input?.value.trim();
    if (!title) return;
    draftSubtasks.push({ id: C.UID(), title, done: false });
    renderDraftSubs(); input.value = ''; input.focus();
  }

  function saveTaskFromSheet(id) {
    const g = (sel) => { const el = $q(sel); return el ? el.value : ''; };
    const title = g('#f-title').trim();
    if (!title) { toast('请先填写任务标题'); return; }
    const existingTask = id ? S.state.tasks.find(t => t.id === id) : null;
    const reminder = draftReminder();
    if (reminder.mode === 'custom' && !R.parseLocalTime(reminder.at)) {
      toast('请填写有效的提醒时间'); $q('#f-reminder-at').focus(); return;
    }
    if (!['none', 'custom'].includes(reminder.mode) && !R.validDay(g('#f-due'))) {
      toast('按截止日期提醒需要先填写截止日期'); $q('#f-due').focus(); return;
    }
    const data = {
      title,
      projectId: existingTask ? existingTask.projectId : draftProjectId || (S.projects()[0] || {}).id,
      due: g('#f-due'),
      status: existingTask?.status || 'todo',
      priority: g('#f-priority') || 'p2',
      reminder,
      notes: g('#f-notes'),
      tags: draftTags.slice(),
      dependsOn: existingTask ? G.dependencies(existingTask) : draftDependencies.slice(),
    };
    try {
      if (id) {
        S.updateTask(id, Object.assign(data, { subtasks: draftSubtasks }));
        S.touch(`更新任务「${title}」`);
        toast('已保存');
      } else {
        S.addTask(Object.assign(data, { subtasks: draftSubtasks }));
        toast('任务已创建');
      }
    } catch (err) { toast(err.message); return; }
    S.save();
    window.PMAI.editorClosed(id, true);
    closeSheet();
    renderRail();
    render();
  }

  function projectFormHTML(p) {
    const isNew = !p;
    const proj = p || { name: '', color: ACCENTS[0], desc: '' };
    const colors = ['#5b8cff', '#38d39f', '#f7b955', '#ff6b81', '#c084fc', '#4dd0e1'];
    return `
      <div class="field">
        <label>项目名称</label>
        <input class="input" id="p-name" value="${esc(proj.name)}" placeholder="例如：官网改版" autocomplete="off" />
      </div>
      <div class="field">
        <label>描述</label>
        <input class="input" id="p-desc" value="${esc(proj.desc)}" placeholder="一句话说明目标与范围" autocomplete="off" />
      </div>
      ${!isNew ? `<section class="field project-task-section" aria-label="项目任务列表"><header><label>任务列表</label><span>${S.tasksIn(proj.id).length} 项</span></header><div class="project-task-list">${S.tasksIn(proj.id).map(task => `<div class="project-task-item"><span class="project-task-name${task.status === 'done' ? ' done' : ''}">${esc(task.title)}</span><span class="project-task-status" style="color:${STATUS[task.status].color}">${esc(STATUS[task.status].label)}</span>${task.due ? `<span class="project-task-due ${dueMeta(task).cls}">${esc(dueMeta(task).text)}</span>` : ''}</div>`).join('') || '<span class="project-task-empty">暂无任务</span>'}</div></section>` : ''}
      <div class="field">
        <label>颜色</label>
        <div class="swatches" id="p-colors">
          ${colors.map((c) => `<button class="swatch" data-color="${c}" aria-pressed="${proj.color === c}" style="background:${c}"></button>`).join('')}
        </div>
      </div>
      <div class="field"><label for="p-group">项目分组</label><select class="select" id="p-group"><option value="">未分组</option>${S.state.projectGroups.map(g => `<option value="${esc(g.id)}" ${proj.groupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
      <div class="sheet-foot">
        ${!isNew ? `<button class="btn tiny danger" data-action="delete-project" data-id="${proj.id}">${I.trash}<span>删除项目</span></button>` : ''}
        <span class="sp"></span>
        <button class="btn" data-action="sheet-cancel">取消</button>
        <button class="btn primary" data-action="save-project" data-id="${isNew ? '' : proj.id}">保存</button>
      </div>`;
  }

  let draftColor = ACCENTS[0];
  let editingProjectId = null;

  /**
   * 打开一个表单页（新建/编辑任务、新建/编辑项目）。
   * 独立项目表单使用主工作区，任务详情使用右侧抽屉。
   */
  function openFormPageFor(moduleKey, renderForm) {
    resetDetail();
    sheetMode = 'module';
    S.state.activeModule = moduleKey;
    S.save();
    renderRail();
    render();
    markRebuild();
    renderForm();
    return Promise.resolve();
  }

  /** 新建项目使用独立页面；现有项目在右侧详情栏编辑。 */
  function openProjectPage(id) {
    if (id) return openProjectEditor(id);
    editingProjectId = id || null;
    const p = id ? S.state.projects.find((x) => x.id === id) : null;
    draftColor = p ? p.color : ACCENTS[0];
    return openFormPageFor('project', () => {
      const i = $q('#p-name');
      if (i) { i.focus(); i.select(); }
    });
  }

  function openProjectEditor(id) {
    const project = S.state.projects.find(item => item.id === id);
    if (!project) return;
    const returnFocus = document.activeElement;
    openProjectTree(id);
    editingProjectId = id; editingTaskId = null;
    draftColor = project.color;
    drawerReturnFocus = returnFocus;
    sheetMode = 'detail';
    $('taskDrawerHead').innerHTML = `<div class="ph-title"><h1 id="taskDrawerTitle">编辑项目</h1><p>${esc(project.name)}</p></div><button class="icon-btn" data-action="sheet-cancel" aria-label="关闭项目详情">${I.x}</button>`;
    taskDrawerBody.innerHTML = projectFormHTML(project);
    $('taskDrawerActions').replaceChildren(taskDrawerBody.querySelector('.sheet-foot'));
    taskDrawerMask.hidden = false;
    app.classList.add('task-card-open');
    const input = $q('#p-name'); input.focus(); input.select();
  }

  /* ================================================================
   * 事件
   * ================================================================ */
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#f-tag-input, #f-newtag')) closeTagEntry();
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.id === 'f-tag-input') closeTagEntry();
  });
  document.addEventListener('click', async (e) => {
    if (e.detail === 1) calendarClickOnControl = !!e.target.closest('.cal-event, .cal-more');
    // Opening an inspector changes calendar width; a task's second click may land on a day.
    if (S.state.activeModule === 'calendar' && e.detail > 1 && calendarClickOnControl) {
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    const tabClose = e.target.closest('[data-tab-close]');
    if (tabClose) { closeDropMenu(); closeWorkspaceTab(tabClose.dataset.tabClose); return; }
    const tabSelect = e.target.closest('[data-tab-select]');
    if (tabSelect) { closeDropMenu(); if (tabSelect.dataset.tabSelect !== workspaceTabKey()) openModule(tabSelect.dataset.tabSelect); return; }
    const navEl = e.target.closest('[data-nav]');
    if (navEl) { closeDropMenu(); openModule(navEl.dataset.nav); return; }

    // 自绘下拉：点触发按钮开合
    const dropEl = e.target.closest('[data-drop]');
    if (dropEl) {
      e.preventDefault();
      e.stopPropagation();
      const kind = dropEl.dataset.drop;
      const cur = dropCurrent(dropEl);
      const rows = kind === 'workspace-tab' ? NAV_MODULES.map(m => ({ label: m.title ? m.title() : m.label, value: m.key, selected: m.key === workspaceTabKey(), action: 'workspace-tab' }))
        : kind === 'theme' ? themeDropRows(cur)
        : kind === 'scope' ? scopeDropRows(cur)
        : kind === 'board-sort' ? SORTS.map((x) => ({ label: x.label, value: x.key, selected: cur === x.key, action: 'board-sort' }))
        : ['board-view', 'canvas-view'].includes(kind) ? [{ label: '详细', value: 'detailed', selected: cur === 'detailed', action: kind }, { label: '简洁', value: 'simple', selected: cur === 'simple', action: kind }]
        : kind === 'project-status' ? projectFilterRows()
        : kind === 'project-layout' ? projectLayoutRows()
        : kind === 'task-reminder' ? Object.entries(R.MODES).map(([value, item]) => ({ label: item.label, value, selected: cur === value, action: 'task-reminder' }))
        : kind === 'task-priority' ? Object.entries(PRIORITY).map(([value, item]) => ({ label: item.label, value, selected: cur === value, action: 'task-priority' }))
        : kind === 'task-project' ? taskProjectDropRows(cur)
        : weekDropRows(cur);
      openDropMenu(dropEl, rows);
      return;
    }
    closeDropMenu();

    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const a = actionEl.dataset.action;
      switch (a) {
        case 'toggle-board-view': toggleBoardView(); return;
        case 'calendar-view': setCalendarView(actionEl.dataset.value); return;
        case 'tree-new-task': openTaskSheet(null); return;
        case 'home': openModule('today'); return;
        case 'scope': {
          S.state.activeProjectId = actionEl.dataset.value || 'all';
          S.save();
          renderRail();
          render();
          return;
        }
        case 'maximize': if (window.PM?.toggleMaximize) await window.PM.toggleMaximize(); return;
        case 'tray': case 'hide-tray': {
          toast('已隐藏窗口，点托盘图标或 Ctrl+Shift+Space 唤回');
          setTimeout(() => { if (window.PM && window.PM.hideToTray) window.PM.hideToTray(); }, 320);
          return;
        }
        case 'quit': if (window.PM && window.PM.quit) window.PM.quit(); return;
        case 'pin': case 'pin-switch': {
          const next = !S.state.settings.alwaysOnTop;
          S.state.settings.alwaysOnTop = next;
          if (window.PM) await window.PM.setAlwaysOnTop(next);
          S.save();
          syncPinUI();
          toast(next ? '已开启置顶' : '已取消置顶');
          if (S.state.activeModule === 'settings') render();
          return;
        }
        case 'minimize': if (window.PM) window.PM.minimize(); return;
        case 'close': {
          // Electron 下「关闭」= 收进系统托盘常驻；浏览器预览则提示
          if (window.PM && window.PM.close) window.PM.close();
          else toast('浏览器预览模式：关闭需在 Electron 中运行');
          return;
        }
        case 'new-task': openTaskSheet(null); return;
        case 'new-project': case 'new-project-page': pendingProjectForTask = false; openProjectPage(null); return;
        case 'edit-project': openProjectPage(actionEl.dataset.id); return;
        case 'restore': {
          S.restoreTrash(actionEl.dataset.key);
          renderRail(); render(); toast('已还原');
          return;
        }
        case 'purge': {
          if (confirm('彻底删除这一项？不可撤销。')) {
            S.purgeTrash(actionEl.dataset.key);
            renderRail(); render(); toast('已彻底删除');
          }
          return;
        }
        case 'empty-trash': {
          if (confirm('清空回收站？其中所有任务/项目将被永久删除。')) {
            const n = S.emptyTrash();
            renderRail(); render(); toast(`已清空 ${n} 项`);
          }
          return;
        }
        case 'save-task': saveTaskFromSheet(actionEl.dataset.id || null); return;
        case 'save-project': {
          const inSidebar = sheetMode === 'detail';
          const name = ($q('#p-name').value || '').trim();
          if (!name) { toast('请填写项目名称'); return; }
          const desc = ($q('#p-desc').value || '').trim();
          const groupId = $q('#p-group').value;
          const id = actionEl.dataset.id;
          let created = null;
          if (id) S.updateProject(id, { name, desc, groupId, color: draftColor });
          else created = S.addProject({ name, desc, groupId, color: draftColor });
          S.save();
          toast(id ? '项目已更新' : '项目已创建');
          // 从任务表单里新建的项目：回到任务编辑并自动选中
          if (created && pendingProjectForTask) {
            pendingProjectForTask = false;
            openTaskSheet(editingTaskId);
            const btn = $q('[data-drop="task-project"]');
            if (btn) {
              draftProjectId = created.id;
              btn.dataset.value = created.id;
              const label = btn.querySelector('[data-drop-label]');
              if (label) label.textContent = created.name;
            }
            return;
          }
          editingProjectId = null;
          if (inSidebar) dismissDrawer();
          S.state.activeModule = 'projects';
          S.save();
          renderRail();
          render();
          return;
        }
        case 'archive-project': {
          const project = S.state.projects.find(p => p.id === actionEl.dataset.id);
          if (!project) return;
          S.updateProject(project.id, { archived: !project.archived });
          renderRail(); render(); toast(project.archived ? '项目已归档' : '已取消归档'); return;
        }
        case 'delete-project': {
          const id = actionEl.dataset.id;
          const p = S.state.projects.find((x) => x.id === id);
          if (p && confirm(`把项目「${p.name}」及其 ${S.tasksIn(id).length} 项任务移入回收站？`)) {
            S.removeProject(id); closeSheet(); renderRail(); render(); toast('已移入回收站');
          }
          return;
        }
        case 'delete-task': {
          const id = actionEl.dataset.id;
          if (confirm('把任务移入回收站？可在回收站还原。')) { S.removeTask(id); closeSheet(); renderRail(); render(); toast('已移入回收站'); }
          return;
        }
        case 'sheet-cancel': closeSheet(); return;
        case 'toggle': {
          const id = actionEl.dataset.id;
          const t = S.state.tasks.find((x) => x.id === id);
          if (t) {
            const next = t.status === 'done' ? 'todo' : 'done';
            S.updateTask(id, { status: next });
            S.touch(next === 'done' ? `完成「${t.title}」` : `重新打开「${t.title}」`);
            if (next === 'done') toast('完成一件事 🎉');
          }
          renderRail(); render(); return;
        }
        case 'advance': { S.cycleStatus(actionEl.dataset.id, 1); renderRail(); render(); return; }
        case 'back': { S.cycleStatus(actionEl.dataset.id, -1); renderRail(); render(); return; }
        case 'reopen': { S.updateTask(actionEl.dataset.id, { status: 'doing' }); renderRail(); render(); return; }
        case 'board-page': {
          const col = actionEl.dataset.col;
          const dir = Number(actionEl.dataset.dir);
          const items = S.tasksIn().filter((t) => t.status === col);
          const pages = Math.max(1, Math.ceil(items.length / view.boardSize));
          view.boardPage[col] = Math.min(pages - 1, Math.max(0, (view.boardPage[col] || 0) + dir));
          render(); return;
        }
        case 'cal-move': {
          const dir = Number(actionEl.dataset.dir);
          const b = view.calMonth || { y: new Date().getFullYear(), m: new Date().getMonth() };
          const d = new Date(b.y, b.m + dir, 1);
          view.calMonth = { y: d.getFullYear(), m: d.getMonth() };
          render(); return;
        }
        case 'cal-today': { view.calMonth = null; view.calSel = day(0); render(); return; }
        case 'theme': S.state.settings.theme = actionEl.value; applySettings(); S.save(); render(); return;        case 'accent': S.state.settings.accent = actionEl.dataset.color; applySettings(); S.save(); render(); return;
        case 'accent-custom': openAccentPicker(); return;
        case 'compact': S.state.settings.compact = !S.state.settings.compact; applySettings(); S.save(); render(); return;
        case 'remember': S.state.settings.rememberLast = !S.state.settings.rememberLast; S.save(); render(); return;
        case 'notification-settings':
          showSystemSettings();
          return;
        case 'close-to-tray':
          S.state.settings.closeToTray = !S.state.settings.closeToTray;
          if (window.PM && window.PM.setCloseToTray) window.PM.setCloseToTray(S.state.settings.closeToTray);
          S.save(); render(); return;
        case 'weekstart': S.state.settings.weekStart = Number(actionEl.value); S.save(); render(); return;
        case 'export': {
          const json = JSON.stringify(S.state, null, 2);
          if (window.PM && window.PM.exportJson) { await window.PM.exportJson(json); toast('已导出备份'); }
          else { download(json); toast('已下载备份'); }
          return;
        }
        case 'import': importFlow(); return;
        case 'open-folder': if (window.PM) window.PM.openStoreFolder(); else toast('浏览器预览模式'); return;
        case 'check-update': {
          await window.PMUpdates.act();
          return;
        }
        case 'open-release': window.PMUpdates.openRelease(); return;
        case 'reset': if (confirm('恢复示例数据？当前内容会被清空。')) { S.reset(); applySettings(); renderRail(); render(); toast('已恢复示例数据'); } return;
      }
    }

    // 标签选择 / 新建标签
    const tagEl = e.target.closest('[data-tag]');
    if (tagEl) {
      const v = tagEl.dataset.tag;
      draftTags = draftTags.includes(v) ? draftTags.filter((x) => x !== v) : draftTags.concat(v);
      syncTagChips($q('#f-tags'));
      return;
    }
    if (e.target.closest('#f-newtag')) {
      const button = $q('#f-newtag'), input = $q('#f-tag-input');
      input.style.width = button.getBoundingClientRect().width + 'px';
      button.hidden = true; input.hidden = false; input.focus(); return;
    }
    const subToggle = e.target.closest('[data-sub-toggle]');
    if (subToggle) {
      const sb = draftSubtasks.find((x) => x.id === subToggle.dataset.subToggle);
      if (sb) sb.done = !sb.done;
      renderDraftSubs(); return;
    }
    const subDel = e.target.closest('[data-sub-del]');
    if (subDel) { draftSubtasks = draftSubtasks.filter((x) => x.id !== subDel.dataset.subDel); renderDraftSubs(); return; }
    const sw = e.target.closest('#p-colors .swatch');
    if (sw) {
      draftColor = sw.dataset.color;
      $qa('#p-colors .swatch').forEach((b) => b.setAttribute('aria-pressed', String(b === sw)));
      return;
    }

    // Task cards inside the calendar open the editor before the surrounding day handles selection.
    const taskEl = e.target.closest('[data-task]');
    if (taskEl) {
      const dayCell = taskEl.closest('.cal-cell');
      if (dayCell) selectCalendarDay(dayCell.dataset.day);
      openTaskSheet(taskEl.dataset.task); return;
    }

    // 日历选日期
    const cell = e.target.closest('[data-day]');
    if (cell) { selectCalendarDay(cell.dataset.day); return; }

    // 打开任务详情
    const treeTask = e.target.closest('[data-tree-task]');
    if (treeTask) { openTaskSheet(treeTask.dataset.treeTask); return; }

    // 跳到某项目
    const goto = e.target.closest('[data-goto-project]');
    if (goto) {
      S.state.activeProjectId = goto.dataset.gotoProject;
      S.state.activeModule = 'board';
      S.save(); renderRail(); render(); return;
    }
    const openP = e.target.closest('[data-open-project]');
    if (openP) {
      openProjectTree(openP.dataset.openProject); return;
    }

    if (e.target === sheetMask) closeSheet();
  });
  document.addEventListener('dblclick', event => {
    const cell = event.target.closest('.cal-cell[data-day]');
    if (S.state.activeModule !== 'calendar' || !cell || !panelBody.contains(cell) || event.button !== 0 || calendarClickOnControl || event.target.closest('.cal-event, .cal-more')) return;
    event.preventDefault();
    newCalendarTask(cell.dataset.day);
  });

  // 表单页（新建任务 / 新建项目）在面板里，弹层是另一套
  document.addEventListener('input', event => {
    if (event.target.id === 'f-due' || event.target.id === 'f-reminder-at') refreshReminderField();
  });
  const formPageOpen = () => (['task', 'project'].includes(S.state.activeModule) && sheetMode === 'module') || sheetMode === 'detail';
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($q('#f-tag-input') && !$q('#f-tag-input').hidden) { e.preventDefault(); closeTagEntry(true); return; }
      if (dropMenu && !dropMenu.hidden) { closeDropMenu(); return; }
      if (accentPickerCleanup) { e.preventDefault(); closeAccentPicker(true); return; }
      if (!sheetMask.hidden) { closeSheet(); return; }
      if (formPageOpen()) { closeSheet(); return; }

    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open-project]')) {
      e.preventDefault(); openProjectTree(e.target.dataset.openProject); return;
    }
    if (e.key === 'Enter') {
      const el = e.target;
      if (el.id === 'f-tag-input' && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); addDraftTag(); return; }
      if (el.id === 'f-sub-input' && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); addDraftSubtask(); return; }
      if (el.id === 'p-name') { const b = $q('[data-action="save-project"]'); if (b) b.click(); return; }
    }
  });

  function toggleBoardView() {
    S.state.settings.boardView = S.state.settings.boardView === 'simple' ? 'detailed' : 'simple';
    S.save(); render();
    panelBody.querySelector('[data-action="toggle-board-view"]')?.focus({ preventScroll: true });
  }
  function setCalendarView(value) {
    if (!['simple', 'detailed'].includes(value)) return;
    S.state.settings.calendarView = value;
    S.save(); render();
    panelBody.querySelector(`[data-action="calendar-view"][data-value="${value}"]`)?.focus({ preventScroll: true });
  }
  function editingGuard() {
    const editing = !taskDrawerMask.hidden || !sheetMask.hidden || !!$q('#p-name') || accentPickerCleanup ||
      $('aiConfig')?.dataset.dirty === 'true' || $('aiConfig')?.dataset.busy === 'true';
    if (editing) toast('请先保存或取消当前编辑');
    return !!editing;
  }
  function runShortcut(id) {
    if (id === 'toggleAI') { window.PMAI.toggle(); return true; }
    if (id === 'save') {
      if (document.activeElement?.closest('#aiUI, #aiConfig')) return false;
      const button = $q('[data-action="save-task"], [data-action="save-project"]');
      if (!button) return false;
      button.click(); return true;
    }
    if (id === 'toggleView') {
      if (S.state.activeModule === 'board') toggleBoardView();
      else if (S.state.activeModule === 'calendar') setCalendarView(S.state.settings.calendarView === 'detailed' ? 'simple' : 'detailed');
      else if (S.state.activeModule === 'projects') {
        S.state.settings.canvasView = S.state.settings.canvasView === 'simple' ? 'detailed' : 'simple';
        S.save(); if (view.detailProjectId) view.detailViewport[view.detailProjectId] = { manual: false }; renderDetail();
      } else return false;
      return true;
    }
    if (editingGuard()) return true;
    if (id === 'newTask') openTaskSheet(null);
    else if (id === 'newProject') openProjectPage(null);
    else if (id === 'projects') openModule('projects');
    else if (id === 'search') { openModule('board'); panelBody.querySelector('#boardSearch')?.focus(); }
    else if (id === 'previousPage' || id === 'nextPage') {
      const index = NAV_MODULES.findIndex(module => module.key === S.state.activeModule), step = id === 'previousPage' ? -1 : 1;
      openModule(NAV_MODULES[Math.max(0, Math.min(NAV_MODULES.length - 1, index + step))].key);
    } else return false;
    return true;
  }

  function aiSelection() {
    const projects = S.state.projects.filter(project => !project.archived);
    const task = !taskDrawerMask.hidden && S.state.tasks.find(item => item.id === editingTaskId);
    const projectId = task?.projectId || (S.state.activeModule === 'projects' ? view.detailProjectId : S.state.activeProjectId);
    return { projects, tasks: S.state.tasks, projectId: projects.some(project => project.id === projectId) ? projectId : projects[0]?.id || '', taskId: task?.id || '' };
  }
  function aiDraft(taskId) {
    if (taskDrawerMask.hidden || editingTaskId !== taskId || !$q('#f-title')) return null;
    return { title: $q('#f-title').value.trim(), notes: $q('#f-notes').value, due: $q('#f-due').value,
      status: S.state.tasks.find(task => task.id === taskId)?.status || 'todo', priority: $q('#f-priority').value,
      reminder: draftReminder(), tags: draftTags.slice(), subtasks: draftSubtasks.map(sub => ({ ...sub })) };
  }
  function captureAIWork(projectId, taskId) {
    const Work = window.PMAIWorkflow, context = Work.contextFrom(S.state, projectId, taskId, day(0));
    const draft = taskId && aiDraft(taskId);
    if (draft) {
      const index = context.tasks.findIndex(task => task.id === taskId);
      context.tasks[index] = { ...context.tasks[index], ...draft };
    }
    return { context: Work.normalizeContext(context), baseline: Work.fingerprint(S.state, projectId),
      draftSignature: draft ? JSON.stringify(draft) : null,
      label: taskId ? '任务：' + context.tasks.find(task => task.id === taskId).title : '项目：' + context.project.name };
  }
  function applyAIWork(capture, request, plan, selected) {
    const Work = window.PMAIWorkflow, projectId = request.context.project.id;
    if (Work.fingerprint(S.state, projectId) !== capture.baseline) throw new Error('项目内容已变化，请重新生成建议后应用。');
    if (capture.draftSignature) {
      const draft = aiDraft(request.context.taskId);
      if (!draft || JSON.stringify(draft) !== capture.draftSignature) throw new Error('编辑草稿已变化或关闭，请重新生成任务拆解。');
      const chosen = Work.items(Work.validatePlan(plan, request)).filter(item => selected.includes(item.id));
      if (!chosen.length) throw new Error('请先勾选要添加的子任务');
      const before = Work.clone(draftSubtasks), used = new Set(draftSubtasks.map(sub => sub.title));
      const additions = chosen.map(item => {
        if (item.kind !== 'sub' || used.has(item.title)) throw new Error('子任务已存在或方案无效');
        used.add(item.title); return { id: C.UID(), title: item.title, done: false };
      });
      draftSubtasks.push(...additions); renderDraftSubs(); toast('已添加到草稿，请保存任务');
      return { kind: 'draft', taskId: request.context.taskId, before, after: JSON.stringify(aiDraft(request.context.taskId)) };
    }
    if (!taskDrawerMask.hidden || !$('sheetMask').hidden || $q('#p-name')) throw new Error('请先保存或取消当前编辑，再应用此方案。');
    const before = Work.clone(S.state.tasks.filter(task => task.projectId === projectId));
    const prepared = Work.prepare(S.state, request, plan, selected, { uid: C.UID });
    S.state.tasks = prepared.tasks; S.touch(`AI ${Work.modes[request.mode].label}：应用 ${prepared.count} 项到「${request.context.project.name}」`); S.save();
    renderRail(); render(); refreshTaskParents(); toast(`已应用 ${prepared.count} 项`);
    return { kind: 'store', projectId, before, after: Work.fingerprint(S.state, projectId) };
  }
  function undoAIWork(receipt) {
    const Work = window.PMAIWorkflow;
    if (receipt.kind === 'draft') {
      const draft = aiDraft(receipt.taskId);
      if (!draft || JSON.stringify(draft) !== receipt.after) throw new Error('草稿已保存、关闭或继续修改，不能撤销此次添加。');
      draftSubtasks = Work.clone(receipt.before); renderDraftSubs(); toast('已撤销草稿中的 AI 子任务'); return;
    }
    if (!taskDrawerMask.hidden || !$('sheetMask').hidden || $q('#p-name')) throw new Error('请先保存或取消当前编辑，再撤销此次应用。');
    if (Work.fingerprint(S.state, receipt.projectId) !== receipt.after) throw new Error('项目已有后续修改，不能撤销此次应用。');
    const beforeIds = new Set(receipt.before.map(task => task.id));
    const addedIds = S.state.tasks.filter(task => task.projectId === receipt.projectId && !beforeIds.has(task.id)).map(task => task.id);
    if (S.state.tasks.some(task => task.projectId !== receipt.projectId && G.dependencies(task).some(id => addedIds.includes(id)))) throw new Error('其他项目已使用新增任务，不能撤销。');
    S.state.tasks = [...S.state.tasks.filter(task => task.projectId !== receipt.projectId), ...Work.clone(receipt.before)];
    S.touch('撤销 AI 方案应用'); S.save(); renderRail(); render(); toast('已撤销此次应用');
  }

  /* 滚动位置记录 */
  panelBody.addEventListener('scroll', () => {
    view.scroll[S.state.activeModule] = panelBody.scrollTop;
    positionDropMenu();
  });
  window.addEventListener('resize', closeDropMenu);
  panelBody.addEventListener('wheel', closeDropMenu, { passive: true });

  /* 拖动窗口（浏览器预览时用 CSS 拖动无意义，这里仅 Electron 生效） */
  /* ================================================================
   * 外观应用
   * ================================================================ */
  const DARK_THEME = 'aurora';
  const LIGHT_THEME = 'daylight';
  let systemTheme = 'dark';     // 由主进程 nativeTheme 同步

  /** 把设置里的主题名解析成真正生效的主题（theme = 'system' 时跟随系统亮/暗） */
  function effectiveTheme() {
    const t = S.state.settings.theme || 'system';
    if (t === 'system') return systemTheme === 'light' ? LIGHT_THEME : DARK_THEME;
    return THEMES[t] ? t : DARK_THEME;
  }

  function applySettings() {
    const s = S.state.settings;
    const theme = effectiveTheme();
    app.dataset.theme = theme;
    document.documentElement.dataset.theme = theme;
    app.classList.toggle('compact', !!s.compact);
    app.style.removeProperty('--panel-bg');
    window.PMAppearance.apply(document, s.accent);
    syncPinUI();
  }

  /** 系统亮暗变化时，仅当主题设置为「跟随系统」才需要重绘 */
  function onSystemThemeChanged(next) {
    if (next && next.system) systemTheme = next.system;
    if ((S.state.settings.theme || 'system') === 'system') {
      applySettings();
      render();
    }
  }

  function syncPinUI() {
    const b = $('pinBtn');
    if (b) b.dataset.on = String(!!S.state.settings.alwaysOnTop);
  }

  function download(text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'moreready-backup.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importFlow() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          S.replace(JSON.parse(String(r.result)));
          S.touch('导入备份');
          S.save();
          applySettings(); renderRail(); render();
          toast('导入完成');
        } catch (err) { toast('导入失败：' + err.message); }
      };
      r.readAsText(f);
    };
    input.click();
  }

  /* ================================================================
   * 启动
   * ================================================================ */
  async function boot() {
    app.dataset.platform = isDesktop ? 'desktop' : 'web';
    document.querySelectorAll('.desktop-window-controls button').forEach(button => {
      button.disabled = !isDesktop;
      if (!isDesktop) button.title = '桌面版可' + button.getAttribute('aria-label') + '应用窗口';
    });
    await S.init();
    window.PMShortcuts.init({ store: S, run: runShortcut, notify: toast, refresh: () => {
      const host = $('shortcutSettings'); if (host) host.innerHTML = window.PMShortcuts.html();
    } });
    document.querySelector('.rail-foot').innerHTML = `<span class="rail-foot-caption">${isDesktop ? 'MoreReady · 本地工作区' : 'MoreReady · 网页工作区'}</span>`;
    await window.PMSystemSettings.init({ notify: toast, changed: () => {
      const host = $('systemSettings');
      if (host && document.activeElement?.id !== 'notificationTime') host.innerHTML = window.PMSystemSettings.html();
      refreshReminderField();
    }, open: payload => {
      if (!taskDrawerMask.hidden || !sheetMask.hidden || accentPickerCleanup) { toast('收到任务提醒，请先保存或取消当前编辑后查看'); return; }
      const task = (payload?.taskIds || []).map(id => S.state.tasks.find(t => t.id === id)).find(Boolean);
      if (task) openTaskSheet(task.id);
      else if (payload?.test) showSystemSettings();
      else openModule('today');
    } });
    window.PMProjectGroups.init({ refresh: refreshProjectResults, notify: toast });
    await window.PMAI.init({ selection: aiSelection, captureWork: captureAIWork, applyWork: applyAIWork, undoWork: undoAIWork,
      openSettings: () => { if (editingGuard()) return false; openModule('extensions'); return true; }, pageContext: () => {
        const heading = workspaceTabTitle(workspaceTabKey()) || '当前页面';
        const content = [panelBody.innerText, !detailPanel.hidden ? detailBody.innerText : '', !taskDrawerMask.hidden ? taskDrawerBody.innerText : ''].filter(Boolean).join('\n\n').slice(0, 7000);
        return { label: heading, content };
      }, context: () => {
      const task = !taskDrawerMask.hidden && S.state.tasks.find(t => t.id === editingTaskId);
      const project = S.state.projects.find(p => p.id === (task?.projectId || (S.state.activeModule === 'projects' ? view.detailProjectId : S.state.activeProjectId)));
      if (!project) return null;
      const tasks = task ? [task] : S.tasksIn(project.id);
      return { label: task ? '任务：' + task.title : '项目：' + project.name,
        content: JSON.stringify({ project: { name: project.name, description: project.desc }, tasks: tasks.map(t => ({
          title: t.title, status: STATUS[t.status].label, priority: PRIORITY[t.priority].label, due: t.due,
          notes: t.notes, subtasks: t.subtasks, predecessors: G.dependencies(t).map(id => S.state.tasks.find(p => p.id === id)?.title || '不可用'),
        })) }, null, 2) };
    } });
    if (window.PM && window.PM.info) { try { window.__PM_INFO = await window.PM.info(); } catch {} }
    await window.PMUpdates.init({ notify: toast,
      changed: () => { const box = $('aboutUpdate'); if (box) box.outerHTML = window.PMUpdates.html(); },
      prepareInstall: () => {
        if (editingGuard()) return false;
        if ($('aiDock')?.dataset.busy === 'true' || $('aiPrompt')?.value.trim() || $('aiWorkGoal')?.value.trim()) { toast('请先处理当前 AI 对话后再重启'); return false; }
        S.save(); return true;
      },
    });
    // 先问系统亮暗，再决定「跟随系统」时用哪套配色
    if (window.PM && window.PM.getSystemTheme) {
      // Electron：走主进程 nativeTheme，可拿到系统级"应用模式"设置
      try { const t = await window.PM.getSystemTheme(); if (t && t.system) systemTheme = t.system; } catch {}
      if (window.PM.onSystemThemeChange) window.PM.onSystemThemeChange(onSystemThemeChanged);
    } else if (window.matchMedia) {
      // 浏览器预览：用 prefers-color-scheme 兜底
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      systemTheme = mq.matches ? 'dark' : 'light';
      mq.addEventListener('change', (e) => onSystemThemeChanged({ system: e.matches ? 'dark' : 'light' }));
    }
    applySettings();
    syncPinUI();
    renderRail();
    if (window.PM && window.PM.setAlwaysOnTop) window.PM.setAlwaysOnTop(!!S.state.settings.alwaysOnTop);
    if (window.PM && window.PM.setCloseToTray) window.PM.setCloseToTray(S.state.settings.closeToTray === true);
    // 托盘菜单改了置顶等设置，需要同步回界面
    if (window.PM && window.PM.onSettingsPushed) {
      window.PM.onSettingsPushed((patch) => {
        if (!patch) return;
        if (typeof patch.alwaysOnTop === 'boolean') S.state.settings.alwaysOnTop = patch.alwaysOnTop;
        S.save();
        syncPinUI();
        if (taskDrawerMask.hidden) render();
      });
    }
    if (!S.state.settings.rememberLast || ['task', 'project'].includes(S.state.activeModule)) S.state.activeModule = 'projects';
    if (!NAV_MODULES.some((module) => module.key === S.state.activeModule)) S.state.activeModule = 'projects';
    const updateWindow = (state) => {
      const button = $('maximizeBtn');
      button.innerHTML = state.maximized ? '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4 4V1.5h6.5V8H8"/><rect x="1.5" y="4" width="6.5" height="6.5"/></svg>' : '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9"/></svg>';
      button.title = state.maximized ? '还原' : '最大化';
      button.setAttribute('aria-label', button.title);
    };
    if (window.PM?.getWindowState) updateWindow(await window.PM.getWindowState());
    if (window.PM?.onWindowStateChange) window.PM.onWindowStateChange(updateWindow);
    $('desktopTitlebar').addEventListener('dblclick', (event) => { if (!event.target.closest('button')) window.PM?.toggleMaximize(); });
    $('workspaceTabs').addEventListener('wheel', event => {
      const tabs = $('workspaceTabs');
      if (tabs.scrollWidth > tabs.clientWidth && Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); tabs.scrollLeft += event.deltaY; }
    }, { passive: false });
    $('workspaceTabs').addEventListener('keydown', event => {
      const current = event.target.closest('[data-tab-select]');
      if (!current || event.ctrlKey || event.metaKey || event.altKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Delete'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Delete') { if (workspaceTabs().length > 1 || current.dataset.tabSelect !== 'today') closeWorkspaceTab(current.dataset.tabSelect); return; }
      const tabs = workspaceTabs(), index = tabs.indexOf(current.dataset.tabSelect);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      if (openModule(tabs[next]) !== false) $('workspaceTab-' + tabs[next])?.focus({ preventScroll: true });
    });
    renderRail(); render(); S.save();
  }

  boot();
})();
