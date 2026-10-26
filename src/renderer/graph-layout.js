(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PMGraphLayout = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function arrange(tasks, graph, preferredWidth = 900, measuredSizes = new Map()) {
    const nodeWidth = 232, nodeHeight = 116, gap = 88, rowGap = 48, padding = 36;
    const sizes = new Map(tasks.map(task => {
      const measured = measuredSizes.get(task.id);
      return [task.id, { width: measured?.width || nodeWidth, height: measured?.height || nodeHeight }];
    }));
    const adjacent = new Map(tasks.map((task) => [task.id, []]));
    graph.edges.forEach(({ from, to }) => { adjacent.get(from).push(to); adjacent.get(to).push(from); });
    const rank = new Map();
    graph.layers.forEach((layer, index) => layer.forEach((task) => rank.set(task.id, index)));
    const seen = new Set(), components = [];
    tasks.forEach((task) => {
      if (seen.has(task.id)) return;
      const ids = [task.id]; seen.add(task.id);
      for (let i = 0; i < ids.length; i++) adjacent.get(ids[i]).forEach((id) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } });
      const members = tasks.filter((item) => ids.includes(item.id));
      const ranks = [...new Set(members.map((item) => rank.get(item.id)))].sort((a, b) => a - b);
      const columns = ranks.map((value) => members.filter((item) => rank.get(item.id) === value));
      const widths = columns.map(column => Math.max(...column.map(item => sizes.get(item.id).width)));
      const heights = columns.map(column => column.reduce((sum, item) => sum + sizes.get(item.id).height, 0) + (column.length - 1) * rowGap);
      const height = Math.max(...heights);
      const positions = new Map(), columnOf = new Map(), columnEnds = new Map();
      let columnX = 0;
      columns.forEach((column, col) => {
        let rowY = (height - heights[col]) / 2;
        column.forEach(item => {
          positions.set(item.id, { x: columnX, y: rowY }); columnOf.set(item.id, col);
          columnEnds.set(item.id, columnX + widths[col]);
          rowY += sizes.get(item.id).height + rowGap;
        });
        columnX += widths[col] + gap;
      });
      const edges = graph.edges.filter((edge) => positions.has(edge.from));
      const skip = edges.filter(edge => columnOf.get(edge.to) - columnOf.get(edge.from) > 1);
      components.push({ positions, edges, height: height + (skip.length ? 38 + skip.length * 14 : 0),
        columnOf, columnEnds, nodeHeight: height, width: columnX - gap });
    });
    // Pack disconnected components compactly rather than spreading all roots across one row.
    components.sort((a, b) => b.positions.size - a.positions.size);
    const positions = new Map(), edgePaths = [];
    let x = padding, y = padding, shelfHeight = 0, width = 0, height = 0;
    components.forEach((component) => {
      if (x > padding && x + component.width + padding > preferredWidth) { x = padding; y += shelfHeight + 48; shelfHeight = 0; }
      component.positions.forEach((point, id) => positions.set(id, { x: x + point.x, y: y + point.y }));
      let lane = 0;
      component.edges.forEach((edge) => {
        const a = positions.get(edge.from), b = positions.get(edge.to);
        const aSize = sizes.get(edge.from), bSize = sizes.get(edge.to);
        const x1 = a.x + aSize.width + 3, y1 = a.y + aSize.height / 2;
        const x2 = b.x - 5, y2 = b.y + bSize.height / 2, mid = (x1 + x2) / 2;
        let d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
        if (component.columnOf.get(edge.to) - component.columnOf.get(edge.from) > 1) {
          const bottom = y + component.nodeHeight + 24 + lane++ * 14;
          const leave = x + component.columnEnds.get(edge.from) + gap / 2, enter = x2 - gap / 2 + 5;
          d = `M ${x1} ${y1} C ${leave} ${y1}, ${leave} ${y1}, ${leave} ${y1 + 22} L ${leave} ${bottom - 14} Q ${leave} ${bottom}, ${leave + 14} ${bottom} L ${enter - 14} ${bottom} Q ${enter} ${bottom}, ${enter} ${bottom - 14} L ${enter} ${y2 + 22} Q ${enter} ${y2}, ${x2} ${y2}`;
        }
        edgePaths.push({ ...edge, d });
      });
      width = Math.max(width, x + component.width + padding);
      height = Math.max(height, y + component.height + padding);
      x += component.width + 48; shelfHeight = Math.max(shelfHeight, component.height);
    });
    return { positions, edgePaths, width: width || nodeWidth + padding * 2, height: height || nodeHeight + padding * 2, nodeWidth, nodeHeight, sizes };
  }
  return { arrange };
});
