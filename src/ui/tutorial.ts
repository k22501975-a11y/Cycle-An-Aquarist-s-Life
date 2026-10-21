import type { KeyValueStore } from '../game/save';
import { freeAmmonia, hasVisible, isCycled, observeSymptoms, tankStarted, sexVisible, type TankState } from '../sim';

/**
 * 新手引導任務（GAME_DESIGN 定案）：水族館老闆一步步帶玩家開缸、放魚、餵食、換水、養水。
 * 隨時可以跳過。另外有「情境提示」：第一次遇到氨偏高、浮頭、白點等狀況時，老闆會說可以怎麼做。
 * 這裡是純函式，只看玩家看得到的資訊（測試劑讀數、症狀、自己做過的事）。
 */

export const OWNER_NAME = '阿德老闆';

/** 開缸 4 步做完、「你的第一個缸」卡片上老闆說的話（design/tutorial-lines.md §3：下一個任務就是挑魚，不能叫玩家先別放魚）。 */
export const FIRST_TANK_LINE = '缸開好了！挑幾條魚住進來吧。';
/** 測水任務測到氨時，任務卡上閃的那句。 */
export const TEST_AMMONIA_LINE = '測到氨了！先換三成的水';
/** 教學最後一個任務做完：不跳對話框，任務卡閃這句（§1）。 */
export const TUTORIAL_DONE_LINE = '新手引導完成！接下來追夢想魚吧';
/** 開遊戲的歡迎（前 5 分鐘兩個對話框之一，§2）。 */
export const WELCOME_LINE = '歡迎！這個空缸送你。挑好設備，開你的第一個缸吧！';
/** 第一次發現搭便車的螺（#213）：一行提示，完整說明放「為什麼？」（§5）。 */
export const FIRST_PESTS_TIP = '咦，草上有小螺搭便車！牠們會幫忙吃剩飼料';

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
  /**
   * 不用繞去商店、選單（#235：前 5 分鐘的點擊要落在缸上）：
   * fish／plant／stone 在任務卡下面排一鍵買的圖卡；feed 直接進餵食模式；name 讓缸下面的名牌發光、點了就改名。
   */
  quick?: QuestQuick;
  /** 完成時老闆說的話（完整的進通知匣）。 */
  done: string;
  /** 完成時任務卡上閃一下的短句（design/tutorial-lines.md §1，3 秒後自己換成下一步）。 */
  doneShort: string;
  /** 照完成當下的缸況換一句（例如測到氨就叫玩家先換水）；沒有就用 doneShort。 */
  doneShortFor?: (state: TankState) => string | null;
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

export type QuestQuick = 'fish' | 'plant' | 'stone' | 'feed' | 'name';

/** 任務要點的地方：工具列的按鈕或右上角的選單。 */
export type QuestTarget = 'shop' | 'test' | 'feed' | 'water' | 'menu' | 'orders';

const living = (s: TankState) => s.fish.filter((f) => f.alive);

/**
 * 任務順序（design/polish-to-9.md §4 G7、U2）：開缸 → 挑魚對水 → 餵食，第一條魚 90 秒內就進缸；
 * 接著種草、測水、換水、擺石頭、取名。「等養水」不再是任務，改成教學後目標串的第一個背景目標（goals.ts），
 * 不擋教學結束：照基準玩法第 4 天以前教學就全部做完。
 */
export const QUESTS: Quest[] = [
  {
    id: 'setup',
    hint: '挑設備，或按「推薦組合」',
    doneShort: '缸開好了',
    reward: 50,
    title: '開缸：挑魚缸和設備',
    short: '開缸',
    lines: [
      '歡迎！我是隔壁水族館的阿德。這個空缸送你，設備就用起始資金自己挑吧。',
      '過濾器決定硝化菌住多少、燈決定能種什麼草、底沙會影響水質。每張卡都寫了好處和代價；拿不定主意就按「推薦組合」。',
    ],
    done: FIRST_TANK_LINE,
    // 按下「開機」才算開好缸（#204），付錢裝設備還不算
    check: (s) => tankStarted(s),
  },
  {
    id: 'fish',
    hint: '挑一組魚，對好水放進缸',
    quick: 'fish',
    doneShort: '魚放進去了',
    doneDialog: true,
    reward: 50,
    title: '挑 2～3 條魚，對好水放進缸',
    short: '挑魚、對水',
    lines: [
      '到「商店」挑魚吧，新手推薦孔雀魚「一公兩母」。店裡的魚耐得住還在養水的新缸，別一次放太多就好。',
      '魚店的水和你缸裡的水不一樣：用滴管一滴一滴把缸水滴進袋子，讓牠們慢慢適應，這叫「對水」。',
    ],
    done: '歡迎新住民！剛到會有點緊張，過一陣子就放鬆了。接下來幾天是「養水」，每天測一次水就好。',
    check: (s) => living(s).length > 0,
    shopTab: 'fish',
  },
  {
    id: 'feed',
    // 企劃原句是「點水面，飼料就掉在那裡」；現在要先按「餵食」進餵食模式，所以把按鈕也寫進去
    hint: '點水面撒飼料',
    target: 'feed',
    quick: 'feed',
    doneShort: '牠們搶得好開心！一天一小撮就夠',
    reward: 50,
    title: '餵一次飼料',
    lines: ['點「餵食」。新缸期間少量就好，吃不完的飼料會爛掉變成更多氨。'],
    done: '看牠們搶食的樣子就很療癒吧。記得一天一次、一小撮就夠。',
    check: (s) => s.water.foodMg > 0,
  },
  {
    id: 'plant',
    hint: '挑一株草，拖到缸裡想種的地方',
    quick: 'plant',
    doneShort: '種好了，小魚以後能躲在這裡',
    reward: 50,
    title: '種下第一株水草',
    lines: ['到「商店」買幾株水草種下去吧。水草會吸收養分，讓新缸穩定得快一點，也是小魚躲藏的地方。'],
    done: '種得不錯！按「造景」可以把草和石頭拖到喜歡的位置。',
    doneScape: true,
    check: (s) => s.plants.length > 0,
    shopTab: 'plants',
  },
  {
    id: 'test',
    hint: '點「測試」看看水質',
    target: 'test',
    doneShort: '氨和亞硝都要是 0，魚才安全',
    // 新缸症候群（#223）第 1 天早上通常測得到氨：直接叫玩家換水，下一個任務剛好就是換水
    doneShortFor: (s) => ((s.lastTest?.reading.ammonia ?? 0) > 0 ? TEST_AMMONIA_LINE : null),
    reward: 50,
    title: '用測試劑測一次水',
    lines: ['魚看不見的東西才最危險。點「測試」用測試劑量一下水質。', '上面那排膠囊就是你測到的數值；沒測過的會顯示「?」，太久沒測也會變回「?」。'],
    done: '記住這幾個數字：氨和亞硝酸鹽都要是 0，魚才安全。養水這幾天每天測一次，冒出來就換水。',
    check: (s) => s.lastTest !== undefined,
  },
  {
    id: 'water',
    hint: '點「換水」，換掉三成',
    target: 'water',
    doneShort: '換水能把毒素稀釋掉',
    reward: 50,
    title: '換一次水',
    lines: ['先試一次換水，熟悉操作：點「換水」換掉三成左右的水。新水的溫度要和缸水差不多，魚才不會受驚。', '新缸前幾天氨和亞硝酸鹽可能會冒出來，這叫「新缸症候群」。之後測到它們不是 0，就像這樣換水把毒素稀釋掉。'],
    done: '換水是養魚最重要的功夫，之後每週都要換一次喔。',
    check: (s) => (s.lastWaterChangeHours ?? 0) > 0,
  },
  {
    id: 'scape',
    hint: '挑一塊石頭或沉木，拖進缸裡',
    quick: 'stone',
    doneShort: '有造景，魚也多了躲的地方',
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
    hint: '點缸下面的名牌，取個名字',
    quick: 'name',
    doneShort: '好名字！我會記住它',
    reward: 50,
    title: '幫你的缸取個名字',
    short: '幫缸取名',
    lines: ['每個缸都值得一個名字。點缸下面的名牌，例如「第一缸」「孔雀魚之家」。', '之後缸多了，靠名字就分得出哪缸是繁殖缸、哪缸是蝦缸。'],
    done: '好名字！以後提醒你的時候，我會叫它的名字。',
    check: (s) => !!s.label,
  },
  {
    id: 'babies',
    hint: '看看母魚的肚子，鼓起來了嗎？',
    doneShort: TUTORIAL_DONE_LINE,
    reward: 150,
    title: '看看母魚有沒有懷孕',
    short: '母魚懷孕',
    lines: ['店裡的母魚大多已經懷孕了，肚子鼓起來、下面出現黑點就是快生了。', '成魚會吃小魚：多種莫絲、矮珍珠讓小魚躲，或把快生的母魚放進育幼盒。'],
    done: '母魚要當媽媽了！新手引導就到這裡。缸還在養水，任務卡上會一直顯示硝化菌長到幾成：每天測水，看到氨或亞硝酸鹽就換水，等它長好。有狀況我還會來提醒你。',
    // 懷孕看得出來，或已經生過了（任務出現前就生了也算）
    check: (s) => living(s).some((f) => observeSymptoms(s, f).includes('pregnant')) || s.events.some((e) => e.type === 'fry_born') || s.fish.some((f) => (f.generation ?? 0) > 0),
    progress: pairProgress,
  },
];

/** 等養水的進度（現在是目標串的背景目標，goals.ts）；舊程式從這裡拿。 */
export { cycleProgress } from '../sim';

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
  /** 完整的說明：沒有 short 的直接顯示；有 short 的放在點「為什麼？」展開。 */
  text: string;
  /** 一行提示（design/tutorial-lines.md §4，≤ 24 字）：小卡上先只顯示這句。 */
  short?: string;
  check: (state: TankState) => boolean;
}

/** 情境提示：每種狀況只提醒一次。 */
export const TIPS: Tip[] = [
  {
    id: 'ammonia',
    short: '測到氨了！先換三成的水，少餵一點',
    text: '測到氨了！氨對魚很毒。先換三成的水，接下來幾天少餵一點，每天測一次。',
    // 新缸症候群（#223）第一次讀到的就是 0.25，早上報告也從 0.25 開始叫人換水
    check: (s) => (s.lastTest?.reading.ammonia ?? 0) >= 0.25 && s.hours - (s.lastTest?.hours ?? -999) < 2,
  },
  {
    id: 'nitrite',
    short: '亞硝冒出來了，再換幾次水就會降',
    text: '亞硝酸鹽冒出來了，代表第二種硝化菌還在長。繼續換水撐過去，過幾天就會降下來。',
    check: (s) => (s.lastTest?.reading.nitrite ?? 0) >= 0.25 && s.hours - (s.lastTest?.hours ?? -999) < 2,
  },
  // 還在養水、氨不歸零時又放魚（polish-to-9.md §4）：魚撐得住，老闆提醒一次養水會多拖一天
  {
    id: 'cycling_fish',
    short: '缸還在養水，每天測一次，看到氨就換水',
    text: '缸還在養水，水裡的氨還沒歸零就放了新魚。店裡的魚撐得住，別擔心；不過廢物一下變多，養水大概要多等一天。這幾天每天測水，看到氨或亞硝酸鹽就換三成的水。',
    check: (s) => (s.cycleDelay?.leftH ?? 0) > 0,
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
    short: 'pH 8 左右是台灣自來水的正常值，不用調',
    text: '新缸測到 pH 8 左右是正常的，台灣的自來水大多偏鹼。孔雀魚、米蝦都養得很好，重點是穩定，不用加藥去調；買魚時選「滴水對水」讓牠們慢慢適應就好。',
    check: (s) => (s.lastTest?.reading.ph ?? 0) >= 8 && s.hours - (s.lastTest?.hours ?? -999) < 2,
  },
  {
    id: 'pair',
    short: '都是同性別，不會生小魚；補一條異性的吧',
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
/** 調順序（先放魚，polish-to-9.md G7）以前的任務順序：存檔沒記 order 的任務 id 照這份算做過哪些。 */
export const PRE_FISH_FIRST_QUEST_IDS = ['setup', 'plant', 'test', 'fish', 'feed', 'water', 'scape', 'name', 'cycled', 'babies'];
/** 存檔裡記的任務順序版本：2 = 先放魚。 */
const ORDER_VERSION = 2;
/** 存檔裡表示教學全部做完的任務 id。 */
const ALL_DONE = 'done';

/** 任務 id 換成目前清單的第幾個；做完或找不到（任務被拿掉）就回 null。 */
function stepOf(id: string): number | null {
  if (id === ALL_DONE) return QUESTS.length;
  const i = QUESTS.findIndex((q) => q.id === id);
  return i >= 0 ? i : null;
}

/**
 * 舊順序存的「目前任務」：排在它前面的都做過了，從現在清單裡第一個還沒做過的接著做。
 * 例如舊順序停在「測水」（種草做過了），現在接「挑魚」；停在「養水完成」（搬去目標串了），現在接「母魚懷孕」。
 * 獎勵每個任務只發一次（claimQuestReward），做過的任務再過一次也不會重領。
 */
function stepFromOldOrder(id: string): number {
  if (id === ALL_DONE) return QUESTS.length;
  const at = PRE_FISH_FIRST_QUEST_IDS.indexOf(id);
  if (at < 0) return stepOf(id) ?? 0;
  const done = new Set(PRE_FISH_FIRST_QUEST_IDS.slice(0, at));
  const i = QUESTS.findIndex((q) => !done.has(q.id));
  return i >= 0 ? i : QUESTS.length;
}

/**
 * 讀回存的進度是第幾個任務。新存檔看任務 id；調順序以前的存檔照舊順序換算；更舊的只有數字，照 LEGACY_QUEST_IDS 換算，
 * 新插進來的任務（擺石頭、取名…）排在玩家已經走過的位置之前就直接略過，不會讓做完教學的玩家重跑、重領獎勵。
 */
function restoreStep(p: { step?: unknown; quest?: unknown; order?: unknown }): number {
  const raw = typeof p.step === 'number' && p.step >= 0 ? Math.floor(p.step) : 0;
  if (typeof p.quest === 'string') return p.order === ORDER_VERSION ? (stepOf(p.quest) ?? Math.min(QUESTS.length, raw)) : stepFromOldOrder(p.quest);
  if (raw >= LEGACY_QUEST_IDS.length) return QUESTS.length;
  return stepFromOldOrder(LEGACY_QUEST_IDS[raw]);
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
    const p = JSON.parse(raw) as Partial<TutorialProgress> & { quest?: unknown; order?: unknown };
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
    store.setItem(TUTORIAL_KEY, JSON.stringify({ ...p, quest: QUESTS[p.step]?.id ?? ALL_DONE, order: ORDER_VERSION }));
  } catch {
    // 存不了就算了
  }
}
