import type { Personality } from './personality';
import type { SnailState } from './snails';
import type { Brood } from './parental';
import type { FoodGrade, FoodKind, FoodLot } from './food';
import { co2Equilibrium, oxygenSaturation, phFromCo2 } from './chemistry';
import type { Placement } from './aquascape';
import type { AirPumpSpec, ChillerSpec, Co2Spec, FanSpec, FilterSpec, HardscapeSpec, HeaterSpec, LightSpec, SubstrateSpec, TankSpec } from './equipment';
import type { Region } from './season';
import type { Economy } from './economy';
import { legacyGenome, type GuppyGenome } from './genetics';
import type { RngState } from './random';
import type { TestKitReading } from './readings';
import { FISH_SPECIES, type FishSpeciesId, type PlantSpeciesId } from './species';

/**
 * 一個水缸的完整模擬狀態。只用純資料（可 JSON 序列化），方便存檔與搬到伺服器。
 * 濃度單位 mg/L，時間單位為遊戲小時。
 */
export interface TankState {
  version: 1;
  /** 玩家幫這缸取的名字（多缸時顯示；沒取就叫「第 N 缸」）。 */
  label?: string;
  /** 這缸的用途（第二缸起，tank-purpose.ts，polish-to-9.md G4）；沒選就沒有。 */
  purpose?: 'breeding' | 'display';
  /** 點水面餵食預設用的飼料（中期選擇 C7「種魚怎麼養」選的，#316）；沒有就用玩家在面板選的。 */
  feedPlan?: { kind: FoodKind; grade: FoodGrade };
  /** 已模擬的遊戲小時數。 */
  hours: number;
  /** 擠缸提醒過幾次（早上報告的擠缸行、C14；擁擠度掉回 60% 以下歸零）：提醒過兩次才會擠死魚（midgame.md §7.1）。 */
  crowdNotices?: number;
  /** 最後一次超過建議量（擁擠度 > 1）的遊戲小時：離線回來看有沒有擠過。 */
  crowdOverHours?: number;
  /** 超過建議量時今天擠死了幾尾（沒接上全家錢包的單缸用；有錢包記在 economy，全家一天最多 2 尾）。 */
  crowdDeaths?: { day: number; n: number };
  rng: RngState;
  nextId: number;
  environment: Environment;
  equipment: Equipment;
  water: Water;
  bacteria: Bacteria;
  fish: Fish[];
  plants: Plant[];
  /** 缸壁與造景上的藻類覆蓋率 0–1。 */
  algae: number;
  events: SimEvent[];
  /** 最近一次用測試劑測水（玩家只知道測過的數值）。 */
  lastTest?: { hours: number; reading: TestKitReading };
  /** 測試劑紀錄（玩家的筆記本），最多保留 TEST_LOG_MAX 筆。 */
  testLog?: { hours: number; reading: TestKitReading }[];
  /** 溫度計每個整點的讀數，最多保留 TEMP_LOG_HOURS 筆。 */
  tempLog?: { hours: number; tempC: number }[];
  /** 最近一次換水的時間（遊戲小時）。 */
  lastWaterChangeHours?: number;
  /** 早上報告說過「你救回來了」（測到氨或亞硝、換水、讀數降下來；每缸一次，G8）。 */
  rescueNoted?: boolean;
  /**
   * 養水期延長：還在養水、水裡有氨時又放店裡的魚，硝化菌長好以後還要多撐 leftH 小時才算養好
   * （design/polish-to-9.md §4 教學順序）。addedHours 是最近一次延長的時間，同一批魚只算一次。
   */
  cycleDelay?: { leftH: number; addedHours: number };
  /**
   * 新缸症候群（design/polish-to-9.md §6「P6 實作確認」）：新建的缸是 {}，第一次放魚時記下開始時間、魚數和這一波
   * 氨的總量（mg，菌夠多時是 0 並標成 prevented）。舊存檔沒有這個欄位，當作早就過了。
   */
  newTankSyndrome?: { startedHours?: number; fish?: number; totalMg?: number; prevented?: boolean };
  /** 早上報告已經說過哪些設備的後果（gear-notes.ts，polish-to-9.md G5）。舊存檔沒有。 */
  gearNotes?: string[];
  /** 早上報告上次說老住戶「放鬆了」的時間（遊戲小時）：隔 3 天才再說一次（#237）。舊存檔沒有。 */
  relaxedNoteHours?: number;
  /** 最近一次餵食、剪下插枝的時間（遊戲小時；每日小事用）。舊存檔沒有。 */
  lastFedHours?: number;
  lastTrimHours?: number;
  /** 最近一次在造景模式移動石頭、沉木或水草的時間（每日小事用）。 */
  lastScapeHours?: number;
  /** 其他動作最後一次的時間（每日小事判定用，DailyAct）。舊存檔沒有。 */
  dailyActs?: Partial<Record<DailyAct, number>>;
  /** 蝦脫下來的殼（畫面上留在缸底一兩天）：哪隻蝦、什麼時候、脫完的體長。 */
  molts?: Array<{ id: number; hour: number; lengthCm: number }>;
  /** 魚幣、電費、手上的插枝。舊存檔沒有，第一次用到時給起始資金。 */
  economy?: Economy;
  /** 螺（design/snails.md）：買的螺和跟著水草混進來的小螺。舊存檔沒有。 */
  snails?: SnailState;
  /** 檢疫盒：買了才有。 */
  quarantine?: Quarantine | null;
  /** 掛了育幼盒（nursery.ts）：盒裡的魚在 fish 裡、帶 nursery 標記。 */
  nurseryBox?: boolean;
  /** 缸裡正在溶解的假期飼料錠，每顆還剩幾 mg（feeders.ts）。 */
  holidayTablets?: number[];
}

/**
 * 檢疫盒：獨立的小缸（小缸＋海綿過濾＋加熱棒），不和主缸共用水。
 * 新魚先放這裡觀察，潛伏的病會在這裡發作，下藥也不會傷到主缸的硝化菌、水草和蝦。
 * 照顧簡化：每天自動餵、固定 26°C、不追蹤水質。
 */
export interface Quarantine {
  fish: Fish[];
  /** 每條魚放進來的時間（遊戲小時），以魚的 id 為鍵。 */
  since: Record<number, number>;
  antibiotic: number;
  dewormer: number;
  ichMedication: number;
}

export type DiseaseKind = 'columnaris' | 'flukes';

export interface Infection {
  kind: DiseaseKind;
  /** 潛伏（看不出來）或發病。 */
  stage: 'latent' | 'visible';
  /** 潛伏進度 0–1；發病後固定為 1，用藥會往下降，降到 0 就治好。 */
  progress: number;
}

export interface Environment {
  /** 室溫日平均（°C），一天內會上下波動。由遊戲依現實季節與地區設定。 */
  roomTempC: number;
  /** 室溫日夜溫差（±°C）。舊存檔沒有，預設 1.5。 */
  roomSwingC?: number;
  /** 地區（決定季節室溫曲線），預設台灣北部。 */
  region?: Region;
  /** 魚缸放在冷氣房：夏天室溫固定在 26～27°C。 */
  airConditioned?: boolean;
  /** 停電時所有設備停止運作。 */
  powerOut: boolean;
  /** 自來水的水質（換水時加入的水）。 */
  tap: TapWater;
}

export interface TapWater {
  kh: number;
  /** 總硬度（dGH）：舊存檔沒有，當 6（台灣自來水大約 4–8）。 */
  gh?: number;
  no3: number;
  co2: number;
}

export interface Equipment {
  tank: TankSpec;
  filter: { spec: FilterSpec; on: boolean } | null;
  heater: {
    spec: HeaterSpec;
    targetC: number;
    /** 恆溫器現在照的溫度：調了目標後一小時只走 HEATER_RAMP_C_PER_HOUR，慢慢走到 targetC 就拿掉。舊存檔沒有這個欄位。 */
    setpointC?: number;
    broken: boolean;
    heating: boolean;
    /** 故障時卡在加熱狀態（恆溫器失靈），插著電就會一直加熱。舊存檔沒有這個欄位。 */
    stuckOn?: boolean;
  } | null;
  airPump: { spec: AirPumpSpec; on: boolean } | null;
  light: { spec: LightSpec; startHour: number; photoperiodHours: number } | null;
  /** CO₂ 跟著燈光的時程注入（夜間關閉）。 */
  co2: { spec: Co2Spec; on: boolean } | null;
  /** 降溫風扇：吹水面靠蒸發降溫，水也蒸發得很快。 */
  fan?: { spec: FanSpec; on: boolean } | null;
  /** 冷水機：製冷到設定溫度。 */
  chiller?: { spec: ChillerSpec; targetC: number; on: boolean; cooling: boolean } | null;
  /** 控溫器：水溫超過上限時切斷加熱棒電源，防止加熱棒卡住把魚煮熟。 */
  controller?: { maxC: number; tripped: boolean } | null;
  /** 自動餵食器（feeders.ts）：每天定時投一小撮；timesPerDay 一天幾次。 */
  feeder?: { timesPerDay: 1 | 2 } | null;
  /** 底材。舊存檔沒有，視為石英砂（惰性）。buffer 是水草泥剩下的緩衝力 0–1。 */
  substrate?: { spec: SubstrateSpec; sinceHours: number; buffer: number } | null;
  /** 造景石與沉木，一項是一組。 */
  hardscape?: HardscapeSpec[];
  /** 每組造景材料擺在哪裡（跟 hardscape 一一對應；沒有就用預設位置，aquascape.ts）。 */
  hardscapePlace?: Placement[];
}

export interface Water {
  tempC: number;
  /** 總氨氮 TAN。 */
  tan: number;
  no2: number;
  no3: number;
  kh: number;
  /** 總硬度（dGH）：鈣鎂離子，蝦長新殼要用。舊存檔沒有，當成自來水的值。 */
  gh?: number;
  ph: number;
  o2: number;
  co2: number;
  /** 未被吃掉、正在腐敗的飼料（mg，整缸總量）。 */
  foodMg: number;
  /** 缸裡的飼料分成哪幾批（種類、等級）；總量是 foodMg。舊存檔沒有。 */
  food?: FoodLot[];
  /** 正在分解的有機廢物：糞便、腐爛的飼料、死魚、枯葉（mg，整缸總量）。 */
  organicMg: number;
  /** 白點蟲游走期的濃度指數（會感染魚，藥物殺得到）。 */
  ichPathogen: number;
  /** 底砂中的白點蟲包囊（藥物殺不到，破裂後變成游走期）。 */
  ichCysts: number;
  /** 水裡、底砂這批白點蟲是哪一波的（從魚身上脫落時記下原因）；蟲死光就清掉。朋友濾材帶來的沒有。 */
  ichCause?: IchCause;
  /** 白點藥濃度，1 = 一份標準劑量。 */
  medication: number;
  /** 抗生素（治柱狀病，也會傷到硝化菌）。 */
  antibiotic?: number;
  /** 驅蟲藥（治鰓吸蟲，對蝦安全）。 */
  dewormer?: number;
  /** 銅（除螺藥）：螺和蝦都怕。 */
  copper?: number;
  /** 用於偵測水溫、pH 驟變的移動平均（約數小時）。 */
  tempAvgC: number;
  phAvg: number;
  /** 目前水量（L）。蒸發會讓水位下降、溶解物濃縮；沒有這個欄位表示滿水位。 */
  levelL?: number;
  /** 混濁度 0–1：動造景攪起的底沙，開著過濾幾小時就沉澱。 */
  turbidity?: number;
}

/** 硝化菌族群，以「每小時可處理的 mg 數」表示其規模。 */
export interface Bacteria {
  /** 亞硝化菌：氨 → 亞硝酸鹽。 */
  aob: number;
  /** 硝化菌：亞硝酸鹽 → 硝酸鹽。 */
  nob: number;
}

export type IchStage = 'none' | 'incubating' | 'visible';

/**
 * 白點病的誘因（polish-to-9.md §4）：只有這三種，沒有誘因就不會爆發。
 * temp_swing：24 小時內水溫差 ≥ 3°C；new_fish：新魚沒檢疫就放進來；crowding：密度超過缸的建議量。
 */
export type IchCause = 'temp_swing' | 'new_fish' | 'crowding';

export interface Fish {
  id: number;
  species: FishSpeciesId;
  /** 個性（F6）；沒有就由編號決定（personality.ts）。只影響畫面上的行為。 */
  personality?: Personality;
  alive: boolean;
  /** 健康 0–1，歸零即死亡。 */
  health: number;
  /** 壓力 0–1。 */
  stress: number;
  /** 飢餓 0（飽）–1（餓）。 */
  hunger: number;
  /** 持續處於飢餓狀態的小時數。 */
  starvingHours: number;
  /** cause：這尾是因為什麼染上的（早上報告寫出原因）；舊存檔沒有。 */
  ich: { stage: IchStage; progress: number; cause?: IchCause };
  /** 基因（目前只有孔雀魚有）。 */
  genome?: GuppyGenome;
  /** 母魚儲存的精子：孔雀魚交配一次可以連生好幾胎，這是那條公魚的基因與血統。 */
  sire?: { genome: GuppyGenome; lineage: number; inbreeding: number; /** 爸爸是缸裡哪尾（店裡買來就懷孕的沒有）。 */ id?: number } | null;
  /** 血統編號：店裡買的每條魚自成一個血統，子代跟著媽媽。 */
  lineage?: number;
  /** 第幾代（店裡買的是 0）。 */
  generation?: number;
  /** 在缸裡出生的時間（遊戲小時）；店裡買的、舊存檔沒有。 */
  bornHours?: number;
  /** 從玩家市場買來的：哪一筆市場訂單（到貨存活追蹤，arrivals.ts）。 */
  marketOrder?: number;
  /** 放進這一缸的時間（遊戲小時：買回來、從檢疫盒放出來、換缸）；早上報告只對剛來的魚說「適應新家」（#237）。缸裡生的、舊存檔沒有。 */
  arrivedHours?: number;
  /** 媽媽是哪尾（在缸裡出生的才有；長得像誰比較卡用，G2）。 */
  motherId?: number;
  /** 爸爸是哪尾（在缸裡出生、爸爸在缸裡的才有；舊存檔沒有）。 */
  fatherId?: number;
  /** 近交係數 0–1：同血統互配會升高，體質和尾鰭跟著退化。 */
  inbreeding?: number;
  /** 保底起步包送的魚：不能賣回店裡。 */
  gift?: boolean;
  /** 在玩家市場上架中的編號：魚還在缸裡照常養，成交後才出貨。 */
  listing?: number;
  /** 白點以外的病（柱狀病、鰓吸蟲）。 */
  infections?: Infection[];
  /** 個體體質差異（約 0.85–1.15），乘在魚種體質上，讓同一缸的魚不會同時倒下。 */
  constitution: number;
  /** 近期（約一兩天內）各原因造成的健康損失，用來判斷死因與診斷。 */
  recentDamage: Record<string, number>;
  /** 屍體剩餘重量（mg），死後在缸內持續腐爛。 */
  corpseMg: number;
  sex: 'male' | 'female';
  /** 目前體長（cm），幼體會慢慢長大；決定吃不吃得下別人、會不會被吃。 */
  lengthCm: number;
  /** 鰭破損 0–1（被咬鰭），會慢慢長回來。 */
  finDamage: number;
  /** 生理年齡（天）。高溫時老得快一點。舊存檔沒有，依體長推估。 */
  ageDays: number;
  /** 懷孕／抱卵進度 0–1，0 表示沒有。 */
  pregnancy: number;
  /** 這一胎玩家已經點開她的卡片看過肚子（下一步就換成倒數，#282）；生完清掉。 */
  bellySeen?: boolean;
  /** 長期營養 0–1（標準飼料約 0.5）：影響成長與免疫力。舊存檔沒有，當 0.5。 */
  nutrition?: number;
  /** 發色加成 0–1：只影響表現，停餵好飼料會慢慢退回去。 */
  colorBoost?: number;
  /** 繁殖意願 0–1（標準約 0.5）：肉食和好飼料讓魚準備繁殖。 */
  breedingCondition?: number;
  /** 個體成長速度（約 0.8–1.2）：同一胎有快有慢。舊存檔與店裡的魚當 1。 */
  growthRate?: number;
  /** 仔魚期吃不好、太擠留下的永久影響 0–1：長到頂的體長最多少兩成。 */
  stunted?: number;
  /** 蝦：已經長了、還沒脫殼兌現的體長（cm）。 */
  pendingCm?: number;
  /** 蝦：離下次脫殼還有幾小時。 */
  moltTimerH?: number;
  /** 蝦：脫殼卡住死掉（畫面上身體有一圈白線）。 */
  stuckMolt?: boolean;
  /** 這尾魚習慣的水（舒適中心，design/acclimation.md）：會慢慢往牠住的水移動。舊存檔沒有，當成習慣目前的缸。 */
  acclimated?: { ph: number; gh: number; tempC: number };
  /** 洞穴產卵的魚（短鯛）：母魚正在顧的這一窩（parental.ts）。 */
  brood?: Brood;
  /** 跟著哪尾母魚（親魚護幼的仔魚）。 */
  guardian?: number;
  /** 帶大過幾窩（越有經驗越不會慌）。 */
  broodsRaised?: number;
  /** 護幼色 0–1：帶小孩時轉成鮮黃加黑紋。 */
  broodColor?: number;
  /** 在育幼盒裡（掛在主缸裡的小網盒，nursery.ts）：成魚吃不到、不會配對。 */
  nursery?: boolean;
  /** 玩家標了「留種」（design/midgame.md C2）：訂單、店家收購、市場上架都不會拿走。 */
  keeper?: boolean;
  /** 已經算進「養到轉色」的累計（自己繁殖的長到轉色期時記一次，之後交單、賣掉、死掉都不扣，#303）。 */
  raisedSeen?: boolean;
}

export interface Plant {
  id: number;
  species: PlantSpeciesId;
  biomassG: number;
  /** 葉面藻類 0–1（陰性草照太強的光時出現）。 */
  leafAlgae: number;
  /** 近一天的平均淨生長率（每小時）。負值代表正在溶葉。 */
  growthRate: number;
  /** 種在哪裡（造景編輯）；沒有就用預設位置。 */
  place?: Placement;
}

export type SimEventType =
  | 'fish_died'
  | 'ich_visible'
  | 'disease_visible'
  | 'power_bill'
  | 'plant_died'
  | 'heater_broke'
  | 'heater_stuck'
  | 'power_out'
  | 'power_restored'
  | 'fry_born'
  | 'controller_cut'
  | 'heater_exposed'
  | 'betta_fight'
  | 'betta_ate_shrimp'
  | 'betta_chase_female'
  | 'snail_died'
  | 'snail_eggs'
  | 'snail_hatched'
  | 'trap_rotted'
  | 'brood_laid'
  | 'brood_eaten'
  | 'brood_left'
  /** 仔魚、仔蝦被大魚吃掉（count 是這一段時間被吃了幾尾，cause 是物種）。 */
  | 'fry_eaten'
  /** 阿德老闆送了育幼盒（subjectId 是快生的那尾母魚）。 */
  | 'nursery_gift'
  /** 品系那對的母魚快生了，照 C15 選的育幼盒自動買了一個（subjectId 是那尾母魚，count 是花了幾元，#362）。 */
  | 'nursery_bought'
  /** 育幼盒裡的小魚長夠大，放回主缸了（count 尾）。 */
  | 'nursery_released'
  /** 缸裡的害蟲小螺第一次多到看得見（count 是隻數）。 */
  | 'pests_seen'
  /** 公魚追到母魚、配對成功（subjectId 是母魚，cause 是公魚的 id；早上報告寫「公魚追母魚」，G8）。 */
  | 'mated'
  /** 自己繁殖的魚第一次賣掉或交單（subjectId 是那尾魚，value 是拿到的錢，cause 'order' 或 'shop'；G2 慶祝）。 */
  | 'first_bred_sale';

export interface SimEvent {
  hours: number;
  type: SimEventType;
  subjectId?: number;
  cause?: string;
  /** 數量（例如一胎生了幾尾）。 */
  count?: number;
  /** 當下的讀數（fish_died：跟死因有關的數值，例如溶氧 mg/L、水溫 °C、斷食天數，見 deathReading）。 */
  value?: number;
}

export interface CreateTankOptions {
  tank: TankSpec;
  filter?: FilterSpec | null;
  heater?: { spec: HeaterSpec; targetC: number } | null;
  airPump?: AirPumpSpec | null;
  light?: { spec: LightSpec; startHour?: number; photoperiodHours?: number } | null;
  co2?: Co2Spec | null;
  roomTempC?: number;
  tap?: Partial<TapWater>;
  seed?: number;
  /** 直接放入成熟濾材（測試用，或玩家從朋友那拿到的成熟濾材）。 */
  matureMedia?: boolean;
}

/** 剛細菌接種前的最小族群（空氣、水中本來就有少量硝化菌）。 */
export const BACTERIA_SEED = 0.02;

/** 溫度紀錄保留兩週。 */
export const TEMP_LOG_HOURS = 14 * 24;
/** 測試劑紀錄保留幾筆。 */
export const TEST_LOG_MAX = 60;

export function createTank(options: CreateTankOptions): TankState {
  const roomTempC = options.roomTempC ?? 23;
  const tap: TapWater = { kh: 4, no3: 2, co2: 3, ...options.tap };
  const filter = options.filter ?? null;
  const mature = options.matureMedia && filter ? filter.bacteriaCapacityMgPerHour * 0.5 : BACTERIA_SEED;

  return {
    version: 1,
    hours: 0,
    rng: { seed: options.seed ?? 1 },
    nextId: 1,
    environment: { roomTempC, powerOut: false, tap },
    equipment: {
      tank: options.tank,
      filter: filter ? { spec: filter, on: true } : null,
      heater: options.heater ? { ...options.heater, broken: false, heating: false } : null,
      airPump: options.airPump ? { spec: options.airPump, on: true } : null,
      light: options.light
        ? {
            spec: options.light.spec,
            startHour: options.light.startHour ?? 10,
            photoperiodHours: options.light.photoperiodHours ?? 8,
          }
        : null,
      co2: options.co2 ? { spec: options.co2, on: true } : null,
    },
    water: {
      tempC: roomTempC,
      tan: 0,
      no2: 0,
      no3: tap.no3,
      kh: tap.kh,
      ph: phFromCo2(tap.kh, co2Equilibrium(roomTempC)),
      o2: oxygenSaturation(roomTempC),
      co2: co2Equilibrium(roomTempC),
      foodMg: 0,
      organicMg: 0,
      ichPathogen: 0,
      ichCysts: 0,
      medication: 0,
      tempAvgC: roomTempC,
      phAvg: phFromCo2(tap.kh, co2Equilibrium(roomTempC)),
    },
    bacteria: { aob: mature, nob: mature },
    fish: [],
    plants: [],
    algae: 0,
    events: [],
    newTankSyndrome: {},
  };
}

/**
 * 每日小事要看的動作（daily.ts）：補水、用缸水洗濾材、造景模式的各種擺法、處理插枝、摘螺卵、撈螺、放進育幼盒。
 * 測水、餵食、換水、修剪、移動造景另外有 last*Hours。
 */
export type DailyAct = 'topup' | 'rinse' | 'scapeMove' | 'scapePlant' | 'scapeFlip' | 'scapeLayer' | 'scapeScale' | 'scapePlace' | 'cutting' | 'clutch' | 'pests' | 'deadSnail' | 'nursery';

/** 記下玩家做了某個動作（每日小事用）。 */
export function noteAct(state: TankState, act: DailyAct): void {
  (state.dailyActs ??= {})[act] = state.hours;
}

export function recordEvent(state: TankState, event: Omit<SimEvent, 'hours'>): void {
  state.events.push({ hours: state.hours, ...event });
  if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
}

export function hourOfDay(state: TankState): number {
  return ((state.hours % 24) + 24) % 24;
}

export function isLightOn(state: TankState): boolean {
  const light = state.equipment.light;
  if (!light || state.environment.powerOut) return false;
  const h = hourOfDay(state);
  const end = light.startHour + light.photoperiodHours;
  return end <= 24 ? h >= light.startHour && h < end : h >= light.startHour || h < end - 24;
}

/** CO₂ 在開燈前 2 小時開始注入、關燈時停止，讓水草一開燈就有足夠的 CO₂。 */
export function isCo2Injecting(state: TankState): boolean {
  const { co2, light } = state.equipment;
  if (!co2?.on || !light || state.environment.powerOut) return false;
  const h = hourOfDay(state);
  const start = (light.startHour - 2 + 24) % 24;
  const end = (light.startHour + light.photoperiodHours) % 24;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

export function isFilterRunning(state: TankState): boolean {
  return !!state.equipment.filter?.on && !state.environment.powerOut;
}

/** 是否為幼體（還沒長到可以繁殖的大小）。 */
/** 長到成魚體長的這個比例才算成魚（之前都是幼魚，isJuvenile）。 */
export const ADULT_SIZE = 0.75;

export function isJuvenile(fish: Fish): boolean {
  return fish.lengthCm < FISH_SPECIES[fish.species].adultLengthCm * ADULT_SIZE;
}

/**
 * 補上舊存檔缺少的欄位（新增欄位時在這裡給預設值），讓存檔版本不用每次都升級。
 */
export function normalizeState(state: TankState): TankState {
  for (const fish of [...state.fish, ...(state.quarantine?.fish ?? [])]) {
    const sp = FISH_SPECIES[fish.species];
    fish.sex ??= fish.id % 2 === 0 ? 'female' : 'male';
    fish.lengthCm ??= sp.adultLengthCm;
    fish.finDamage ??= 0;
    fish.pregnancy ??= 0;
    if (fish.species === 'guppy' && !fish.genome) fish.genome = legacyGenome(fish.id, fish.sex);
    fish.ageDays ??= Math.min(1, fish.lengthCm / sp.adultLengthCm) >= 0.9 ? sp.daysToAdult : sp.daysToAdult * (fish.lengthCm / sp.adultLengthCm);
  }
  return state;
}

/**
 * 新手期（教學走完約 12 個遊戲天，mvp.md §4.6）：店裡的魚不帶柱狀病等細菌病（#118），加熱棒也不會隨機故障（#122）。
 * 教學還沒教到這些，新手會不知道魚為什麼死。看的是這缸的遊戲時間。
 */
export const NEWBIE_HEALTHY_DAYS = 12;
