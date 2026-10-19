import type { KeyValueStore } from '../game/save';
import { observeSymptoms, type TankState } from '../sim';

/**
 * 新手引導任務（GAME_DESIGN 定案）：水族館老闆一步步帶玩家開缸、放魚、餵食、換水、養水。
 * 隨時可以跳過。另外有「情境提示」：第一次遇到氨偏高、浮頭、白點等狀況時，老闆會說可以怎麼做。
 * 這裡是純函式，只看玩家看得到的資訊（測試劑讀數、症狀、自己做過的事）。
 */

export const OWNER_NAME = '阿德老闆';

export interface Quest {
  id: string;
  title: string;
  /** 老闆開場說的話（分段）。 */
  lines: string[];
  /** 完成時老闆說的話。 */
  done: string;
  check: (state: TankState) => boolean;
  /** 任務卡上的進度（例如「硝酸鹽 0／5」），看得出還差多少。 */
  progress?: (state: TankState) => string | null;
  /** 任務卡上的一行提示（要等很久的任務才有）。 */
  hint?: string;
}

const living = (s: TankState) => s.fish.filter((f) => f.alive);

export const QUESTS: Quest[] = [
  {
    id: 'plant',
    title: '種下第一株水草',
    lines: ['歡迎！我是隔壁水族館的阿德。這個缸剛開，水裡還沒有能分解魚便便的硝化菌。', '先到「商店」買幾株水草種下去吧。水草會吸收養分，讓新缸穩定得快一點。'],
    done: '種得不錯！水草也會給之後的小魚躲藏的地方。',
    check: (s) => s.plants.length > 0,
  },
  {
    id: 'test',
    title: '用測試劑測一次水',
    lines: ['魚看不見的東西才最危險。點「測試」用測試劑量一下水質。', '上面那排膠囊就是你測到的數值；沒測過的會顯示「?」，太久沒測也會變回「?」。'],
    done: '記住這幾個數字：氨和亞硝酸鹽都要是 0，魚才安全。',
    check: (s) => s.lastTest !== undefined,
  },
  {
    id: 'fish',
    title: '先放 2～3 條魚',
    lines: ['硝化菌要靠魚的排泄物（氨）才長得起來。先放少量好養的魚，例如 2～3 條孔雀魚。', '別一次放太多，新缸的細菌還處理不了那麼多廢物。'],
    done: '歡迎新住民！牠們剛運到會有點緊張，過一陣子就會放鬆了。',
    check: (s) => living(s).length > 0,
  },
  {
    id: 'feed',
    title: '餵一次飼料',
    lines: ['點「餵食」。新缸期間少量就好，吃不完的飼料會爛掉變成更多氨。'],
    done: '看牠們搶食的樣子就很療癒吧。記得一天一兩次、少量。',
    check: (s) => s.water.foodMg > 0,
  },
  {
    id: 'water',
    title: '換一次水',
    lines: ['新缸前幾週氨和亞硝酸鹽會冒出來，這叫「新缸症候群」。', '測到它們不是 0 的時候，點「換水」換掉三成左右的水，把毒素稀釋掉。新水的溫度要和缸水差不多，魚才不會受驚。'],
    done: '換水是養魚最重要的功夫，之後每週都要換一次喔。',
    check: (s) => (s.lastWaterChangeHours ?? 0) > 0,
  },
  {
    id: 'cycled',
    title: '養水完成：氨 0、亞硝 0、測得到硝酸鹽',
    lines: [
      '接下來每天測水，看到氨或亞硝酸鹽就換水。',
      '等到氨和亞硝酸鹽都是 0、而且測得到硝酸鹽，就代表硝化菌把廢物一路轉成了比較無害的硝酸鹽，缸子養好了。',
      '氨、亞硝都是 0 但測不到硝酸鹽，代表菌還沒長起來，不是養好了；這時不要一直換水。養水通常要 3～7 天，等的時候可以用時鐘旁的快轉。',
      '想快一點可以到商店買硝化菌液（1～3 天），或從自己養好的舊缸分一份濾材過來。',
    ],
    done: '恭喜，你的缸子「養好了」！現在可以慢慢多加一些魚。',
    check: (s) => {
      const r = s.lastTest?.reading;
      return !!r && living(s).length > 0 && r.ammonia === 0 && r.nitrite === 0 && r.nitrate >= 5 && s.hours - s.lastTest!.hours < 24;
    },
    progress: cycleProgress,
    hint: '通常 3～7 天，加硝化菌液 1～3 天',
  },
  {
    id: 'babies',
    title: '等母魚懷孕',
    lines: ['有公有母、水質穩定、吃得好，孔雀魚就會自己繁殖。', '母魚肚子鼓起來就是快生了。成魚會吃小魚，多種些水草讓小魚有地方躲。'],
    done: '看到肚子鼓鼓的母魚了！引導就到這裡，接下來就靠你自己了。有狀況我還會來提醒你。',
    check: (s) => living(s).some((f) => observeSymptoms(s, f).includes('pregnant')),
  },
];

/** 養水任務的進度：照上次測水的讀數（玩家看得到的資訊）。 */
export function cycleProgress(s: TankState): string {
  const test = s.lastTest;
  if (!test) return '還沒測過水';
  const r = test.reading;
  const parts = [`硝酸鹽 ${fmt(r.nitrate)}／5`];
  if (r.ammonia > 0) parts.unshift(`氨 ${fmt(r.ammonia)}`);
  if (r.nitrite > 0) parts.unshift(`亞硝 ${fmt(r.nitrite)}`);
  const stale = s.hours - test.hours >= 24;
  return `${parts.join('・')}（${stale ? '上次測水超過一天，再測一次' : '上次測水'}）`;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export interface Tip {
  id: string;
  text: string;
  check: (state: TankState) => boolean;
}

/** 情境提示：每種狀況只提醒一次。 */
export const TIPS: Tip[] = [
  {
    id: 'ammonia',
    text: '測到氨了！氨對魚很毒。先換三成的水，接下來幾天少餵一點，每天測一次。',
    check: (s) => (s.lastTest?.reading.ammonia ?? 0) >= 0.5 && s.hours - (s.lastTest?.hours ?? -999) < 2,
  },
  {
    id: 'nitrite',
    text: '亞硝酸鹽冒出來了，代表第二種硝化菌還在長。繼續換水撐過去，大概再一兩週就會降下來。',
    check: (s) => (s.lastTest?.reading.nitrite ?? 0) >= 0.5 && s.hours - (s.lastTest?.hours ?? -999) < 2,
  },
  {
    id: 'nitrate',
    text: '硝酸鹽偏高了。雖然比氨溫和，但太高魚還是會不舒服，也會長藻。換水、多種水草都能降低它。',
    check: (s) => (s.lastTest?.reading.nitrate ?? 0) >= 40 && s.hours - (s.lastTest?.hours ?? -999) < 2,
  },
  {
    id: 'gasping',
    text: '魚在水面喘氣，水裡可能缺氧，或是氨、亞硝酸鹽太高。加一台打氣機、先換水，再測一次水。',
    check: (s) => living(s).some((f) => observeSymptoms(s, f).includes('gasping')),
  },
  {
    id: 'ich',
    text: '魚身上有白點，是白點病！到「設備」下白點藥，同時把加熱棒調高到 28～30°C，蟲會比較快脫落。注意：白點藥對蝦有毒。',
    check: (s) => living(s).some((f) => observeSymptoms(s, f).includes('white_spots')),
  },
  {
    id: 'dead',
    text: '有魚死了……先把牠撈出來，屍體會很快腐爛讓水質變差。然後測一次水，找找原因。',
    check: (s) => s.fish.some((f) => !f.alive),
  },
  {
    id: 'heater',
    text: '加熱棒好像卡住一直在加熱！趕快到「設備」把它拔掉，不然水會越來越燙。',
    check: (s) => !!s.equipment.heater?.stuckOn,
  },
  {
    id: 'algae',
    text: '缸壁開始長藻了。通常是光太強、開太久，或養分太多。把燈光時數調短一點，多種水草跟藻類搶養分。',
    check: (s) => s.algae > 0.3,
  },
];

export interface TutorialProgress {
  /** 目前在第幾個任務（等於 QUESTS.length 表示全部完成）。 */
  step: number;
  skipped: boolean;
  seenTips: string[];
}

export const TUTORIAL_KEY = 'cycle.tutorial.v1';

export function newProgress(): TutorialProgress {
  return { step: 0, skipped: false, seenTips: [] };
}

export function currentQuest(p: TutorialProgress): Quest | null {
  return p.skipped ? null : (QUESTS[p.step] ?? null);
}

/** 檢查目前的任務完成了沒；完成了就前進一步，回傳剛完成的任務。一次只前進一步，讓每句話都看得到。 */
export function advanceQuest(p: TutorialProgress, state: TankState): Quest | null {
  const q = currentQuest(p);
  if (!q || !q.check(state)) return null;
  p.step++;
  return q;
}

/** 有沒有該說的情境提示（還沒說過的）。 */
export function pendingTip(p: TutorialProgress, state: TankState): Tip | null {
  for (const tip of TIPS) {
    if (p.seenTips.includes(tip.id)) continue;
    if (tip.check(state)) return tip;
  }
  return null;
}

export function loadProgress(store: KeyValueStore): TutorialProgress {
  try {
    const raw = store.getItem(TUTORIAL_KEY);
    if (!raw) return newProgress();
    const p = JSON.parse(raw) as Partial<TutorialProgress>;
    return {
      step: typeof p.step === 'number' && p.step >= 0 ? Math.min(QUESTS.length, Math.floor(p.step)) : 0,
      skipped: p.skipped === true,
      seenTips: Array.isArray(p.seenTips) ? p.seenTips.filter((t): t is string => typeof t === 'string') : [],
    };
  } catch {
    return newProgress();
  }
}

export function saveProgress(store: KeyValueStore, p: TutorialProgress): void {
  try {
    store.setItem(TUTORIAL_KEY, JSON.stringify(p));
  } catch {
    // 存不了就算了
  }
}
