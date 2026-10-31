(function () {
  'use strict';
  const S = window.PMStore, C = window.PMConst, R = window.PMReminders;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAYS = 28, MS = 864e5;
  function shift(day, amount) {
    if (!R.validDay(day)) return C.day(0);
    const date = C.parseDay(day); date.setDate(date.getDate() + amount);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function distance(a, b) {
    const utc = day => { const d = C.parseDay(day); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
    return Math.round((utc(b) - utc(a)) / MS);
  }
  function initialStart(tasks) {
    const today = C.day(0);
    const first = tasks.reduce((min, task) => R.validDay(task.due) && task.due < min ? task.due : min, today);
    const anchor = distance(first, today) > 56 ? shift(today, -7) : first;
    return shift(anchor, -((C.parseDay(anchor).getDay() + 6) % 7));
  }
  function html(tasks, requestedStart) {
    const start = R.validDay(requestedStart) ? requestedStart : initialStart(tasks);
    const end = shift(start, DAYS - 1), today = C.day(0), todayIndex = distance(start, today);
    const dates = Array.from({ length: DAYS }, (_, index) => shift(start, index));
    const dated = tasks.filter(task => R.validDay(task.due));
    const undated = tasks.filter(task => !R.validDay(task.due));
    const ordered = [...dated.slice().sort((a, b) => a.due.localeCompare(b.due)), ...undated];
    const row = task => {
      const project = S.state.projects.find(item => item.id === task.projectId);
      const index = R.validDay(task.due) ? distance(start, task.due) : null;
      const visible = index !== null && index >= 0 && index < DAYS;
      const dateLabel = index === null ? '未排期' : task.due.replace(/-/g, '/');
      return `<div class="timeline-row${task.status === 'done' ? ' done' : ''}" data-timeline-task="${esc(task.id)}">
        <div class="timeline-task-label"><button type="button" data-task="${esc(task.id)}" title="${esc(task.title)}">${esc(task.title)}</button><div><span class="pdot" style="background:${esc(project?.color || '#8b95a7')}"></span><small>${esc(project?.name || '未归类')}</small>${index === null ? '<small>未排期</small>' : `<button class="timeline-date-link" type="button" data-action="timeline-date" data-date="${esc(task.due)}" title="定位到截止日期">${dateLabel}</button>`}</div></div>
        <div class="timeline-track">${visible ? `<button type="button" class="timeline-milestone" data-task="${esc(task.id)}" data-date="${esc(task.due)}" style="--task-day:${index};--task-color:${esc(project?.color || '#8b95a7')}" aria-label="${esc(task.title)}，截止 ${dateLabel}" title="${esc(task.title)} · ${dateLabel}"><span>${esc(task.title)}</span></button>` : `<span class="timeline-outside">${index === null ? '未设置截止日期' : '此范围外，可点击日期定位'}</span>`}</div>
      </div>`;
    };
    return `<div class="timeline-heading"><div><b>${start.replace(/-/g, '/')} — ${end.replace(/-/g, '/')}</b><span>${tasks.length} 项任务${undated.length ? ` · ${undated.length} 项未排期` : ''}</span></div><div class="timeline-range-controls"><button class="btn tiny" type="button" data-action="timeline-move" data-start="${start}" data-dir="-1" aria-label="前四周">‹</button><button class="btn tiny" type="button" data-action="timeline-today">今天</button><button class="btn tiny" type="button" data-action="timeline-move" data-start="${start}" data-dir="1" aria-label="后四周">›</button></div></div>
      ${ordered.length ? `<div class="timeline-scroller" role="region" aria-label="任务甘特时间线" tabindex="0"><div class="timeline-table" style="--timeline-days:${DAYS};--timeline-today:${todayIndex}"><div class="timeline-date-head"><div class="timeline-corner">任务 / 截止日期</div><div class="timeline-dates">${dates.map(date => { const d = C.parseDay(date), weekend = [0, 6].includes(d.getDay()); return `<div class="timeline-day${weekend ? ' weekend' : ''}${date === today ? ' today' : ''}" data-timeline-day="${date}"><span>${d.getMonth() + 1}/${d.getDate()}</span><small>${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}</small></div>`; }).join('')}</div></div><div class="timeline-rows">${ordered.map(row).join('')}${todayIndex >= 0 && todayIndex < DAYS ? '<div class="timeline-today-line" aria-hidden="true"></div>' : ''}</div></div></div>` : '<div class="empty"><b>没有匹配的任务</b><span>调整搜索、项目筛选，或新建任务</span></div>'}`;
  }
  window.PMTimeline = { html, shift };
})();
