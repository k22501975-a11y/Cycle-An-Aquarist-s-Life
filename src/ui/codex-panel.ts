import { markDaily, type FishSpeciesId, type PlantSpeciesId } from '../sim';
import { artImg, type ArtIcon } from './art-icons';
import { CODEX, isUnlocked, type CodexCategory, type CodexEntry } from './codex';
import { h } from './dom';
import type { PanelContext } from './panels';
import { plantArt, speciesArt } from './shop-cards';
import { iconTabs } from './card-kit';

const ART = `${import.meta.env.BASE_URL}art/`;

const TABS: Array<{ id: CodexCategory; label: string; art?: string; icon?: ArtIcon }> = [
  { id: 'fish', label: '魚蝦', art: speciesArt('guppy') },
  { id: 'plant', label: '水草', art: plantArt('anubias') },
  { id: 'gear', label: '設備', icon: 'gear' },
  { id: 'disease', label: '疾病', icon: 'bacteria' },
];

/** 設備條目對應的商品圖（跟商店同一張）。 */
const GEAR_ART: Record<string, string> = {
  sponge: 'gear/sponge-filter.webp',
  hangOn: 'gear/hangon-filter.webp',
  canister: 'gear/canister-filter.webp',
  h25: 'gear/heater.webp',
  h50: 'gear/heater.webp',
  h100: 'gear/heater.webp',
  small: 'gear/air-pump.webp',
  basic: 'gear/led-basic.webp',
  planted: 'gear/led-planted.webp',
  diy: 'gear/co2-set.webp',
  fan_clip: 'gear/fan.webp',
  chiller_small: 'gear/chiller.webp',
  substrate_sand: 'gear/bag-sand.webp',
  substrate_soil: 'gear/bag-soil.webp',
  substrate_coral: 'gear/bag-coral.webp',
  hardscape_seiryu: 'scape/rock-seiryu-1.webp',
  hardscape_lava: 'gear/rock-lava.webp',
  hardscape_slate: 'gear/rock-slate.webp',
  hardscape_driftwood: 'scape/wood-spider-1.webp',
  quarantine: 'gear/quarantine-box.webp',
};

/** 疾病：水質類用試劑圖示，病原類用細菌圖示，其他（缺氧、水溫）用設備圖示。 */
const DISEASE_ICON: Record<string, ArtIcon> = { new_tank: 'testkit', ammonia: 'testkit', nitrite: 'testkit', oxygen: 'gear', temperature: 'gear' };

/** 條目的圖：魚蝦、水草、設備、缸用商品圖；疾病用插畫圖示。 */
export function entryPic(e: CodexEntry): { art?: string; icon?: ArtIcon } {
  const key = e.id.slice(e.id.indexOf(':') + 1);
  if (e.category === 'fish') return { art: speciesArt(key as FishSpeciesId) };
  if (e.category === 'plant') return { art: plantArt(key as PlantSpeciesId) };
  if (e.category === 'gear') return GEAR_ART[key] ? { art: GEAR_ART[key] } : /^(nano|std)\d+$/.test(key) ? { art: 'gear/tank-empty.webp' } : { icon: 'gear' };
  return { icon: DISEASE_ICON[key] ?? 'bacteria' };
}

function pic(e: CodexEntry, cls: string): HTMLElement {
  const p = entryPic(e);
  const box = h(`div.${cls}`);
  if (p.art) {
    const img = h('img', { src: ART + p.art, alt: '', loading: 'lazy', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  } else if (p.icon) box.append(artImg(p.icon, 'card-icon'));
  return box;
}

/** 圖鑑：分類分頁（有圖），條目是圖卡，點進去看詳細；疾病沒遇過前顯示「？」。 */
export function codexPanel(ctx: PanelContext, seen: Set<string>, category: CodexCategory = 'fish', entryId?: string): Node {
  const { sheet } = ctx;
  // 每日小事「翻一頁圖鑑」
  markDaily(ctx.game.tanks, 'codex');
  const go = (c: CodexCategory, id?: string) => sheet.open('圖鑑', () => codexPanel(ctx, seen, c, id));
  const tabs = iconTabs(TABS, category, (c) => go(c));
  const entry = entryId ? CODEX.find((e) => e.id === entryId) : undefined;
  if (entry && isUnlocked(entry, seen)) {
    return h(
      'div.stack',
      {},
      tabs,
      h('button.btn.small.back', { onclick: () => go(category) }, '‹ 回到列表'),
      h('div.codex-head', {}, pic(entry, 'card-pic.codex-hero'), h('h3.codex-name', {}, entry.name)),
      h('table.readings', {}, ...entry.facts.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td.value', {}, v)))),
      h('p.codex-text', {}, entry.text),
    );
  }
  const items = CODEX.filter((e) => e.category === category);
  const unlocked = items.filter((e) => isUnlocked(e, seen)).length;
  return h(
    'div.stack',
    {},
    tabs,
    category === 'disease' ? h('p.hint', {}, `已記錄 ${unlocked} / ${items.length} 種。親眼遇過一次才會寫進圖鑑。`) : null,
    h(
      'div.card-grid.codex-grid',
      {},
      ...items.map((e) =>
        isUnlocked(e, seen)
          ? h('button.shop-card.codex-card', { onclick: () => go(category, e.id) }, pic(e, 'card-pic'), h('div.card-body', {}, h('b.card-name', {}, e.name), h('span.codex-sub', {}, e.facts[0]?.[1] ?? '')))
          : h('div.shop-card.codex-card.locked', {}, h('div.card-pic', {}, h('b.codex-q', {}, '？')), h('div.card-body', {}, h('b.card-name', {}, '還沒遇過'))),
      ),
    ),
  );
}
