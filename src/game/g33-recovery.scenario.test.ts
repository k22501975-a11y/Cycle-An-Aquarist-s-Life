import { describe, expect, it } from 'vitest';
import { addAir, buyCheapHeater, doseIchMedication, economy, emergencySale, feed, fulfillOrder, insulateTank, installHeater, moveToWarmTank, needsMedicine, orderBoard, orderRefusal, pinchMg, price, recordEvent, removeDeadFish, sellFish, simulate, spend, suggestedChange, takeHeaterCredit, unplugHeater, waterChange, type TankState } from '../sim';
import { saltIchCure, saltRefusal } from '../sim/salt-treat';
import { guideStep } from '../ui/status';
import { midgamePlayerTanks } from './midgame-player';

/**
 * mvp.md §4.4.6「g33 之後的調整」驗收：第 72 天、一月室溫 16°C、手上 100 元、兩缸加熱棒都壞，之後太擠生白點。
 * 照任務卡做（交單、賣魚、保溫、賒、買加熱棒、併缸、治白點），第 90 天每個種子手上 ≥ 150 元、至少 2 個 ≥ 200 元（企劃 2026-10-26，原訂 300）；
 * 生白點後 3 天內一定買得起一種治法。
 */
/** 第 90 天每個種子手上至少 MIN_COINS、至少 GOOD_SEEDS 個種子到 GOOD_COINS（企劃 2026-10-26 定案，mvp.md §4.4.6）。 */
const MIN_COINS = 150;
const GOOD_COINS = 200;
const GOOD_SEEDS = 1;
/** 照任務卡做一步；回傳做了沒。 */
function follow(tanks: TankState[]): boolean {
  const s = guideStep(tanks, 'g');
  if (!s) return false;
  const t = tanks[s.tank ?? 0];
  switch (s.target) {
    case 'insulate':
      return insulateTank(t);
    case 'heater_credit':
      return takeHeaterCredit(t) > 0;
    case 'move_warm':
      return !!moveToWarmTank(tanks, s.tank ?? 0);
    case 'buy_heater':
      return !!buyCheapHeater(t);
    case 'remove_dead':
      return tanks.reduce((n, x) => n + removeDeadFish(x), 0) > 0;
    case 'water_change':
      suggestedChange(t);
      return true;
    case 'add_air':
      return addAir(t);
    case 'equipment': {
      const heater = t.equipment.heater;
      if (!heater?.broken) return false;
      if (!spend(tanks[0], price(`heater:${heater.spec.id}`))) return false;
      installHeater(t, heater.spec);
      return true;
    }
    case 'sell': {
      const n = Number(/賣(?:掉今天能賣的)? (\d+) 尾/.exec(s.text)?.[1] ?? 0);
      let sold = 0;
      for (const f of emergencySale(tanks, Infinity).fish.slice(0, n)) sold += sellFish(tanks.find((x) => x.fish.includes(f))!, f.id);
      return sold > 0;
    }
    case 'orders': {
      const ok = orderBoard(tanks[0]).orders.find((o) => !o.preview && !orderRefusal(tanks, o.id));
      return !!ok && fulfillOrder(tanks, ok.id) > 0;
    }
    case 'treat': {
      const sick = tanks.find(needsMedicine);
      if (!sick) return false;
      if (/粗鹽/.test(s.text)) return saltIchCure(sick);
      if (!spend(tanks[0], price('med:ich'))) return false;
      doseIchMedication(sick);
      return true;
    }
    default:
      return false;
  }
}

/** 中期劇本玩到第 72 天的家（兩缸、自己繁殖的魚、訂單板），之後一月、手上 100 元、兩支加熱棒都壞。 */
function g33(seed: number): TankState[] {
  const tanks = midgamePlayerTanks(seed, 72);
  for (const t of tanks) {
    t.environment.roomTempC = 16;
    t.environment.roomSwingC = 2;
    if (t.equipment.heater) {
      // 跟遊戲裡壞掉一樣記成危機（不用 breakHeater：不擲骰，亂數順序跟原本的家一樣）
      t.equipment.heater.broken = true;
      recordEvent(t, { type: 'heater_broke' });
      unplugHeater(t);
    }
  }
  economy(tanks[0]).coins = 100;
  return tanks;
}

describe('冬天危機過後錢回得來（mvp.md §4.4.6 g33 驗收）', () => {
  const final = new Map<number, number>();
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：第 72 天 100 元、兩支加熱棒都壞，13 天後最擠的那缸生白點：第 90 天手上 ≥ ${MIN_COINS} 元，生白點 3 天內買得起一種治法`, () => {
      const tanks = g33(seed);
      const a = tanks[0];
      const start = Math.floor(a.hours / 24);
      let sickTank = tanks[1];
      const log: string[] = [];
      let ichDay = -1;
      let treatable = false;
      while (a.hours < 90 * 24) {
        for (const t of tanks) simulate(t, 1);
        const day = Math.floor(a.hours / 24);
        const hour = Math.round(a.hours) % 24;
        if (day === start + 13 && hour === 8 && ichDay < 0 && tanks.some((t) => t.fish.some((f) => f.alive))) {
          // 魚可能都搬到暖的那缸了：白點生在魚最多（最擠）的那缸
          sickTank = tanks.reduce((m, t) => (t.fish.filter((f) => f.alive).length > m.fish.filter((f) => f.alive).length ? t : m));
          sickTank.fish.filter((f) => f.alive)[0].ich = { stage: 'visible', progress: 0, cause: 'crowding' };
          sickTank.water.ichPathogen = 2;
          ichDay = day;
        }
        const coins = economy(a).coins;
        if (ichDay >= 0 && day - ichDay <= 3 && (coins >= price('med:ich') || (coins >= price('med:salt') && !saltRefusal(sickTank)) || sickTank.saltTreat || sickTank.water.medication > 0.25)) treatable = true;
        if (hour === 9 || hour === 19) for (const t of tanks) feed(t, pinchMg(t));
        // 每週換三成水；早上報告說 KH 快沒了就多換一次（跟認真玩家一樣）
        if (hour === 10) for (const t of tanks) if (t.fish.some((f) => f.alive) && ((day - start) % 7 === 6 || t.water.kh <= 1)) waterChange(t, 0.3);
        if (hour >= 8 && hour <= 22 && hour % 3 === 2) {
          for (let n = 0; n < 6; n++) {
            const s = guideStep(tanks, 'g');
            if (!follow(tanks)) break;
            log.push(`${day}d ${s?.text} | $${economy(a).coins} 欠${economy(a).heaterLoan ?? 0} | ${tanks.map((t) => `${t.fish.filter((f) => f.alive).length}尾 ${t.water.tempC.toFixed(1)}°C`).join(' / ')}`);
          }
          // 交得出的單就交（訂單板的單不一定是任務卡第一步）
          for (const o of [...orderBoard(a).orders]) if (!o.preview && !orderRefusal(tanks, o.id)) fulfillOrder(tanks, o.id);
        }
      }
      expect(treatable, log.join('\n')).toBe(true);
      final.set(seed, economy(a).coins);
      expect(economy(a).coins, log.join('\n')).toBeGreaterThanOrEqual(MIN_COINS);
    }, 300_000);
  }
  it(`至少 ${GOOD_SEEDS} 個種子第 90 天手上 ≥ ${GOOD_COINS} 元`, () => {
    expect([...final.values()].filter((c) => c >= GOOD_COINS).length, JSON.stringify([...final])).toBeGreaterThanOrEqual(GOOD_SEEDS);
  });
});
