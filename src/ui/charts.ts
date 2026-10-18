import { h } from './dom';

/**
 * 小型折線圖（SVG）：一張圖只畫一個數值，多個數值用並排的小圖，不用雙 Y 軸。
 * 細線 2px、點 r=4 加一圈底色、格線很淡、只標最後一個值；手指或滑鼠移上去看每一點的時間和數值。
 */

export interface ChartPoint {
  x: number;
  y: number;
}

export interface LineChartOptions {
  title: string;
  unit: string;
  points: ChartPoint[];
  /** X 軸範圍（遊戲小時）。 */
  xRange: [number, number];
  /** Y 軸至少要顯示到多少（數值小的時候不要把雜訊放大）。 */
  yMinSpan: number;
  /** 從 0 開始（濃度）或貼著資料（溫度）。 */
  zeroBased: boolean;
  /** 安全範圍，畫成淡淡的底色帶。 */
  band?: [number, number];
  /** 測試劑讀數畫點，溫度計連續讀數只畫線。 */
  dots: boolean;
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  empty: string;
}

const W = 320;
const H = 120;
const PAD = { left: 34, right: 40, top: 10, bottom: 20 };

/** 把最大值進位成好讀的刻度（1、2、2.5、5、10 的倍數）。 */
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * exp + 1e-9) return m * exp;
  return 10 * exp;
}

export function yDomain(points: ChartPoint[], minSpan: number, zeroBased: boolean): [number, number] {
  const ys = points.map((p) => p.y);
  if (zeroBased) return [0, niceCeil(Math.max(minSpan, ...ys))];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const mid = (lo + hi) / 2;
  const span = Math.max(minSpan, hi - lo) * 1.2;
  return [Math.floor((mid - span / 2) * 2) / 2, Math.ceil((mid + span / 2) * 2) / 2];
}

export function lineChart(o: LineChartOptions): HTMLElement {
  const wrap = h('figure.chart', {}, h('figcaption.chart-title', {}, o.title));
  const pts = o.points.filter((p) => p.x >= o.xRange[0] && p.x <= o.xRange[1]);
  if (pts.length === 0) {
    wrap.append(h('p.hint', {}, o.empty));
    return wrap;
  }
  const [y0, y1] = yDomain(pts, o.yMinSpan, o.zeroBased);
  const [x0, x1] = o.xRange;
  const sx = (x: number) => PAD.left + ((x - x0) / Math.max(1e-9, x1 - x0)) * (W - PAD.left - PAD.right);
  const sy = (y: number) => PAD.top + (1 - (y - y0) / Math.max(1e-9, y1 - y0)) * (H - PAD.top - PAD.bottom);
  const NS = 'http://www.w3.org/2000/svg';
  const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `${o.title}趨勢圖` });

  if (o.band) {
    const top = sy(Math.min(y1, o.band[1]));
    const bottom = sy(Math.max(y0, o.band[0]));
    if (bottom > top) svg.append(el('rect', { x: PAD.left, y: top, width: W - PAD.left - PAD.right, height: bottom - top, class: 'chart-band' }));
  }
  // 三條淡格線＋刻度
  for (const t of [y0, (y0 + y1) / 2, y1]) {
    svg.append(el('line', { x1: PAD.left, x2: W - PAD.right, y1: sy(t), y2: sy(t), class: 'chart-grid' }));
    const label = el('text', { x: PAD.left - 6, y: sy(t) + 4, class: 'chart-tick', 'text-anchor': 'end' });
    label.textContent = o.formatY(t);
    svg.append(label);
  }
  // X 軸：每天一個刻度，最多 7 個
  const days = Math.max(1, Math.round((x1 - x0) / 24));
  const every = Math.ceil(days / 7);
  for (let d = Math.ceil(x0 / 24); d * 24 <= x1; d += every) {
    const label = el('text', { x: sx(d * 24), y: H - 4, class: 'chart-tick', 'text-anchor': 'middle' });
    label.textContent = `${d + 1}`;
    svg.append(label);
  }

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  svg.append(el('path', { d: path, class: 'chart-line' }));
  if (o.dots) for (const p of pts) svg.append(el('circle', { cx: sx(p.x), cy: sy(p.y), r: 4, class: 'chart-dot' }));
  const last = pts[pts.length - 1];
  if (!o.dots) svg.append(el('circle', { cx: sx(last.x), cy: sy(last.y), r: 4, class: 'chart-dot' }));
  const endLabel = el('text', { x: sx(last.x) + 8, y: sy(last.y) + 4, class: 'chart-end' });
  endLabel.textContent = o.formatY(last.y);
  svg.append(endLabel);

  // 指到哪裡就顯示最近一點的時間與數值
  const cross = el('line', { y1: PAD.top, y2: H - PAD.bottom, class: 'chart-cross' });
  const focus = el('circle', { r: 5, class: 'chart-focus' });
  cross.style.display = focus.style.display = 'none';
  svg.append(cross, focus);
  const tip = h('div.chart-tip');
  const move = (e: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    const x = x0 + (((e.clientX - rect.left) / rect.width) * W - PAD.left) / ((W - PAD.left - PAD.right) / (x1 - x0));
    const p = pts.reduce((best, q) => (Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best), pts[0]);
    cross.setAttribute('x1', String(sx(p.x)));
    cross.setAttribute('x2', String(sx(p.x)));
    focus.setAttribute('cx', String(sx(p.x)));
    focus.setAttribute('cy', String(sy(p.y)));
    cross.style.display = focus.style.display = '';
    tip.textContent = `${o.formatX(p.x)}　${o.formatY(p.y)} ${o.unit}`;
    tip.style.left = `${(sx(p.x) / W) * 100}%`;
    tip.classList.add('show');
  };
  const leave = () => {
    cross.style.display = focus.style.display = 'none';
    tip.classList.remove('show');
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
  wrap.append(h('div.chart-plot', {}, svg, tip));
  return wrap;
}
