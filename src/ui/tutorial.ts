import type { KeyValueStore } from '../game/save';
import { cycleMaturity, freeAmmonia, hasVisible, isCycled, observeSymptoms, tankStarted, sexVisible, type TankState } from '../sim';

/**
 * 新手引導任務（GAME_DESIGN 定案）：水族館老闆一步步帶玩家開缸、放魚、餵食、換水、養水。
 * 隨時可以跳過。另外有「情境提示」：第一次遇到氨偏高、浮頭、白點等狀況時，老闆會說可以怎麼做。
 * 這裡是純函式，只看玩家看得到的資訊（測試劑讀數、症狀、自己做過的事）。
 */

export const OWNER_NAME = '阿德老闆';

export interface Quest {
  id: string;
  title: string;
  /** 任務小卡上的短標題（長標題在小卡上會換成好幾行、遮住缸）。 */
  short?: string;
  /** 任務小卡上的進度條（0–1）。 */
  meter?: (state: TankState) => number;
  /** 老闆開場說的話（分段）。 */
  lines: string[];
  /** 任務卡上的一行提示：現在要做什麼（P1：教學只用一行提示，不再是要按「下一步」的對話框）。 */
  hint: string;
  /** 要點的按鈕（任務卡旁那顆會發光）。 */
  target?: QuestTarget;
  /** 完成時老闆說的話（完整的進通知匣）。 */
  done: string;
  /** 完成時任務卡上閃一下的短句。 */
  doneShort: string;
  /** 完成時要老闆當面說、按掉才繼續（前 5 分鐘只有第一次放魚）。 */
  doneDialog?: boolean;
  check: (state: TankState) => boolean;
  /** 任務卡上的進度（例如「硝化菌 40%」），看得出還差多少。 */
  progress?: (state: TankState) => string | null;
  /** 任務要去商店買東西時，商店直接開在這一頁（不然打開是「魚」，找不到水草）。 */
  shopTab?: QuestShopTab;
  /** 完成時多一顆「去擺位置」，帶玩家進造景模式（F1-c）。 */
  doneScape?: boolean;
  /** 完成時老闆給的魚幣（新手任務合計約 800，讓第一次加缸不完全靠賣魚，design/mvp.md §4.3）。 */
  reward: number;
}

export type QuestShopTab = 'fish' | 'snails' | 'plants' | 'gear';

/** 任務要點的地方：工具列的按鈕或右上角的選單。 */
export type QuestTarget = 'shop' | 'test' | 'feed' | 'water' | 'menu' | 'orders';

const living = (s: TankState) => s.fish.filter((f) => f.alive);

export const QUESTS: Quest[] = [
  {
    id: 'setup',
    hint: '在開缸面板挑好設備，按「開缸」',
    doneShort: '缸開好了',
    reward: 50,
    title: '開缸：挑魚缸和設備',
    short: '開缸',
    lines: [
      '歡迎！我是隔壁水族館的阿德。這個空缸送你，設備就用起始資金自己挑吧。',
      '過濾器決定硝化菌住多少、燈決定能種什麼草、底沙會影響水質。每張卡都寫了好處和代價；拿不定主意就按「推薦組合」。',
    ],
    done: '缸開好了！水裡還沒有能分解魚便便的硝化菌，接下來我們一步步把它養起來。',
    // 按下「開機」才算開好缸（#204），付錢裝設備還不算
    check: (s) => tankStarted(s),
  },
  {
    id: 'plant',
    hint: '點「商店」買一株水草',
    target: 'shop',
    doneShort: '種好了',
    reward: 50,
    title: '種下第一株水草',
    lines: ['先到「商店」買幾株水草種下去吧。水草會吸收養分，讓新缸穩定得快一點。'],
    done: '種得不錯！水草也會給之後的小魚躲藏的地方。缸還空著的時候最好造景，按「造景」可以把草和石頭拖到喜歡的位置。',
    doneScape: true,
    check: (s) => s.plants.length > 0,
    shopTab: 'plants',
  },
  {
    id: 'test',
    hint: '點「測試」量一次水',
    target: 'test',
    doneShort: '測好了：氨和亞硝要是 0',
    reward: 50,
    title: '用測試劑測一次水',
    lines: ['魚看不見的東西才最危險。點「測試」用測試劑量一下水質。', '上面那排膠囊就是你測到的數值；沒測過的會顯示「?」，太久沒測也會變回「?」。'],
    done: '記住這幾個數字：氨和亞硝酸鹽都要是 0，魚才安全。',
    check: (s) => s.lastTest !== undefined,
  },
  {
    id: 'fish',
    hint: '點「商店」買 2～3 條孔雀魚',
    target: 'shop',
    doneShort: '魚放進去了',
    doneDialog: true,
    reward: 50,
    title: '先放 2～3 條魚',
    lines: ['硝化菌要靠魚的排泄物（氨）才長得起來。先放少量好養的魚，例如 2～3 條孔雀魚。', '別一次放太多，新缸的細菌還處理不了那麼多廢物。'],
    done: '歡迎新住民！牠們剛運到會有點緊張，過一陣子就會放鬆了。',
    check: (s) => living(s).length > 0,
    shopTab: 'fish',
  },
  {
    id: 'feed',
    hint: '點「餵食」再點水面撒飼料',
    target: 'feed',
    doneShort: '餵好了',
    reward: 50,
    title: '餵一次飼料',
    lines: ['點「餵食」。新缸期間少量就好，吃不完的飼料會爛掉變成更多氨。'],
    done: '看牠們搶食的樣子就很療癒吧。記得一天一兩次、少量。',
    check: (s) => s.water.foodMg > 0,
  },
  {
    id: 'water',
    hint: '點「換水」換掉三成的水',
    target: 'water',
    doneShort: '換好水了',
    reward: 50,
    title: '換一次水',
    lines: ['先試一次換水，熟悉操作：點「換水」換掉三成左右的水。新水的溫度要和缸水差不多，魚才不會受驚。', '新缸前幾天氨和亞硝酸鹽可能會冒出來，這叫「新缸症候群」。之後測到它們不是 0，就像這樣換水把毒素稀釋掉。'],
    done: '換水是養魚最重要的功夫，之後每週都要換一次喔。',
    check: (s) => (s.lastWaterChangeHours ?? 0) > 0,
  },
  {
    id: 'scape',
    hint: '商店「設備」買石頭或沉木',
    target: 'shop',
    doneShort: '有造景了',
    reward: 50,
    title: '擺一塊石頭或沉木',
    short: '擺石頭',
    lines: ['等硝化菌長起來的這幾天，來佈置一下缸子吧。', '到商店的「設備」買一塊石頭或沉木（火山石最便宜），再用「進入造景模式」拖到你喜歡的位置。石頭和沉木表面也能住硝化菌。'],
    done: '有造景就像樣多了！魚也多了躲的地方。',
    check: (s) => (s.equipment.hardscape ?? []).length > 0,
    shopTab: 'gear',
  },
  {
    id: 'name',
    hint: '選單「我的水缸」幫缸取名',
    target: 'menu',
    doneShort: '取好名字了',
    reward: 50,
    title: '幫你的缸取個名字',
    short: '幫缸取名',
    lines: ['每個缸都值得一個名字。打開選單的「我的水缸」，按「改名」，例如「第一缸」「孔雀魚之家」。', '之後缸多了，靠名字就分得出哪缸是繁殖缸、哪缸是蝦缸。'],
    done: '好名字！以後提醒你的時候，我會叫它的名字。',
    check: (s) => !!s.label,
  },
  {
    id: 'cycled',
    hint: '每天測水，有氨或亞硝就換水',
    target: 'test',
    doneShort: '養水完成',
    reward: 250,
    title: '養水完成：硝化菌長好、氨 0、亞硝 0',
    short: '養水完成',
    lines: [
      '接下來每天測水，看到氨或亞硝酸鹽就換水。',
      '硝化菌長起來的途中，亞硝酸鹽會先冒出來一陣子，接著才降回 0。等硝化菌長好、氨和亞硝酸鹽都測到 0，缸子就養好了。',
      '剛放魚的頭一兩天也常測到 0，那是魚的排泄物還少，不是養好了；看任務卡上的硝化菌進度。養水通常要 4～7 天，等的時候可以用時鐘旁的快轉。',
      '想快一點可以到商店買硝化菌液（1～3 天），或從自己養好的舊缸分一份濾材過來。',
    ],
    done: '恭喜，你的缸子「養好了」！現在可以慢慢多加一些魚。',
    check: (s) => {
      const r = s.lastTest?.reading;
      return !!r && living(s).length > 0 && r.ammonia === 0 && r.nitrite === 0 && s.hours - s.lastTest!.hours < 24 && isCycled(s);
    },
    progress: cycleProgress,
    meter: (s) => Math.max(0, Math.min(1, cycleMaturity(s))),
    shopTab: 'gear',
  },
  {
    id: 'babies',
    hint: '母魚肚子鼓起來就快生了',
    doneShort: '第一窩要來了',
    doneDialog: true,
    reward: 150,
    title: '迎接第一窩小魚',
    short: '第一窩小魚',
    lines: ['店裡的母魚大多已經懷孕了，肚子鼓起來、下面出現黑點就是快生了。', '成魚會吃小魚：多種莫絲、矮珍珠讓小魚躲，或把快生的母魚放進育幼盒。'],
    done: '母魚要當媽媽了！新手引導就到這裡，接下來看任務卡上的目標，一步步把缸養起來。有狀況我還會來提醒你。',
    // 懷孕看得出來，或已經生過了（任務出現前就生了也算）
    check: (s) => living(s).some((f) => observeSymptoms(s, f).includes('pregnant')) || s.events.some((e) => e.type === 'fry_born') || s.fish.some((f) => (f.generation ?? 0) > 0),
    progress: pairProgress,
  },
];

/** 養水任務的進度：照上次測水的讀數（玩家看得到的資訊）。 */
export function cycleProgress(s: TankState): string {
  const test = s.lastTest;
  if (!test) return '還沒測過水';
  const r = test.reading;
  const parts = [`硝化菌 ${Math.floor(cycleMaturity(s) * 100)}%`];
  if (r.ammonia > 0) parts.unshift(`氨 ${fmt(r.ammonia)}`);
  if (r.nitrite > 0) parts.unshift(`亞硝 ${fmt(r.nitrite)}`);
  const stale = s.hours - test.hours >= 24;
  return `${parts.join('・')}（${stale ? '舊讀數，再測一次' : '上次測水'}）`;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 等母魚懷孕的進度：缸裡有幾尾公、母孔雀魚（沒有公魚或母魚就說要補）。 */
export function pairProgress(s: TankState): string {
  const adults = living(s).filter((f) => f.species === 'guppy' && sexVisible(f));
  const males = adults.filter((f) => f.sex === 'male').length;
  const females = adults.length - males;
  if (males === 0 || females === 0) return `公 ${males}・母 ${females}（要有公有母）`;
  return `公 ${males}・母 ${females}`;
}

/** 新缸（還沒養好）一次最多放幾條還不容易出事：約每 13 公升一條，至少 3 條。 */
export function newTankFishLimit(s: TankState): number {
  return Math.max(3, Math.round(s.equipment.tank.volumeL / 13));
}

/**
 * 買魚前的老闆提醒：新缸還沒養好、這次買完會超過負荷，就回傳要說的話（只提醒，玩家可以照買）。
 * 有檢疫盒、缸已經養好、量還不多就回傳 null。
 */
export function overloadWarning(s: TankState, adding: number): string | null {
  if (s.quarantine || isCycled(s)) return null;
  const after = living(s).length + adding;
  if (after <= newTankFishLimit(s)) return null;
  return `${OWNER_NAME}：新缸的硝化菌還沒長好，一次放到 ${after} 條，廢物會多到處理不了，魚很容易生病，甚至整缸死光。建議先放 2～3 條，養好水再慢慢加。還是要買嗎？`;
}

/** 水質真的讓魚喘（缺氧、氨、CO₂），不是鰓吸蟲。門檻跟 observeSymptoms 的喘氣一致。 */
function waterChoking(s: TankState): boolean {
  return s.water.o2 < 3.5 || freeAmmonia(s) > 0.05 || s.water.co2 > 35;
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
  // 老闆依實際病因說（#118）：鰓吸蟲、柱狀病先講，水質真的有問題才說缺氧
  {
    id: 'flukes',
    text: '這條魚鰓蓋張開、一直喘，可是水質沒問題：是鰓吸蟲，一種寄生蟲，很容易被當成缺氧。到「設備」下驅蟲藥，對蝦和硝化菌都安全；拖久了魚會慢慢衰弱、傳給別條。之後新買的魚先放檢疫盒觀察 3 天。',
    check: (s) => living(s).some((f) => hasVisible(f, 'flukes')),
  },
  {
    id: 'columnaris',
    text: '魚嘴巴和身上長出白色棉絮，是柱狀病，細菌感染，傳染很快，一兩天就能死好幾條。馬上到「設備」下抗生素（也會殺掉一些硝化菌，之後幾天多測水）；有檢疫盒就把病魚撈進去藥浴。水溫別調高，熱了它更兇。',
    check: (s) => living(s).some((f) => hasVisible(f, 'columnaris')),
  },
  {
    id: 'gasping',
    text: '魚在水面喘氣，水裡可能缺氧，或是氨、亞硝酸鹽太高。加一台打氣機、先換水，再測一次水。',
    check: (s) => waterChoking(s) && living(s).some((f) => observeSymptoms(s, f).includes('gasping')),
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
    id: 'alkaline',
    text: '新缸測到 pH 8 左右是正常的，台灣的自來水大多偏鹼。孔雀魚、米蝦都養得很好，重點是穩定，不用加藥去調；買魚時選「滴水對水」讓牠們慢慢適應就好。',
    check: (s) => (s.lastTest?.reading.ph ?? 0) >= 8 && s.hours - (s.lastTest?.hours ?? -999) < 2,
  },
  {
    id: 'pair',
    text: '缸裡的孔雀魚都是同一種性別，這樣不會生小魚。公魚尾巴大、顏色鮮豔，母魚比較大隻、顏色淡。到商店補一條另一種性別的，或買「一公兩母」。',
    check: (s) => {
      const adults = living(s).filter((f) => f.species === 'guppy' && sexVisible(f));
      return adults.length >= 2 && new Set(adults.map((f) => f.sex)).size === 1 && isCycled(s);
    },
  },
  {
    id: 'fry_eaten',
    text: '小魚都被大魚吃掉了……孔雀魚會吃自己的小孩。下次母魚肚子鼓起來時，把牠放進育幼盒（商店 150 元）；多種莫絲、矮珍珠這種密草，小魚也比較好躲。',
    check: (s) => {
      const born = s.events.filter((e) => e.type === 'fry_born');
      const last = born[born.length - 1];
      // 撈進檢疫盒救下來的也算還活著（#184）；育幼盒裡的本來就在 s.fish
      return !!last && s.hours - last.hours > 48 && ![...s.fish, ...(s.quarantine?.fish ?? [])].some((f) => f.alive && (f.generation ?? 0) > 0);
    },
  },
  {
    id: 'algae',
    text: '缸壁開始長藻了。通常是光太強、開太久，或養分太多。把燈光時數調短一點，多種水草跟藻類搶養分。',
    check: (s) => s.algae > 0.3,
  },
];

export interface TutorialProgress {
  /** 目前在第幾個任務（等於 QUESTS.length 表示全部完成）。存檔時另外記任務 id（quest），任務清單改了也對得回來。 */
  step: number;
  skipped: boolean;
  seenTips: string[];
}

export const TUTORIAL_KEY = 'cycle.tutorial.v1';

/** 存檔裡記「目前任務 id」以前（只有數字 step）的任務順序；舊進度照這份換算。 */
export const LEGACY_QUEST_IDS = ['plant', 'test', 'fish', 'feed', 'water', 'cycled', 'babies'];
/** 存檔裡表示教學全部做完的任務 id。 */
const ALL_DONE = 'done';

/** 任務 id 換成目前清單的第幾個；做完或找不到（任務被拿掉）就回 null。 */
function stepOf(id: string): number | null {
  if (id === ALL_DONE) return QUESTS.length;
  const i = QUESTS.findIndex((q) => q.id === id);
  return i >= 0 ? i : null;
}

/**
 * 讀回存的進度是第幾個任務。新存檔看任務 id；舊存檔只有數字，照 LEGACY_QUEST_IDS 換算，
 * 新插進來的任務（擺石頭、取名…）排在玩家已經走過的位置之前就直接略過，不會讓做完教學的玩家重跑、重領獎勵。
 */
function restoreStep(p: { step?: unknown; quest?: unknown }): number {
  const raw = typeof p.step === 'number' && p.step >= 0 ? Math.floor(p.step) : 0;
  if (typeof p.quest === 'string') return stepOf(p.quest) ?? Math.min(QUESTS.length, raw);
  if (raw >= LEGACY_QUEST_IDS.length) return QUESTS.length;
  return stepOf(LEGACY_QUEST_IDS[raw]) ?? Math.min(QUESTS.length, raw);
}

export function newProgress(): TutorialProgress {
  return { step: 0, skipped: false, seenTips: [] };
}

/** 現在的任務要去商店哪一頁；沒有就 null（照原本的「魚」）。 */
export function questShopTab(p: TutorialProgress): QuestShopTab | null {
  return currentQuest(p)?.shopTab ?? null;
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
    const p = JSON.parse(raw) as Partial<TutorialProgress> & { quest?: unknown };
    return {
      step: restoreStep(p),
      skipped: p.skipped === true,
      seenTips: Array.isArray(p.seenTips) ? p.seenTips.filter((t): t is string => typeof t === 'string') : [],
    };
  } catch {
    return newProgress();
  }
}

export function saveProgress(store: KeyValueStore, p: TutorialProgress): void {
  try {
    store.setItem(TUTORIAL_KEY, JSON.stringify({ ...p, quest: QUESTS[p.step]?.id ?? ALL_DONE }));
  } catch {
    // 存不了就算了
  }
}
