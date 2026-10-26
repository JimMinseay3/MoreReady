(function () {
  'use strict';
  const KEYS = ['urgent', 'due', 'doing', 'next', 'done', 'projects'];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function detach(host) {
    host.__overviewCleanup?.();
    host.__overviewCleanup = null;
  }
  function mount(host, store) {
    detach(host);
    const grid = host.querySelector('.overview-grid');
    if (!grid) return;
    const cards = () => [...grid.querySelectorAll('[data-overview-card]')];
    const saved = store.state.settings.overviewLayout || {};
    const order = [...new Set([...(Array.isArray(saved.order) ? saved.order : []), ...KEYS])].filter((key) => KEYS.includes(key));
    const sizes = {};
    KEYS.forEach((key) => {
      const size = saved.sizes?.[key];
      if (size && Number.isFinite(size.span) && Number.isFinite(size.height)) {
        sizes[key] = { span: clamp(Math.round(size.span), 3, 12), height: clamp(Math.round(size.height), 160, 1000) };
      }
    });
    const applySize = (card) => {
      const key = card.dataset.overviewCard, size = sizes[key];
      card.style.setProperty('--overview-span', size?.span || (key === 'projects' ? 12 : 6));
      if (size) card.style.setProperty('--overview-height', size.height + 'px');
      else card.style.removeProperty('--overview-height');
    };
    order.forEach((key) => { const card = cards().find((item) => item.dataset.overviewCard === key); if (card) grid.append(card); });
    cards().forEach(applySize);
    const persist = () => {
      const visible = cards().map((card) => card.dataset.overviewCard);
      store.state.settings.overviewLayout = { order: [...visible, ...order.filter((key) => !visible.includes(key))], sizes: { ...sizes } };
      store.save();
    };
    let active = null;
    const finish = (cancel = false) => {
      if (!active) return;
      const operation = active; active = null;
      if (cancel) {
        operation.originalOrder.forEach((card) => grid.append(card));
        if (operation.originalSize) sizes[operation.key] = operation.originalSize;
        else delete sizes[operation.key];
        applySize(operation.card);
      } else if (operation.moved) persist();
      operation.card.classList.remove('layout-moving', 'layout-resizing');
      document.body.classList.remove('overview-manipulating');
      if (grid.hasPointerCapture(operation.id)) grid.releasePointerCapture(operation.id);
    };
    const start = (event) => {
      if (event.button !== 0) return;
      const control = event.target.closest('[data-overview-drag], [data-overview-resize]');
      if (!control) return;
      const card = control.closest('[data-overview-card]'), key = card.dataset.overviewCard;
      const bounds = card.getBoundingClientRect();
      active = { id: event.pointerId, kind: control.hasAttribute('data-overview-resize') ? 'resize' : 'drag',
        card, key, x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height,
        originalSize: sizes[key] ? { ...sizes[key] } : null, originalOrder: cards(), moved: false };
      event.preventDefault(); event.stopPropagation();
      control.focus({ preventScroll: true });
      grid.setPointerCapture(event.pointerId);
    };
    const move = (event) => {
      if (!active || event.pointerId !== active.id) return;
      const dx = event.clientX - active.x, dy = event.clientY - active.y;
      if (!active.moved && Math.hypot(dx, dy) < 5) return;
      active.moved = true;
      document.body.classList.add('overview-manipulating');
      if (active.kind === 'resize') {
        active.card.classList.add('layout-resizing');
        const unit = (grid.clientWidth + 16) / 12;
        const minSpan = clamp(Math.ceil(260 / unit), 3, 12);
        const singleColumn = getComputedStyle(grid).gridTemplateColumns.split(' ').length === 1;
        const previousSpan = active.originalSize?.span || (active.key === 'projects' ? 12 : 6);
        sizes[active.key] = { span: singleColumn ? previousSpan : clamp(Math.round((active.width + dx + 16) / unit), minSpan, 12),
          height: clamp(Math.round(active.height + dy), 160, 1000) };
        applySize(active.card);
      } else {
        active.card.classList.add('layout-moving');
        const bounds = host.getBoundingClientRect();
        if (event.clientY > bounds.bottom - 40) host.scrollTop += 12;
        else if (event.clientY < bounds.top + 40) host.scrollTop -= 12;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-overview-card]');
        if (target && target !== active.card && grid.contains(target)) {
          const list = cards();
          if (list.indexOf(active.card) < list.indexOf(target)) target.after(active.card);
          else target.before(active.card);
        }
      }
    };
    const end = (event) => { if (active?.id === event.pointerId) finish(event.type === 'pointercancel'); };
    const keydown = (event) => {
      if (event.key === 'Escape' && active) { event.preventDefault(); event.stopImmediatePropagation(); finish(true); return; }
      const card = event.target.closest('[data-overview-card]');
      if (!card) return;
      if (event.target.matches('[data-overview-drag]') && event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const list = cards(), index = list.indexOf(card), next = list[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (next) { if (event.key === 'ArrowUp') next.before(card); else next.after(card); persist(); event.target.focus(); }
      } else if (event.target.matches('[data-overview-resize]') && event.key.startsWith('Arrow')) {
        event.preventDefault(); event.stopPropagation();
        const bounds = card.getBoundingClientRect(), key = card.dataset.overviewCard;
        const size = sizes[key] || { span: key === 'projects' ? 12 : 6, height: Math.round(bounds.height) };
        const minSpan = clamp(Math.ceil(260 / ((grid.clientWidth + 16) / 12)), 3, 12);
        sizes[key] = { span: clamp(size.span + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0), minSpan, 12),
          height: clamp(size.height + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0), 160, 1000) };
        applySize(card); persist();
      }
    };
    const reset = host.querySelector('[data-overview-reset]');
    const resetLayout = () => {
      finish(true); Object.keys(sizes).forEach((key) => delete sizes[key]);
      KEYS.forEach((key) => { const card = cards().find((item) => item.dataset.overviewCard === key); if (card) grid.append(card); });
      cards().forEach(applySize); delete store.state.settings.overviewLayout; store.save();
    };
    grid.addEventListener('pointerdown', start);
    grid.addEventListener('pointermove', move);
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
    document.addEventListener('keydown', keydown, true);
    reset?.addEventListener('click', resetLayout);
    host.__overviewCleanup = () => {
      finish(true);
      document.removeEventListener('keydown', keydown, true);
      reset?.removeEventListener('click', resetLayout);
      grid.removeEventListener('pointerdown', start); grid.removeEventListener('pointermove', move);
      grid.removeEventListener('pointerup', end); grid.removeEventListener('pointercancel', end);
    };
  }
  window.PMOverviewLayout = { mount, detach };
})();
