import {
  addFish,
  addPlant,
  AIR_PUMPS,
  CO2_KITS,
  doseIchMedication,
  feed,
  FILTERS,
  FISH_SPECIES,
  freeAmmonia,
  HEATERS,
  hidingFactor,
  LIGHTS,
  observeSymptoms,
  PLANT_SPECIES,
  removeDeadFish,
  replaceFilter,
  rinseFilterMedia,
  setHeaterTarget,
  unplugHeater,
  testWater,
  trimPlant,
  waterChange,
  type FishSpeciesId,
  type PlantSpeciesId,
  type TankState,
} from '../sim';
import type { Game } from '../game/game';
import { h } from './dom';
import { DEATH_CAUSE_LABELS, fishName, plantName, SYMPTOM_LABELS } from './labels';
import type { Sheet, Toasts } from './sheet';

export interface PanelContext {
  game: Game;
  sheet: Sheet;
  toasts: Toasts;
}

const alive = (s: TankState) => s.fish.filter((f) => f.alive);

/** 一餐的份量：缸內所有魚每日食量的一半（建議一天兩餐）。 */
function mealSize(s: TankState): number {
  return alive(s).reduce((sum, f) => sum + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;
}

function button(label: string, onclick: () => void, kind = ''): HTMLButtonElement {
  return h(`button.btn${kind ? '.' + kind : ''}`, { onclick }, label);
}

export function feedPanel({ game, sheet, toasts }: PanelContext): Node {
  const s = game.state;
  const meal = mealSize(s);
  if (meal <= 0) return h('p', {}, '缸裡還沒有魚。');
  const give = (mg: number, label: string) => () => {
    game.act((st) => feed(st, mg));
    toasts.show(`餵了${label}（${mg.toFixed(0)} mg）`);
    sheet.close();
  };
  return h(
    'div.stack',
    {},
    h('p.hint', {}, '一天兩餐、幾分鐘內吃完最好。吃不完的飼料會沉底腐敗，變成氨。'),
    h(
      'div.row',
      {},
      button('一小撮', give(meal * 0.5, '一小撮')),
      button('一餐', give(meal, '一餐'), 'primary'),
      button('一大把', give(meal * 3, '一大把')),
    ),
  );
}

export function waterChangePanel({ game, sheet, toasts }: PanelContext): Node {
  let fraction = 0.3;
  let matchTemp = true;
  const label = h('span', {}, '30%');
  const slider = h('input', { type: 'range', min: '10', max: '80', step: '5', value: '30' }) as HTMLInputElement;
  slider.addEventListener('input', () => {
    fraction = Number(slider.value) / 100;
    label.textContent = `${slider.value}%`;
  });
  const check = h('input', { type: 'checkbox', checked: 'checked' }) as HTMLInputElement;
  check.addEventListener('change', () => (matchTemp = check.checked));
  return h(
    'div.stack',
    {},
    h('p.hint', {}, '換水能稀釋氨、亞硝酸鹽、硝酸鹽，並補回 KH。每週 20–30% 是好習慣。'),
    h('label.field', {}, '換水量 ', label, slider),
    h('label.check', {}, check, ' 新水對好溫度（沒對溫，水溫驟變會讓魚緊迫）'),
    button('開始換水', () => {
      game.act((st) => waterChange(st, fraction, matchTemp ? { tempC: st.water.tempC } : {}));
      toasts.show(`換了 ${Math.round(fraction * 100)}% 的水`);
      sheet.close();
    }, 'primary'),
  );
}

const READING_ROWS: Array<{ key: 'ammonia' | 'nitrite' | 'nitrate' | 'ph' | 'kh'; label: string; unit: string; danger: (v: number) => 'ok' | 'warn' | 'bad' }> = [
  { key: 'ammonia', label: '氨 NH₃/NH₄⁺', unit: 'ppm', danger: (v) => (v === 0 ? 'ok' : v <= 0.25 ? 'warn' : 'bad') },
  { key: 'nitrite', label: '亞硝酸鹽 NO₂', unit: 'ppm', danger: (v) => (v === 0 ? 'ok' : v <= 0.25 ? 'warn' : 'bad') },
  { key: 'nitrate', label: '硝酸鹽 NO₃', unit: 'ppm', danger: (v) => (v <= 20 ? 'ok' : v <= 40 ? 'warn' : 'bad') },
  { key: 'ph', label: 'pH', unit: '', danger: (v) => (v >= 6.6 && v <= 8 ? 'ok' : 'warn') },
  { key: 'kh', label: 'KH', unit: 'dKH', danger: (v) => (v >= 3 ? 'ok' : v >= 1 ? 'warn' : 'bad') },
];

export function testKitPanel({ game }: PanelContext): Node {
  const r = testWater(game.state);
  return h(
    'div.stack',
    {},
    h('p.hint', {}, '試劑只能比對色卡，讀到的是大約的級距。'),
    h(
      'table.readings',
      {},
      ...READING_ROWS.map((row) =>
        h('tr', {}, h('td', {}, row.label), h(`td.value.${row.danger(r[row.key])}`, {}, `${r[row.key]} ${row.unit}`)),
      ),
      h('tr', {}, h('td', {}, '水溫（溫度計）'), h('td.value', {}, `${game.state.water.tempC.toFixed(1)} °C`)),
    ),
  );
}

export function fishPanel({ game, sheet }: PanelContext, fishId: number): Node {
  const fish = game.state.fish.find((f) => f.id === fishId);
  if (!fish) return h('p', {}, '這條魚已經不在缸裡了。');
  if (!fish.alive) {
    const cause = Object.entries(fish.recentDamage).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    return h(
      'div.stack',
      {},
      h('p', {}, `${fishName(fish)} 已經死了，可能原因：${DEATH_CAUSE_LABELS[cause] ?? cause}。`),
      h('p.hint', {}, '死魚留在缸裡會腐爛產生大量的氨，請盡快撈出。'),
      button('撈出死魚', () => {
        game.act(removeDeadFish);
        sheet.close();
      }, 'primary'),
    );
  }
  const symptoms = observeSymptoms(game.state, fish);
  return h(
    'div.stack',
    {},
    h('p', {}, `${fishName(fish)} · 體長約 ${fish.lengthCm.toFixed(1)} cm`),
    symptoms.length
      ? h('ul.symptoms', {}, ...symptoms.map((s) => h('li', {}, SYMPTOM_LABELS[s])))
      : h('p', {}, '游動正常，看起來很健康。'),
    h('p.hint', {}, '症狀只是線索：先用測試劑檢查水質，再判斷是環境問題還是生病。'),
  );
}

export function plantPanel({ game, sheet, toasts }: PanelContext, plantId: number): Node {
  const plant = game.state.plants.find((p) => p.id === plantId);
  if (!plant) return h('p', {}, '這株水草已經不在了。');
  const sp = PLANT_SPECIES[plant.species];
  const status =
    plant.growthRate < -0.0002 ? '正在溶葉（光、CO₂ 或養分不夠）' : plant.growthRate > 0.0005 ? '長得很好' : '生長緩慢';
  const fullness = Math.min(100, Math.round((plant.biomassG / sp.maxBiomassG) * 100));
  const canTrim = plant.biomassG - sp.maxBiomassG * 0.5 >= sp.cuttingMassG;
  return h(
    'div.stack',
    {},
    h('p', {}, `狀態：${status}`),
    plant.leafAlgae > 0.15 ? h('p.warn-text', {}, '葉面長了藻，光照可能太強。') : null,
    h('div.meter', {}, h('div.meter-fill', { style: { width: `${fullness}%` } })),
    h('p.hint', {}, `茂密度 ${fullness}%。超過一半後可以修剪，剪下的插枝能種回缸裡。`),
    button(canTrim ? '修剪' : '還太小，不能修剪', () => {
      if (!canTrim) return;
      const cuttings = game.act((st) => trimPlant(st, plantId));
      sheet.open(`剪下 ${cuttings} 份插枝`, () =>
        h(
          'div.stack',
          {},
          h('p.hint', {}, '之後可以拿到市場賣、送朋友（Phase 3）。現在可以種回缸裡。'),
          h(
            'div.row',
            {},
            button(`全部種回去（${cuttings} 株）`, () => {
              game.act((st) => {
                for (let i = 0; i < cuttings; i++) addPlant(st, plant.species, sp.cuttingMassG);
              });
              toasts.show(`種了 ${cuttings} 株${sp.name}`);
              sheet.close();
            }, 'primary'),
            button('丟掉', () => sheet.close()),
          ),
        ),
      );
    }, canTrim ? 'primary' : ''),
  );
}

export function shopPanel(ctx: PanelContext, tab: 'fish' | 'plants' | 'gear' = 'fish'): Node {
  const { game, sheet, toasts } = ctx;
  const tabs = h(
    'div.tabs',
    {},
    ...(['fish', 'plants', 'gear'] as const).map((t) =>
      h(`button.tab${t === tab ? '.active' : ''}`, { onclick: () => sheet.open('商店', () => shopPanel(ctx, t)) }, { fish: '魚', plants: '水草', gear: '設備' }[t]),
    ),
  );

  const buyFish = (species: FishSpeciesId, count: number) => () => {
    game.act((st) => {
      for (let i = 0; i < count; i++) addFish(st, species);
    });
    toasts.show(`買了 ${count} 隻${FISH_SPECIES[species].name}，剛運到會有點緊迫`);
  };
  const buyPlant = (species: PlantSpeciesId) => () => {
    game.act((st) => addPlant(st, species));
    toasts.show(`種下一株${PLANT_SPECIES[species].name}`);
  };

  let content: Node;
  if (tab === 'fish') {
    content = h(
      'div.stack',
      {},
      h('p.hint', {}, '店裡的魚可能帶著白點蟲。新缸還沒養好水就放太多魚，會氨中毒。'),
      h('p.hint', {}, '孔雀魚和櫻花蝦會自己繁殖，但成魚會吃仔魚和仔蝦，水草種密一點才躲得掉。斑馬魚會輕微咬孔雀魚公魚的長尾巴。'),
      ...(Object.keys(FISH_SPECIES) as FishSpeciesId[]).map((id) => {
        const sp = FISH_SPECIES[id];
        const note = [`${sp.temp.min}–${sp.temp.max}°C`, `pH ${sp.ph.min}–${sp.ph.max}`, sp.minGroup ? `群游，至少 ${sp.minGroup} 隻` : ''].filter(Boolean).join(' · ');
        return h('div.item', {}, h('div', {}, h('b', {}, sp.name), h('div.hint', {}, note)), h('div.row', {}, button('+1', buyFish(id, 1)), button('+6', buyFish(id, 6))));
      }),
    );
  } else if (tab === 'plants') {
    content = h(
      'div.stack',
      {},
      h('p.hint', {}, '陰性草弱光就能長；陽性草需要強光加 CO₂。'),
      ...(Object.keys(PLANT_SPECIES) as PlantSpeciesId[]).map((id) =>
        h('div.item', {}, h('b', {}, plantName(id)), button('種一株', buyPlant(id))),
      ),
    );
  } else {
    const eq = game.state.equipment;
    const item = (label: string, owned: boolean, onclick: () => void, note = '') =>
      h('div.item', {}, h('div', {}, h('b', {}, label), note ? h('div.hint', {}, note) : null), owned ? h('span.owned', {}, '使用中') : button('換上', onclick));
    content = h(
      'div.stack',
      {},
      h('p.warn-text', {}, '換過濾器會失去舊濾材上的硝化菌！'),
      ...Object.values(FILTERS).map((f) =>
        item(f.name, eq.filter?.spec.id === f.id, () => {
          game.act((st) => replaceFilter(st, f));
          toasts.show(`換上${f.name}，濾材要重新養菌`, 'warn');
        }, `濾材容量 ${f.bacteriaCapacityMgPerHour}`),
      ),
      ...Object.values(HEATERS).map((x) =>
        item(x.name, eq.heater?.spec.id === x.id && !eq.heater.broken, () => {
          game.act((st) => {
            st.equipment.heater = { spec: x, targetC: st.equipment.heater?.targetC ?? 25, broken: false, heating: false };
          });
        }, eq.heater?.spec.id === x.id && eq.heater.broken ? '目前這支壞了' : ''),
      ),
      ...Object.values(LIGHTS).map((l) =>
        item(l.name, eq.light?.spec.id === l.id, () => {
          game.act((st) => {
            st.equipment.light = { spec: l, startHour: st.equipment.light?.startHour ?? 10, photoperiodHours: st.equipment.light?.photoperiodHours ?? 8 };
          });
        }, `光照強度 ${l.par} PAR`),
      ),
      item(AIR_PUMPS.small.name, !!eq.airPump, () => game.act((st) => (st.equipment.airPump = { spec: AIR_PUMPS.small, on: true }))),
      item(CO2_KITS.diy.name, !!eq.co2, () => game.act((st) => (st.equipment.co2 = { spec: CO2_KITS.diy, on: true }))),
    );
  }
  return h('div.stack', {}, tabs, content);
}

export function maintenancePanel({ game, toasts }: PanelContext): Node {
  const s = game.state;
  const eq = s.equipment;
  const toggle = (label: string, on: boolean, flip: (st: TankState) => void) =>
    h('div.item', {}, h('b', {}, label), button(on ? '開' : '關', () => game.act(flip), on ? 'primary' : ''));
  return h(
    'div.stack',
    {},
    eq.heater
      ? h(
          'div.item',
          {},
          h(
            'div',
            {},
            h('b', {}, `加熱棒 ${eq.heater.targetC}°C`),
            eq.heater.broken
              ? h('div.warn-text', {}, eq.heater.stuckOn ? '卡住一直加熱！先拔掉插頭，再到商店換一支' : '故障中，請到商店換一支')
              : null,
          ),
          eq.heater.stuckOn
            ? button('拔掉插頭', () => {
                game.act((st) => unplugHeater(st));
                toasts.show('拔掉加熱棒了，記得換一支新的', 'warn');
              }, 'primary')
            : h('div.row', {}, button('−', () => game.act((st) => setHeaterTarget(st, eq.heater!.targetC - 1))), button('+', () => game.act((st) => setHeaterTarget(st, eq.heater!.targetC + 1)))),
        )
      : null,
    eq.light
      ? h(
          'div.item',
          {},
          h('b', {}, `燈光 ${eq.light.startHour}:00 起 ${eq.light.photoperiodHours} 小時`),
          h('div.row', {}, button('−', () => game.act((st) => (st.equipment.light!.photoperiodHours = Math.max(0, eq.light!.photoperiodHours - 1)))), button('+', () => game.act((st) => (st.equipment.light!.photoperiodHours = Math.min(16, eq.light!.photoperiodHours + 1))))),
        )
      : null,
    eq.filter ? toggle('過濾器', eq.filter.on, (st) => {
      st.equipment.filter!.on = !st.equipment.filter!.on;
    }) : null,
    eq.airPump ? toggle('打氣機', eq.airPump.on, (st) => {
      st.equipment.airPump!.on = !st.equipment.airPump!.on;
    }) : null,
    eq.co2 ? toggle('CO₂（跟著燈光時程）', eq.co2.on, (st) => {
      st.equipment.co2!.on = !st.equipment.co2!.on;
    }) : null,
    h('h3', {}, '清潔與用藥'),
    h(
      'div.row.wrap',
      {},
      button('用缸水洗濾材', () => {
        game.act((st) => rinseFilterMedia(st, 'tank'));
        toasts.show('用換出來的缸水洗了濾材');
      }),
      button('用自來水洗濾材', () => {
        game.act((st) => rinseFilterMedia(st, 'tap'));
        toasts.show('用自來水洗了濾材', 'warn');
      }),
      button('下白點藥', () => {
        game.act((st) => doseIchMedication(st));
        toasts.show('下了一份白點藥（對蝦有毒）', 'warn');
      }),
    ),
  );
}

/** 開發用：顯示真實數值，方便調整平衡（玩家版不會有）。 */
export function debugPanel({ game }: PanelContext): Node {
  const s = game.state;
  const w = s.water;
  const rows: Array<[string, string]> = [
    ['水溫', `${w.tempC.toFixed(2)} °C`],
    ['TAN / 游離氨', `${w.tan.toFixed(3)} / ${freeAmmonia(s).toFixed(4)}`],
    ['NO₂ / NO₃', `${w.no2.toFixed(3)} / ${w.no3.toFixed(1)}`],
    ['pH / KH', `${w.ph.toFixed(2)} / ${w.kh.toFixed(2)}`],
    ['O₂ / CO₂', `${w.o2.toFixed(2)} / ${w.co2.toFixed(1)}`],
    ['殘餌 / 有機物', `${w.foodMg.toFixed(0)} / ${w.organicMg.toFixed(0)} mg`],
    ['亞硝化菌 / 硝化菌', `${s.bacteria.aob.toFixed(3)} / ${s.bacteria.nob.toFixed(3)}`],
    ['白點蟲 游走 / 包囊', `${w.ichPathogen.toFixed(2)} / ${w.ichCysts.toFixed(2)}`],
    ['藥物', w.medication.toFixed(2)],
    ['藻類', s.algae.toFixed(2)],
    ['躲藏係數', hidingFactor(s).toFixed(2)],
  ];
  return h(
    'div.stack',
    {},
    h('table.readings', {}, ...rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td.value', {}, v)))),
    h(
      'table.readings',
      {},
      ...s.fish.map((f) =>
        h('tr', {}, h('td', {}, fishName(f)), h('td.value', {}, f.alive ? `健康 ${f.health.toFixed(2)} 壓力 ${f.stress.toFixed(2)} 飢餓 ${f.hunger.toFixed(2)} ${f.ich.stage} ${f.lengthCm.toFixed(1)}cm${f.finDamage > 0 ? ` 鰭 ${f.finDamage.toFixed(2)}` : ''}${f.pregnancy > 0 ? ` 孕 ${f.pregnancy.toFixed(2)}` : ''}` : '死亡')),
      ),
      ...s.plants.map((p) => h('tr', {}, h('td', {}, PLANT_SPECIES[p.species].name), h('td.value', {}, `${p.biomassG.toFixed(2)} g 生長 ${(p.growthRate * 24).toFixed(3)}/天 葉藻 ${p.leafAlgae.toFixed(2)}`))),
    ),
  );
}
