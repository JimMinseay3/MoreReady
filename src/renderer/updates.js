(function () {
  'use strict';
  let state = { status: 'unavailable', supported: false, percent: 0, version: '' };
  let hooks = {};
  const labels = { checking: '检查中…', available: '下载更新', downloading: '下载中…', downloaded: '重启安装', installing: '正在重启…' };
  const messages = () => ({
    unavailable: '请使用已安装的桌面版检查更新', idle: '', checking: '正在检查新版本',
    current: '已是最新版本', available: '发现新版本 v' + state.version,
    downloading: '正在下载 ' + state.percent + '%', downloaded: '更新已下载，重启后安装', installing: '即将重启并安装更新',
    error: '更新失败，请检查网络后重试',
  });
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function html() {
    const busy = ['checking', 'downloading', 'installing'].includes(state.status);
    const label = state.status === 'error' && state.retry === 'download' ? '重新下载' : labels[state.status] || '检查更新';
    return `<div class="about-update" id="aboutUpdate"><button class="btn" data-action="check-update" ${busy ? 'disabled' : ''}>${label}</button><p class="about-update-status${state.status === 'error' ? ' error' : ''}" role="status">${escape(messages()[state.status] || '')}</p><button class="about-release-link" data-action="open-release">发行版下载</button></div>`;
  }
  function update(next) { state = { ...state, ...next }; hooks.changed?.(); }
  async function init(options) {
    hooks = options;
    if (!window.PM?.updateInfo) return;
    window.PM.onUpdateState?.(update);
    try { update(await window.PM.updateInfo()); } catch { update({ status: 'error' }); }
  }
  async function act() {
    if (!state.supported) { hooks.notify?.('请从发行版下载并安装 MoreReady 后检查更新'); return; }
    if (['checking', 'downloading', 'installing'].includes(state.status)) return;
    if (state.status === 'downloaded' && hooks.prepareInstall?.() === false) return;
    const action = state.status === 'downloaded' ? 'installUpdate' : state.status === 'available' || (state.status === 'error' && state.retry === 'download') ? 'downloadUpdate' : 'checkForUpdates';
    try { update(await window.PM[action]()); } catch { update({ status: 'error' }); }
  }
  function openRelease() {
    if (window.PM?.openRelease) window.PM.openRelease();
    else window.open(window.PMRelease.releaseUrl, '_blank', 'noopener,noreferrer');
  }
  window.PMUpdates = { html, init, act, openRelease };
})();
