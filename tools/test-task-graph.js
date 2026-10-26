'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const graph = require('../src/renderer/task-graph');
const { restoreBounds } = require('../src/desktop-window');
const { arrange } = require('../src/renderer/graph-layout');

const task = (id, dependsOn = [], projectId = 'p') => ({ id, title: id, projectId, dependsOn, status: 'todo' });
const tasks = [task('a'), task('b', ['a']), task('c', ['b']), task('d', ['b']), task('e', ['c', 'd']), task('f', ['e'])];
const result = graph.analyze(tasks);
assert.deepEqual(result.layers.map((layer) => layer.map((item) => item.id)), [['a'], ['b'], ['c', 'd'], ['e'], ['f']]);
assert.equal(result.edges.length, 6);
assert.equal(result.unresolved.length, 0);
assert.throws(() => graph.validate(tasks, task('a', ['f'])), /循环/);
assert.throws(() => graph.validate(tasks, task('a', ['a'])), /自己/);
assert.throws(() => graph.validate([...tasks, task('other', [], 'q')], task('a', ['other'])), /同一项目/);
assert.throws(() => graph.validate(tasks, task('a', ['missing'])), /不存在/);
assert.deepEqual(graph.validate(tasks, task('c', ['b', 'b'])), ['b']);
assert.equal(graph.analyze([task('a', ['b']), task('b', ['a'])]).unresolved.length, 2);
assert.deepEqual(graph.analyze([task('a', ['missing'])]).missing.get('a'), ['missing']);

for (const area of [{ x: 0, y: 0, width: 1920, height: 1080 }, { x: -1280, y: 0, width: 1280, height: 720 }, { x: 1920, y: 0, width: 1024, height: 600 }]) {
  for (const saved of [null, { x: 10000, y: -999, width: 5000, height: 4000 }, { x: NaN }]) {
    const bounds = restoreBounds(saved, area);
    assert.ok(bounds.x >= area.x && bounds.x + bounds.width <= area.x + area.width);
    assert.ok(bounds.y >= area.y && bounds.y + bounds.height <= area.y + area.height);
  }
}
const mixed = [task('x'), task('y', ['x']), ...Array.from({ length: 5 }, (_, i) => task('isolated' + i))];
const layout = arrange(mixed, graph.analyze(mixed), 900);
assert.ok(layout.width <= 900 && layout.height < 700);
assert.ok(layout.positions.get('y').x > layout.positions.get('x').x);
const rectangles = [...layout.positions.values()];
assert.ok(rectangles.every((a, i) => rectangles.every((b, j) => i === j
  || a.x + layout.nodeWidth <= b.x || b.x + layout.nodeWidth <= a.x
  || a.y + layout.nodeHeight <= b.y || b.y + layout.nodeHeight <= a.y)));

// Heterogeneous content sizes must not overlap, and every wire must meet the actual card midpoint.
const measured = new Map(tasks.map((t, i) => [t.id, { width: 180 + i * 24, height: 90 + (i % 3) * 95 }]));
const adaptive = arrange(tasks, result, 900, measured);
const rects = tasks.map(t => ({ ...adaptive.positions.get(t.id), ...measured.get(t.id) }));
assert.ok(rects.every((a, i) => rects.every((b, j) => i === j || a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)));
adaptive.edgePaths.forEach(edge => {
  const numbers = edge.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const from = adaptive.positions.get(edge.from), to = adaptive.positions.get(edge.to);
  assert.deepEqual(numbers.slice(0, 2), [from.x + measured.get(edge.from).width + 3, from.y + measured.get(edge.from).height / 2]);
  assert.deepEqual(numbers.slice(-2), [to.x - 5, to.y + measured.get(edge.to).height / 2]);
});

(async () => {
  const stored = { schema: 3, settings: { theme: 'graphite', rememberLast: false },
    projects: [{ id: 'p', name: '测试项目' }, { id: 'q', name: '另一项目' }],
    tasks: tasks.map((item) => ({ ...item })), activeProjectId: 'all', activeModule: 'projects', trash: [] };
  delete stored.tasks[0].dependsOn; // Legacy tasks gain empty dependencies without resetting settings.
  const context = { window: { PMTaskGraph: graph, PMReminders: require('../src/renderer/reminder-engine') }, localStorage: {
    getItem: () => JSON.stringify(stored), setItem: () => {},
  }, console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/store.js'), 'utf8'), context);
  const store = context.window.PMStore;
  await store.init();
  assert.equal(store.state.schema, 6);
  assert.equal(store.state.projectGroups.length, 0);
  assert.ok(store.state.projects.every(project => project.groupId === ''));
  assert.equal(store.state.settings.theme, 'graphite');
  assert.equal(store.state.tasks[0].dependsOn.length, 0);
  const before = JSON.stringify(store.state.tasks);
  assert.throws(() => store.updateTask('a', { title: '必须不被修改', dependsOn: ['f'] }), /循环/);
  assert.equal(JSON.stringify(store.state.tasks), before);
  assert.throws(() => store.updateTask('a', { projectId: 'q', dependsOn: [] }), /后续任务/);
  store.removeTask('b');
  assert.deepEqual(graph.analyze(store.tasksIn('p')).missing.get('c'), ['b']);
  store.restoreTrash(String(store.state.trash[0].deletedAt));
  assert.equal(graph.analyze(store.tasksIn('p')).missing.get('c').length, 0);
  assert.equal(graph.analyze(store.tasksIn('p')).edges.length, 6);
  console.log('PASS: branches, merges, cycles, missing tasks, atomic writes, legacy data, restoration, screen bounds');
})().catch((err) => { console.error(err); process.exitCode = 1; });
