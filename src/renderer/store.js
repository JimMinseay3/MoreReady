/* ------------------------------------------------------------------
 * store.js — 数据层
 * 统一状态 + 持久化（Electron 走 IPC 存 userData/store.json，浏览器走 localStorage）
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const KEY = 'projectdesk.store.v1';
  const UID = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const fmtDay = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /** 本地时区的 YYYY-MM-DD（避免 toISOString 的 UTC 偏移问题） */
  const day = (offset) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (offset || 0));
    return fmtDay(d);
  };

  const parseDay = (s) => {
    const [y, m, d] = String(s || '').split('-').map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1);
  };

  const SCHEMA = 6;

  const DEFAULT_TAGS = ['前端', '后端', '设计', '文档', '会议', '紧急'];

  function seed() {
    const p = {
      website: { id: 'p-website', name: '官网改版', color: '#5b8cff', desc: '品牌官网 2.0，7 月底上线', archived: false, createdAt: Date.now() - 864e5 * 21 },
      app: { id: 'p-app', name: '移动端 App', color: '#38d39f', desc: 'iOS / Android 双端功能对齐', archived: false, createdAt: Date.now() - 864e5 * 40 },
      ops: { id: 'p-ops', name: '内部运营', color: '#f7b955', desc: '周会、汇报、数据看板维护', archived: false, createdAt: Date.now() - 864e5 * 60 },
      research: { id: 'p-research', name: '技术预研', color: '#c084fc', desc: '渲染管线与性能基准', archived: false, createdAt: Date.now() - 864e5 * 12 },
    };

    const t = (projectId, title, status, priority, due, tags, notes, subs) => ({
      id: UID(), projectId, title, status, priority, due: due || '', tags: tags || [],
      notes: notes || '', subtasks: subs || [], dependsOn: [], createdAt: Date.now() - Math.floor(Math.random() * 12) * 864e5,
      doneAt: status === 'done' ? Date.now() - 864e5 : null,
    });

    return {
      schema: SCHEMA,
      settings: {
        theme: 'system',
        accent: '#c18b38',
        compact: false,
        boardView: 'simple',
        canvasView: 'detailed',
        calendarView: 'simple',
        alwaysOnTop: false,
        showDoneInBoard: false,
        weekStart: 1,
        rememberLast: true,
        closeToTray: false,
        desktopMigrated: true,
      },
      activeModule: 'projects',
      activeProjectId: 'all',
      projects: Object.values(p),
      projectGroups: [],
      tags: DEFAULT_TAGS.slice(),
      tasks: [
        t('p-website', '首页视觉稿走查并定稿', 'doing', 'p0', day(0), ['设计', '前端'], '重点确认首屏信息层级与 CTA 位置。', [
          { id: UID(), title: '导出三套配色方案', done: true },
          { id: UID(), title: '和品牌部对齐字体', done: false },
        ]),
        t('p-website', '落地页组件库搭建', 'doing', 'p1', day(3), ['前端'], 'Hero / 特性 / 价格 / FAQ 四段式。'),
        t('p-website', 'SEO 元信息与站点地图', 'todo', 'p2', day(6), ['前端', '文档']),
        t('p-website', '旧站 301 跳转规则', 'todo', 'p1', day(9), ['后端']),
        t('p-website', '导航栏响应式适配', 'waiting', 'p2', day(-1), ['前端'], '等待设计给移动端稿。'),
        t('p-website', '域名与证书迁移', 'done', 'p1', day(-4), ['后端']),

        t('p-app', '登录态刷新逻辑重构', 'doing', 'p0', day(1), ['后端'], 'Token 过期静默续期，避免闪断。'),
        t('p-app', '消息中心未读红点', 'todo', 'p1', day(4), ['前端']),
        t('p-app', '崩溃日志接入与符号化', 'todo', 'p2', day(11), ['后端']),
        t('p-app', '应用商店截图与文案', 'waiting', 'p1', day(2), ['文档'], '等交互冻结后再截图。'),
        t('p-app', '启动速度优化到 1.2s', 'doing', 'p1', day(7), ['后端']),
        t('p-app', '设置页深色模式', 'done', 'p2', day(-2), ['前端']),

        t('p-ops', '周一项目周会纪要', 'todo', 'p1', day(0), ['会议', '文档'], '同步三个项目的风险项。'),
        t('p-ops', '季度 OKR 复盘材料', 'doing', 'p0', day(2), ['文档'], '按目标 / 结果 / 差距三段写。'),
        t('p-ops', '数据看板口径核对', 'todo', 'p2', day(5), ['后端']),
        t('p-ops', '团队月度工时统计', 'done', 'p3', day(-6), ['文档']),

        t('p-research', '渲染管线基准测试', 'doing', 'p1', day(8), ['前端'], '对比 WebGPU / WebGL 两条路径。'),
        t('p-research', '离线缓存策略调研', 'todo', 'p2', day(14), ['后端']),
        t('p-research', '技术选型分享会', 'todo', 'p3', day(17), ['会议']),
      ],
      trash: [],
      activity: [],
    };
  }

  const s = {
    state: null,
    ready: false,
    async init() {
      let raw = null;
      try {
        raw = window.PM && window.PM.isElectron ? await window.PM.readStore() : JSON.parse(localStorage.getItem(KEY) || 'null');
      } catch { raw = null; }
      this.state = normalize(raw) || seed();
      this.ready = true;
      this.touch('启动');
      return this.state;
    },
    save() {
      const data = this.state;
      try {
        if (window.PM && window.PM.isElectron) window.PM.writeStore(data);
        else {
          localStorage.setItem(KEY, JSON.stringify(data));
          window.dispatchEvent?.(new Event('pm:store-saved'));
        }
      } catch (err) { console.warn('保存失败', err); }
    },
    reset() { this.state = seed(); this.touch('重置数据'); this.save(); },
    replace(next) {
      const n = normalize(next);
      if (!n) throw new Error('数据格式不正确');
      this.state = n; this.save();
    },
    touch(text) {
      const st = this.state;
      if (!st) return;
      st.activity = st.activity || [];
      st.activity.unshift({ at: Date.now(), text });
      st.activity = st.activity.slice(0, 40);
    },

    /* ---------- 项目 ---------- */
    addProject({ name, color, desc, groupId }) {
      const p = { id: 'p-' + UID(), name: name.trim(), color: color || '#5b8cff', desc: (desc || '').trim(), groupId: this.state.projectGroups.some(g => g.id === groupId) ? groupId : '', archived: false, createdAt: Date.now() };
      this.state.projects.push(p); this.touch(`新建项目「${p.name}」`); this.save(); return p;
    },
    updateProject(id, patch) {
      const p = this.state.projects.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, patch);
      if (patch.name) this.touch(`重命名项目「${patch.name}」`);
      this.save(); return p;
    },
    addProjectGroup(name) {
      name = String(name || '').trim().slice(0, 40);
      if (!name) throw new Error('请填写分组名称');
      if (this.state.projectGroups.some(g => g.name === name)) throw new Error('分组名称已存在');
      const group = { id: 'g-' + UID(), name, collapsed: false };
      this.state.projectGroups.push(group); this.save(); return group;
    },
    renameProjectGroup(id, name) {
      name = String(name || '').trim().slice(0, 40);
      const group = this.state.projectGroups.find(g => g.id === id);
      if (!group || !name) throw new Error('请填写分组名称');
      if (this.state.projectGroups.some(g => g.id !== id && g.name === name)) throw new Error('分组名称已存在');
      group.name = name; this.save();
    },
    removeProjectGroup(id) {
      this.state.projectGroups = this.state.projectGroups.filter(g => g.id !== id);
      this.state.projects.forEach(p => { if (p.groupId === id) p.groupId = ''; });
      (this.state.trash || []).forEach(item => { if (item.project?.groupId === id) item.project.groupId = ''; });
      this.save();
    },
    removeProject(id) {
      const p = this.state.projects.find((x) => x.id === id);
      if (!p) return;
      // 软删除：项目连同它的任务一起进回收站，可还原
      this.trashProject(id);
      if (this.state.activeProjectId === id) this.state.activeProjectId = 'all';
      this.touch(`项目「${p.name}」移入回收站`);
      this.save();
    },

    /* ---------- 回收站 ---------- */
    trashList() {
      return (this.state.trash || []).slice().sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    },
    trashCount() {
      return (this.state.trash || []).length;
    },
    /** 任务进回收站 */
    trashTask(id) {
      const i = this.state.tasks.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const t = this.state.tasks.splice(i, 1)[0];
      this.state.trash = this.state.trash || [];
      this.state.trash.unshift({ type: 'task', deletedAt: Date.now(), task: t });
      this.save();
      return t;
    },
    /** 项目连同它的任务一起进回收站（合成一条记录） */
    trashProject(id) {
      const i = this.state.projects.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const p = this.state.projects.splice(i, 1)[0];
      const tasks = this.state.tasks.filter((t) => t.projectId === id);
      this.state.tasks = this.state.tasks.filter((t) => t.projectId !== id);
      this.state.trash = this.state.trash || [];
      this.state.trash.unshift({ type: 'project', deletedAt: Date.now(), project: p, tasks });
      this.save();
      return p;
    },
    restoreTrash(key) {
      const list = this.state.trash || [];
      const i = list.findIndex((x) => String(x.deletedAt) === String(key));
      if (i < 0) return false;
      const rec = list.splice(i, 1)[0];
      if (rec.type === 'task') {
        this.state.tasks.unshift(rec.task);
        this.touch(`还原任务「${rec.task.title}」`);
      } else {
        this.state.projects.push(rec.project);
        (rec.tasks || []).forEach((t) => this.state.tasks.push(t));
        this.touch(`还原项目「${rec.project.name}」`);
      }
      this.save();
      return true;
    },
    purgeTrash(key) {
      this.state.trash = (this.state.trash || []).filter((x) => String(x.deletedAt) !== String(key));
      this.save();
    },
    emptyTrash() {
      const n = (this.state.trash || []).length;
      this.state.trash = [];
      this.touch(`清空回收站（${n} 项）`);
      this.save();
      return n;
    },

    /* ---------- 任务 ---------- */
    addTask(data) {
      const t = Object.assign({
        projectId: this.state.projects[0] && this.state.projects[0].id,
        notes: '', status: 'todo', priority: 'p2', due: '', tags: [], subtasks: [], dependsOn: [],
      }, data, { id: UID(), title: String(data.title || '').trim(), createdAt: Date.now(), doneAt: null });
      if (!t.title) throw new Error('任务标题不能为空');
      t.reminder = window.PMReminders.normalizeReminder(t.reminder);
      t.dependsOn = window.PMTaskGraph.validate(this.state.tasks, t);
      this.state.tasks.unshift(t);
      this.touch(`新建任务「${t.title}」`);
      this.save(); return t;
    },
    updateTask(id, patch) {
      const t = this.state.tasks.find((x) => x.id === id);
      if (!t) return null;
      if ('dependsOn' in patch || 'projectId' in patch) {
        const candidate = { ...t, ...patch };
        candidate.dependsOn = window.PMTaskGraph.validate(this.state.tasks, candidate);
        if (candidate.projectId !== t.projectId && this.state.tasks.some((task) =>
          task.id !== id && window.PMTaskGraph.dependencies(task).includes(id))) {
          throw new Error('有后续任务依赖此任务，请先移除这些依赖再更换项目');
        }
        patch = { ...patch, dependsOn: candidate.dependsOn };
      }
      if ('reminder' in patch) patch = { ...patch, reminder: window.PMReminders.normalizeReminder(patch.reminder) };
      Object.assign(t, patch);
      if (patch.status) t.doneAt = patch.status === 'done' ? (t.doneAt || Date.now()) : null;
      this.save(); return t;
    },
    removeTask(id) {
      const t = this.state.tasks.find((x) => x.id === id);
      if (t) {
        this.trashTask(id);
        this.touch(`任务「${t.title}」移入回收站`);
      }
      this.save();
    },
    cycleStatus(id, dir) {
      const order = ['todo', 'doing', 'waiting', 'done'];
      const t = this.state.tasks.find((x) => x.id === id);
      if (!t) return null;
      const i = order.indexOf(t.status);
      const next = order[Math.min(order.length - 1, Math.max(0, i + dir))];
      const r = this.updateTask(id, { status: next });
      this.touch(`「${t.title}」→ ${STATUS[next].label}`);
      this.save();
      return r;
    },
    toggleSubtask(taskId, subId) {
      const t = this.state.tasks.find((x) => x.id === taskId);
      if (!t) return;
      const sub = (t.subtasks || []).find((x) => x.id === subId);
      if (sub) sub.done = !sub.done;
      this.save();
    },
    addSubtask(taskId, title) {
      const t = this.state.tasks.find((x) => x.id === taskId);
      if (!t || !title.trim()) return;
      t.subtasks = t.subtasks || [];
      t.subtasks.push({ id: UID(), title: title.trim(), done: false });
      this.save();
    },
    addTag(tag) {
      const v = tag.trim();
      if (v && !this.state.tags.includes(v)) { this.state.tags.push(v); this.save(); }
      return v;
    },

    /* ---------- 派生数据 ---------- */
    projects(includeArchived) {
      return this.state.projects.filter((p) => includeArchived || !p.archived);
    },
    tasksIn(projectId) {
      const pid = projectId || this.state.activeProjectId;
      return pid === 'all' ? this.state.tasks.slice() : this.state.tasks.filter((t) => t.projectId === pid);
    },
    stats(projectId) {
      const list = this.tasksIn(projectId);
      const by = (s2) => list.filter((t) => t.status === s2).length;
      const done = by('done');
      const total = list.length;
      const overdue = list.filter((t) => t.status !== 'done' && t.due && t.due < day(0)).length;
      return {
        total, done, doing: by('doing'), todo: by('todo'), waiting: by('waiting'),
        overdue,
        progress: total ? Math.round((done / total) * 100) : 0,
        dueToday: list.filter((t) => t.status !== 'done' && t.due === day(0)).length,
        priority: ['p0', 'p1', 'p2', 'p3'].map((k) => ({ key: k, label: PRIORITY[k].label, count: list.filter((t) => t.priority === k && t.status !== 'done').length })),
        tags: tagCloud(list),
      };
    },
    search(q) {
      const kw = q.trim().toLowerCase();
      if (!kw) return [];
      const byId = Object.fromEntries(this.state.projects.map((p) => [p.id, p.name]));
      return this.state.tasks
        .filter((t) => (t.title + ' ' + (t.notes || '') + ' ' + (t.tags || []).join(' ')).toLowerCase().includes(kw))
        .slice(0, 40)
        .map((t) => ({ ...t, projectName: byId[t.projectId] || '未归类' }));
    },
  };

  /* ---------- 常量与工具 ---------- */
  const STATUS = {
    todo: { label: '待办', color: 'var(--status-todo)' },
    doing: { label: '进行中', color: 'var(--status-doing)' },
    waiting: { label: '等待中', color: 'var(--status-waiting)' },
    done: { label: '已完成', color: 'var(--status-done)' },
  };
  const PRIORITY = {
    p0: { label: 'P0 紧急', color: 'var(--danger)' },
    p1: { label: 'P1 高', color: 'var(--status-waiting)' },
    p2: { label: 'P2 中', color: 'var(--status-doing)' },
    p3: { label: 'P3 低', color: 'var(--status-todo)' },
  };
  const THEMES = {
    system: { label: '跟随系统', dark: true },
    aurora: { label: 'MoreReady 夜幕（深色）', dark: true },
    graphite: { label: '石墨', bg: 'linear-gradient(150deg,#1b1d21,#101215)', text: '#eceef1', rail: 'rgba(38,40,45,.74)', panel: 'rgba(26,28,32,.64)' },
    ocean: { label: '深海蓝', bg: 'linear-gradient(150deg,#07223a,#04182b)', text: '#e6f2ff', rail: 'rgba(10,44,70,.7)', panel: 'rgba(8,34,56,.6)' },
    sakura: { label: '樱雾', bg: 'linear-gradient(150deg,#241826,#1a1120)', text: '#f7ecf5', rail: 'rgba(58,32,54,.72)', panel: 'rgba(44,24,42,.62)' },
    daylight: { label: 'MoreReady 晨光（浅色）', dark: false },
  };

  function tagCloud(list) {
    const m = new Map();
    list.forEach((t) => (t.tags || []).forEach((g) => m.set(g, (m.get(g) || 0) + 1)));
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks) || !Array.isArray(raw.projects)) return null;
    const fromSchema = Number(raw.schema) || 0;
    raw.schema = SCHEMA;
    raw.settings = Object.assign({
      theme: 'system', accent: '#c18b38',
      compact: false, alwaysOnTop: false, showDoneInBoard: false, weekStart: 1, rememberLast: true, closeToTray: false,
      boardView: 'simple', canvasView: 'detailed', calendarView: 'simple',
    }, raw.settings || {});
    if (!['simple', 'detailed'].includes(raw.settings.calendarView)) raw.settings.calendarView = 'simple';
    migrateSettings(raw.settings, fromSchema);
    raw.tags = Array.isArray(raw.tags) ? raw.tags : DEFAULT_TAGS.slice();
    const groupIds = new Set();
    raw.projectGroups = (Array.isArray(raw.projectGroups) ? raw.projectGroups : []).filter(g => {
      if (!g || typeof g.id !== 'string' || !g.id || typeof g.name !== 'string' || !g.name.trim() || groupIds.has(g.id)) return false;
      groupIds.add(g.id); g.name = g.name.trim().slice(0, 40); g.collapsed = g.collapsed === true; return true;
    });
    raw.projects.forEach(p => { if (!groupIds.has(p.groupId)) p.groupId = ''; });
    raw.activity = Array.isArray(raw.activity) ? raw.activity : [];
    raw.tasks.forEach((t) => {
      t.subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
      t.tags = Array.isArray(t.tags) ? t.tags : [];
      t.status = STATUS[t.status] ? t.status : 'todo';
      t.priority = PRIORITY[t.priority] ? t.priority : 'p2';
      t.reminder = window.PMReminders.normalizeReminder(t.reminder);
      t.id = t.id || UID();
      t.dependsOn = window.PMTaskGraph.dependencies(t);
    });
    return raw;
  }

  /** Preserve projects, tasks and colors; migrate widget-specific window defaults once. */
  function migrateSettings(settings, fromSchema) {
    if (fromSchema >= SCHEMA && settings.desktopMigrated === true) return;
    if (fromSchema < 2) {
      if (settings.theme === 'aurora') settings.theme = 'system';   // 老默认值 → 新默认值
      if (settings.rememberLast === true) settings.rememberLast = false;
      if (settings.closeToTray === undefined) settings.closeToTray = true;
    }
    if (fromSchema < 5 || settings.desktopMigrated !== true) {
      settings.alwaysOnTop = false;
      settings.closeToTray = false;
      settings.rememberLast = true;
      settings.desktopMigrated = true;
      delete settings.opacity;
      delete settings.targetWidth;
    }
  }

  window.PMStore = s;
  window.PMConst = { STATUS, PRIORITY, THEMES, DEFAULT_TAGS, day, parseDay, fmtDay, UID };
})();
