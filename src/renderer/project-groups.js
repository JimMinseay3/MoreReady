(function () {
  'use strict';
  const S = window.PMStore;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let refresh, notify, creating = false;
  function toolbarHTML() {
    return `<form class="project-group-create" id="projectGroupCreate" data-group-create ${creating ? '' : 'hidden'}><input class="input" name="name" maxlength="40" placeholder="分组名称" aria-label="新分组名称" required /><button class="btn tiny" type="submit">创建</button><button class="icon-btn" type="button" data-group-cancel aria-label="取消新建分组">×</button></form>`;
  }
  function resultsHTML(list, cards) {
    const groups = [{ id: '', name: '默认分组', collapsed: S.state.settings.ungroupedCollapsed }, ...S.state.projectGroups];
    const filtered = list.length < S.projects(true).length;
    return groups.map(g => {
      const items = list.filter(p => (p.groupId || '') === g.id);
      if (filtered && !items.length) return '';
      return `<section class="project-group" data-group-drop="${esc(g.id)}"><button class="project-group-head" data-group-toggle="${esc(g.id)}" aria-expanded="${!g.collapsed}"><span class="group-chevron">${g.collapsed ? '›' : '⌄'}</span><b>${esc(g.name)}</b><span>${items.length}</span></button><div class="project-group-projects" ${g.collapsed ? 'hidden' : ''}>${items.map(p => cards.get(p.id)).join('') || '<p class="group-empty">暂无项目</p>'}</div></section>`;
    }).join('');
  }
  function showCreator(open) {
    creating = open;
    const form = document.querySelector('[data-group-create]');
    if (form) { form.hidden = !open; if (open) form.elements.name.focus(); else form.reset(); }
    const button = document.querySelector('[data-group-new]');
    button?.setAttribute('aria-expanded', String(open));
    if (!open) button?.focus({ preventScroll: true });
  }
  function init(options) {
    refresh = options.refresh; notify = options.notify;
    document.addEventListener('submit', e => {
      if (!e.target.matches('[data-group-create]')) return;
      e.preventDefault();
      try {
        const group = S.addProjectGroup(new FormData(e.target).get('name'));
        const select = document.getElementById('p-group');
        if (select) select.add(new Option(group.name, group.id));
        showCreator(false); refresh(); notify('分组已创建');
      } catch (error) { notify(error.message); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && e.target.closest('[data-group-create]')) {
        e.preventDefault(); e.stopImmediatePropagation(); showCreator(false);
      }
    }, true);
    document.addEventListener('click', e => {
      if (e.target.closest('[data-group-new]')) { showCreator(!creating); return; }
      if (e.target.closest('[data-group-cancel]')) { showCreator(false); return; }
      const toggle = e.target.closest('[data-group-toggle]');
      if (toggle) {
        const id = toggle.dataset.groupToggle, group = S.state.projectGroups.find(g => g.id === id);
        if (group) group.collapsed = !group.collapsed;
        else S.state.settings.ungroupedCollapsed = !S.state.settings.ungroupedCollapsed;
        S.save(); refresh();
        [...document.querySelectorAll('[data-group-toggle]')].find(button => button.dataset.groupToggle === id)?.focus({ preventScroll: true });
      }
    });
    document.addEventListener('dragstart', e => {
      const card = e.target.closest('[data-open-project]');
      if (!card || e.target.closest('button')) return;
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
