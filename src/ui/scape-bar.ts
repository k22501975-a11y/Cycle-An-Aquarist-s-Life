import {
  HARDSCAPE,
  hardscapeEffect,
  hardscapePlacements,
  PLANT_SPECIES,
  placeHardscape,
  placePlant,
  plantLight,
  plantPlacement,
  SCALE_MAX,
  SCALE_MIN,
  SCAPE_LAYERS,
  type Disturbance,
  type Placement,
  type ScapeLayer,
  type TankState,
} from '../sim';
import { LAYER_LABELS, type ScapeEdit, type ScapeTarget } from '../render/scape-view';
import { h } from './dom';
import type { Game } from '../game/game';
import type { Toasts } from './sheet';

/**
 * 造景模式的操作列（aquascape-editor.md）：上面切換編輯哪一層，選了東西以後可以換層、翻轉、縮放。
 * 在缸裡拖曳石頭、沉木、水草改位置（畫面那邊處理），放開時才真的移動（攪沙、嚇魚的代價也在那時算）。
 */

export interface ScapeBarDeps {
  game: Game;
  toasts: Toasts;
  /** 造景狀態變了（畫面要跟著更新）。 */
  onChange: (edit: ScapeEdit) => void;
  onDone: () => void;
  /** 缸裡什麼都沒有時，直接去商店買石頭（設備頁）或水草。 */
  openShop?: (tab: 'gear' | 'plants') => void;
  /** 第一次放開拖曳（造景引導收起來）。 */
  onDrop?: () => void;
}

const STEP = 0.05;

/** 選到的東西叫什麼、在哪層、對水質的影響。 */
export function describeTarget(state: TankState, target: ScapeTarget): { name: string; place: Placement; note: string } | null {
  if (target.kind === 'hardscape') {
    const spec = state.equipment.hardscape?.[target.index];
    if (!spec) return null;
    const place = hardscapePlacements(state)[target.index];
    return { name: spec.name, place, note: hardscapeEffect(HARDSCAPE[spec.id as keyof typeof HARDSCAPE] ?? spec) };
  }
  const plant = state.plants.find((p) => p.id === target.id);
  if (!plant) return null;
  const sp = PLANT_SPECIES[plant.species];
  const light = plantLight(state, plant);
  const note = light < 0.7 ? (sp.lightType === 'high' ? '這裡被遮到，陽性草會長不好' : '半陰影，陰性草剛好') : sp.lightType === 'high' ? '陽性草・光照充足' : '陰性草・光太強葉子會長藻';
  return { name: sp.name, place: plantPlacement(plant), note };
}

/** 動完造景的提示（有魚的缸大動會攪沙、嚇魚）。 */
export function disturbanceText(d: Disturbance): { text: string; tone: 'warn' | 'info' } | null {
  if (d.turbidity <= 0) return null;
  if (d.big) return { text: d.stressed > 0 ? `攪起底沙，水變混濁了，${d.stressed} 隻魚蝦嚇到了。大改造景最好先把魚移出去` : '攪起底沙，水變混濁了，開著過濾幾小時就會沉澱', tone: d.stressed > 0 ? 'warn' : 'info' };
  return null;
}

export class ScapeBar {
  readonly el = h('div.scape-bar.glass');
  private edit: ScapeEdit = { layer: 'mid', selected: null, guides: true };

  constructor(private readonly deps: ScapeBarDeps) {}

  get state(): ScapeEdit {
    return this.edit;
  }

  /** 進造景模式：先停在有東西的那層（只有後景有石頭時，停在中景會什麼都拖不到）。 */
  reset(): void {
    this.edit = { layer: firstLayer(this.deps.game.state), selected: null, guides: this.edit.guides };
    this.render();
  }

  select(target: ScapeTarget | null): void {
    // 點到的物件就是這層的（畫面只讓點目前那層）
    this.edit = { ...this.edit, selected: target };
    this.changed();
  }

  /** 放開拖曳：真的移動，算代價。 */
  drop(target: ScapeTarget, x: number): void {
    this.apply(target, { x });
    this.deps.onDrop?.();
  }

  private apply(target: ScapeTarget, change: Partial<Omit<Placement, 'seed'>>): void {
    const d = this.deps.game.act((st) => (target.kind === 'hardscape' ? placeHardscape(st, target.index, change) : placePlant(st, target.id, change)));
    const msg = disturbanceText(d);
    if (msg) this.deps.toasts.show(msg.text, msg.tone);
    if (change.layer) this.edit = { ...this.edit, layer: change.layer };
    this.changed();
  }

  private changed(): void {
    this.deps.onChange(this.edit);
    this.render();
  }

  render(): void {
    const s = this.deps.game.state;
    const edit = this.edit;
    const sel = edit.selected ? describeTarget(s, edit.selected) : null;
    if (edit.selected && !sel) this.edit = { ...edit, selected: null };
    const btn = (label: string, run: () => void, cls = '', disabled = false) => h(`button.btn.small${cls}`, { onclick: run, disabled }, label);
    const tabs = h(
      'div.tabs',
      {},
      ...SCAPE_LAYERS.map((layer) =>
        h(`button.tab${edit.layer === layer ? '.active' : ''}`, { onclick: () => ((this.edit = { ...this.edit, layer, selected: null }), this.changed()) }, LAYER_LABELS[layer]),
      ),
    );
    const fishIn = s.fish.some((f) => f.alive);
    const empty = (s.equipment.hardscape ?? []).length === 0 && s.plants.length === 0;
    const shop = this.deps.openShop;
    const info = empty
      ? h(
          'div.scape-empty',
          {},
          h('div.hint', {}, '缸裡還沒有石頭和水草。先買幾樣，再回來拖到喜歡的位置'),
          shop ? h('div.row.scape-actions', {}, btn('買石頭、沉木', () => shop('gear')), btn('買水草', () => shop('plants'))) : null,
        )
      : sel
      ? h(
          'div.scape-sel',
          {},
          h('b', {}, `${sel.name}・${LAYER_LABELS[sel.place.layer]}`),
          h(`div.hint${sel.note.includes('長不好') ? '.warn' : ''}`, {}, sel.note),
        )
      : h('div.hint', {}, fishIn ? '拖曳石頭、沉木、水草改位置。缸裡有魚：搬石頭會攪起底沙、嚇到魚' : '拖曳石頭、沉木、水草改位置。空缸最適合大改造景');
    const target = edit.selected;
    const actions = target && sel
      ? h(
          'div.row.wrap.scape-actions',
          {},
          ...layerMoves(sel.place.layer).map(([layer, label]) => btn(label, () => this.apply(target, { layer }))),
          btn('翻轉', () => this.apply(target, { flip: !sel.place.flip })),
          target.kind === 'hardscape' ? btn('縮小', () => this.apply(target, { scale: (sel.place.scale ?? 1) - STEP }), '', (sel.place.scale ?? 1) <= SCALE_MIN + 1e-6) : null,
          target.kind === 'hardscape' ? btn('放大', () => this.apply(target, { scale: (sel.place.scale ?? 1) + STEP }), '', (sel.place.scale ?? 1) >= SCALE_MAX - 1e-6) : null,
        )
      : null;
    const plant = target?.kind === 'plant' ? s.plants.find((p) => p.id === target.id) : undefined;
    const high = plant ? PLANT_SPECIES[plant.species].lightType === 'high' : true;
    const legend = plant ? h('div.hint.scape-legend', {}, h('i.dot.ok'), '光照足', h('i.dot.mid'), '普通', high ? h('i.dot.low') : h('i.dot.shade'), high ? '被遮住（陽性草長不好）' : '陰影（陰性草喜歡）') : null;
    this.el.replaceChildren(
      h('div.scape-head', {}, h('b.scape-title', {}, '造景模式'), tabs),
      info,
      legend ?? '',
      actions ?? '',
      h(
        'div.row.scape-foot',
        {},
        btn(edit.guides ? '輔助線：開' : '輔助線：關', () => ((this.edit = { ...this.edit, guides: !this.edit.guides }), this.changed()), edit.guides ? '' : '.ghost'),
        btn('完成', () => this.deps.onDone(), '.primary'),
      ),
    );
  }
}

/** 第一個擺著東西的層（石頭優先，比較好拖）；空缸就是中景。 */
export function firstLayer(state: TankState): ScapeLayer {
  const rocks = hardscapePlacements(state);
  if (rocks.length > 0) return rocks[0].layer;
  const plant = state.plants[0];
  return plant ? plantPlacement(plant).layer : 'mid';
}

/** 可以往前、往後搬一層。 */
function layerMoves(layer: ScapeLayer): Array<[ScapeLayer, string]> {
  const i = SCAPE_LAYERS.indexOf(layer);
  const out: Array<[ScapeLayer, string]> = [];
  if (i > 0) out.push([SCAPE_LAYERS[i - 1], `移到${LAYER_LABELS[SCAPE_LAYERS[i - 1]]}`]);
  if (i < SCAPE_LAYERS.length - 1) out.push([SCAPE_LAYERS[i + 1], `移到${LAYER_LABELS[SCAPE_LAYERS[i + 1]]}`]);
  return out;
}
