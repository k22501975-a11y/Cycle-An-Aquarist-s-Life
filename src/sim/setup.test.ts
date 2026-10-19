import { describe, expect, it } from 'vitest';
import { blankGameState, Game, newGameState } from '../game/game';
import { applySetup, economy, needsSetup, RECOMMENDED_SETUP, setupCards, setupCost, setupRefusal, STARTING_COINS, withTank, type SetupChoice } from '.';

describe('開缸（F1-a）', () => {
  it('新遊戲是空缸＋起始資金，還沒有設備', () => {
    const s = blankGameState(1);
    expect(needsSetup(s)).toBe(true);
    expect(economy(s).coins).toBe(STARTING_COINS);
    expect(s.equipment.filter).toBeNull();
    expect(s.equipment.heater).toBeNull();
    expect(s.equipment.light).toBeNull();
    expect(s.equipment.substrate).toBeUndefined();
  });

  it('推薦組合 1,400，買完剩 2,000；設備照選的裝上', () => {
    const s = blankGameState(1);
    expect(setupCost(RECOMMENDED_SETUP)).toBe(1400);
    expect(applySetup(s, RECOMMENDED_SETUP)).toBeNull();
    expect(needsSetup(s)).toBe(false);
    expect(economy(s).coins).toBe(2000);
    expect(s.equipment.tank.id).toBe('std40');
    expect(s.equipment.filter?.spec.id).toBe('hangOn');
    expect(s.equipment.heater?.spec.id).toBe('h50');
    expect(s.equipment.light?.spec.id).toBe('basic');
    expect(s.equipment.substrate?.spec.id).toBe('sand');
    expect(s.equipment.airPump).toBeNull();
    expect(setupRefusal(s, RECOMMENDED_SETUP)).toBe('已經開過缸了');
  });

  it('選 20L 缸、打氣機、水草泥都照實裝上', () => {
    const s = blankGameState(1);
    const c: SetupChoice = { tank: 'nano20', filter: 'sponge', heater: 'h25', light: 'planted', substrate: 'soil', air: 'small' };
    expect(applySetup(s, c)).toBeNull();
    expect(s.equipment.tank.volumeL).toBe(20);
    expect(s.equipment.airPump?.spec.id).toBe('small');
    expect(s.equipment.substrate?.spec.id).toBe('soil');
    expect(economy(s).coins).toBe(STARTING_COINS - setupCost(c));
  });

  it('錢不夠、選了還沒解鎖的缸就不開，什麼都不改', () => {
    const s = blankGameState(1);
    const canister: SetupChoice = { ...RECOMMENDED_SETUP, filter: 'canister', light: 'planted' };
    expect(applySetup(s, canister)).toMatch('錢不夠');
    expect(applySetup(s, { ...RECOMMENDED_SETUP, tank: 'std90' as SetupChoice['tank'] })).toMatch('第一缸');
    expect(needsSetup(s)).toBe(true);
    expect(economy(s).coins).toBe(STARTING_COINS);
    expect(s.equipment.filter).toBeNull();
  });

  it('每類 2～3 張卡，都有價錢和取捨；推薦的加熱棒跟著缸的大小', () => {
    const cards = setupCards();
    expect(cards.map((c) => c.category)).toEqual(['tank', 'filter', 'heater', 'light', 'substrate', 'air']);
    for (const c of cards) {
      expect(c.options.length).toBeGreaterThanOrEqual(2);
      expect(c.options.length).toBeLessThanOrEqual(3);
      expect(c.options.filter((o) => o.recommended)).toHaveLength(1);
      for (const o of c.options) expect(o.pro && o.con).toBeTruthy();
    }
    const heater = (choice: SetupChoice) => setupCards(choice).find((c) => c.category === 'heater')!.options.find((o) => o.recommended)!.id;
    expect(heater(RECOMMENDED_SETUP)).toBe('h50');
    expect(heater(withTank(RECOMMENDED_SETUP, 'nano20'))).toBe('h25');
    expect(withTank(RECOMMENDED_SETUP, 'nano20').heater).toBe('h25');
    // 玩家自己改過的加熱棒，換缸時不幫他改回去
    expect(withTank({ ...RECOMMENDED_SETUP, heater: 'h100' }, 'nano20').heater).toBe('h100');
  });

  it('選錯不擋，卡上有老闆的提醒', () => {
    const cards = setupCards(RECOMMENDED_SETUP);
    const option = (cat: string, id: string) => cards.find((c) => c.category === cat)!.options.find((o) => o.id === id)!;
    expect(option('heater', 'h25').warning).toMatch('25W');
    expect(option('light', 'planted').warning).toMatch('CO₂');
    expect(option('filter', 'hangOn').warning).toBeUndefined();
    expect(option('tank', 'std90').locked).toBeTruthy();
  });

  it('還沒開缸時間不走，開完才開始跑（也不會一口氣補算等待的時間）', () => {
    const game = new Game(blankGameState(1), 3600);
    const h = game.state.hours;
    expect(game.advance(60_000)).toBe(0);
    expect(game.state.hours).toBe(h);
    game.act((s) => applySetup(s, RECOMMENDED_SETUP));
    expect(game.advance(1000)).toBeGreaterThan(0);
    expect(game.state.hours - h).toBeLessThan(2);
  });

  it('測試用的 newGameState 就是用推薦組合開好的缸', () => {
    const s = newGameState(1);
    expect(needsSetup(s)).toBe(false);
    expect(economy(s).coins).toBe(2000);
  });
});
