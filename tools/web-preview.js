#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createAIService } = require('../src/ai-service');

const RENDERER = path.resolve(__dirname, '../src/renderer');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
};

// CSS swaps preserve open forms. Other source changes wait for editors to close.
const CLIENT = `(() => {
  const stream = new EventSource('/__preview/events');
  let pending = false;
  const editing = () => !!document.querySelector('#p-name') ||
    !!document.querySelector('#accentPickerContainer:not([hidden])') ||
    !!document.querySelector('#aiConfig[data-dirty="true"], #aiConfig[data-busy="true"], #aiDock[data-busy="true"], #aiWorkForm, #aiDock[data-pending-plan="true"], #shortcutRecorder') ||
    !!document.querySelector('#aiPrompt')?.value.trim() ||
    !!document.querySelector('#taskDrawerMask:not([hidden])') ||
    !!document.querySelector('#sheetMask:not([hidden])');
  const reload = () => {
    if (!pending || editing()) return;
    pending = false;
    window.PMStore?.save();
    location.reload();
  };
  new MutationObserver(reload).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  stream.onmessage = event => {
    const change = JSON.parse(event.data);
    if (change.files.every(file => file.endsWith('.css'))) {
      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const url = new URL(link.href);
        if (!change.files.includes(url.pathname.slice(1))) return;
        url.searchParams.set('preview', String(change.revision));
        const replacement = link.cloneNode();
        replacement.href = url.href;
        replacement.onload = () => link.remove();
        replacement.onerror = () => replacement.remove();
        link.after(replacement);
      });
    } else {
      pending = true;
      if (editing() && !document.getElementById('previewUpdateNotice')) {
        const notice = document.createElement('div');
        notice.id = 'previewUpdateNotice'; notice.className = 'toast'; notice.setAttribute('role', 'status');
        notice.textContent = '预览已更新，将在保存或取消编辑后刷新。';
        document.getElementById('toastWrap').append(notice);
      }
      reload();
    }
  };
  window.addEventListener('pagehide', () => stream.close());
})();`;

function createPreviewServer(root = RENDERER, options = {}) {
  root = fs.realpathSync(root);
  const ai = options.aiService || createAIService({ configFile: options.aiConfigFile });
  const aiToken = crypto.randomUUID();
  let aiBusy = false;
  const clients = new Set();
  const changed = new Set();
  let debounce;
  let revision = Date.now();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let pathname;
    try { pathname = decodeURIComponent(req.url.split('?')[0]); }
    catch { res.writeHead(400); res.end('Invalid URL'); return; }
    if (pathname.startsWith('/__ai/')) {
      const host = req.headers.host || '';
      const expectedPort = server.address()?.port;
      const origin = `http://${host}`;
      const json = (status, value) => { res.writeHead(status, { 'Content-Type': MIME['.json'] }); res.end(JSON.stringify(value)); };
      if (![`127.0.0.1:${expectedPort}`, `localhost:${expectedPort}`].includes(host) || (req.headers.origin && req.headers.origin !== origin)) { json(403, { error: '仅允许当前应用访问 AI 配置' }); return; }
      if (pathname === '/__ai/session' && req.method === 'GET') { json(200, { ...ai.info(), token: aiToken }); return; }
      if (req.method !== 'POST') { json(405, { error: '请求方式不支持' }); return; }
      if (req.headers['x-moreready-token'] !== aiToken) { json(403, { error: '请求验证失败，请刷新页面' }); return; }
      if (!String(req.headers['content-type']).startsWith('application/json')) { json(400, { error: '请使用 JSON 请求' }); return; }
      try {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 512000) { json(413, { error: '请求内容过长' }); return; } chunks.push(chunk); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!data || typeof data !== 'object') throw new Error('请求格式不正确');
        if (pathname === '/__ai/config') { json(200, ai.save(data)); return; }
        if (pathname === '/__ai/clear') { json(200, ai.clear()); return; }
        if (pathname === '/__ai/chat' || pathname === '/__ai/workflow') {
          if (aiBusy) { json(429, { error: '请等待当前请求完成' }); return; }
          aiBusy = true;
          const controller = new AbortController();
          res.on('close', () => { if (!res.writableFinished) controller.abort(); });
          try { json(200, pathname === '/__ai/chat' ? await ai.chat(data.messages, { signal: controller.signal }) : await ai.workflow(data, { signal: controller.signal })); }
          finally { aiBusy = false; }
          return;
        }
        json(404, { error: '接口不存在' });
      } catch (error) { if (!res.writableEnded && !res.destroyed) json(400, { error: error instanceof SyntaxError ? '请求格式不正确' : error.message }); }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (pathname === '/__preview/health') {
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      res.end(JSON.stringify({ app: 'MoreReady', mode: 'web-preview' })); return;
    }
    if (pathname === '/__preview/events') {
      if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      res.write(': connected\n\n'); clients.add(res);
      req.on('close', () => clients.delete(res)); return;
    }
    if (pathname === '/__preview/client.js') {
      res.writeHead(200, { 'Content-Type': MIME['.js'] }); res.end(CLIENT); return;
    }
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const withinRoot = candidate => {
      const relative = path.relative(root, candidate);
      return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
    };
    if (pathname.includes('\0') || !withinRoot(file)) { res.writeHead(404); res.end('Not found'); return; }
    try {
      // Also disallow symlinks pointing outside the renderer directory.
      const real = await fs.promises.realpath(file);
      if (!withinRoot(real) || !(await fs.promises.stat(real)).isFile()) throw new Error('Not a public file');
      let content = await fs.promises.readFile(real);
      if (path.basename(file) === 'index.html') {
        content = Buffer.from(content.toString('utf8').replace('</body>', '<script src="/__preview/client.js"></script></body>'));
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  const watcher = fs.watch(root, { recursive: true }, (event, filename) => {
    if (!filename) return;
    // Windows also reports directory metadata changes while serving assets.
    // Only actual files should trigger a preview refresh.
    try { if (fs.statSync(path.join(root, String(filename))).isDirectory()) return; } catch {}
    changed.add(String(filename).split(path.sep).join('/'));
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const data = JSON.stringify({ revision: ++revision, files: [...changed] });
      changed.clear(); clients.forEach(client => client.write('data: ' + data + '\n\n'));
    }, 180);
  });
  const heartbeat = setInterval(() => clients.forEach(client => client.write(': alive\n\n')), 15000);
  server.on('close', () => { watcher.close(); clearTimeout(debounce); clearInterval(heartbeat); });
  server.stop = () => {
    clients.forEach(client => client.end()); clients.clear();
    return new Promise(resolve => server.close(resolve));
  };
  return server;
}

if (require.main === module) {
  const flag = process.argv.indexOf('--port');
  const port = Number(flag === -1 ? (process.env.MOREREADY_WEB_PORT || 5173) : process.argv[flag + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('请输入 1–65535 的端口号。'); process.exit(1); }
  const server = createPreviewServer(RENDERER, { aiConfigFile: path.join(__dirname, '../.local-ai/config.json') });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被使用。请访问已有预览，或使用 npm run web -- --port 5174。` : error.message);
    server.stop().finally(() => process.exit(1));
  });
  server.listen(port, '127.0.0.1', () => console.log(`MoreReady 网页预览：http://127.0.0.1:${port}/\n修改界面文件后自动更新。按 Ctrl+C 停止。`));
  process.on('SIGINT', () => server.stop().then(() => process.exit(0)));
  process.on('SIGTERM', () => server.stop().then(() => process.exit(0)));
}

module.exports = { createPreviewServer };
