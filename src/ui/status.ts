import { dueMothers, nurseryRefusal, price, HUNGRY, isShrimpSpecies, snailBloom, isLightOn, COMFORT_BAND, habitOf, canClaimStarterPack, tankLabel, splitAdvice, type SplitPlan, FISH_SPECIES, GAME_SECONDS_PER_DAY, hasVisible, observeSymptoms, QUARANTINE_DAYS, readyForTank, isJuvenile, PLANT_SPECIES, type TankState, type TestKitReading } from '../sim';

/**
 * 狀態列與待辦卡要顯示的內容（純函式，不碰 DOM，方便測試）。
 * 玩家只看得到測試劑測過的數值：沒測過顯示「?」，太久沒測也變回「?」。
 */

export type Tone = 'ok' | 'warn' | 'bad' | 'unknown';

export const READING_TONES: Record<keyof TestKitReading, (v: number) => Tone> = {
  ammonia: (v) => (v === 0 ? 'ok' : v <= 0.25 ? 'warn' : 'bad'),
  nitrite: (v) => (v === 0 ? 'ok' : v <= 0.25 ? 'warn' : 'bad'),
  nitrate: (v) => (v <= 20 ? 'ok' : v <= 40 ? 'warn' : 'bad'),
  // 台灣自來水常在 pH 8 左右，孔雀魚、米蝦都能適應，8.4 以上才提醒
  ph: (v) => (v >= 6.5 && v <= 8.4 ? 'ok' : 'warn'),
  kh: (v) => (v >= 3 ? 'ok' : v >= 1 ? 'warn' : 'bad'),
};

export interface Capsule {
  label: string;
  value: string;
  tone: Tone;
  /** 讀數超過一天，可能已經不準了（顯示得淡一點）。 */
  stale: boolean;
  title: string;
}

/** 測試劑讀數多久之後視為不知道（遊戲小時）。 */
export const TEST_FORGET_HOURS = 72;
const TEST_STALE_HOURS = 24;

function temperatureTone(state: TankState): Tone {
  const t = state.water.tempC;
  let tone: Tone = 'ok';
  for (const species of new Set(state.fish.filter((f) => f.alive).map((f) => f.species))) {
    const { min, max } = FISH_SPECIES[species].temp;
    const off = Math.max(min - t, t - max);
    if (off > 2) return 'bad';
    if (off > 0) tone = 'warn';
  }
  return tone;
}

export function waterCapsules(state: TankState): Capsule[] {
  const caps: Capsule[] = [
    { label: '溫度', value: `${state.water.tempC.toFixed(1)}°C`, tone: temperatureTone(state), stale: false, title: '溫度計隨時看得到' },
  ];
  const test = state.lastTest;
  const age = test ? state.hours - test.hours : Infinity;
  const known = age <= TEST_FORGET_HOURS;
  const stale = known && age > TEST_STALE_HOURS;
  const title = !test ? '還沒測過，點「測試」用測試劑測水' : known ? `${Math.floor(age / 24) > 0 ? `${Math.floor(age / 24)} 天前` : '今天'}測的` : '太久沒測了，數值可能變了';
  const row = (label: string, key: keyof TestKitReading) => {
    const v = test?.reading[key];
    caps.push({
      label,
      value: known && v !== undefined ? String(v) : '?',
      tone: known && v !== undefined && !stale ? READING_TONES[key](v) : 'unknown',
      stale,
      title,
    });
  };
  row('pH', 'ph');
  row('氨', 'ammonia');
  row('亞硝', 'nitrite');
  row('硝酸', 'nitrate');
  return caps;
}

/** 「第 3 週・週二 14:05」：第 1 天是第 1 週的週一。 */
export function clockLabel(hours: number): string {
  const t = hours * 3600;
  const dayIndex = Math.floor(t / GAME_SECONDS_PER_DAY);
  const week = Math.floor(dayIndex / 7) + 1;
  const weekday = '一二三四五六日'[dayIndex % 7];
  const hh = Math.floor((t % GAME_SECONDS_PER_DAY) / 3600);
  const mm = Math.floor((t % 3600) / 60);
  return `第 ${week} 週・週${weekday} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface Todo {
  text: string;
  tone: 'bad' | 'warn' | 'ok';
  /** 點了可以照這個分法一鍵分缸。 */
  split?: SplitPlan;
  /** 點了打開螺的管理。 */
  snails?: true;
  /** 母魚快生了（#187）：put 是有盒子、按了放進育幼盒；buy 是還沒有，按了買一個再放進去。 */
  nursery?: 'put' | 'buy';
}

/** 待辦卡：今天該做的事，嚴重的排前面。只用玩家看得到的資訊（症狀、死魚、設備狀態、自己做過的事）。 */
export function todos(state: TankState, others: TankState[] = []): Todo[] {
  const out: Todo[] = [];
  const living = state.fish.filter((f) => f.alive);
  const dead = state.fish.length - living.length;
  const eq = state.equipment;
  if (state.environment.powerOut) out.push({ text: '停電中，設備都停了', tone: 'bad' });
  if (dead > 0) out.push({ text: `撈出 ${dead} 條死魚`, tone: 'bad' });
  if (eq.heater?.stuckOn) out.push({ text: '加熱棒卡住了，快拔插頭', tone: 'bad' });
  else if (eq.heater?.broken) out.push({ text: '加熱棒壞了，換一支', tone: 'bad' });
  const symptoms = living.map((f) => ({ fish: f, s: observeSymptoms(state, f) }));
  if (symptoms.some((x) => x.s.includes('white_spots'))) out.push({ text: '有魚身上出現白點', tone: 'bad' });
  if (symptoms.some((x) => x.s.includes('gasping'))) out.push({ text: '魚在水面喘氣', tone: 'bad' });
  if (symptoms.some((x) => x.s.includes('white_patches'))) out.push({ text: '有魚身上長出白色棉絮狀的斑', tone: 'bad' });
  // 只用玩家看得到的資訊：最近一次測水的讀數、缸裡有幾條魚
  const reading = state.lastTest && state.hours - state.lastTest.hours <= TEST_FORGET_HOURS ? state.lastTest.reading : null;
  if (reading && living.length > 0) {
    if (reading.kh <= 1) out.push({ text: `KH 只剩 ${reading.kh}，pH 隨時會崩，多換點水`, tone: 'bad' });
    else if (reading.kh <= 2) out.push({ text: `KH 偏低（${reading.kh}），換水把它補回來`, tone: 'warn' });
    // 超出物種的存活範圍才危險；在範圍內只看跟魚習慣的水差多少（會慢慢適應，design/acclimation.md）
    const phMin = Math.max(...living.map((f) => FISH_SPECIES[f.species].phSurvive.min));
    const phMax = Math.min(...living.map((f) => FISH_SPECIES[f.species].phSurvive.max));
    const unused = living.filter((f) => Math.abs(reading.ph - habitOf(state, f).ph) > COMFORT_BAND.ph).length;
    if (reading.ph < phMin) out.push({ text: `pH 太低（${reading.ph}），超出魚能撐的範圍`, tone: 'bad' });
    else if (reading.ph > phMax) out.push({ text: `pH 太高（${reading.ph}），超出魚能撐的範圍`, tone: 'bad' });
    else if (unused > 0) out.push({ text: `pH ${reading.ph} 跟 ${unused} 條魚習慣的水差很多，別一次調太多，牠們會慢慢適應`, tone: 'warn' });
  }
  // 分缸提示：太擠、成魚會吃小魚、小魚轉色後公母混著（點一下照建議分缸）
  for (const a of splitAdvice(state)) out.push({ text: a.text, tone: a.tone, split: a.plan });
  // 螺：看得到的才提醒（尖螺白天躲在沙裡）
  const sn = state.snails;
  if (sn) {
    const deadSnails = sn.snails.filter((x) => !x.alive).length;
    if (deadSnails > 0) out.push({ text: `撈出 ${deadSnails} 隻死掉的大螺，爛了很髒`, tone: 'bad', snails: true });
    const bloom = isLightOn(state) && sn.pests.mts > sn.pests.bladder + sn.pests.ramshorn ? 'none' : snailBloom(state);
    if (bloom !== 'none') out.push({ text: bloom === 'plague' ? '滿缸都是小螺：餵太多了，少餵並清一清' : '小螺變多了，是不是餵太多？', tone: bloom === 'plague' ? 'bad' : 'warn', snails: true });
    if (sn.clutches.length > 0) out.push({ text: `水面上方有 ${sn.clutches.length} 團蘋果螺卵塊，不想要一堆小螺就摘掉`, tone: 'warn', snails: true });
    if (sn.trapHour !== undefined && state.hours - sn.trapHour >= 8) out.push({ text: '螺陷阱可以收了，放太久菜會爛', tone: state.hours - sn.trapHour > 36 ? 'bad' : 'warn', snails: true });
  }
  if (canClaimStarterPack(state, others)) out.push({ text: '整缸都沒了？到商店領老闆送的起步包', tone: 'warn' });
  const coins = state.economy?.coins ?? 0;
  if (coins < 0) out.push({ text: `錢包透支 ${-coins} 元，賣些魚或插枝吧`, tone: 'warn' });
  const sub = eq.substrate;
  if (sub?.spec.khAbsorb && sub.buffer < 0.15) out.push({ text: '水草泥老化了，KH 慢慢回升', tone: 'warn' });
  const q = state.quarantine;
  if (q) {
    const qLiving = q.fish.filter((f) => f.alive);
    if (q.fish.length > qLiving.length) out.push({ text: '檢疫盒裡有魚死了', tone: 'warn' });
    if (qLiving.some((f) => f.ich.stage === 'visible' || hasVisible(f))) out.push({ text: '檢疫盒裡有魚發病了，先藥浴', tone: 'warn' });
    else {
      // 仔魚看大小、新魚看觀察天數（#174）：太小的放回主缸會被吃，不提醒
      const ready = qLiving.filter((f) => readyForTank(state, f));
      if (ready.length > 0) out.push({ text: ready.every((f) => isJuvenile(f)) ? `檢疫盒裡有 ${ready.length} 尾小魚長夠大了，可以移到主缸` : `檢疫盒的魚觀察滿 ${QUARANTINE_DAYS} 天，可以移到主缸`, tone: 'ok' });
    }
  }

  // 水溫超出缸裡魚種的適溫範圍（以最怕熱、最怕冷的那種為準）
  if (living.length > 0) {
    const t = state.water.tempC;
    const hottest = Math.min(...living.map((f) => FISH_SPECIES[f.species].temp.max));
    const coldest = Math.max(...living.map((f) => FISH_SPECIES[f.species].temp.min));
    if (t > hottest + 0.5) out.push({ text: `水溫偏高（${t.toFixed(1)}°C），開風扇或冷水機`, tone: t > hottest + 2 ? 'bad' : 'warn' });
    else if (t < coldest - 0.5) out.push({ text: `水溫偏低（${t.toFixed(1)}°C），檢查加熱棒`, tone: t < coldest - 2 ? 'bad' : 'warn' });
  }
  const level = (state.water.levelL ?? eq.tank.volumeL) / eq.tank.volumeL;
  if (level < 0.9) out.push({ text: `水位降到 ${Math.round(level * 100)}%，該補水了`, tone: level < 0.8 && eq.heater ? 'bad' : 'warn' });

  if (living.length > 0) {
    const testAge = state.lastTest ? state.hours - state.lastTest.hours : Infinity;
    if (testAge === Infinity) out.push({ text: '還沒測過水質', tone: 'warn' });
    else if (testAge > TEST_FORGET_HOURS) out.push({ text: `${Math.floor(testAge / 24)} 天沒測水了`, tone: 'warn' });
    const sinceChange = state.hours - (state.lastWaterChangeHours ?? 0);
    if (sinceChange > 7 * 24) out.push({ text: `該換水了（${Math.floor(sinceChange / 24)} 天沒換）`, tone: 'warn' });
    const hunger = living.reduce((sum, f) => sum + f.hunger, 0) / living.length;
    if (hunger > HUNGRY) out.push({ text: '魚餓了，該餵食', tone: 'warn' });
  }

  const pregnant = symptoms.filter((x) => x.s.includes('pregnant') && !x.fish.nursery);
  // 快生了：直接附「放進育幼盒」或「去買育幼盒」（mvp.md §4.4.2 第 3 點）；盒子正在用就照舊提醒
  const due = dueMothers(state);
  const dueTodo = due.length === 0 ? null : !state.nurseryBox ? 'buy' : due.some((f) => !nurseryRefusal(state, f)) ? 'put' : null;
  if (dueTodo) out.push({ text: dueTodo === 'put' ? '母魚快生了，放進育幼盒' : `母魚快生了：去買育幼盒 ${price('nursery:box')} 元`, tone: 'warn', nursery: dueTodo });
  const guppies = dueTodo ? 0 : pregnant.filter((x) => !isShrimpSpecies(x.fish.species)).length;
  const shrimp = state.fish.filter((f) => f.alive && isShrimpSpecies(f.species) && f.pregnancy > 0).length;
  if (guppies > 0) out.push({ text: `${guppies} 條母魚肚子鼓鼓的，快生了`, tone: 'ok' });
  if (shrimp > 0) out.push({ text: `${shrimp} 隻母蝦正在抱卵`, tone: 'ok' });
  if (state.plants.some((p) => p.biomassG - PLANT_SPECIES[p.species].maxBiomassG * 0.5 >= PLANT_SPECIES[p.species].cuttingMassG && p.biomassG >= PLANT_SPECIES[p.species].maxBiomassG))
    out.push({ text: '水草長滿了，可以修剪', tone: 'ok' });

  if (out.length === 0) out.push({ text: living.length === 0 ? '去商店買魚和水草吧' : '一切正常', tone: 'ok' });
  const rank = { bad: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/** 這些待辦是整個房間共用的，不用在每一缸重複提醒。 */
const SHARED_TODO = /^(停電中|錢包透支|整缸都沒了)/;

/**
 * 多缸的待辦：目前這缸的全部列出，其他缸有要處理的事也提醒一行（缸越多越難顧）。
 */
export function householdTodos(tanks: TankState[], active: number): Todo[] {
  const current = tanks[active];
  const others = tanks.filter((_, i) => i !== active);
  const out = todos(current, others);
  const extra: Todo[] = [];
  tanks.forEach((t, i) => {
    if (i === active) return;
    const urgent = todos(t, tanks.filter((x) => x !== t)).filter((x) => x.tone !== 'ok' && !SHARED_TODO.test(x.text));
    if (urgent.length === 0) return;
    const more = urgent.length > 1 ? `（還有 ${urgent.length - 1} 件）` : '';
    extra.push({ text: `${tankLabel(tanks, i)}：${urgent[0].text}${more}`, tone: urgent[0].tone });
  });
  if (extra.length === 0) return out;
  const merged = [...out.filter((x) => x.text !== '一切正常'), ...extra];
  const rank = { bad: 0, warn: 1, ok: 2 };
  return merged.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
