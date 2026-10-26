(function () {
  'use strict';
  const S = window.PMStore;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let refresh, notify;
  function toolbarHTML() {
    return `<details class="group-manager"><summary>管理分组 <span>＋</span></summary><div class="group-manager-body">
      <form data-group-create><input class="input" name="name" maxlength="40" placeholder="新分组名称" aria-label="新分组名称" required /><button class="btn tiny" type="submit">新建</button></form>
      ${S.state.projectGroups.map(g => `<div class="group-manager-row"><input class="input" data-group-name="${esc(g.id)}" value="${esc(g.name)}" maxlength="40" aria-label="分组名称" /><button class="icon-btn" data-group-save="${esc(g.id)}" title="保存分组名称" aria-label="保存分组名称">✓</button><button class="icon-btn" data-group-remove="${esc(g.id)}" title="移除分组，项目保留在未分组" aria-label="移除分组">×</button></div>`).join('')}
      </div></details>`;
  }
  function resultsHTML(list, cards) {
    if (!S.state.projectGroups.length) return [...cards.values()].join('');
    const groups = [...S.state.projectGroups, { id: '', name: '未分组', collapsed: S.state.settings.ungroupedCollapsed }];
    return groups.map(g => {
      const items = list.filter(p => (p.groupId || '') === g.id);
      return `<section class="project-group" data-group-drop="${esc(g.id)}"><button class="project-group-head" data-group-toggle="${esc(g.id)}" aria-expanded="${!g.collapsed}"><span class="group-chevron">${g.collapsed ? '›' : '⌄'}</span><b>${esc(g.name)}</b><span>${items.length}</span></button><div class="project-group-projects" ${g.collapsed ? 'hidden' : ''}>${items.map(p => cards.get(p.id)).join('') || '<p class="group-empty">拖入项目或在项目详情中选择分组</p>'}</div></section>`;
    }).join('');
  }
  function init(options) {
    refresh = options.refresh; notify = options.notify;
    const update = () => {
      refresh();
      const manager = document.querySelector('.group-manager');
      if (manager) { const open = manager.open; manager.outerHTML = toolbarHTML(); document.querySelector('.group-manager').open = open; }
    };
    document.addEventListener('submit', e => {
      if (!e.target.matches('[data-group-create]')) return;
      e.preventDefault();
      try { S.addProjectGroup(new FormData(e.target).get('name')); update(); } catch (error) { notify(error.message); }
    });
    document.addEventListener('click', e => {
      const toggle = e.target.closest('[data-group-toggle]');
      if (toggle) {
        const id = toggle.dataset.groupToggle, group = S.state.projectGroups.find(g => g.id === id);
        if (group) group.collapsed = !group.collapsed;
        else S.state.settings.ungroupedCollapsed = !S.state.settings.ungroupedCollapsed;
        S.save(); refresh(); return;
      }
      const save = e.target.closest('[data-group-save]'), remove = e.target.closest('[data-group-remove]');
      try {
        if (save) { const id = save.dataset.groupSave; S.renameProjectGroup(id, [...document.querySelectorAll('[data-group-name]')].find(el => el.dataset.groupName === id).value); update(); }
        if (remove) { S.removeProjectGroup(remove.dataset.groupRemove); update(); notify('分组已移除，项目已保留在未分组'); }
      } catch (error) { notify(error.message); }
    });
    document.addEventListener('dragstart', e => {
      const card = e.target.closest('[data-open-project]');
      if (!card) return;
      e.dataTransfer.setData('application/x-moreready-project', card.dataset.openProject); e.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragover', e => {
      const group = e.target.closest('[data-group-drop]');
      if (group && [...e.dataTransfer.types].includes('application/x-moreready-project')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; group.classList.add('drag-over'); }
    });
    document.addEventListener('dragleave', e => { const group = e.target.closest('[data-group-drop]'); if (group && !group.contains(e.relatedTarget)) group.classList.remove('drag-over'); });
    document.addEventListener('drop', e => {
      const group = e.target.closest('[data-group-drop]');
      if (!group) return;
      group.classList.remove('drag-over');
      const id = e.dataTransfer.getData('application/x-moreready-project');
      if (!id || !S.state.projects.some(p => p.id === id)) return;
      e.preventDefault(); S.updateProject(id, { groupId: group.dataset.groupDrop }); refresh();
    });
    document.addEventListener('dragend', () => document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')));
  }
  window.PMProjectGroups = { init, toolbarHTML, resultsHTML };
})();
