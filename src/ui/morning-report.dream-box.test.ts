import { describe, expect, it } from 'vitest';
import { addFish, addPlant, BOX_DUE, boxBlock, DENSE_COVER, buyNurseryBox, clearBoxForMom, createTank, daysToBirth, FILTERS, HEATERS, ID_BLOCK, LIGHTS, nextStep, plantCover, TANKS, type Fish, type TankState } from '../sim';
import { choiceState } from '../sim/choices';
import { lineGroup, morningReport, slimReport, snapshot } from './morning-report';

/** 養好水、一公一母孔雀魚的缸。 */
function tank(seed: number, volume: 'nano20' | 'std40'): TankState {
  const s = createTank({ tank: TANKS[volume], filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed, matureMedia: true });
  s.hours = 20;
  for (const sex of ['male', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false }).ageDays = 120;
  return s;
}

/**
 * g41 A 局：主缸水草密，繁殖缸沒草；留種那對在繁殖缸，C15 選了「等快生再放育幼盒」，
 * 繁殖缸的育幼盒卻被上一窩 11 尾小魚佔著。夢想窩剩 days 天生。
 */
function g41(days: number, densePlants = true) {
  const home = tank(21, 'std40');
  // 每株最多蓋 35%（polish-to-9.md §13）：種到夠密（≥ DENSE_COVER）
  if (densePlants) while (plantCover(home) < DENSE_COVER) addPlant(home, 'moss');
  const breeding = tank(22, 'nano20');
  breeding.purpose = 'breeding';
  buyNurseryBox(breeding);
  for (let i = 0; i < 11; i++) Object.assign(addFish(breeding, 'guppy', { carriesIch: false, carries: [], pregnant: false }), { lengthCm: 0.9, ageDays: 6, generation: 1, nursery: true });
  // 真的存檔裡每缸的魚編號不重複（ID_BLOCK）；測試各自開缸，手動錯開
  for (const f of breeding.fish) f.id += ID_BLOCK;
  const tanks = [home, breeding];
  const mom = breeding.fish.find((f) => f.sex === 'female' && f.ageDays === 120)!;
  const dad = breeding.fish.find((f) => f.sex === 'male' && f.ageDays === 120)!;
  const s = choiceState(tanks);
  s.pair = [mom.id, dad.id];
  mom.sire = { id: dad.id, lineage: dad.id, inbreeding: 0, genome: dad.genome! };
  s.reveal = { momId: mom.id, hours: home.hours, box: true };
  dueIn(breeding, mom, days);
  return { tanks, home, breeding, mom };
}

function dueIn(t: TankState, mom: Fish, days: number) {
  mom.pregnancy = 0.5;
  const total = daysToBirth(t, mom)! * 2;
  mom.pregnancy = 1 - days / total;
}

/** 過一晚（只推時間，不跑模擬，免得懷孕往前走）。 */
function night(tanks: TankState[]) {
  const before = snapshot(tanks);
  for (const t of tanks) t.hours += 12;
  return morningReport(before, tanks, 12, null);
}

describe('選了等快生再放育幼盒、盒子卻被小魚佔著（g41 #457）', () => {
  it('開獎前 4 天起，早上緊接倒數說盒子被佔著、小魚搬去哪；點了把小魚搬走', () => {
    const { tanks, home, breeding, mom } = g41(3.5);
    expect(plantCover(breeding)).toBe(0);
    const r = night(tanks);
    const line = r.items.find((i) => i.kind === 'box_block')!;
    expect(line).toMatchObject({ tank: 1, tone: 'warn', action: 'clear_box', subjectId: mom.id });
    expect(line.text).toMatch(/^.+母魚快生了，育幼盒還被 11 尾小魚佔著：小魚搬去.+，盒子留給她$/);
    // 不會被 3 行上限擠掉：排在其他壞消息前面
    expect(slimReport(r).lines[0].kind).toBe('box_block');
    // 任務卡也說同一件事
    expect(nextStep(tanks)).toMatchObject({ target: 'clear_box', tank: 1 });
    expect(nextStep(tanks)!.text).toMatch(/^夢想窩的媽媽快生了，育幼盒還被 11 尾小魚佔著/);
    // 點了：11 尾慢慢對水搬到水草密的主缸；她還沒快到要放盒子（< BOX_DUE），盒子先空著
    const done = clearBoxForMom(tanks)!;
    expect(done).toMatchObject({ to: 0, count: 11, momId: mom.id });
    expect(home.fish.filter((f) => f.generation === 1)).toHaveLength(11);
    expect(boxBlock(tanks)).toBeNull();
    // 快生了：照 C15 自己放進去，說一聲
    dueIn(breeding, mom, 2.5);
    expect(mom.pregnancy).toBeGreaterThanOrEqual(BOX_DUE);
    const echo = night(tanks).items.find((i) => i.kind === 'echo' && i.echo === '等快生再放育幼盒');
    expect(mom.nursery).toBe(true);
    expect(echo?.text).toMatch(/快生了，照你選的放進育幼盒待產，這一窩一尾都不會被吃$/);
  });

  it('已經快生（≥ BOX_DUE）才點：小魚搬走、媽媽直接放進盒子', () => {
    const { tanks, mom } = g41(2.5);
    // 倒數開始了：緊接在倒數後面
    expect(slimReport(night(tanks)).lines.slice(0, 2).map((i) => i.kind)).toEqual(['countdown', 'box_block']);
    expect(mom.nursery).toBeFalsy();
    expect(clearBoxForMom(tanks)).toMatchObject({ count: 11, placed: true });
    expect(mom.nursery).toBe(true);
  });

  it('別缸也收不了（有大魚、草不夠密）：說繁殖缸水草多少、按鈕叫玩家種水草，任務卡不出這一步', () => {
    const { tanks } = g41(3, false);
    const line = night(tanks).items.find((i) => i.kind === 'box_block')!;
    expect(line.text).toMatch(/育幼盒還被 11 尾小魚佔著，別缸也收不了小魚。.+水草才 0%，先種密一點，這窩比較躲得住$/);
    expect(line).toMatchObject({ action: 'shop_plants', goLabel: '種水草', tank: 1 });
    expect(nextStep(tanks)?.target).not.toBe('clear_box');
    expect(clearBoxForMom(tanks)).toBeNull();
  });

  it('別缸也收不了、但那缸草已經夠密（≥ 60%）：只是提醒，不叫玩家做事（#460 架構 🟡）', () => {
    const { tanks } = g41(3, false);
    while (plantCover(tanks[1]) < DENSE_COVER) addPlant(tanks[1], 'moss');
    const line = night(tanks).items.find((i) => i.kind === 'box_block')!;
    expect(line.text).toMatch(/別缸也收不了小魚。.+水草 \d+%，這窩大多躲得住$/);
    expect(line).toMatchObject({ tone: 'info' });
    expect(line.action).toBeUndefined();
    expect(lineGroup(line)).toBe('good');
  });

  it('還早（超過 4 天）、沒選育幼盒、或盒裡的小魚夠大放得出去：不說', () => {
    expect(boxBlock(g41(6).tanks)).toBeNull();
    const plants = g41(3);
    choiceState(plants.tanks).reveal!.box = undefined;
    expect(boxBlock(plants.tanks)).toBeNull();
    const big = g41(3);
    for (const f of big.breeding.fish) if (f.generation === 1) f.lengthCm = 1.55;
    expect(boxBlock(big.tanks)).toBeNull();
  });
});
