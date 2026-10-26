(function () {
  'use strict';
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function detach(host) {
    if (host.__dagCleanup) { host.__dagCleanup(); host.__dagCleanup = null; }
  }

  function mount(host, { tasks, graph, state, nodeHTML, nodeColor, onLink, onNewTask, selectedId = null }) {
    detach(host);
    const container = host.querySelector('.dag-host');
    // Measure each rendered card before positioning so wrapped titles and subtasks set its own size.
    const contents = new Map(tasks.map(task => [task.id, nodeHTML(task)]));
    const measure = document.createElement('div'); measure.className = 'dag-measure'; measure.setAttribute('aria-hidden', 'true');
    measure.innerHTML = tasks.map(task => `<div class="tree-node graph-node" data-node-id="${esc(task.id)}"><div class="dag-node-content">${contents.get(task.id)}</div></div>`).join('');
    container.append(measure);
    const measuredSizes = new Map([...measure.children].map(node => {
      const rect = node.getBoundingClientRect();
      return [node.dataset.nodeId, { width: Math.ceil(rect.width), height: Math.ceil(rect.height) }];
    }));
    measure.remove();
    const { positions, edgePaths, width, height, sizes } = window.PMGraphLayout.arrange(tasks, graph, Math.max(600, container.clientWidth - 32), measuredSizes);
    const paths = edgePaths.map((edge) => '<path data-edge-from="' + esc(edge.from) + '" data-edge-to="' + esc(edge.to) + '" d="' + edge.d + '" marker-end="url(#taskArrow)" />').join('');
    const nodes = tasks.map((task) => {
      const point = positions.get(task.id);
      const size = sizes.get(task.id);
      return `<div class="tree-node graph-node" data-node-id="${esc(task.id)}" style="left:${point.x}px;top:${point.y}px;width:${size.width}px;height:${size.height}px;--node-color:${nodeColor(task)}"><button class="dag-port dag-port-in" data-dag-port="in" data-node-id="${esc(task.id)}" title="接收前置任务连线（左侧）" aria-label="连接到${esc(task.title)}"></button><button class="dag-node-content" data-tree-task="${esc(task.id)}">${contents.get(task.id)}</button><button class="dag-port dag-port-out" data-dag-port="out" data-node-id="${esc(task.id)}" title="拖动或点击，连接后续任务（右侧）" aria-label="从${esc(task.title)}连线" aria-pressed="false"></button></div>`;
    }).join('');
    container.innerHTML = `<div class="tree-scroll dag-viewport" role="region" aria-label="任务 DAG 画布" tabindex="0"><div class="tree-canvas dag-plane" style="width:${width}px;height:${height}px"><svg class="tree-edges" width="${width}" height="${height}" aria-hidden="true"><defs><marker id="taskArrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" stroke="none" /></marker></defs>${paths}<g><path class="dag-preview" hidden marker-end="url(#taskArrow)" /></g></svg>${nodes}</div>${tasks.length ? '' : '<div class="dag-empty"><b>这个项目还没有任务</b><span>右键画布或点击「添加任务」开始规划</span></div>'}<div class="dag-context-menu" role="menu" hidden><button role="menuitem" data-dag-new>＋ 新建任务</button></div>
      <div class="dag-controls" role="toolbar" aria-label="画布工具"><div class="dag-zoom"><button class="btn tiny" data-dag-action="out" aria-label="缩小">−</button><output class="dag-scale" aria-label="当前缩放比例"></output><button class="btn tiny" data-dag-action="in" aria-label="放大">＋</button></div><button class="btn tiny" data-dag-action="fit">适应视图</button><button class="btn tiny" data-dag-action="reset" aria-label="原始大小">100%</button><button class="btn tiny" data-action="tree-new-task">添加任务</button></div></div>`;
    const viewport = container.querySelector('.dag-viewport');
    const controls = container.querySelector('.dag-controls');
    const plane = container.querySelector('.dag-plane');
    const output = container.querySelector('.dag-scale');
    const preview = container.querySelector('.dag-preview');
    const menu = container.querySelector('.dag-context-menu');
    host.__dagSelect = (id) => {
      const related = new Set(id ? [id] : []);
      // Walk each direction independently so siblings are not marked as dependencies.
      for (const direction of ['from', 'to']) {
        const queue = id ? [id] : [], seen = new Set(queue);
        for (let i = 0; i < queue.length; i++) graph.edges.forEach((edge) => {
          const next = edge[direction === 'from' ? 'to' : 'from'];
          if (edge[direction] === queue[i] && !seen.has(next)) { seen.add(next); related.add(next); queue.push(next); }
        });
      }
      viewport.querySelectorAll('.graph-node').forEach((node) => {
        const selected = node.dataset.nodeId === id;
        node.classList.toggle('selected', selected);
        node.classList.toggle('related', !!id && !selected && related.has(node.dataset.nodeId));
        node.classList.toggle('muted', !!id && !related.has(node.dataset.nodeId));
        node.querySelector('.dag-node-content').setAttribute('aria-pressed', String(selected));
      });
      viewport.querySelectorAll('.tree-edges > path').forEach((edge) => {
        const active = !!id && related.has(edge.dataset.edgeFrom) && related.has(edge.dataset.edgeTo);
        edge.classList.toggle('related', active); edge.classList.toggle('muted', !!id && !active);
      });
    };
    host.__dagSelect(selectedId);
    let linkFrom = null, wireDrag = null, drag = null, suppressClickUntil = 0;
    const hideMenu = () => { menu.hidden = true; };
    const cancelLink = () => {
      linkFrom = null;
      preview.setAttribute('hidden', '');
      viewport.classList.remove('connecting');
      viewport.querySelectorAll('.dag-port-out').forEach((port) => port.setAttribute('aria-pressed', 'false'));
    };
    const beginLink = (id) => {
      cancelLink(); hideMenu();
      linkFrom = id;
      viewport.classList.add('connecting');
      viewport.querySelectorAll('.dag-port-out').forEach((port) => port.setAttribute('aria-pressed', String(port.dataset.nodeId === id)));
    };
    const drawPreview = (clientX, clientY) => {
      if (!linkFrom) return;
      const from = positions.get(linkFrom), bounds = viewport.getBoundingClientRect();
      const size = sizes.get(linkFrom);
      const x1 = from.x + size.width, y1 = from.y + size.height / 2;
      const x2 = (clientX - bounds.left - viewport.clientLeft - state.x) / state.scale;
      const y2 = (clientY - bounds.top - viewport.clientTop - state.y) / state.scale;
      const mid = (x1 + x2) / 2;
      preview.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
      preview.removeAttribute('hidden');
    };
    const completeLink = (to) => {
      const from = linkFrom;
      cancelLink();
      if (from) onLink(from, to);
    };
    const apply = () => {
      plane.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
      output.textContent = `${Math.round(state.scale * 100)}%`;
      viewport.dataset.scale = String(state.scale);
    };
    const fit = () => {
      // Keep fitted nodes above the floating toolbar, including when its buttons wrap.
      const padding = 24;
      const availableWidth = Math.max(1, viewport.clientWidth - padding * 2);
      const availableHeight = Math.max(1, viewport.clientHeight - padding - controls.offsetHeight - 32);
      state.scale = Math.max(0.02, Math.min(1, availableWidth / width, availableHeight / height));
      state.x = (viewport.clientWidth - width * state.scale) / 2;
      state.y = padding + (availableHeight - height * state.scale) / 2;
      state.manual = false;
      apply();
    };
    const zoom = (scale, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) => {
      const previous = state.scale;
      state.scale = Math.max(0.1, Math.min(2.5, scale));
      state.x = x - (x - state.x) * state.scale / previous;
      state.y = y - (y - state.y) * state.scale / previous;
      state.manual = true;
      apply();
    };
    controls.addEventListener('click', (event) => {
      const button = event.target.closest('[data-dag-action]');
      if (!button) return;
      event.stopPropagation();
      hideMenu(); cancelLink();
      if (button.dataset.dagAction === 'fit') fit();
      else zoom(button.dataset.dagAction === 'reset' ? 1 : state.scale * (button.dataset.dagAction === 'in' ? 1.2 : 1 / 1.2));
    });
    viewport.addEventListener('pointerdown', (event) => {
      if (menu.contains(event.target) || controls.contains(event.target)) return;
      hideMenu();
      const port = event.target.closest('[data-dag-port="out"]');
      if (event.button === 0 && port) {
        event.preventDefault(); event.stopPropagation();
        wireDrag = { id: event.pointerId, from: port.dataset.nodeId, x: event.clientX, y: event.clientY, moved: false };
        viewport.focus({ preventScroll: true });
        return;
      }
      if (event.button !== 0 || event.target.closest('.tree-node')) return;
      if (linkFrom) { cancelLink(); return; }
      event.preventDefault();
      viewport.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: state.x, startY: state.y };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('panning');
    });
    viewport.addEventListener('pointermove', (event) => {
      if (wireDrag && event.pointerId === wireDrag.id) {
        if (!wireDrag.moved && Math.hypot(event.clientX - wireDrag.x, event.clientY - wireDrag.y) > 4) {
          wireDrag.moved = true;
          beginLink(wireDrag.from);
          viewport.setPointerCapture(event.pointerId);
        }
        if (wireDrag.moved) drawPreview(event.clientX, event.clientY);
        return;
      }
      if (linkFrom) drawPreview(event.clientX, event.clientY);
      if (!drag || event.pointerId !== drag.id) return;
      state.x = drag.startX + event.clientX - drag.x;
      state.y = drag.startY + event.clientY - drag.y;
      state.manual = true;
      apply();
    });
    const endDrag = () => {
      const id = (drag || wireDrag)?.id;
      drag = null; wireDrag = null; viewport.classList.remove('panning');
      if (id !== undefined && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    };
    viewport.addEventListener('pointerup', (event) => {
      if (wireDrag?.moved && event.pointerId === wireDrag.id) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.graph-node');
        const to = target && viewport.contains(target) ? target.dataset.nodeId : null;
        suppressClickUntil = performance.now() + 300;
        endDrag();
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
        if (to) completeLink(to);
        else cancelLink();
        return;
      }
      endDrag();
    });
    viewport.addEventListener('pointercancel', () => { endDrag(); cancelLink(); });
    viewport.addEventListener('lostpointercapture', () => { if (wireDrag) cancelLink(); endDrag(); });
    // Ports are separate buttons; stop their click before the task-detail handler.
    viewport.addEventListener('click', (event) => {
      if (event.detail && event.target === viewport && performance.now() < suppressClickUntil) {
        event.preventDefault(); event.stopPropagation(); return;
      }
      if (event.target.closest('[data-dag-new]')) {
        event.stopPropagation(); hideMenu(); onNewTask(); return;
      }
      const port = event.target.closest('[data-dag-port]');
      const node = event.target.closest('.graph-node');
      if (!port && !(linkFrom && node)) return;
      event.preventDefault(); event.stopPropagation();
      if (port?.dataset.dagPort === 'out') {
        if (linkFrom === port.dataset.nodeId) cancelLink();
        else beginLink(port.dataset.nodeId);
      } else if (linkFrom && node) completeLink(node.dataset.nodeId);
    }, true);
    viewport.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.graph-node') || controls.contains(event.target)) return;
      event.preventDefault(); event.stopPropagation();
      cancelLink(); endDrag();
      const bounds = viewport.getBoundingClientRect();
      menu.hidden = false;
      menu.style.left = `${Math.max(0, Math.min(event.clientX - bounds.left, viewport.clientWidth - menu.offsetWidth - 4))}px`;
      menu.style.top = `${Math.max(0, Math.min(event.clientY - bounds.top, viewport.clientHeight - menu.offsetHeight - 4))}px`;
      menu.querySelector('button').focus({ preventScroll: true });
    });
    const dismissMenu = (event) => { if (!menu.contains(event.target)) hideMenu(); };
    const cancelInteraction = (event) => {
      if (event.key !== 'Escape' || (!linkFrom && menu.hidden && !wireDrag)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      cancelLink(); endDrag(); hideMenu(); viewport.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', dismissMenu, true);
    document.addEventListener('keydown', cancelInteraction, true);
    viewport.addEventListener('wheel', (event) => {
      if (controls.contains(event.target)) return;
      event.preventDefault();
      hideMenu(); cancelLink();
      if (event.ctrlKey || event.metaKey) {
        const bounds = viewport.getBoundingClientRect();
        zoom(state.scale * Math.exp(-event.deltaY * 0.002), event.clientX - bounds.left, event.clientY - bounds.top);
      } else {
        state.x -= event.deltaX;
        state.y -= event.deltaY;
        state.manual = true;
        apply();
      }
    }, { passive: false });
    viewport.addEventListener('keydown', (event) => {
      if (event.target !== viewport || event.altKey) return;
      const offsets = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
      if (offsets[event.key]) {
        event.preventDefault(); event.stopPropagation();
        state.x += offsets[event.key][0]; state.y += offsets[event.key][1]; state.manual = true; apply();
      }
    });
    const observer = new ResizeObserver(() => { hideMenu(); if (!state.manual) fit(); });
    observer.observe(viewport);
    host.__dagCleanup = () => {
      host.__dagSelect = null;
      observer.disconnect();
      document.removeEventListener('pointerdown', dismissMenu, true);
      document.removeEventListener('keydown', cancelInteraction, true);
      if (drag || wireDrag) {
        const id = (drag || wireDrag).id;
        if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
      }
    };
    if (state.manual && Number.isFinite(state.scale)) apply();
    else fit();
  }
  window.PMDAGView = { mount, detach, select: (host, id) => host.__dagSelect?.(id) };
})();
