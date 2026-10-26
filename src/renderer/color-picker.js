/* App-owned HSV palette; shared by Electron and browser without native dialogs. */
(function (root) {
  'use strict';
  const clamp = value => Math.min(1, Math.max(0, value));
  const normalize = value => {
    let hex = String(value).trim().replace(/^#/, '');
    if (/^[\da-f]{3}$/i.test(hex)) hex = hex.split('').map(char => char + char).join('');
    return /^[\da-f]{6}$/i.test(hex) ? '#' + hex.toLowerCase() : null;
  };
  function toHSV(color) {
    const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
    const [r, g, b] = rgb, max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
    let h = 0;
    if (delta) h = 60 * (max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
    return { h, s: max ? delta / max : 0, v: max };
  }
  function toHex({ h, s, v }) {
    const chroma = v * s, sector = ((h % 360) + 360) % 360 / 60;
    const x = chroma * (1 - Math.abs(sector % 2 - 1)), m = v - chroma;
    const rgb = sector < 1 ? [chroma, x, 0] : sector < 2 ? [x, chroma, 0] : sector < 3 ? [0, chroma, x]
      : sector < 4 ? [0, x, chroma] : sector < 5 ? [x, 0, chroma] : [chroma, 0, x];
    return '#' + rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
  }
  function mount(host, { color, onPreview, onApply, onCancel }) {
    const original = normalize(color) || '#c18b38';
    let hsv = toHSV(original), current = original;
    host.innerHTML = `<div class="accent-palette" role="group" aria-label="自定义色板">
      <div class="palette-head"><b>自定义色板</b><span>实时预览</span></div>
      <div class="palette-sv" tabindex="0" role="slider" aria-label="饱和度与明度" aria-valuemin="0" aria-valuemax="100"><i class="palette-cursor" aria-hidden="true"></i></div>
      <label class="palette-hue-label" for="accentHue">色相</label><input id="accentHue" class="palette-hue" type="range" min="0" max="360" step="1" aria-label="色相" />
      <div class="palette-value"><span class="palette-sample" aria-hidden="true"></span><label for="accentHex">HEX</label><input class="input" id="accentHex" aria-label="自定义色值" aria-describedby="accentColorError" autocomplete="off" spellcheck="false" maxlength="7" /></div>
      <p class="palette-error" id="accentColorError" role="status"></p>
      <div class="palette-actions"><button type="button" class="btn tiny" data-palette-cancel>取消</button><button type="button" class="btn tiny primary" data-palette-apply>应用</button></div>
    </div>`;
    const field = host.querySelector('.palette-sv'), cursor = host.querySelector('.palette-cursor');
    const hue = host.querySelector('#accentHue'), hex = host.querySelector('#accentHex');
    const error = host.querySelector('#accentColorError'), apply = host.querySelector('[data-palette-apply]');
    const sync = (preview = true, keepInput = false) => {
      current = toHex(hsv);
      field.style.setProperty('--picker-hue', `hsl(${hsv.h} 100% 50%)`);
      cursor.style.left = hsv.s * 100 + '%'; cursor.style.top = (1 - hsv.v) * 100 + '%';
      field.setAttribute('aria-valuenow', String(Math.round(hsv.s * 100)));
      field.setAttribute('aria-valuetext', `饱和度 ${Math.round(hsv.s * 100)}%，明度 ${Math.round(hsv.v * 100)}%`);
      hue.value = String(Math.round(hsv.h));
      host.querySelector('.palette-sample').style.background = current;
      if (!keepInput) hex.value = current.toUpperCase();
      hex.setAttribute('aria-invalid', 'false'); error.textContent = ''; apply.disabled = false;
      if (preview) onPreview(current);
    };
    const choose = event => {
      const rect = field.getBoundingClientRect();
      hsv.s = clamp((event.clientX - rect.left) / rect.width);
      hsv.v = 1 - clamp((event.clientY - rect.top) / rect.height); sync();
    };
    field.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); field.focus(); field.setPointerCapture(event.pointerId); choose(event);
    });
    field.addEventListener('pointermove', event => { if (field.hasPointerCapture(event.pointerId)) choose(event); });
    field.addEventListener('pointerup', event => { if (field.hasPointerCapture(event.pointerId)) field.releasePointerCapture(event.pointerId); });
    field.addEventListener('keydown', event => {
      const step = event.shiftKey ? .10 : .01;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') hsv.s = clamp(hsv.s - step);
      if (event.key === 'ArrowRight') hsv.s = clamp(hsv.s + step);
      if (event.key === 'ArrowUp') hsv.v = clamp(hsv.v + step);
      if (event.key === 'ArrowDown') hsv.v = clamp(hsv.v - step);
      if (event.key === 'Home') hsv.s = 0;
      if (event.key === 'End') hsv.s = 1;
      sync();
    });
    hue.addEventListener('input', () => { hsv.h = Number(hue.value); sync(); });
    hex.addEventListener('input', () => {
      const normalized = normalize(hex.value);
      if (!normalized) {
        hex.setAttribute('aria-invalid', 'true'); error.textContent = '请输入有效色值，例如 #C18B38'; apply.disabled = true; return;
      }
      const next = toHSV(normalized);
      if (next.s === 0) next.h = hsv.h;
      hsv = next; sync(true, true);
    });
    const handleKey = event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.key === 'Enter' && (event.target === hex || event.ctrlKey || event.metaKey)) {
        event.preventDefault(); event.stopPropagation(); if (!apply.disabled) onApply(current);
      }
    };
    host.addEventListener('keydown', handleKey);
    const cancel = host.querySelector('[data-palette-cancel]');
    cancel.addEventListener('click', onCancel);
    apply.addEventListener('click', () => { if (!apply.disabled) onApply(current); });
    sync(false); hex.focus(); hex.select();
    return () => { host.removeEventListener('keydown', handleKey); host.replaceChildren(); };
  }
  root.PMColorPicker = { mount };
})(window);
