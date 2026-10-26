(function (root, factory) {
  const graph = factory();
  if (typeof module === 'object' && module.exports) module.exports = graph;
  else root.PMTaskGraph = graph;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const dependencies = (task) => [...new Set((Array.isArray(task.dependsOn) ? task.dependsOn : [])
    .filter((id) => typeof id === 'string' && id))];

  function analyze(tasks) {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const children = new Map(tasks.map((task) => [task.id, []]));
    const remaining = new Map();
    const levels = new Map(tasks.map((task) => [task.id, 0]));
    const missing = new Map();
    const edges = [];
    tasks.forEach((task) => {
      const parents = dependencies(task);
      const valid = parents.filter((id) => byId.has(id) && byId.get(id).projectId === task.projectId);
      missing.set(task.id, parents.filter((id) => !valid.includes(id)));
      remaining.set(task.id, valid.length);
      valid.forEach((id) => { children.get(id).push(task.id); edges.push({ from: id, to: task.id }); });
    });
    const queue = tasks.filter((task) => remaining.get(task.id) === 0).map((task) => task.id);
    for (let i = 0; i < queue.length; i += 1) {
      const id = queue[i];
      children.get(id).forEach((child) => {
        levels.set(child, Math.max(levels.get(child), levels.get(id) + 1));
        remaining.set(child, remaining.get(child) - 1);
        if (remaining.get(child) === 0) queue.push(child);
      });
    }
    const unresolved = tasks.filter((task) => remaining.get(task.id) > 0).map((task) => task.id);
    const last = Math.max(0, ...levels.values()) + 1;
    unresolved.forEach((id) => levels.set(id, last));
    const layers = [];
    tasks.forEach((task) => {
      const level = levels.get(task.id);
      (layers[level] ||= []).push(task);
    });
    return { byId, edges, layers: layers.filter(Boolean), unresolved, missing };
  }

  function validate(tasks, candidate) {
    const ids = dependencies(candidate);
    if (ids.includes(candidate.id)) throw new Error('任务不能依赖自己');
    const byId = new Map(tasks.map((task) => [task.id, task]));
    ids.forEach((id) => {
      const parent = byId.get(id);
      if (!parent) throw new Error('前置任务不存在或已移入回收站，请移除该依赖');
      if (parent.projectId !== candidate.projectId) throw new Error('只能选择同一项目的前置任务');
    });
    // A new parent must not already depend on this task, even through several layers.
    const pending = ids.slice();
    const seen = new Set();
    while (pending.length) {
      const id = pending.pop();
      if (id === candidate.id) throw new Error('这会形成循环依赖，请调整前置任务');
      if (seen.has(id)) continue;
      seen.add(id);
      const task = byId.get(id);
      if (task) pending.push(...dependencies(task));
    }
    return ids;
  }
  return { dependencies, analyze, validate };
});
