import { describe, expect, it } from 'vitest';
import { addFish, addPlant, price, canClaimStarterPack, catchPests, comparePartner, markDailyFish, dailyTasks, economy, updateDaily, createTank, feed, FILTERS, HEATERS, LIGHTS, linkTanks, pinchMg, simulate, starterPackTank, TANKS, unplugHeater, type TankState } from '../sim';
import { crisisTodos, capsSummary, guideStep, heaterCanWait, lingering, wipedOut } from './status';
import { morningReport, REPORT_LINES, slimReport, snapshot } from './morning-report';
import { fishName } from './labels';

/** 養好水、一株草、10 尾孔雀魚的缸，加熱棒設 25°C。 */
function tank(seed = 31): TankState {
  const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed, matureMedia: true });
  s.hours = 20;
  addPlant(s, 'rotala');
  for (let i = 0; i < 10; i++) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
  return s;
}

/** 白天加熱棒卡住（事件不在昨晚），過了 n 晚。 */
function stuckSince(s: TankState, nights: number) {
  s.equipment.heater!.broken = true;
  s.equipment.heater!.stuckOn = true;
  for (let i = 0; i < nights; i++) {
    feed(s, pinchMg(s));
    simulate(s, 24);
  }
}

describe('危機排第一行（#375）', () => {
  it('白天卡住的加熱棒：之後每天早上都是第一行，3 行塞滿了也在，點了去設備', () => {
    const s = tank();
    stuckSince(s, 1);
    const before = snapshot([s]);
    simulate(s, 12);
    const r = morningReport(before, [s], 12, null);
    const slim = slimReport({ ...r, items: [...Array.from({ length: REPORT_LINES + 1 }, () => ({ kind: 'algae' as const, tank: 0, tone: 'warn' as const, text: '玻璃上的藻變多了' })), ...r.items] });
    expect(slim.lines[0]).toMatchObject({ kind: 'equipment', tone: 'bad', action: 'equipment', standing: true });
    expect(slim.lines[0].text).toContain('加熱棒卡住');
    expect(slim.rest.some((i) => i.text.includes('加熱棒'))).toBe(false);
  });

  it('同一晚熱死好幾尾：合成一行寫幾尾、死因，排第一行', () => {
    const s = tank();
    s.water.tempC = 36;
    s.equipment.heater!.broken = true;
    s.equipment.heater!.stuckOn = true;
    const before = snapshot([s]);
    simulate(s, 24);
    const r = morningReport(before, [s], 24, null);
    const deaths = r.items.filter((i) => i.kind === 'death' && !i.standing);
    const dead = s.fish.filter((f) => !f.alive).length;
    expect(dead).toBeGreaterThan(1);
    expect(deaths).toHaveLength(1);
    expect(deaths[0].text).toMatch(new RegExp(`^${dead} 尾孔雀魚死了。死因：水溫`));
    expect(slimReport(r).lines[0].tone).toBe('bad');
  });

  it('危機在別缸：右上角不寫「正常」，標籤換成那缸', () => {
    const a = tank(31);
    const b = tank(32);
    b.label = '繁殖缸';
    const tanks = [a, b];
    linkTanks(tanks);
    a.lastTest = { hours: a.hours, reading: { ammonia: 0, nitrite: 0, nitrate: 5, ph: 7.4, kh: 6 } } as never;
    expect(capsSummary(tanks, 0).value).toBe('正常');
    b.equipment.heater!.broken = true;
    b.equipment.heater!.stuckOn = true;
    expect(crisisTodos(tanks)).toMatchObject([{ tank: 1, go: 'equipment' }]);
    expect(capsSummary(tanks, 0)).toMatchObject({ tone: 'bad', value: '危險', label: '繁殖缸' });
  });

  it('驗收：加熱棒卡住，照第一行當天拔插頭，之後兩週死魚 ≤ 2 尾', () => {
    const s = tank();
    stuckSince(s, 1);
    const before = snapshot([s]);
    simulate(s, 12);
    const first = slimReport(morningReport(before, [s], 12, null)).lines[0];
    expect(first.action).toBe('equipment');
    unplugHeater(s);
    for (let d = 0; d < 14; d++) {
      feed(s, pinchMg(s));
      simulate(s, 24);
    }
    expect(s.fish.filter((f) => !f.alive).length).toBeLessThanOrEqual(2);
  });

  it('魚死光了（#377）：早上第一行說最後怎麼死的、叫玩家去買魚，任務卡指向商店；沒魚不說魚在睡覺', () => {
    const s = tank();
    economy(s).coins = 3000;
    s.water.tempC = 40;
    s.equipment.heater!.broken = true;
    s.equipment.heater!.stuckOn = true;
    simulate(s, 48);
    expect(s.fish.some((f) => f.alive)).toBe(false);
    // 撈掉屍體、拔插頭、換新加熱棒，水溫回來：剩下的只有「魚都沒了」
    s.fish = [];
    s.equipment.heater = { spec: HEATERS.h50, targetC: 25, broken: false, heating: false };
    s.water.tempC = 25;
    const before = snapshot([s]);
    simulate(s, 12);
    const r = morningReport(before, [s], 12, null);
    const first = slimReport(r).lines[0];
    expect(first).toMatchObject({ kind: 'wiped', tone: 'bad', action: 'shop_fish', standing: true });
    expect(first.text).toBe('缸裡的魚都沒了，最後一尾是水溫不適。手上還有 3000 元，到商店重新買魚');
    expect(r.items.some((i) => i.text.includes('睡覺'))).toBe(false);
    expect(wipedOut([s])).toMatchObject({ step: '魚都沒了，去商店重新買魚', claim: false });
    // 錢不多：叫玩家去領起步包
    economy(s).coins = 50;
    expect(wipedOut([s])).toMatchObject({ step: '魚都沒了，去商店領起步包', claim: true });
    // 很久以前死過魚、這次是全賣掉的：不說那尾的死因
    s.hours += 30 * 24;
    expect(wipedOut([s])!.text).toBe('缸裡的魚都沒了。阿德老闆送你一包起步魚（1 公 2 母），到商店領');
    // 又買了魚就不說
    addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
    expect(wipedOut([s])).toBeNull();
  });

  it('今天的小事「撈一次小螺」：這缸沒有螺、撈到 0 隻也算（g23）', () => {
    const a = tank(31);
    const b = tank(32);
    const tanks = [a, b];
    linkTanks(tanks);
    updateDaily(tanks);
    const d = dailyTasks(tanks)!;
    d.tasks = [{ id: 'pests', done: false }];
    expect(catchPests(b, true)).toBe(0);
    updateDaily(tanks);
    expect(dailyTasks(tanks)!.tasks[0].done).toBe(true);
  });
});

describe('壞加熱棒不佔住任務卡、死光先重新開始（#382）', () => {
  /** 加熱棒卡住、整缸熱死（屍體還在）。 */
  function cooked(s: TankState): void {
    s.water.tempC = 40;
    s.equipment.heater!.broken = true;
    s.equipment.heater!.stuckOn = true;
    simulate(s, 48);
    expect(s.fish.some((f) => f.alive)).toBe(false);
  }

  it('別缸馬上會出事的（死魚、卡住）排在這缸拔了插頭的壞加熱棒前面', () => {
    const a = tank(31);
    const b = tank(32);
    linkTanks([a, b]);
    a.equipment.heater!.broken = true;
    unplugHeater(a);
    b.equipment.heater!.broken = true;
    b.equipment.heater!.stuckOn = true;
    b.fish[0].alive = false;
    const c = crisisTodos([a, b]);
    expect(c.map((x) => x.tank)).toEqual([1, 1, 0]);
    expect(c[2]).toMatchObject({ text: '加熱棒壞了，換一支', go: 'equipment' });
    expect(lingering(c[2])).toBe(true);
    expect(c.slice(0, 2).some(lingering)).toBe(false);
  });

  it('死光那天：「魚都沒了、去領起步包」是第一行，排在死魚和加熱棒前面', () => {
    const s = tank();
    economy(s).coins = 50;
    cooked(s);
    const before = snapshot([s]);
    simulate(s, 12);
    const lines = slimReport(morningReport(before, [s], 12, null)).lines;
    expect(lines[0]).toMatchObject({ kind: 'wiped', action: 'shop_fish', goLabel: '去領' });
    expect(lines.slice(1).some((i) => i.text.includes('死魚'))).toBe(true);
  });

  it('說好要送的起步包：之後錢變多也領得到；缸裡又有魚就作廢', () => {
    const s = tank();
    economy(s).coins = 50;
    cooked(s);
    expect(economy(s).starterPackPromised).toBeDefined();
    economy(s).coins = 500;
    expect(canClaimStarterPack(s)).toBe(true);
    expect(wipedOut([s])).toMatchObject({ claim: true, step: '魚都沒了，去商店領起步包' });
    // 自己買了魚：作廢，下次死光再重新看錢夠不夠
    addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
    simulate(s, 1);
    expect(economy(s).starterPackPromised).toBeUndefined();
    // 沒說好過、錢又多：照舊不送
    const rich = tank(33);
    economy(rich).coins = 500;
    cooked(rich);
    expect(canClaimStarterPack(rich)).toBe(false);
  });
});

describe('比一比只點了一尾（g25）', () => {
  it('提示還沒點的那尾；兩尾都點了才算、不再提示', () => {
    const s = tank();
    const tanks = [s];
    updateDaily(tanks);
    const [a, b, c] = s.fish;
    dailyTasks(tanks)!.tasks = [{ id: 'goalCompare', done: false, subjectId: a.id, otherId: b.id }];
    expect(comparePartner(tanks, c.id)).toBeNull();
    markDailyFish(tanks, b.id);
    expect(comparePartner(tanks, b.id)?.id).toBe(a.id);
    markDailyFish(tanks, a.id);
    expect(comparePartner(tanks, a.id)).toBeNull();
    updateDaily(tanks);
    expect(dailyTasks(tanks)!.tasks[0].done).toBe(true);
  });

  it('魚的編號只留每缸那段，不寫 8 位數（g26）', () => {
    const f = { ...tank().fish[0], id: 10_000_003 };
    expect(fishName(f)).toMatch(/ #3$/);
  });
});

describe('拔了插頭的壞加熱棒不卡住任務卡（#388，g26）', () => {
  /** 兩缸，繁殖缸的加熱棒壞了、拔了插頭，手上 200 元。 */
  function broke(roomTempC = 24.8) {
    const a = tank(31);
    const b = tank(32);
    b.label = '繁殖缸';
    const tanks = [a, b];
    linkTanks(tanks);
    for (const t of tanks) {
      t.environment.roomTempC = roomTempC;
      t.environment.roomSwingC = 2.3;
    }
    b.equipment.heater!.broken = true;
    unplugHeater(b);
    economy(a).coins = 200;
    return { tanks, b };
  }

  it('室溫孔雀魚撐得住：任務卡先說別的；生白點時叫你下藥', () => {
    const { tanks, b } = broke();
    expect(crisisTodos(tanks).filter(lingering)).toHaveLength(1);
    expect(heaterCanWait(b)).toBe(true);
    expect(guideStep(tanks, 'g')?.text ?? '').not.toContain('加熱棒');
    b.fish[0].ich = { stage: 'visible', progress: 0, cause: 'relapse' };
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'treat', text: '有魚生病了，去下藥' });
  });

  it('房間太冷：還是叫你換；錢不夠就說還差多少、先交訂單湊錢', () => {
    const { tanks, b } = broke(20);
    expect(heaterCanWait(b)).toBe(false);
    const cost = price(`heater:${b.equipment.heater!.spec.id}`);
    expect(cost).toBeGreaterThan(200);
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'orders', text: `繁殖缸：加熱棒壞了，換一支要 ${cost} 元（還差 ${cost - 200} 元），先交訂單湊錢` });
    economy(b).coins = cost;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'equipment', tank: 1, text: '繁殖缸：加熱棒壞了，換一支' });
    // 生病還是先下藥
    b.fish[0].ich = { stage: 'visible', progress: 0, cause: 'relapse' };
    expect(guideStep(tanks, 'g')?.target).toBe('treat');
  });

  it('這缸沒有魚：先放著', () => {
    const { b } = broke(20);
    b.fish = [];
    expect(heaterCanWait(b)).toBe(true);
  });
});

describe('起步包放對缸、買不起藥有下一步（#391，g27）', () => {
  function two(roomTempC = 20) {
    const a = tank(31);
    const b = tank(32);
    b.label = '繁殖缸';
    const tanks = [a, b];
    linkTanks(tanks);
    for (const t of tanks) t.environment.roomTempC = roomTempC;
    return { tanks, a, b };
  }

  it('起步包不放進加熱棒壞掉的缸，就算正在看那缸', () => {
    const { tanks, b } = two();
    b.equipment.heater!.broken = true;
    unplugHeater(b);
    expect(starterPackTank(tanks, 1)).toBe(0);
  });

  it('兩缸一樣好：放目前這缸', () => {
    const { tanks } = two();
    expect(starterPackTank(tanks, 1)).toBe(1);
    expect(starterPackTank(tanks, 0)).toBe(0);
  });

  it('還有白點蟲的缸往後排', () => {
    const { tanks, a } = two();
    a.water.ichCysts = 0.5;
    expect(starterPackTank(tanks, 0)).toBe(1);
  });

  it('藥買不起：說還差多少、先交訂單湊錢；錢夠就叫下藥', () => {
    const { tanks, b } = two(24);
    b.fish[0].ich = { stage: 'visible', progress: 0, cause: 'relapse' };
    const cost = price('med:ich');
    economy(b).coins = 25;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'orders', text: `藥要 ${cost} 元（還差 ${cost - 25} 元），先交訂單湊錢` });
    economy(b).coins = cost;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'treat', text: '有魚生病了，去下藥' });
  });

  it('藥買不起但背包有特效藥：照樣叫去下藥', () => {
    const { tanks, b } = two(24);
    b.fish[0].ich = { stage: 'visible', progress: 0, cause: 'relapse' };
    economy(b).coins = 25;
    economy(b).mall = { cure: 1, tankset: 0 };
    expect(guideStep(tanks, 'g')?.target).toBe('treat');
  });
});
