(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const desktop = window.PM?.isElectron;
  const Work = window.PMAIWorkflow;
  let metadata = { configured: false, baseURL: '', model: '', hasKey: false }, token = '', hooks;
  let messages = [], controller = null, requestId = '';
  let workForm = null, preparing = false;
  let toolsMenuReturnFocus = null;
  const quickPrompts = [
    { label: '总结此页面', icon: 'summary', prompt: '请总结以下页面内容，并列出重点和下一步建议。', page: true },
    { label: '翻译此页面', icon: 'translate', prompt: '请将以下页面内容翻译成英文，保留原有的结构、任务名称和日期。', page: true },
    { label: '深度剖析', icon: 'risk', prompt: '请深入分析以下页面中的工作，指出风险、优先事项和可行的改进建议。', page: true },
    { label: '创建任务跟踪器', icon: 'plan', mode: 'project-plan' },
  ];
  const promptIcons = {
    summary: '<path d="M4 6h16M4 10h16M4 14h11M4 18h8"/>',
    translate: '<path d="M3 17 7 5l4 12M4.5 13h5M13 8h8m-4-3v3m-3 2c1 5 4 8 7 9m-1-9c-1 4-4 7-7 9"/>',
    idea: '<path d="M9 18h6m-5 3h4M8.1 14.5a6 6 0 1 1 7.8 0c-.9.8-1.9 1.6-1.9 3.5h-4c0-1.9-1-2.7-1.9-3.5Z"/>',
    plan: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16m-11 4 2 2 4-4"/>',
    risk: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
    write: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5M3 8h5M3 12h2"/>',
  };
  const promptIcon = name => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${promptIcons[name]}</svg>`;
  const assistantMark = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11c1-5 6-5 8-1 3-5 8-2 9 1M16 12l-6 13h11M8 15h.1M23 15h.1M10 7l2-1m8 1 2 1"/></svg>';
  const dockIcon = paths => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const providers = [
    { id: 'openai', name: 'OpenAI', icon: 'O', caption: '官方接口', baseURL: 'https://api.openai.com/v1', description: '连接 OpenAI 的对话模型。', hint: '填写支持 Chat Completions 的模型名称，API 地址可自行调整。', docs: 'https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create' },
    { id: 'deepseek', name: 'DeepSeek', icon: 'D', caption: '官方接口', baseURL: 'https://api.deepseek.com', description: '连接 DeepSeek 的对话模型。', hint: '填写 DeepSeek 提供的模型名称与对应 API 密钥。', docs: 'https://api-docs.deepseek.com/' },
    { id: 'bailian', name: '阿里云百炼', icon: 'Q', caption: '通义千问与更多模型', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', description: '通过百炼接入通义千问及平台支持的模型。', hint: '默认使用北京地域；其他地域或业务空间请填写与密钥配套的接口地址。', docs: 'https://help.aliyun.com/zh/model-studio/base-url' },
    { id: 'siliconflow', name: '硅基流动', icon: 'S', caption: '多模型平台', baseURL: 'https://api.siliconflow.cn/v1', description: '连接硅基流动平台中的对话模型。', hint: '请填写模型广场中对应模型的完整名称。', docs: 'https://docs.siliconflow.cn/docs/userguide/capabilities/text-generation' },
    { id: 'ollama', name: 'Ollama', icon: 'L', caption: '本地模型', baseURL: 'http://127.0.0.1:11434/v1', description: '连接本机运行的 Ollama 模型服务。', hint: '先启动本地服务，再填写已安装的模型名称；本地服务通常无需密钥。', docs: 'https://docs.ollama.com/api/openai-compatibility' },
    { id: 'custom', name: '自定义 API', icon: '＋', caption: 'OpenAI 兼容接口', baseURL: '', description: '连接其他兼容 OpenAI 格式的模型服务。', hint: '填写服务提供方的接口地址，兼容 OpenAI Chat Completions 格式。', docs: '' },
  ];
  const providerDrafts = new Map();
  let selectedProvider = 'custom';
  let extensionTab = 'models';
  const normalizeAddress = value => String(value || '').trim().replace(/\/+$/, '');
  function savedProvider() {
    if (providers.some(provider => provider.id === metadata.providerId)) return metadata.providerId;
    try {
      const host = new URL(metadata.baseURL).hostname;
      return providers.find(provider => provider.baseURL && new URL(provider.baseURL).hostname === host)?.id || 'custom';
    } catch { return 'custom'; }
  }
  function providerDraft(id) {
    if (!providerDrafts.has(id)) {
      const provider = providers.find(item => item.id === id);
      const saved = id === savedProvider() && !!metadata.baseURL;
      providerDrafts.set(id, { baseURL: saved ? metadata.baseURL : provider.baseURL, model: saved ? metadata.model : '' });
    }
    return providerDrafts.get(id);
  }
  function configChanged(id, draft, suppliedKey = '') {
    return id !== savedProvider() || normalizeAddress(draft.baseURL) !== metadata.baseURL || draft.model.trim() !== metadata.model || !!suppliedKey;
  }
  function keyPlaceholder(baseURL) {
    return metadata.hasKey && normalizeAddress(baseURL) === metadata.baseURL ? '已设置，留空保留现有密钥' : '填写此接口的 API 密钥';
  }
  function rememberDraft(form) {
    const draft = { baseURL: form.querySelector('#aiBaseURL').value, model: form.querySelector('#aiModel').value };
    providerDrafts.set(form.dataset.provider, draft);
    form.dataset.dirty = String(configChanged(form.dataset.provider, draft, form.querySelector('#aiKey').value));
    form.querySelector('#aiKey').placeholder = keyPlaceholder(draft.baseURL);
  }
  function selectProvider(id) {
    const form = document.getElementById('aiConfig');
    const provider = providers.find(item => item.id === id);
    if (!form || !provider || id === selectedProvider || form.dataset.busy === 'true') return;
    rememberDraft(form);
    selectedProvider = id;
    const draft = providerDraft(id);
    form.dataset.provider = id;
    form.querySelector('#aiBaseURL').value = draft.baseURL;
    form.querySelector('#aiModel').value = draft.model;
    // Unsaved secrets stay out of provider drafts and are never carried to another endpoint.
    form.querySelector('#aiKey').value = '';
    rememberDraft(form);
    document.getElementById('aiProviderName').textContent = provider.name;
    document.getElementById('aiProviderDescription').textContent = provider.description;
    document.getElementById('aiEndpointHint').textContent = provider.hint;
    const docs = document.getElementById('aiProviderDocs');
    docs.hidden = !provider.docs;
    if (provider.docs) docs.href = provider.docs; else docs.removeAttribute('href');
    document.querySelectorAll('[data-ai-provider]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.aiProvider === id)));
    status(form.dataset.dirty === 'false' && metadata.configured ? '已配置 · ' + metadata.model : '填写配置后保存');
  }
  function configBusy(form, busy) {
    form.dataset.busy = String(busy);
    form.closest('.ai-settings-page')?.querySelectorAll('button').forEach(button => { button.disabled = busy; });
  }
  function connectedHTML() {
    if (!metadata.baseURL || !metadata.model) return '<p class="ai-connected-empty">尚未连接模型</p>';
    const provider = providers.find(item => item.id === savedProvider());
    return `<button class="ai-connected-model" type="button" data-ai-connected aria-controls="aiConfig" title="${esc(metadata.model)}"><span class="ai-provider-icon" aria-hidden="true">${provider.icon}</span><span><b>${esc(metadata.model)}</b><small>${provider.name} · ${metadata.configured ? '已配置' : '待连接'}</small></span><span class="ai-connection-dot ${metadata.configured ? 'ready' : ''}" aria-hidden="true"></span></button>`;
  }
  function renderConnected() {
    const node = document.getElementById('aiConnectedModels');
    if (node) {
      node.innerHTML = connectedHTML();
      node.querySelectorAll('button').forEach(button => { button.disabled = document.getElementById('aiConfig')?.dataset.busy === 'true'; });
    }
  }
  function selectExtensionTab(tab) {
    const page = document.querySelector('.ai-settings-page');
    if (!page || !['plugins', 'models'].includes(tab) || page.querySelector('#aiConfig')?.dataset.busy === 'true') return;
    extensionTab = tab;
    page.querySelectorAll('.ai-extension-tabs [data-extension-tab]').forEach(button => {
      const active = button.dataset.extensionTab === tab;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    page.querySelectorAll('[data-extension-panel]').forEach(panel => { panel.hidden = panel.dataset.extensionPanel !== tab; });
    document.getElementById('aiSettingsTitle').textContent = tab === 'models' ? '模型设置' : '插件设置';
  }
  async function request(route, body, signal) {
    if (!token) throw new Error('AI 预览服务未连接，请重新启动网页预览');
    const response = await fetch('/__ai/' + route, { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-MoreReady-Token': token }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'AI 请求失败');
      error.legacyRoute = response.status === 404 && data.error === '接口不存在';
      throw error;
    }
    return data;
  }
  async function refreshInfo() {
    if (desktop) metadata = await window.PM.aiInfo();
    else {
      const response = await fetch('/__ai/session');
      if (!response.ok) throw new Error('AI 预览服务未连接，请重新启动网页预览');
      const data = await response.json(); token = data.token; metadata = data;
    }
    renderConnected();
    return metadata;
  }
  function configHTML() {
    const provider = providers.find(item => item.id === selectedProvider), draft = providerDraft(selectedProvider);
    const dirty = configChanged(selectedProvider, draft);
    return `<div class="ai-settings-page"><div class="ai-settings-layout">
      <aside class="ai-settings-rail" aria-label="扩展导航">
        <div class="ai-extension-tabs" role="tablist" aria-label="扩展类别">${[['plugins', '插件'], ['models', '模型']].map(([id, label]) => `<button id="aiTab-${id}" type="button" role="tab" data-extension-tab="${id}" aria-selected="${extensionTab === id}" aria-controls="aiPanel-${id}" tabindex="${extensionTab === id ? 0 : -1}">${label}</button>`).join('')}</div>
        <div class="ai-model-navigation" data-extension-panel="models" ${extensionTab !== 'models' ? 'hidden' : ''}>
          <section class="ai-connected-section" aria-labelledby="aiConnectedTitle"><h3 id="aiConnectedTitle">已连接</h3><div id="aiConnectedModels">${connectedHTML()}</div></section>
          <nav class="ai-providers" aria-label="模型提供商"><h3>模型列表</h3><div class="ai-provider-list">${providers.map(item => `<button class="ai-provider" type="button" data-ai-provider="${item.id}" aria-pressed="${item.id === selectedProvider}" aria-controls="aiConfig"><span class="ai-provider-icon" aria-hidden="true">${item.icon}</span><span><b>${item.name}</b><small>${item.caption}</small></span><span class="ai-provider-check" aria-hidden="true">✓</span></button>`).join('')}</div></nav>
        </div>
        <nav class="ai-plugin-navigation" data-extension-panel="plugins" aria-label="插件列表" ${extensionTab !== 'plugins' ? 'hidden' : ''}><h3>插件列表</h3><button class="ai-provider" type="button" aria-pressed="true" aria-controls="aiPanel-plugins"><span class="ai-provider-icon" aria-hidden="true">✦</span><span><b>Miss.MR</b><small>内置助手</small></span><span class="ai-provider-check" aria-hidden="true">✓</span></button></nav>
      </aside>
      <section class="ai-config-card" aria-labelledby="aiSettingsTitle">
        <header class="ai-config-title"><h2 id="aiSettingsTitle">${extensionTab === 'models' ? '模型设置' : '插件设置'}</h2></header>
        <div class="ai-config-main" id="aiPanel-models" role="tabpanel" aria-labelledby="aiTab-models" data-extension-panel="models" ${extensionTab !== 'models' ? 'hidden' : ''}>
          <div class="ai-provider-heading"><h3 id="aiProviderName">${provider.name}</h3><p id="aiProviderDescription">${provider.description}</p></div>
          <form id="aiConfig" data-provider="${provider.id}" data-dirty="${dirty}" data-busy="false">
            <div class="field"><label for="aiBaseURL">API 地址</label><input class="input" id="aiBaseURL" type="url" placeholder="https://你的服务地址/v1" value="${esc(draft.baseURL)}" required /><p id="aiEndpointHint" class="ai-field-hint">${provider.hint}</p><a id="aiProviderDocs" class="ai-doc-link" ${provider.docs ? `href="${provider.docs}"` : 'hidden'} target="_blank" rel="noopener noreferrer">查看接口文档 ↗</a></div>
            <div class="field"><label for="aiModel">模型名称</label><input class="input" id="aiModel" placeholder="填写服务提供方给出的模型名称" value="${esc(draft.model)}" maxlength="200" required /></div>
            <div class="field"><label for="aiKey">API 密钥</label><input class="input" id="aiKey" type="password" autocomplete="off" placeholder="${keyPlaceholder(draft.baseURL)}" /><p class="ai-field-hint">${desktop ? '密钥使用系统加密保存；若系统加密不可用，仅保留至本次应用关闭。' : '密钥仅保留在本次本地预览服务中，重启预览后需重新填写。'}项目备份不包含密钥。</p></div>
            <div class="ai-config-actions"><button class="btn primary" type="submit">保存配置</button><button class="btn" type="button" data-ai="test">测试连接</button><button class="btn" type="button" data-ai="clear-config">移除配置</button></div>
            <p id="aiConfigStatus" class="ai-config-status" role="status">${!dirty && metadata.configured ? '已配置 · ' + esc(metadata.model) : '填写配置后保存'}</p>
          </form>
          <div class="ai-usage-note"><b>在任何页面打开 Miss.MR</b><p>点击右下角 ✦ 按钮展开或收起对话。可以直接提问，或选择工作方式生成项目方案。</p><button class="btn" data-ai="open">打开 Miss.MR</button></div>
        </div>
        <div class="ai-plugin-main" id="aiPanel-plugins" role="tabpanel" aria-labelledby="aiTab-plugins" data-extension-panel="plugins" ${extensionTab !== 'plugins' ? 'hidden' : ''}>
          <div class="ai-plugin-heading"><span class="ai-symbol" aria-hidden="true">✦</span><div><h3>Miss.MR</h3><span class="ai-plugin-badge">内置助手</span></div></div>
          <p>接入你的模型，协助拆解任务、梳理依赖与分析项目风险。</p>
          <div class="ai-plugin-actions"><button class="btn primary" data-ai="open">打开 Miss.MR</button><button class="btn" type="button" data-extension-tab="models">配置模型</button></div>
        </div>
      </section>
    </div></div>`;
  }
  function status(text, bad = false) {
    const node = document.getElementById('aiConfigStatus');
    if (node) { node.textContent = text; node.classList.toggle('error', bad); }
  }
  function renderMessages() {
    const box = document.getElementById('aiMessages');
    box.replaceChildren();
    if (!messages.length && !workForm) {
      const intro = document.createElement('div'); intro.className = 'ai-empty';
      intro.innerHTML = `<span class="ai-welcome-avatar" aria-hidden="true">${assistantMark}</span><h3>今日事，我来帮。</h3><div class="ai-suggestions" aria-label="提问灵感">${quickPrompts.map((item, index) => `<button type="button" class="ai-suggestion" data-ai-prompt="${index}">${promptIcon(item.icon)}<span>${item.label}</span></button>`).join('')}</div>${!metadata.configured ? '<button class="ai-connect-link" data-ai="settings">连接模型</button>' : ''}`;
      box.append(intro);
    }
    messages.forEach(message => {
      const node = document.createElement('article'); node.className = 'ai-message ' + message.role;
      const author = document.createElement('b'); author.textContent = message.role === 'user' ? '你' : 'Miss.MR';
      const content = document.createElement('p'); content.textContent = message.display || message.content;
      node.append(author, content); box.append(node);
      if (message.work) node.insertAdjacentHTML('beforeend', planHTML(message.work));
    });
    if (workForm) box.insertAdjacentHTML('beforeend', workFormHTML());
    if (controller) { const waiting = document.createElement('p'); waiting.className = 'ai-waiting'; waiting.textContent = '正在思考…'; box.append(waiting); }
    box.scrollTop = box.scrollHeight;
    document.getElementById('aiDock').dataset.pendingPlan = String(messages.some(message => message.work?.status === 'ready' && Work.items(message.work.plan).length));
  }
  function workFormHTML() {
    const selection = hooks.selection(), projects = selection.projects;
    const tasks = selection.tasks.filter(task => task.projectId === workForm.projectId && task.status !== 'done');
    return `<form id="aiWorkForm" class="ai-work-form"><header><b>${Work.modes[workForm.mode].label}</b><button type="button" class="icon-btn" data-ai="cancel-work" aria-label="取消方案生成">×</button></header><p>${Work.modes[workForm.mode].hint}</p>
      <label for="aiWorkProject">使用的项目</label><select class="select" id="aiWorkProject" ${controller ? 'disabled' : ''}>${projects.map(project => `<option value="${esc(project.id)}" ${project.id === workForm.projectId ? 'selected' : ''}>${esc(project.name)}</option>`).join('')}</select>
      ${workForm.mode === 'task-breakdown' ? `<label for="aiWorkTask">要拆解的任务</label><select class="select" id="aiWorkTask" ${controller ? 'disabled' : ''}><option value="">请选择任务</option>${tasks.map(task => `<option value="${esc(task.id)}" ${task.id === workForm.taskId ? 'selected' : ''}>${esc(task.title)}</option>`).join('')}</select>` : ''}
      <label for="aiWorkGoal">补充目标 <span>选填</span></label><textarea class="textarea" id="aiWorkGoal" maxlength="3000" placeholder="希望达成什么、有哪些限制？" ${controller ? 'disabled' : ''}>${esc(workForm.goal)}</textarea>
      <p class="ai-work-note">生成时会发送此项目的任务、备注及依赖；正在编辑的目标任务会使用当前草稿。</p><button class="btn primary" type="submit" ${controller ? 'disabled' : ''}>${controller ? '正在生成…' : '生成方案'}</button></form>`;
  }
  function planHTML(work) {
    const { plan, capture, request, id } = work, names = new Map(request.context.tasks.map(task => [task.id, task.title]));
    plan.tasks.forEach(task => names.set(task.key, task.title));
    const items = Work.items(plan), editable = work.status === 'ready' && !controller && !preparing;
    const stateLabels = { ready: '先勾选，再应用', applied: '已应用到工作区', draft: '已加入编辑草稿，请保存任务', committed: '子任务已随任务保存', 'draft-cancelled': '编辑已取消，AI 子任务未保存', undone: '已撤销', discarded: '方案已放弃' };
    return `<section class="ai-plan" data-ai-plan="${id}" aria-label="AI 工作方案"><p class="ai-plan-source">${esc(capture.label)}${capture.draftSignature ? ' · 使用编辑草稿' : ''}</p>
      ${plan.advice.map(advice => `<div class="ai-advice ${advice.severity}"><strong>${esc(advice.title)}</strong><p>${esc(advice.detail)}</p></div>`).join('')}
      ${items.length ? `<p class="ai-plan-label">${Work.modes[request.mode].action} · ${items.length} 项</p><div class="ai-plan-items">${items.map(item => `<label class="ai-plan-item"><input type="checkbox" data-ai-choice="${id}" value="${item.id}" ${work.selected.includes(item.id) ? 'checked' : ''} ${editable ? '' : 'disabled'} /><span><strong>${esc(item.kind === 'link' ? `${names.get(item.from)} → ${names.get(item.to)}` : item.title)}</strong>
        ${item.kind === 'task' ? `<small>${esc(window.PMConst.PRIORITY[item.priority].label)}${item.due ? ' · ' + esc(item.due) : ' · 不设截止日期'}</small>${item.notes ? `<p>${esc(item.notes)}</p>` : ''}${item.dependsOn.length ? `<small>前置：${esc(item.dependsOn.map(key => names.get(key)).join('、'))}</small>` : ''}` : item.kind === 'link' ? `<p>${esc(item.reason)}</p>` : ''}</span></label>`).join('')}</div>
      <p class="ai-plan-state" role="status">${stateLabels[work.status]}</p><div class="ai-plan-actions">${editable ? `<button class="btn primary tiny" data-ai-apply="${id}">应用所选 (${work.selected.length})</button><button class="btn tiny" data-ai-discard="${id}">放弃方案</button>` : work.receipt && !['undone', 'discarded'].includes(work.status) ? `<button class="btn tiny" data-ai-undo="${id}">撤销此次应用</button>` : ''}</div>` : '<p class="ai-plan-state">仅提供建议，工作区数据保持不变。</p>'}
      ${work.error ? `<p class="ai-error" role="alert">${esc(work.error)}</p>` : ''}</section>`;
  }
  function startWork(mode = 'review', options = {}) {
    if (!Object.prototype.hasOwnProperty.call(Work.modes, mode) || controller || preparing) return;
    const selection = hooks.selection();
    const projectId = options.projectId || selection.projectId || selection.projects[0]?.id || '';
    const taskId = options.taskId || selection.taskId || '';
    if (!projectId) { toggle(true); document.getElementById('aiStatus').textContent = '请先创建一个项目。'; return; }
    workForm = { mode, projectId, taskId: selection.tasks.some(task => task.id === taskId && task.projectId === projectId && task.status !== 'done') ? taskId : '', goal: '' };
    toggle(true); renderMessages(); document.getElementById('aiWorkGoal')?.focus(); document.getElementById('aiStatus').textContent = '';
  }
  async function generateWork() {
    if (controller || preparing || !workForm) return;
    const form = { ...workForm };
    preparing = true; setBusy(true);
    let capture, payload;
    try {
      await refreshInfo();
      if (!metadata.configured) throw new Error('请先在扩展页保存 AI 配置。');
      capture = hooks.captureWork(form.projectId, form.mode === 'task-breakdown' ? form.taskId : '');
      payload = Work.normalizeRequest({ mode: form.mode, goal: form.goal, context: capture.context });
    } catch (error) { preparing = false; setBusy(false); document.getElementById('aiStatus').textContent = errorText(error); return; }
    preparing = false;
    controller = new AbortController(); requestId = window.PMConst.UID(); setBusy(true); renderMessages(); document.getElementById('aiStatus').textContent = '';
    try {
      let response;
      if (desktop) response = await window.PM.aiWorkflow({ id: requestId, ...payload });
      else {
        try { response = await request('workflow', payload, controller.signal); }
        catch (error) {
          if (!error.legacyRoute) throw error;
          // A running preview may still hold the user's key in its older chat service.
          // Reuse that service until the next restart instead of discarding its credentials.
          const prompts = Work.prompt(payload);
          const reply = await request('chat', { messages: [{ role: 'user', content: prompts.system + '\n\n参考输入 JSON：\n' + prompts.user }] }, controller.signal);
          response = { plan: Work.validatePlan(Work.parse(reply.content), payload) };
        }
      }
      if (controller.signal.aborted) throw new Error('请求已停止');
      const plan = Work.validatePlan(response.plan, payload);
      const work = { id: window.PMConst.UID(), plan, request: payload, capture, selected: Work.items(plan).map(item => item.id), status: 'ready', error: '' };
      messages.push({ role: 'user', workflow: true, content: `${Work.modes[form.mode].label} · ${capture.label}${form.goal ? '\n' + form.goal : ''}` });
      messages.push({ role: 'assistant', content: plan.summary, work }); workForm = null;
    } catch (error) { document.getElementById('aiStatus').textContent = controller.signal.aborted ? '生成已停止，目标已保留。' : errorText(error); }
    finally { controller = null; setBusy(false); renderMessages(); }
  }
  function applyWork(id, undo = false) {
    const work = messages.find(message => message.work?.id === id)?.work;
    if (!work || controller || preparing) return;
    try {
      if (undo) {
        if (!work.receipt || ['undone', 'discarded'].includes(work.status)) return;
        hooks.undoWork(work.receipt); work.status = 'undone'; work.receipt = null;
      } else {
        if (work.status !== 'ready') return;
        work.receipt = hooks.applyWork(work.capture, work.request, work.plan, work.selected);
        work.status = work.receipt.kind === 'draft' ? 'draft' : 'applied';
      }
      work.error = '';
    } catch (error) { work.error = errorText(error); }
    renderMessages();
  }
  function editorClosed(taskId, saved = false) {
    let changed = false;
    messages.forEach(message => {
      const work = message.work;
      if (work?.status === 'draft' && work.receipt?.taskId === taskId) {
        work.status = saved ? 'committed' : 'draft-cancelled'; work.receipt = null; work.error = ''; changed = true;
      }
    });
    if (changed) renderMessages();
  }
  function toggle(open) {
    const dock = document.getElementById('aiDock'), fab = document.getElementById('aiFab');
    dock.hidden = open === undefined ? !dock.hidden : !open;
    fab.setAttribute('aria-expanded', String(!dock.hidden)); fab.setAttribute('aria-label', dock.hidden ? '打开 Miss.MR' : '收起 Miss.MR');
    if (!dock.hidden) { updateComposer(); document.getElementById('aiPrompt').focus(); } else { setToolsMenu(false); fab.focus(); }
    if (!dock.hidden) refreshInfo().then(() => { if (!messages.length && !workForm && !controller) renderMessages(); }).catch(() => {});
  }
  function setBusy(busy) {
    if (busy) setToolsMenu(false);
    document.getElementById('aiDock').dataset.busy = String(busy);
    updateComposer();
    document.getElementById('aiStop').hidden = !busy;
    document.querySelectorAll('[data-ai="new-chat"], [data-ai="menu"], [data-ai-prompt], [data-ai-work], [data-ai-apply], [data-ai-undo], [data-ai-discard]').forEach(button => { button.disabled = busy; });
    document.querySelectorAll('#aiWorkForm input, #aiWorkForm textarea, #aiWorkForm select, #aiWorkForm button, [data-ai-choice]').forEach(node => { node.disabled = busy; });
  }
  function errorText(error) { return String(error.message || '请求失败').replace(/^Error invoking remote method '[^']+': Error: /, ''); }
  function updateComposer() {
    const input = document.getElementById('aiPrompt');
    input.style.height = 'auto'; input.style.height = Math.min(144, Math.max(64, input.scrollHeight)) + 'px';
    document.getElementById('aiSend').disabled = document.getElementById('aiDock').dataset.busy === 'true' || !input.value.trim();
  }
  function setToolsMenu(open, trigger) {
    const menu = document.getElementById('aiToolsMenu');
    if (!menu || (open && (controller || preparing))) return;
    menu.hidden = !open;
    document.querySelectorAll('#aiDock [data-ai="menu"]').forEach(button => { button.setAttribute('aria-expanded', String(open)); });
    if (open) {
      toolsMenuReturnFocus = trigger;
      menu.dataset.placement = trigger?.closest('.ai-composer') ? 'composer' : 'header';
      menu.querySelector('button').focus();
    }
  }
  async function send() {
    if (controller || preparing) return;
    const input = document.getElementById('aiPrompt'), text = input.value.trim();
    if (!text) return;
    preparing = true; setBusy(true);
    try { await refreshInfo(); }
    catch (error) { preparing = false; setBusy(false); document.getElementById('aiStatus').textContent = errorText(error); return; }
    preparing = false;
    if (!metadata.configured) { setBusy(false); document.getElementById('aiStatus').textContent = '请先在扩展页配置 AI 服务'; return; }
    const user = { role: 'user', content: text };
    const history = [...messages.filter(message => !message.work && !message.workflow), user].slice(-30).map(({ role, content }) => ({ role, content }));
    messages.push(user); input.value = '';
    controller = new AbortController(); requestId = window.PMConst.UID(); setBusy(true); renderMessages();
    document.getElementById('aiStatus').textContent = '';
    try {
      const response = desktop ? await window.PM.aiChat({ id: requestId, messages: history }) : await request('chat', { messages: history }, controller.signal);
      messages.push({ role: 'assistant', content: response.content });
    } catch (error) {
      messages.pop(); if (!input.value.trim()) input.value = text;
      document.getElementById('aiStatus').textContent = controller.signal.aborted ? '请求已停止，可以重新发送。' : errorText(error);
    } finally { controller = null; setBusy(false); renderMessages(); }
  }
  async function saveConfig(form) {
    if (form.dataset.busy === 'true') return;
    const data = { providerId: form.dataset.provider, baseURL: form.querySelector('#aiBaseURL').value.trim(), model: form.querySelector('#aiModel').value.trim(), apiKey: form.querySelector('#aiKey').value.trim() };
    configBusy(form, true);
    try {
      metadata = desktop ? await window.PM.aiSave(data) : await request('config', data);
      form.querySelector('#aiKey').value = '';
      form.querySelector('#aiBaseURL').value = metadata.baseURL;
      form.querySelector('#aiModel').value = metadata.model;
      rememberDraft(form);
      status('已保存 · ' + metadata.model); renderConnected(); renderMessages();
    } catch (error) { status(errorText(error), true); }
    finally { configBusy(form, false); }
  }
  async function init(options) {
    hooks = options;
    try {
      await refreshInfo();
    } catch {}
    selectedProvider = savedProvider();
    const host = document.createElement('div'); host.id = 'aiUI';
    host.innerHTML = `<button id="aiFab" class="ai-fab" data-ai="toggle" aria-label="打开 Miss.MR" aria-controls="aiDock" aria-expanded="false" title="Miss.MR">${assistantMark}</button>
      <aside class="ai-dock" id="aiDock" aria-label="Miss.MR" data-busy="false" hidden>
        <header class="ai-dock-head"><div><button class="ai-conversation-title" data-ai="menu" aria-haspopup="menu" aria-expanded="false" aria-controls="aiToolsMenu"><span class="ai-title-avatar">${assistantMark}</span><b>Miss.MR</b>${dockIcon('<path d="m8 10 4 4 4-4"/>')}</button></div><button class="icon-btn" data-ai="new-chat" title="新建对话" aria-label="新建对话">${dockIcon('<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a8 8 0 0 1 8-8h3M18 3v8m-4-4h8"/>')}</button><button class="icon-btn" data-ai="expand" title="放大助手" aria-label="放大助手" aria-pressed="false">${dockIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M16 5v14"/>')}</button><button class="icon-btn" data-ai="menu" title="更多操作" aria-label="更多操作" aria-haspopup="menu" aria-expanded="false" aria-controls="aiToolsMenu">${dockIcon('<circle cx="5" cy="12" r=".7"/><circle cx="12" cy="12" r=".7"/><circle cx="19" cy="12" r=".7"/>')}</button><button class="icon-btn" data-ai="close" title="收起" aria-label="收起 Miss.MR">${dockIcon('<path d="M5 12h14"/>')}</button></header>
        <div class="ai-tools-menu" id="aiToolsMenu" role="menu" aria-label="助手操作" hidden>${Object.entries(Work.modes).map(([mode, item]) => `<button type="button" role="menuitem" data-ai-work="${mode}">${dockIcon('<path d="M4 6h16M4 12h12M4 18h8"/>')}<span>${item.label}</span></button>`).join('')}<div class="ai-menu-divider"></div><button type="button" role="menuitem" data-ai="settings">${dockIcon('<path d="M4 7h16M7 4v6M4 17h16m-6-3v6"/>')}<span>模型配置</span></button></div>
        <div class="ai-messages" id="aiMessages" aria-live="polite"></div>
        <footer class="ai-composer"><div class="ai-input-card"><textarea class="textarea" id="aiPrompt" aria-label="发送给 Miss.MR 的消息" placeholder="询问 Miss.MR" maxlength="12000"></textarea><div class="ai-composer-actions"><button class="ai-composer-tool" type="button" data-ai="menu" aria-label="选择助手工具" aria-haspopup="menu" aria-expanded="false" aria-controls="aiToolsMenu">${dockIcon('<path d="M12 5v14M5 12h14"/>')}</button><span class="ai-composer-spacer"></span><button class="btn tiny" id="aiStop" data-ai="stop" hidden>停止</button><button class="ai-mode-button" type="button" data-ai="menu" aria-haspopup="menu" aria-expanded="false" aria-controls="aiToolsMenu">自动</button><button class="btn primary tiny ai-send" id="aiSend" data-ai="send" aria-label="发送消息" title="发送消息" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></div></div><p id="aiStatus" class="ai-error" role="status"></p></footer>
      </aside>`;
    document.body.append(host); renderMessages();
    document.addEventListener('input', event => { const form = event.target.closest('#aiConfig'); if (form) rememberDraft(form); if (event.target.id === 'aiWorkGoal' && workForm) workForm.goal = event.target.value; if (event.target.id === 'aiPrompt') updateComposer(); });
    document.addEventListener('change', event => {
      if (event.target.id === 'aiWorkProject' && workForm) { workForm.projectId = event.target.value; workForm.taskId = ''; renderMessages(); }
      if (event.target.id === 'aiWorkTask' && workForm) workForm.taskId = event.target.value;
      if (event.target.matches('[data-ai-choice]')) {
        const work = messages.find(message => message.work?.id === event.target.dataset.aiChoice)?.work;
        if (!work || work.status !== 'ready') return;
        work.selected = [...document.querySelectorAll(`[data-ai-choice="${work.id}"]:checked`)].map(input => input.value);
        document.querySelector(`[data-ai-apply="${work.id}"]`).textContent = `应用所选 (${work.selected.length})`;
      }
    });
    document.addEventListener('submit', event => { if (event.target.id === 'aiConfig') { event.preventDefault(); saveConfig(event.target); } if (event.target.id === 'aiWorkForm') { event.preventDefault(); generateWork(); } });
    document.addEventListener('keydown', event => {
      const tab = event.target.closest('[role="tab"][data-extension-tab]');
      if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || tab.disabled) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === 'Home' ? 'plugins' : event.key === 'End' ? 'models' : tab.dataset.extensionTab === 'models' ? 'plugins' : 'models';
      selectExtensionTab(next); document.getElementById('aiTab-' + next).focus();
    });
    document.getElementById('aiPrompt').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); event.stopPropagation(); send(); }
    });
    host.addEventListener('keydown', event => {
      const menu = document.getElementById('aiToolsMenu');
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!menu.hidden) { setToolsMenu(false); toolsMenuReturnFocus?.focus(); } else toggle(false);
      }
      if (event.target.closest('#aiToolsMenu') && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const buttons = [...menu.querySelectorAll('button')], index = buttons.indexOf(event.target.closest('button'));
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    });
    document.addEventListener('click', async event => {
      if (!event.target.closest('#aiToolsMenu, [data-ai="menu"]')) setToolsMenu(false);
      const suggestion = event.target.closest('[data-ai-prompt]');
      if (suggestion && !controller && !preparing) {
        const item = quickPrompts[Number(suggestion.dataset.aiPrompt)], input = document.getElementById('aiPrompt');
        if (!item) return;
        if (!input.value.trim()) {
          if (item.mode) { startWork(item.mode); return; }
          const page = item.page ? hooks.pageContext?.() : null;
          input.value = item.prompt + (page?.content ? '\n\n当前页面：' + page.label + '\n' + page.content : '\n');
        }
        updateComposer(); input.focus(); input.setSelectionRange(input.value.length, input.value.length); return;
      }
      const workButton = event.target.closest('[data-ai-work]');
      if (workButton) { setToolsMenu(false); startWork(workButton.dataset.aiWork, { projectId: workButton.dataset.projectId, taskId: workButton.dataset.taskId }); return; }
      const apply = event.target.closest('[data-ai-apply]'), undo = event.target.closest('[data-ai-undo]'), discard = event.target.closest('[data-ai-discard]');
      if (apply || undo) { applyWork((apply || undo).dataset[apply ? 'aiApply' : 'aiUndo'], !!undo); return; }
      if (discard && !controller && !preparing) { const work = messages.find(message => message.work?.id === discard.dataset.aiDiscard)?.work; if (work?.status === 'ready') { work.status = 'discarded'; work.error = ''; renderMessages(); } return; }
      const extensionButton = event.target.closest('[data-extension-tab]');
      if (extensionButton) { selectExtensionTab(extensionButton.dataset.extensionTab); return; }
      if (event.target.closest('[data-ai-connected]')) { selectProvider(savedProvider()); return; }
      const providerButton = event.target.closest('[data-ai-provider]');
      if (providerButton) { selectProvider(providerButton.dataset.aiProvider); return; }
      const action = event.target.closest('[data-ai]')?.dataset.ai;
      if (!action) return;
      if (action === 'toggle') toggle();
      if (action === 'open') toggle(true);
      if (action === 'close') toggle(false);
      if (action === 'menu') setToolsMenu(document.getElementById('aiToolsMenu').hidden, event.target.closest('button'));
      if (action === 'expand') {
        const dock = document.getElementById('aiDock'), expanded = dock.classList.toggle('expanded'), button = event.target.closest('button');
        button.setAttribute('aria-pressed', String(expanded)); button.setAttribute('aria-label', expanded ? '还原助手大小' : '放大助手'); button.title = expanded ? '还原助手大小' : '放大助手';
      }
      if (action === 'settings') { setToolsMenu(false); if (hooks.openSettings() !== false) { selectExtensionTab('models'); toggle(false); } }
      if (action === 'send') send();
      if (action === 'stop' && controller) { controller.abort(); if (desktop) window.PM.aiCancel(requestId); }
      if (action === 'cancel-work' && !controller && !preparing) { workForm = null; renderMessages(); }
      if (action === 'new-chat' && !controller && !preparing) { messages = []; workForm = null; document.getElementById('aiPrompt').value = ''; updateComposer(); renderMessages(); document.getElementById('aiStatus').textContent = ''; }
      if (action === 'clear-config') {
        const form = document.getElementById('aiConfig');
        if (!form || form.dataset.busy === 'true') return;
        configBusy(form, true);
        try {
          metadata = desktop ? await window.PM.aiClear() : await request('clear', {});
          providerDrafts.clear(); selectedProvider = 'custom';
          const page = document.querySelector('.ai-settings-page');
          if (page) page.outerHTML = configHTML();
          status('配置已移除'); renderMessages();
        } catch (error) { status(errorText(error), true); }
        finally { configBusy(form, false); }
      }
      if (action === 'test') {
        const form = document.getElementById('aiConfig');
        if (!form || form.dataset.busy === 'true') return;
        if (!metadata.configured) { status('请先保存配置', true); return; }
        if (form.dataset.dirty === 'true') { status('请先保存修改后的配置', true); return; }
        configBusy(form, true); status('正在测试连接…');
        try {
          const payload = [{ role: 'user', content: '请仅回复：连接成功' }];
          if (desktop) await window.PM.aiChat({ id: 'test-' + window.PMConst.UID(), messages: payload }); else await request('chat', { messages: payload });
          status('连接成功 · ' + metadata.model);
        } catch (error) { status(errorText(error), true); }
        finally { configBusy(form, false); }
      }
    });
  }
  window.PMAI = { init, configHTML, toggle, startWork, refreshInfo, editorClosed };
})();
