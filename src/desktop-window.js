'use strict';
const DEFAULT_SIZE = { width: 1440, height: 900 };
const MIN_SIZE = { width: 960, height: 620 };
function restoreBounds(saved, area) {
  const source = saved && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(saved[key])) ? saved : null;
  const width = Math.min(area.width, Math.max(Math.min(MIN_SIZE.width, area.width), source?.width || DEFAULT_SIZE.width));
  const height = Math.min(area.height, Math.max(Math.min(MIN_SIZE.height, area.height), source?.height || DEFAULT_SIZE.height));
  return {
    width: Math.round(width), height: Math.round(height),
    x: Math.round(Math.max(area.x, Math.min(source ? source.x : area.x + (area.width - width) / 2, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(source ? source.y : area.y + (area.height - height) / 2, area.y + area.height - height))),
  };
}
module.exports = { DEFAULT_SIZE, MIN_SIZE, restoreBounds };
