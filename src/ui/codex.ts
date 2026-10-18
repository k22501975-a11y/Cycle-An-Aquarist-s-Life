import type { KeyValueStore } from '../game/save';
import { AIR_PUMPS, CO2_KITS, FILTERS, FISH_SPECIES, HEATERS, LIGHTS, observeSymptoms, PLANT_SPECIES, TANKS, type Symptom, type TankState } from '../sim';

/**
 * 圖鑑：魚種、水草、設備隨時可以查；疾病要親眼遇過一次才會解鎖（GAME_DESIGN：第一次遇到才開放）。
 * 數值直接從模擬資料讀，文字是給玩家看的真實飼養知識。
 */

export type CodexCategory = 'fish' | 'plant' | 'gear' | 'disease';

export interface CodexEntry {
  id: string;
  category: CodexCategory;
  name: string;
  facts: [string, string][];
  text: string;
  /** 疾病：什麼狀況下算「遇過」。沒有這個欄位的條目一開始就看得到。 */
  unlock?: (state: TankState) => boolean;
}

const living = (s: TankState) => s.fish.filter((f) => f.alive);
const anySymptom = (s: TankState, symptom: Symptom) => living(s).some((f) => observeSymptoms(s, f).includes(symptom));
const diedOf = (s: TankState, cause: string) => s.events.some((e) => e.type === 'fish_died' && e.cause === cause);

const FISH_TEXT: Record<string, string> = {
  guppy: '原產南美的胎生魚，母魚直接生下小魚。公魚尾巴大而華麗，品系非常多。很好養，但成魚會吃剛出生的小魚，多種水草讓小魚有地方躲。',
  zebrafish: '身上有藍白條紋、游得很快的群游魚，耐低溫。數量少於 6 條時會緊張，還會去咬孔雀魚公魚的長尾巴，最好成群飼養。',
  cherry_shrimp: '紅色的小型淡水蝦，會吃藻類和殘餌。母蝦抱卵約一個月後生出小蝦。對藥物非常敏感，白點藥會讓蝦死光。',
};

const PLANT_TEXT: Record<string, string> = {
  anubias: '陰性草，綁在石頭或沉木上，弱光也長得好，長得很慢。光太強時葉面容易長藻。',
  rotala: '陽性草，光照夠、加 CO₂ 時頂端會轉紅，長得很快，需要常常修剪。光不夠會越長越細、慢慢溶掉。',
};

function fishEntries(): CodexEntry[] {
  return Object.values(FISH_SPECIES).map((sp) => ({
    id: `fish:${sp.id}`,
    category: 'fish' as const,
    name: sp.name,
    facts: [
      ['適溫', `${sp.temp.min}～${sp.temp.max} °C`],
      ['pH', `${sp.ph.min}～${sp.ph.max}`],
      ['成體體長', `約 ${sp.adultLengthCm} cm`],
      ['長大需要', `約 ${sp.daysToAdult} 天`],
      ['群游', sp.minGroup > 0 ? `至少 ${sp.minGroup} 條` : '不需要'],
      ['繁殖', sp.breeding ? `懷孕約 ${sp.breeding.gestationDays} 天，一胎 ${sp.breeding.broodMin}～${sp.breeding.broodMax} 隻` : '目前不會在缸裡繁殖'],
    ],
    text: FISH_TEXT[sp.id] ?? '',
  }));
}

function plantEntries(): CodexEntry[] {
  return Object.values(PLANT_SPECIES).map((sp) => ({
    id: `plant:${sp.id}`,
    category: 'plant' as const,
    name: sp.name,
    facts: [
      ['類型', sp.lightType === 'low' ? '陰性草（弱光）' : '陽性草（強光）'],
      ['光照', `約 ${sp.compensationPar}～${sp.lightTolerancePar} PAR`],
      ['CO₂', sp.co2HalfSaturation < 1 ? '不需要另外加' : '建議加 CO₂'],
      ['修剪', `長滿後可剪出 ${sp.cuttingMassG} g 的插枝`],
    ],
    text: PLANT_TEXT[sp.id] ?? '',
  }));
}

function gearEntries(): CodexEntry[] {
  const out: CodexEntry[] = [];
  for (const t of Object.values(TANKS))
    out.push({ id: `gear:${t.id}`, category: 'gear', name: t.name, facts: [['尺寸', `${t.sizeCm.w}×${t.sizeCm.h}×${t.sizeCm.d} cm`], ['水量', `${t.volumeL} L`]], text: '水越多，水質和水溫變化越慢、越穩定；但缸越大，換水和照顧也越花工夫。' });
  for (const f of Object.values(FILTERS))
    out.push({
      id: `gear:${f.id}`,
      category: 'gear',
      name: f.name,
      facts: [['流量', `${f.flowLPerHour} L/小時`], ['濾材容量', `每小時可處理 ${f.bacteriaCapacityMgPerHour} mg 氨`]],
      text: '濾材是硝化菌住的地方。清洗時要用換出來的缸水，用自來水洗會把菌殺光。換新過濾器時濾材要重新養菌。',
    });
  for (const hh of Object.values(HEATERS))
    out.push({ id: `gear:${hh.id}`, category: 'gear', name: hh.name, facts: [['功率', `${hh.watts} W`], ['建議水量', `約 ${hh.watts} L 以內`]], text: '大約每公升 1 W。加熱棒可能壞掉不加熱，也可能卡住一直加熱，要常看溫度計。' });
  for (const l of Object.values(LIGHTS))
    out.push({ id: `gear:${l.id}`, category: 'gear', name: l.name, facts: [['光照', `${l.par} PAR`], ['發熱', `開燈時水溫約 +${l.heatC} °C`]], text: l.par >= 80 ? '強光讓陽性草長得好，但沒有足夠的水草和 CO₂ 時很容易長藻。' : '弱光適合陰性草，不太會長藻。' });
  for (const a of Object.values(AIR_PUMPS))
    out.push({ id: `gear:${a.id}`, category: 'gear', name: a.name, facts: [['用途', '增加水中溶氧']], text: '氣泡攪動水面，讓氧氣溶進水裡。夏天水溫高、魚多的時候特別重要；但會把 CO₂ 趕跑。' });
  for (const c of Object.values(CO2_KITS))
    out.push({ id: `gear:${c.id}`, category: 'gear', name: c.name, facts: [['輸出', `${c.mgPerHour} mg/小時`]], text: '開燈時打 CO₂，陽性草長得快、顏色漂亮。打太多魚會窒息，晚上要關。' });
  return out;
}

const DISEASES: CodexEntry[] = [
  {
    id: 'disease:new_tank',
    category: 'disease',
    name: '新缸症候群',
    facts: [['原因', '硝化菌還沒建立，氨和亞硝酸鹽累積'], ['怎麼看出來', '測到氨或亞硝酸鹽、魚無精打采']],
    text: '新開的缸還沒有足夠的硝化菌分解魚的排泄物。先少量放魚、少餵，每天測水，測到氨或亞硝酸鹽就換三成的水，撐過三到六週。',
    unlock: (s) => (s.testLog ?? []).some((t) => t.reading.ammonia > 0 || t.reading.nitrite > 0),
  },
  {
    id: 'disease:ammonia',
    category: 'disease',
    name: '氨中毒',
    facts: [['原因', '氨太高（pH 和水溫越高越毒）'], ['症狀', '浮頭喘氣、鰭夾起來、不吃東西']],
    text: '馬上換水稀釋，停餵一兩天。找出原因：魚太多、餵太多、死魚沒撈、濾材被洗壞。',
    unlock: (s) => (s.testLog ?? []).some((t) => t.reading.ammonia >= 1) || diedOf(s, 'ammonia'),
  },
  {
    id: 'disease:nitrite',
    category: 'disease',
    name: '亞硝酸鹽中毒',
    facts: [['原因', '第二種硝化菌還不夠'], ['症狀', '浮頭、呼吸急促（血液帶不了氧）']],
    text: '多換水，必要時加打氣。亞硝酸鹽通常在氨下降之後才冒出來，是新缸的第二關。',
    unlock: (s) => (s.testLog ?? []).some((t) => t.reading.nitrite >= 0.5) || diedOf(s, 'nitrite'),
  },
  {
    id: 'disease:oxygen',
    category: 'disease',
    name: '缺氧',
    facts: [['原因', '水溫高、魚太多、水面沒有波動、停電'], ['症狀', '整群魚在水面喘氣']],
    text: '開打氣機或把過濾出水口調到攪動水面，降低水溫，換水。停電時溶氧掉得很快。',
    unlock: (s) => anySymptom(s, 'gasping') || diedOf(s, 'oxygen'),
  },
  {
    id: 'disease:ich',
    category: 'disease',
    name: '白點病',
    facts: [['原因', '小瓜蟲（寄生蟲），常跟著新魚進來'], ['症狀', '身上鹽粒般的白點、磨身體']],
    text: '下白點藥，同時把水溫調高到 28～30°C 加快蟲的生活史，要連續治療到白點消失後幾天。白點藥對蝦有毒。新魚先檢疫可以預防。',
    unlock: (s) => anySymptom(s, 'white_spots') || s.events.some((e) => e.type === 'ich_visible'),
  },
  {
    id: 'disease:fin_nip',
    category: 'disease',
    name: '咬鰭',
    facts: [['原因', '斑馬魚等愛咬的魚數量不足、空間太擠'], ['症狀', '長尾巴破破爛爛']],
    text: '讓群游魚湊到足夠的數量，牠們就會比較少去騷擾別的魚；或把長尾巴的魚分開養。',
    unlock: (s) => anySymptom(s, 'torn_fins') || diedOf(s, 'fin_nip'),
  },
];

export const CODEX: CodexEntry[] = [...fishEntries(), ...plantEntries(), ...gearEntries(), ...DISEASES];

export const CODEX_KEY = 'cycle.codex.v1';

export function loadCodexSeen(store: KeyValueStore): Set<string> {
  try {
    const raw = JSON.parse(store.getItem(CODEX_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveCodexSeen(store: KeyValueStore, seen: Set<string>): void {
  try {
    store.setItem(CODEX_KEY, JSON.stringify([...seen]));
  } catch {
    // 存不了就算了
  }
}

/** 檢查有沒有新解鎖的疾病條目，回傳新解鎖的。 */
export function unlockCodex(seen: Set<string>, state: TankState): CodexEntry[] {
  const fresh: CodexEntry[] = [];
  for (const e of CODEX) {
    if (!e.unlock || seen.has(e.id)) continue;
    if (e.unlock(state)) {
      seen.add(e.id);
      fresh.push(e);
    }
  }
  return fresh;
}

export function isUnlocked(entry: CodexEntry, seen: Set<string>): boolean {
  return !entry.unlock || seen.has(entry.id);
}
