import { describe, expect, it } from 'vitest';
import { addFish, addPlant, price, canClaimStarterPack, catchPests, comparePartner, markDailyFish, dailyTasks, economy, updateDaily, createTank, feed, FILTERS, HEATERS, LIGHTS, linkTanks, pinchMg, simulate, starterPackTank, TANKS, unplugHeater, canDeliverAnyOrder, emergencySale, orderBoard, starterPackAllCold, moveToWarmTank, needsInsulation, warmMove, warmMoveRefusal, cheapHeater, buyCheapHeater, coldestRoomC, sellFish, creditTarget, heaterCreditRefusal, takeHeaterCredit, fishBuybackPrice, type ShopOrder, type TankSpec, type TankState } from '../sim';
import { crisisTodos, capsSummary, guideStep, heaterCanWait, lingering, warmMoveStep, wipedOut } from './status';
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

  it('房間太冷：還是叫你換；錢不夠就說還差多少、沒單可交就叫你賣魚湊（#397）', () => {
    const { tanks, b } = broke(20);
    expect(heaterCanWait(b)).toBe(false);
    const cost = price(`heater:${b.equipment.heater!.spec.id}`);
    expect(cost).toBeGreaterThan(200);
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'sell', text: `繁殖缸：加熱棒壞了，換一支要 ${cost} 元（還差 ${cost - 200} 元），賣 3 尾魚給水族店（約 175 元）湊錢` });
    economy(b).coins = cost;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'equipment', tank: 1, text: '繁殖缸：加熱棒壞了，換一支' });
    // 生病還是先下藥
    b.fish[0].ich = { stage: 'visible', progress: 0, cause: 'relapse' };
    expect(guideStep(tanks, 'g')?.target).toBe('treat');
  });

  it('室溫撐得住但錢夠換：還是叫你換，不要放到冬天（#394，g28）', () => {
    const { tanks, b } = broke();
    const cost = price(`heater:${b.equipment.heater!.spec.id}`);
    economy(b).coins = cost + 1000;
    expect(heaterCanWait(b)).toBe(true);
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'equipment', tank: 1, text: '繁殖缸：加熱棒壞了，換一支' });
  });

  it('冬天水溫偏低、加熱棒壞了：直接說換一支；錢不夠就說還差多少、賣魚湊錢（#395、#397，g28）', () => {
    const { tanks, b } = broke(16);
    b.water.tempC = 19;
    // 先保溫（#397）：今天保溫過了才往下說換加熱棒
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'insulate', tank: 1, text: '繁殖缸：水溫偏低（19.0°C），先保溫：缸外包毛巾、泡溫水瓶（第 1 缸已經滿了，搬不過去）' });
    b.insulatedDay = Math.floor(b.hours / 24);
    const cost = price(`heater:${b.equipment.heater!.spec.id}`);
    expect(crisisTodos(tanks).find((c) => c.tank === 1 && c.text.startsWith('水溫偏低'))?.text).toBe('水溫偏低（19.0°C），加熱棒壞了，換一支');
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'sell', text: `繁殖缸：水溫偏低，加熱棒壞了，換一支要 ${cost} 元（還差 ${cost - 200} 元），賣 3 尾魚給水族店（約 175 元）湊錢（第 1 缸已經滿了，搬不過去）` });
    economy(b).coins = cost;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'equipment', tank: 1, text: '繁殖缸：水溫偏低（19.0°C），加熱棒壞了，換一支' });
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

  /** 兩缸的魚都死光了（每缸都死過魚）。 */
  function wiped(roomTempC = 20) {
    const x = two(roomTempC);
    for (const t of x.tanks) {
      t.fish = [];
      t.events.push({ type: 'fish_died', hours: t.hours } as (typeof t.events)[number]);
    }
    economy(x.a).coins = 50;
    return x;
  }

  it('起步包不放進加熱棒壞掉的缸，就算正在看那缸', () => {
    const { tanks, b } = wiped();
    b.equipment.heater!.broken = true;
    unplugHeater(b);
    expect(starterPackTank(tanks, 1)).toBe(0);
  });

  it('兩缸一樣好：放目前這缸', () => {
    const { tanks } = wiped();
    expect(starterPackTank(tanks, 1)).toBe(1);
    expect(starterPackTank(tanks, 0)).toBe(0);
  });

  it('還沒養好水的新缸比有白點蟲的缸更往後排（#392 架構）', () => {
    const { tanks, a, b } = wiped();
    a.water.ichCysts = 0.5;
    b.bacteria = { aob: 0.02, nob: 0.02 };
    expect(starterPackTank(tanks, 1)).toBe(0);
  });

  it('領不到的缸不挑：從來沒養過魚的缸不會被選到（#392 架構）', () => {
    const { tanks, a, b } = wiped();
    b.events = b.events.filter((e) => e.type !== 'fish_died');
    expect(canClaimStarterPack(b, [a])).toBe(false);
    expect(starterPackTank(tanks, 1)).toBe(0);
  });

  it('還有白點蟲的缸往後排', () => {
    const { tanks, a } = wiped();
    a.water.ichCysts = 0.5;
    expect(starterPackTank(tanks, 0)).toBe(1);
  });

  it('藥買不起：說還差多少、賣魚湊錢；錢夠就叫下藥', () => {
    const { tanks, b } = two(24);
    b.fish[0].ich = { stage: 'visible', progress: 0, cause: 'relapse' };
    const cost = price('med:ich');
    economy(b).coins = 25;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'sell', text: `藥要 ${cost} 元（還差 ${cost - 25} 元），賣 3 尾魚給水族店（約 175 元）湊錢` });
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

describe('沒單可交時怎麼湊錢（#397，g29）', () => {
  function cold() {
    const a = tank(31);
    const b = tank(32);
    b.label = '繁殖缸';
    const tanks = [a, b];
    linkTanks(tanks);
    for (const t of tanks) t.environment.roomTempC = 16;
    b.equipment.heater!.broken = true;
    unplugHeater(b);
    b.water.tempC = 19;
    economy(a).coins = 98;
    b.insulatedDay = Math.floor(b.hours / 24);
    return { tanks, a, b };
  }

  it('有交得出的單：叫你交單', () => {
    const { tanks, a } = cold();
    economy(a).cuttings = { rotala: 3 };
    orderBoard(a).orders = [{ id: 990, kind: 'cutting', plant: 'rotala', count: 1, unitPrice: 20, postedHours: a.hours } as ShopOrder];
    expect(canDeliverAnyOrder(tanks)).toBe(true);
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'orders' });
    expect(guideStep(tanks, 'g')?.text).toContain('先交訂單湊錢');
  });

  it('單交不出：叫你賣幾尾、約多少錢；留最好的一公一母成魚', () => {
    const { tanks, a } = cold();
    orderBoard(a).orders = [];
    const sale = emergencySale(tanks, 350 - 98);
    expect(sale.coins).toBeGreaterThanOrEqual(350 - 98);
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'sell', text: `繁殖缸：水溫偏低，加熱棒壞了，換一支要 350 元（還差 252 元），賣 ${sale.count} 尾魚給水族店（約 ${sale.coins} 元）湊錢（第 1 缸已經滿了，搬不過去）` });
    // 全部要賣也會留下一公一母成魚
    const all = emergencySale(tanks, 1_000_000);
    const left = tanks.flatMap((t) => t.fish).filter((f) => !all.fish.includes(f));
    expect(left.some((f) => f.sex === 'male')).toBe(true);
    expect(left.some((f) => f.sex === 'female')).toBe(true);
  });

  it('今天的收購次數用完了：只能等訂單', () => {
    const { tanks, a } = cold();
    orderBoard(a).orders = [];
    economy(a).sold = { day: Math.floor(a.hours / 24), count: 99 };
    expect(emergencySale(tanks, 252).count).toBe(0);
    // 單交不出、魚也賣不了、水又冷：跟阿德賒一支（mvp.md §4.4.6）
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'heater_credit', tank: 1, text: '繁殖缸：水太冷了，阿德說可以先賒一支加熱棒（350 元，有錢再還）（第 1 缸已經滿了，搬不過去）' });
    // 還欠著就不能再賒，只能等訂單
    economy(a).heaterLoan = 100;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'orders' });
  });
});

describe('兩缸都冷時先提醒再給起步包（#397，g29）', () => {
  function wipedCold() {
    const a = tank(31);
    const b = tank(32);
    b.label = '繁殖缸';
    const tanks = [a, b];
    linkTanks(tanks);
    for (const t of tanks) {
      t.environment.roomTempC = 16;
      t.water.tempC = 15.5;
      t.equipment.heater!.broken = true;
      unplugHeater(t);
      t.fish = [];
      t.events.push({ type: 'fish_died', hours: t.hours, cause: 'temperature' } as (typeof t.events)[number]);
    }
    economy(a).coins = 64;
    // 死光那一刻就說好要送了（noteStarterPack），之後錢變多也照樣領得到
    economy(a).starterPackPromised = a.hours;
    return { tanks, a, b };
  }

  it('每一缸都太冷：先叫你弄加熱棒，錢不夠就說還差多少', () => {
    const { tanks, a } = wipedCold();
    expect(starterPackAllCold(tanks)).toBe(true);
    const w = wipedOut(tanks)!;
    expect(w.claim).toBe(true);
    expect(w.text).toContain('起步魚放進去也會冷死');
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'heater_credit', text: '魚都沒了，第 1 缸水太冷了，阿德說可以先賒一支加熱棒（350 元，有錢再還）' });
    economy(a).heaterLoan = 100;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'orders' });
    expect(guideStep(tanks, 'g')?.text).toMatch(/^魚都沒了，水太冷，.+換一支加熱棒要 350 元（還差 286 元）/);
    economy(a).coins = 400;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'equipment', text: expect.stringContaining('再領起步包') });
  });

  it('有一缸加熱棒好、水溫也夠：照常去領，放進那缸', () => {
    const { tanks, b } = wipedCold();
    b.equipment.heater!.broken = false;
    b.water.tempC = 25;
    expect(starterPackAllCold(tanks)).toBe(false);
    expect(starterPackTank(tanks, 0)).toBe(1);
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'shop_fish', text: '魚都沒了，去商店領起步包' });
  });

  it('加熱棒剛換好、水還沒回溫的缸往後排', () => {
    const { tanks, a, b } = wipedCold();
    for (const t of [a, b]) t.equipment.heater!.broken = false;
    a.water.tempC = 25;
    b.water.tempC = 36;
    expect(starterPackTank(tanks, 1)).toBe(0);
  });
});

describe('早上報告：先保溫、還阿德多少（#397）', () => {
  it('冷到要救急：第一行叫你保溫；還錢的那晚說還剩多少', () => {
    const s = tank();
    s.environment.roomTempC = 16;
    s.equipment.heater!.broken = true;
    unplugHeater(s);
    s.water.tempC = 19;
    economy(s).heaterLoan = 280;
    const before = snapshot([s]);
    economy(s).heaterLoan = 200;
    const r = morningReport(before, [s], 1, null);
    const slim = slimReport(r);
    expect(slim.lines[0]).toMatchObject({ action: 'insulate', goLabel: '保溫' });
    expect(slim.lines[0].text).toContain('先保溫');
    expect(r.items.some((i) => i.kind === 'loan' && i.text === '還了阿德 80 元加熱棒的錢，還剩 200 元')).toBe(true);
  });
});

describe('冬天搬去有加熱棒的缸、空缸不再叫保溫（#400，g30）', () => {
  /** 第 1 缸加熱棒壞了、16°C 室溫、沒錢又已經跟阿德賒過一支；第 2 缸（20L）賒來的加熱棒是好的。 */
  function twoCold() {
    const a = tank(41);
    a.environment.roomTempC = 16;
    a.equipment.heater!.broken = true;
    unplugHeater(a);
    a.water.tempC = 19;
    const b = createTank({ tank: TANKS.nano20, filter: FILTERS.hangOn, heater: { spec: HEATERS.h25, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 16, seed: 42, matureMedia: true });
    b.hours = a.hours;
    b.label = '繁殖缸';
    b.water.tempC = 25;
    const tanks = [a, b];
    linkTanks(tanks);
    economy(a).coins = 0;
    economy(a).heaterLoan = 280;
    orderBoard(a).orders = [];
    a.insulatedDay = Math.floor(a.hours / 24);
    return { tanks, a, b };
  }

  it('保溫過了、賒不到、賣魚也湊不到：任務卡和早上報告叫你把魚搬到繁殖缸，點了就搬', () => {
    const { tanks, a, b } = twoCold();
    for (const f of a.fish) Object.assign(f, { lengthCm: 1.6, stress: 0 });
    const step = guideStep(tanks, 'g');
    expect(step).toMatchObject({ target: 'move_warm', tank: 0 });
    expect(step?.text).toContain('連袋子泡進繁殖缸（25.0°C）慢慢對水再放');
    const r = morningReport(snapshot(tanks), tanks, 1, null);
    expect(r.items.some((i) => i.action === 'move_warm' && i.goLabel === '搬魚' && i.tone === 'bad')).toBe(true);
    const moved = moveToWarmTank(tanks, 0)!;
    expect(moved.to).toBe(1);
    expect(b.fish.filter((f) => f.alive)).toHaveLength(moved.count);
    expect(a.fish.filter((f) => f.alive).length + moved.count).toBe(10);
    // 慢慢對水：緊迫比直接撈過去小
    expect(Math.max(...b.fish.map((f) => f.stress))).toBeLessThan(0.5);
  });

  it('暖缸放不下全部：先搬留種的，寫最要緊的幾尾', () => {
    const { tanks, a } = twoCold();
    economy(a).choices = { ...(economy(a).choices ?? {}), pair: [a.fish[9].id] } as never;
    const plan = warmMove(tanks, 0)!;
    expect(plan.fish.length).toBeLessThan(plan.total);
    expect(plan.fish[0].id).toBe(a.fish[9].id);
    expect(guideStep(tanks, 'g')?.text).toContain(`最要緊的 ${plan.fish.length} 尾（共 10 尾）`);
  });

  it('救急第一步是搬魚，還賒得到也一樣；錢夠換就不叫搬（mvp.md §4.4.6）', () => {
    const { tanks, a } = twoCold();
    economy(a).heaterLoan = undefined;
    a.insulatedDay = undefined;
    expect(guideStep(tanks, 'g')?.target).toBe('move_warm');
    economy(a).coins = 1000;
    expect(warmMoveStep(tanks, 0)).toBeNull();
  });

  it('暖缸在下藥：魚照搬、蝦留著；暖缸有魚生病：不搬，任務卡寫為什麼（#404）', () => {
    const { tanks, a, b } = twoCold();
    b.water.medication = 1;
    const shrimp = addFish(a, 'cherry_shrimp', { carriesIch: false, carries: [], sex: 'female', pregnant: false });
    const plan = warmMove(tanks, 0)!;
    expect(plan.fish.some((f) => f.id === shrimp.id)).toBe(false);
    expect(plan.shrimp).toBe(1);
    expect(guideStep(tanks, 'g')?.text).toContain('繁殖缸在下藥，魚一起泡藥沒關係，蝦先留著');
    b.water.medication = 0;
    const sick = addFish(b, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
    sick.ich = { stage: 'visible', progress: 0.5 };
    expect(warmMove(tanks, 0)).toBeNull();
    expect(warmMoveRefusal(tanks, 0)).toBe('繁殖缸有魚在生病，搬過去會被傳染');
    a.insulatedDay = undefined;
    expect(guideStep(tanks, 'g')).toMatchObject({ target: 'insulate' });
    expect(guideStep(tanks, 'g')?.text).toContain('（繁殖缸有魚在生病，搬過去會被傳染）');
  });

  it('錢不夠換同款、買得起撐得住的 25W：第 0 步叫你買，不叫搬魚（#404）', () => {
    const { tanks, a } = twoCold();
    economy(a).coins = 300;
    expect(cheapHeater(a)).toMatchObject({ spec: { id: 'h25' }, cost: 280, comfy: false });
    const step = guideStep(tanks, 'g');
    expect(step).toMatchObject({ target: 'buy_heater', tank: 0 });
    expect(step?.text).toBe('第 1 缸：水溫只剩 19.0°C，錢不夠換同款，先買一支25W 加熱棒（280 元）撐過冬天，水會比適溫低一點');
    expect(warmMoveStep(tanks, 0)).toBeNull();
    const r = morningReport(snapshot(tanks), tanks, 1, null);
    expect(r.items.some((i) => i.action === 'buy_heater')).toBe(true);
    expect(r.items.some((i) => i.tank === 0 && (i.action === 'move_warm' || i.action === 'insulate'))).toBe(false);
    expect(buyCheapHeater(a)?.id).toBe('h25');
    expect(economy(a).coins).toBe(20);
    expect(a.equipment.heater?.broken).toBe(false);
  });

  it('便宜加熱棒照這地區最冷那個月算撐不撐得住，不是只看今天（#405 架構）', () => {
    const { a } = twoCold();
    economy(a).coins = 300;
    expect(coldestRoomC('north')).toBe(14);
    expect(coldestRoomC('south')).toBe(17);
    // 今天室溫還有 21°C：只看今天 25W 連適溫都撐得到；照 1 月最冷 14°C 算只撐得住不冷死
    a.environment.roomTempC = 21;
    expect(cheapHeater(a)).toMatchObject({ spec: { id: 'h25' }, comfy: false });
  });

  it('還欠加熱棒錢時，緊急賣魚逐尾扣一半還款，算出來的跟真的賣完到手一樣（#405 架構）', () => {
    const { tanks, a } = twoCold();
    // 每尾價錢是奇數時逐尾 ceil 會比整筆 ceil 多扣
    economy(a).heaterLoan = 280;
    expect(emergencySale(tanks, 1_000_000).fish.map(fishBuybackPrice).some((p) => p % 2 === 1)).toBe(true);
    const sale = emergencySale(tanks, 1_000_000);
    expect(sale.count).toBeGreaterThan(1);
    const before = economy(a).coins;
    for (const f of sale.fish) sellFish(tanks.find((t: TankState) => t.fish.includes(f))!, f.id);
    expect(economy(a).coins - before).toBe(sale.coins);
  });

  /** g32：90L 大缸 15 尾、20L 小缸 10 尾，兩缸加熱棒都壞、收購次數用完、單交不出、保溫過了。 */
  function bigAndSmall(bigFirst: boolean) {
    const mk = (spec: TankSpec, label: string, n: number, seed: number) => {
      const t = createTank({ tank: spec, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 16, seed, matureMedia: true });
      t.hours = 20;
      t.label = label;
      for (let i = 0; i < n; i++) addFish(t, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
      t.equipment.heater!.broken = true;
      unplugHeater(t);
      t.water.tempC = t.water.tempAvgC = 20;
      t.insulatedDay = Math.floor(t.hours / 24);
      return t;
    };
    const big = mk(TANKS.std90, '孔雀魚之家', 15, 51);
    const small = mk(TANKS.nano20, '繁殖缸', 10, 52);
    // 小缸散熱快，先掉到「水溫偏低」：任務卡的危機排在小缸（g32 B 次）
    small.water.tempC = 19;
    const tanks = bigFirst ? [big, small] : [small, big];
    linkTanks(tanks);
    economy(big).coins = 0;
    economy(big).sold = { day: Math.floor(big.hours / 24), count: 99 };
    orderBoard(big).orders = [];
    return { tanks, big, small };
  }

  it('只能賒一支：給會冷死最多尾的缸，跟正在看哪缸、缸排第幾無關；小缸的魚再搬過去（#407）', () => {
    for (const bigFirst of [true, false]) {
      const { tanks, big, small } = bigAndSmall(bigFirst);
      expect(creditTarget(tanks)).toBe(big);
      expect(guideStep(tanks, 'g')).toMatchObject({ target: 'heater_credit', tank: tanks.indexOf(big) });
      expect(guideStep(tanks, 'g')?.text).toContain('孔雀魚之家：水太冷了，阿德說可以先賒一支加熱棒');
      expect(heaterCreditRefusal(small)).toBe('阿德只能先賒一支，先給孔雀魚之家（那缸的魚比較多），這缸的魚再搬過去');
      expect(takeHeaterCredit(small)).toBe(0);
      expect(takeHeaterCredit(big)).toBeGreaterThan(0);
      big.water.tempC = 25;
      expect(guideStep(tanks, 'g')).toMatchObject({ target: 'move_warm', tank: tanks.indexOf(small) });
    }
  });

  it('湊不到錢時說真正原因，不叫「先交訂單」（#404）', () => {
    const { tanks, a, b } = twoCold();
    b.equipment.heater!.broken = true;
    a.insulatedDay = Math.floor(a.hours / 24);
    economy(a).heaterLoan = 280;
    economy(a).sold = { day: Math.floor(a.hours / 24), count: 99 };
    const text = guideStep(tanks, 'g')?.text ?? '';
    expect(text).toContain('今天阿德的收購次數用完了，明天再賣魚湊');
    expect(text).not.toContain('先交訂單');
  });

  it('魚都冷死撈掉了的空缸：早上不再叫保溫、也不再天天叫換加熱棒', () => {
    const { tanks, a, b } = twoCold();
    a.insulatedDay = undefined;
    addFish(b, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
    a.fish = [];
    expect(needsInsulation(a)).toBe(false);
    const r = morningReport(snapshot(tanks), tanks, 1, null);
    expect(r.items.filter((i) => i.tank === 0 && /保溫|加熱棒/.test(i.text))).toEqual([]);
  });

  it('有白點的魚先留在原缸，任務卡說留了幾尾（#401 架構）', () => {
    const { tanks, a, b } = twoCold();
    a.fish[0].ich = { stage: 'visible', progress: 0.5 };
    const plan = warmMove(tanks, 0)!;
    expect(plan.sick).toBe(1);
    expect(plan.fish.some((f) => f.id === a.fish[0].id)).toBe(false);
    expect(guideStep(tanks, 'g')?.text).toContain('有病的 1 尾先留著，免得傳染');
    moveToWarmTank(tanks, 0);
    expect(b.fish.some((f) => f.ich.stage === 'visible')).toBe(false);
  });

  it('小魚優先搬去不會被吃的缸；只有會吃小魚的缸時先放育幼盒，放不下照樣搬並提醒（mvp.md §4.4.6）', () => {
    const { tanks, a, b } = twoCold();
    for (const f of a.fish.slice(0, 6)) Object.assign(f, { lengthCm: 0.7, ageDays: 3 });
    const fry = new Set(a.fish.slice(0, 6).map((f) => f.id));
    // 第 3 缸：一樣暖、空位更多，但有大魚
    const c = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 16, seed: 43, matureMedia: true });
    c.hours = a.hours;
    c.water.tempC = 25;
    addFish(c, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: false });
    tanks.push(c);
    linkTanks(tanks);
    expect(warmMove(tanks, 0)).toMatchObject({ to: 1, box: [], exposed: 0 });
    // 繁殖缸不能用：只剩有大魚的第 3 缸
    b.equipment.heater!.broken = true;
    // 沒有盒子：小魚照樣搬（留著一定冷死），任務卡提醒會被吃
    const noBox = warmMove(tanks, 0)!;
    expect(noBox).toMatchObject({ to: 2, exposed: 6 });
    expect(noBox.fish.filter((f) => fry.has(f.id))).toHaveLength(6);
    expect(guideStep(tanks, 'g')?.text).toContain('小魚可能被大魚吃，盒子滿了就多放點水草');
    c.nurseryBox = true;
    const plan = warmMove(tanks, 0)!;
    expect(plan.box.map((f) => f.id).sort()).toEqual([...fry].sort());
    expect(guideStep(tanks, 'g')?.text).toContain('小魚 6 尾放進育幼盒');
    const moved = moveToWarmTank(tanks, 0)!;
    expect(moved.boxed).toBe(6);
    expect(c.fish.filter((f) => f.nursery).map((f) => f.id).sort()).toEqual([...fry].sort());
  });

  it('蝦苗放不進育幼盒：照樣搬，任務卡提醒會被吃（#402 架構）', () => {
    const { tanks, a, b } = twoCold();
    b.nurseryBox = true;
    addFish(b, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: false });
    const shrimp = addFish(a, 'cherry_shrimp', { carriesIch: false, carries: [], sex: 'female', pregnant: false });
    Object.assign(shrimp, { lengthCm: 0.3, ageDays: 2 });
    const plan = warmMove(tanks, 0)!;
    expect(plan.fish.some((f) => f.id === shrimp.id)).toBe(true);
    expect(plan.box.some((f) => f.id === shrimp.id)).toBe(false);
    expect(plan.exposed).toBe(1);
    expect(guideStep(tanks, 'g')?.text).toContain('小魚可能被大魚吃');
  });
});

