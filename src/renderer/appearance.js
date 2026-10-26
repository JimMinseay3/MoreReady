/* Shared color helpers for the desktop and browser renderer. */
(function (root) {
  'use strict';
  const BRAND_ACCENT = '#c18b38';
  const parse = (value) => {
    const hex = /^#([\da-f]{6})$/i.exec(value || '');
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(value || '');
    return rgb ? rgb.slice(1, 4).map(Number) : null;
  };
  const luminance = (rgb) => rgb.map((n) => n / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
    .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + .05) / (values[1] + .05);
  };
  const mix = (a, b, amount) => a.map((n, i) => Math.round(n * (1 - amount) + b[i] * amount));
  const css = (rgb) => `rgb(${rgb.join(', ')})`;
  function apply(document, accent) {
    const html = document.documentElement;
    const base = getComputedStyle(html);
    const color = parse(accent) || parse(BRAND_ACCENT);
    const surface = parse(base.getPropertyValue('--panel-bg').trim());
    const target = parse(base.getPropertyValue('--text').trim());
    const tint = mix(surface, color, .13);
    let ink = color.slice();
    for (let step = 1; contrast(ink, tint) < 4.6 && step <= 100; step++) ink = mix(color, target, step / 100);
    const light = [255, 255, 255], dark = [29, 28, 25];
    html.style.setProperty('--accent', css(color));
    html.style.setProperty('--accent-ink', css(ink));
    html.style.setProperty('--accent-soft', css(tint));
    html.style.setProperty('--accent-on', css(contrast(color, dark) > contrast(color, light) ? dark : light));
    const heatBase = parse(base.getPropertyValue('--heat-bg').trim());
    [.22, .45, .70].forEach((amount, index) => {
      const heatColor = mix(heatBase, color, amount);
      const black = [0, 0, 0];
      const heatInk = contrast(heatColor, target) >= 4.6 ? target
        : contrast(heatColor, black) > contrast(heatColor, light) ? black : light;
      html.style.setProperty(`--heat-ink-${index + 1}`, css(heatInk));
    });
  }
  root.PMAppearance = { BRAND_ACCENT, apply };
})(window);
