'use strict';
// Exercise the saved service using invented project data, never user projects or secrets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../src/renderer/ai-workflow');
(async () => {
  const base = 'http://127.0.0.1:5173';
  const session = await (await fetch(base + '/__ai/session')).json();
  assert.ok(session.configured, 'Save AI configuration in the extension page first');
  async function post(route, body) {
    const response = await fetch(base + '/__ai/' + route, { method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', 'X-MoreReady-Token': session.token }, body: JSON.stringify(body) });
    const value = await response.json(); return { status: response.status, value };
  }
  const context = W.contextFrom({ projects: [{ id: 'demo', name: '独立连接验证示例', desc: '演示：给一个简单页面安排两项验收任务。' }], tasks: [
    { id: 'demo-ready', projectId: 'demo', title: '确认页面内容', status: 'todo', priority: 'p2', due: '', notes: '', dependsOn: [], subtasks: [] },
  ] }, 'demo', '', '2026-10-06');
  const payload = { mode: 'project-plan', goal: '仅建议两个新任务：检查页面展示，然后进行最终验收。后者依赖前者。不要设截止日期。', context };
  let result = await post('workflow', payload), transport = 'workflow';
  if (result.status === 404 && result.value.error === '接口不存在') {
    const prompts = W.prompt(payload); transport = 'existing-chat';
    result = await post('chat', { messages: [{ role: 'user', content: prompts.system + '\n\n参考输入 JSON：\n' + prompts.user }] });
    if (result.status === 200) result.value = { plan: W.validatePlan(W.parse(result.value.content), payload) };
  }
  if (result.status !== 200) throw new Error(result.value.error || 'AI request failed');
  const plan = W.validatePlan(result.value.plan, payload);
  assert.equal(plan.tasks.length, 2);
  let index = 0;
  const testStore = { projects: [context.project], tasks: context.tasks };
  const prepared = W.prepare(testStore, payload, plan, W.items(plan).map(item => item.id), { uid: () => 'example-' + ++index });
  assert.equal(prepared.tasks.length, 3);
  assert.ok(prepared.tasks.some(task => task.dependsOn.some(id => id.startsWith('example-'))));
  const evidence = { checkedAt: new Date().toISOString(), provider: session.providerId, model: session.model, transport,
    pass: true, generatedTasks: plan.tasks.length, sameProjectDependenciesValidated: true, workspaceDataWritten: false, plan };
  fs.writeFileSync(path.resolve('shots/live-ai-verification.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ pass: true, provider: session.providerId, model: session.model, generatedTasks: plan.tasks.length,
    validatedDependencies: true, workspaceDataWritten: false, evidence: 'shots/live-ai-verification.json' }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
