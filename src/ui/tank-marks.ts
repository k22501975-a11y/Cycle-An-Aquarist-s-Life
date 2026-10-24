import { h } from './dom';
import type { MorningReport, ReportItem } from './morning-report';

/**
 * 缸上的小標記（design/daily-loop.md §2）：水草長了、小螺多了、新訂單這種天天有的小事不上早上報告，
 * 改成缸裡的一個小圖示，點了才跳出一句話。留在主程式（很小），早上報告卡關掉後放上去。
 */

export type MarkKind = 'plant' | 'snail' | 'order' | 'note';

export interface TankMark {
  kind: MarkKind;
  /** 第幾缸。 */
  tank: number;
  text: string;
  /** 標在哪株水草上（沒有就標最高的那株）。 */
  plantId?: number;
}

/** 這幾種報告項目改放到缸上（核心還沒把它們移進 report.marks 之前，先從 items 撈出來）。 */
const MARK_KINDS: Partial<Record<ReportItem['kind'], MarkKind>> = { plant_grew: 'plant', new_leaf: 'plant', snails: 'snail', orders: 'order' };

function toMark(item: ReportItem): TankMark {
  return { kind: MARK_KINDS[item.kind] ?? 'note', tank: item.tank, text: item.text, plantId: item.plantId };
}

/** 報告拆成卡上的那幾行和缸上的標記；每缸每種最多一個（同種的留第一個）。 */
export function splitMarks(report: MorningReport & { marks?: ReportItem[] }): { report: MorningReport; marks: TankMark[] } {
  let items = report.items;
  let moved = report.marks;
  if (!moved) {
    moved = items.filter((i) => MARK_KINDS[i.kind] && i.tone !== 'bad' && i.tone !== 'warn');
    items = items.filter((i) => !moved!.includes(i));
  }
  if (items.length === 0) items = [{ kind: 'quiet', tank: 0, tone: 'info', text: '昨晚很平靜，魚都在水草裡睡覺' }];
  const seen = new Set<string>();
  const marks: TankMark[] = [];
  for (const m of moved.map(toMark)) {
    const key = `${m.tank}:${m.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    marks.push(m);
  }
  return { report: { ...report, items }, marks };
}

const ICON: Record<MarkKind, string> = {
  plant: '<path d="M12 21c0-6 1-10 6-14-1 6-3 9-6 10M12 21c0-5-1-8-5-11 0 5 2 8 5 9" fill="#7fd08a" stroke="#2e6b3e" stroke-width="1.2" stroke-linejoin="round"/>',
  snail: '<path d="M4 18h13c2 0 3-1 3-2l2-3-3 1" fill="#e9c7a0" stroke="#7a4f2c" stroke-width="1.1" stroke-linejoin="round"/><circle cx="11" cy="12" r="6" fill="#c9774a" stroke="#6b3a1f" stroke-width="1.2"/><path d="M11 12a2.5 2.5 0 1 1 2.5-2.5A4.5 4.5 0 1 1 6.5 12" fill="none" stroke="#f3d2a8" stroke-width="1.2"/>',
  order: '<rect x="5" y="3" width="14" height="18" rx="2" fill="#fff4d8" stroke="#9a6a1e" stroke-width="1.2"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#c48a2a" stroke-width="1.4" stroke-linecap="round"/><circle cx="18" cy="5" r="3.2" fill="#e8584a" stroke="#fff" stroke-width="1"/>',
  note: '<circle cx="12" cy="12" r="8" fill="#bfe6f2" stroke="#3f7f95" stroke-width="1.2"/><path d="M8.5 11.5a3.5 3.5 0 0 1 7 0M9 15h6" stroke="#3f7f95" stroke-width="1.4" stroke-linecap="round" fill="none"/>',
};

export interface MarkHost {
  /** 標記蓋在哪個元素上（水缸的舞台）。 */
  stage: HTMLElement;
  /** 這個標記在舞台上的位置（CSS 像素）；null 就先不畫。 */
  pos(mark: TankMark): { x: number; y: number } | null;
  /** 現在看的是第幾缸。 */
  tank(): number;
  /** 點了訂單標記的那句話：打開訂單板。 */
  openOrders(): void;
  /** 舞台上方被狀態列蓋住的高度：標記不放到那後面。 */
  topInset(): number;
}

/** 一句話留多久（毫秒）。 */
const SAY_MS = 2800;

export class TankMarks {
  private marks: TankMark[] = [];
  private readonly els = new Map<TankMark, HTMLElement>();

  constructor(private readonly host: MarkHost) {}

  /** 新的早上：換上這天的標記（昨天沒點的就不留了）。 */
  set(marks: TankMark[]): void {
    for (const el of this.els.values()) el.remove();
    this.els.clear();
    this.marks = marks;
    this.sync();
  }

  get count(): number {
    return this.marks.length;
  }

  /** 每半秒跟著水草、螺移動；換缸時只畫這缸的。 */
  sync(): void {
    const tank = this.host.tank();
    const top = this.host.topInset() + 28;
    const w = this.host.stage.clientWidth;
    for (const m of this.marks) {
      const p = m.tank === tank ? this.host.pos(m) : null;
      let el = this.els.get(m);
      if (!p) {
        el?.remove();
        this.els.delete(m);
        continue;
      }
      if (!el) {
        el = h(`button.tank-mark.${m.kind}`, { type: 'button', 'aria-label': m.text, onclick: () => this.open(m) });
        el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[m.kind]}</svg>`;
        this.els.set(m, el);
        this.host.stage.append(el);
      }
      el.style.left = `${Math.round(Math.max(24, Math.min(w - 24, p.x)))}px`;
      el.style.top = `${Math.round(Math.max(top, p.y))}px`;
    }
  }

  /** 點了：標記換成一句話，過一下就消失（訂單那句再點一下打開訂單板）。 */
  private open(m: TankMark): void {
    const el = this.els.get(m);
    this.marks = this.marks.filter((x) => x !== m);
    this.els.delete(m);
    if (!el) return;
    const say = h(`button.tank-mark-say.${m.kind}`, { type: 'button', onclick: () => (say.remove(), m.kind === 'order' && this.host.openOrders()) }, m.text, m.kind === 'order' ? h('b', {}, ' 去看看 ›') : '');
    // 一句話比標記寬：靠邊時往內收，不要被螢幕切掉
    const w = this.host.stage.clientWidth;
    say.style.left = `${Math.round(Math.max(Math.min(150, w / 2), Math.min(w - 150, parseFloat(el.style.left))))}px`;
    say.style.top = el.style.top;
    el.replaceWith(say);
    window.setTimeout(() => say.remove(), m.kind === 'order' ? SAY_MS + 1600 : SAY_MS);
  }
}
