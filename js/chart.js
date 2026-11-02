// Small SVG line chart: dates on x, kg on y, with a crosshair + tooltip.
// Used for body weight and for every exercise.

import { addDays, daysBetween, parseDateKey } from './store.js';
import { formatDate } from './ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function niceStep(span) {
  for (const step of [0.2, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50]) if (span / step <= 4) return step;
  return 100;
}

// Point on the segment a→b at `date` (for clipping a goal path to the visible range).
function along(a, b, date) {
  const t = daysBetween(a.date, date) / Math.max(1, daysBetween(a.date, b.date));
  return { date, y: a.y + (b.y - a.y) * t };
}

/**
 * opts:
 *   start, end   x range (date keys)
 *   dots         [{ date, y }] markers — the crosshair snaps to these
 *   line         [{ date, y }] main line (optional)
 *   path         [{ date, y }, { date, y }] goal path, drawn faint (optional)
 *   target       { y, label } horizontal goal line (optional)
 *   mark         { date, y, label } one labeled point, e.g. the current record (optional)
 *   minSpan      smallest y range to show (kg)
 *   tooltip      (dotIndex) => [{ text, strong?, key?: 'line' | 'dot' }]
 *   ariaLabel
 */
export function drawLineChart(wrap, opts) {
  const { start, end, dots = [], line = null, target = null, mark = null, minSpan = 1, tooltip, ariaLabel = '' } = opts;
  wrap.replaceChildren();

  let path = opts.path;
  if (path) {
    let [a, b] = path;
    if (b.date < start || a.date > end) path = null;
    else {
      if (a.date < start) a = along(a, b, start);
      if (b.date > end) b = along(path[0], b, end);
      path = [a, b];
    }
  }

  const W = wrap.clientWidth || 320;
  const H = 200;
  const m = { top: 14, right: target ? 44 : 10, bottom: 26, left: 40 };
  const span = Math.max(1, daysBetween(start, end));
  const ys = [...dots, ...(line || []), ...(path || [])].map((p) => p.y);
  if (target) ys.push(target.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const step = niceStep(hi - lo);
  const y0 = Math.max(0, Math.floor(lo / step) * step);
  const y1 = Math.ceil(hi / step) * step;
  const x = (date) => m.left + (daysBetween(start, date) / span) * (W - m.left - m.right);
  const y = (v) => m.top + (1 - (v - y0) / (y1 - y0 || 1)) * (H - m.top - m.bottom);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'ch-svg', role: 'img' });
  root.setAttribute('aria-label', ariaLabel);

  const decimals = step % 1 ? 1 : 0;
  for (let v = y0; v <= y1 + 1e-9; v += step) {
    root.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), class: 'ch-grid' }));
    const t = svg('text', { x: m.left - 8, y: y(v) + 4, class: 'ch-axis', 'text-anchor': 'end' });
    t.textContent = v.toFixed(decimals);
    root.append(t);
  }
  const long = span > 300;
  [start, addDays(start, Math.round(span / 2)), end].forEach((d, i) => {
    const t = svg('text', { x: x(d), y: H - 6, class: 'ch-axis', 'text-anchor': ['start', 'middle', 'end'][i] });
    t.textContent = formatDate(parseDateKey(d), long ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
    root.append(t);
  });

  if (target) {
    root.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(target.y), y2: y(target.y), class: 'ch-target' }));
    const t = svg('text', { x: W - m.right + 6, y: y(target.y) + 4, class: 'ch-target-label' });
    t.textContent = target.label;
    root.append(t);
  }
  if (path) {
    root.append(svg('line', { x1: x(path[0].date), y1: y(path[0].y), x2: x(path[1].date), y2: y(path[1].y), class: 'ch-path' }));
  }

  // With a separate line (body weight) the dots are muted context under it.
  // Without one (exercises) the dots are the series, threaded on their own line.
  const r = dots.length > 90 ? 2.5 : line ? 4 : 3.5;
  const dotLayer = svg('g', { class: line ? 'ch-dots muted' : 'ch-dots beads' });
  for (const p of dots) dotLayer.append(svg('circle', { cx: x(p.date), cy: y(p.y), r }));
  const series = line || dots;
  root.append(dotLayer);
  if (series.length > 1) {
    root.append(svg('path', { d: series.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.y).toFixed(1)}`).join(''), class: 'ch-line' }));
  }

  if (mark) {
    root.append(svg('circle', { cx: x(mark.date), cy: y(mark.y), r: 6, class: 'ch-mark' }));
    const left = x(mark.date) > W - 60;
    const t = svg('text', { x: x(mark.date) + (left ? -10 : 10), y: y(mark.y) - 10, class: 'ch-mark-label', 'text-anchor': left ? 'end' : 'start' });
    t.textContent = mark.label;
    root.append(t);
  }

  const cross = svg('line', { y1: m.top, y2: H - m.bottom, class: 'ch-cross', visibility: 'hidden' });
  const focus = svg('circle', { r: 5, class: 'ch-focus', visibility: 'hidden' });
  const focusLine = svg('circle', { r: 4, class: 'ch-focus-line', visibility: 'hidden' });
  root.append(cross, focus, focusLine);
  wrap.append(root);

  if (!dots.length || !tooltip) return;
  const tip = document.createElement('div');
  tip.className = 'ch-tip';
  tip.hidden = true;
  wrap.append(tip);

  const move = (ev) => {
    const px = ev.clientX - root.getBoundingClientRect().left;
    let best = 0;
    dots.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(dots[best].date) - px)) best = i;
    });
    const p = dots[best];
    const cx = x(p.date);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    focus.setAttribute('cx', cx);
    focus.setAttribute('cy', y(p.y));
    const onLine = line?.find((q) => q.date === p.date);
    if (onLine) {
      focusLine.setAttribute('cx', cx);
      focusLine.setAttribute('cy', y(onLine.y));
    }
    cross.setAttribute('visibility', 'visible');
    focus.setAttribute('visibility', 'visible');
    focusLine.setAttribute('visibility', onLine ? 'visible' : 'hidden');

    tip.replaceChildren(
      ...tooltip(best).map((row) => {
        const n = document.createElement(row.strong ? 'strong' : 'span');
        if (row.key) {
          const k = document.createElement('i');
          k.className = row.key === 'line' ? 'key-line' : 'key-dot';
          n.append(k);
        }
        n.append(row.text);
        return n;
      }),
    );
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(W - tw, cx - tw / 2))}px`;
  };
  const hide = () => {
    [cross, focus, focusLine].forEach((n) => n.setAttribute('visibility', 'hidden'));
    tip.hidden = true;
  };
  root.addEventListener('pointerdown', move);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerleave', (ev) => ev.pointerType === 'mouse' && hide());
}
