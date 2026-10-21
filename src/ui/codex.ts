import { AIR_PUMPS, CHILLERS, CO2_KITS, FANS, FILTERS, HARDSCAPE, SUBSTRATES, FISH_SPECIES, HEATERS, LIGHTS, observeSymptoms, PLANT_SPECIES, TANKS, type HardscapeSpec, type SubstrateSpec, type Symptom, type TankState } from '../sim';

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
  apisto: '南美的小型慈鯛。公魚背鰭像一排長刺，顏色鮮豔；母魚平常灰黃，產卵後轉成鮮黃加黑紋的護幼色。要有石縫或沉木下的洞穴才會產卵，母魚會帶著一群仔魚在缸底巡邏，趕走靠近的魚。缸裡太吵、水質變動太大時，母魚會把卵吃掉。喜歡偏酸的軟水，水溫高時生出來的公魚比較多。',
  betta: '東南亞稻田裡的迷鰓魚，會到水面吸空氣，所以不怕缺氧，也能養在小缸。公魚的鰭又長又大，顏色鮮豔；母魚短鰭、顏色淡。公魚地盤性極強，兩尾公魚放在一起會打到一尾死掉，也會把孔雀魚公魚的長尾巴當成對手去咬。個性差很多：約三成的鬥魚會獵蝦。喜歡溫暖的水（24–30°C），愛吃紅蟲、豐年蝦。繁殖時公魚在平靜的水面吐泡巢，產完卵要把母魚撈走（公魚會追咬牠），由公魚把卵含進泡巢顧著；約一天半孵化，再兩三天仔魚會平游，這時要把公魚也撈走，不然牠會吃小魚。繁殖缸用海綿過濾，水流太強泡巢會散。',
  crystal_shrimp: '紅白相間的小型淡水蝦，比櫻花蝦嬌貴很多。要偏酸的軟水（pH 6–7），水溫 20–24°C，26°C 以上就很危險，台灣的夏天要開冷氣或冷水機。水質一點點不穩就會出問題，對藥物也非常敏感。抱卵約一個月，一窩比櫻花蝦少。',
  cherry_shrimp: '紅色的小型淡水蝦，會吃藻類和殘餌。母蝦抱卵約一個月後生出小蝦。對藥物非常敏感，白點藥會讓蝦死光。',
};

const PLANT_TEXT: Record<string, string> = {
  anubias: '陰性草，綁在石頭或沉木上，弱光也長得好，長得很慢。光太強時葉面容易長藻。',
  rotala: '陽性草，光照夠、加 CO₂ 時頂端會轉紅，長得很快，需要常常修剪。光不夠會越長越細、慢慢溶掉。',
  eleocharis: '細長像草地的前景草，一叢叢往旁邊走莖蔓延。中強光、有 CO₂ 才長得密，光不夠會變黃、長不開。',
  glosso: '最常見的前景鋪地草，小圓葉貼著底沙長成一片綠毯。很吃強光和 CO₂，條件不夠會往上竄、不貼地，甚至溶掉。',
  hydrocotyle: '小圓葉一層層往外擴散，好種、長得快，中等光就可以，加 CO₂ 會更密。長太亂要常修剪。',
  moss: '綁在石頭或沉木上的苔蘚，弱光、不加 CO₂ 也能慢慢長。小蝦很愛在裡面找東西吃，仔魚也能躲。太久沒修會堆積髒污。',
};

function fishEntries(): CodexEntry[] {
  return Object.values(FISH_SPECIES).map((sp) => ({
    id: `fish:${sp.id}`,
    category: 'fish' as const,
    name: sp.name,
    facts: [
      ['適溫', `${sp.temp.min}～${sp.temp.max} °C`],
      ['致死溫度', `低於 ${sp.tempLethal.min} °C 或高於 ${sp.tempLethal.max} °C`],
      ['pH', `一般 ${sp.ph.min}～${sp.ph.max}，能適應 ${sp.phSurvive.min}～${sp.phSurvive.max}（重點是穩定，慢慢對水）`],
      ['成體體長', `約 ${sp.adultLengthCm} cm`],
      ['長大需要', `約 ${sp.daysToAdult} 天`],
      ['壽命', sp.lifespanDays >= 365 ? `約 ${Math.round((sp.lifespanDays / 365) * 2) / 2} 年` : `約 ${Math.round(sp.lifespanDays / 30)} 個月`],
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
  for (const f of Object.values(FANS))
    out.push({ id: `gear:fan_${f.id}`, category: 'gear', name: f.name, facts: [['降溫', `水溫比室溫低約 ${f.coolingC} °C`], ['蒸發', `平常的 ${f.evaporationFactor} 倍`]], text: '台灣夏天最便宜的降溫方法：吹水面讓水蒸發帶走熱。代價是水少得很快，要天天補水，不然水質會越來越濃。' });
  for (const c of Object.values(CHILLERS))
    out.push({ id: `gear:chiller_${c.id}`, category: 'gear', name: c.name, facts: [['製冷', `${c.coolingWatts} W`], ['用法', '設定溫度，高於設定就製冷']], text: '像小冰箱一樣把水降到設定溫度，不受室溫影響，養怕熱的魚蝦最安心。很貴、很耗電，停電時也沒用。' });
  const SUB_TEXT: Record<string, string> = {
    sand: '最普通的底砂，不會改變水質，也沒有養分。水草要靠根肥，換底材時最單純。',
    soil: '燒結的黑土顆粒，會吸收水裡的 KH，讓 pH 維持在弱酸，水草和水晶蝦都愛。新土前兩到四週會漏氨，要先養水；緩衝力大約半年到一年用完，之後 KH 會慢慢回升，要換新土。',
    coral: '碎珊瑚和貝殼，主要是碳酸鈣，會一直把 KH 和 pH 拉高。非洲慈鯛和海水缸用得到；放在草缸裡 CO₂ 會白打。',
  };
  for (const sub of Object.values(SUBSTRATES) as SubstrateSpec[])
    out.push({ id: `gear:substrate_${sub.id}`, category: 'gear', name: sub.name, facts: [['類型', '底材'], ['對水質', sub.carbonate ? '提高 KH、pH' : sub.khAbsorb ? '吸收 KH、pH 變低' : '不影響']], text: SUB_TEXT[sub.id] ?? '' });
  const ROCK_TEXT: Record<string, string> = {
    seiryu: '灰藍色帶白紋的石頭，造景很受歡迎，但含碳酸鈣。開 CO₂ 時溶得更快，pH 會一直降不下去，是現實玩家最常踩的坑。',
    lava: '多孔的玄武岩，不會改變水質。孔隙讓硝化菌有很多地方住，新缸用它養水會快一點。',
    slate: '一片一片的矽酸鹽岩，不會改變水質。平滑的石板是很多魚喜歡的產卵平台。',
    driftwood: '泡過水的樹根或樹枝。會慢慢釋出單寧酸，水變淡茶色、pH 稍微降低。新沉木會浮、會長白毛，都是正常的。',
  };
  for (const x of Object.values(HARDSCAPE) as HardscapeSpec[])
    out.push({ id: `gear:hardscape_${x.id}`, category: 'gear', name: x.name, facts: [['類型', x.kind === 'rock' ? '造景石' : '沉木'], ['白醋測試', x.kind === 'rock' ? (x.fizzes ? '會冒泡（含碳酸鈣）' : '不冒泡') : '—']], text: ROCK_TEXT[x.id] ?? '' });
  out.push({ id: 'gear:quarantine', category: 'gear', name: '檢疫盒', facts: [['設備', '小缸＋海綿過濾＋加熱棒'], ['建議觀察', '新魚 3 天']], text: '新魚、新蝦可能帶著還沒發作的病。先在獨立的小缸觀察幾天，病會在這裡現形；在這裡下藥也不會傷到主缸的硝化菌、水草和蝦。省掉檢疫，就是拿整缸去賭。' });
  out.push({ id: 'gear:controller', category: 'gear', name: '控溫器', facts: [['作用', '水溫超過上限就切斷加熱棒電源']], text: '加熱棒的恆溫器卡住時會一直加熱把魚煮熟。控溫器是第二道保險，用另一支溫度探頭監看，超過就斷電。' });
  return out;
}

const DISEASES: CodexEntry[] = [
  {
    id: 'disease:new_tank',
    category: 'disease',
    name: '新缸症候群',
    facts: [['原因', '硝化菌還沒建立，氨和亞硝酸鹽累積'], ['怎麼看出來', '測到氨或亞硝酸鹽、魚無精打采']],
    text: '新開的缸還沒有足夠的硝化菌分解魚的排泄物。先少量放魚、少餵，每天測水，測到氨或亞硝酸鹽就換三成的水，撐過三到七天。',
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
  {
    id: 'disease:columnaris',
    category: 'disease',
    name: '柱狀病（爛嘴爛身）',
    facts: [['原因', '細菌，常跟著新魚進來；水溫高、緊迫時特別兇'], ['症狀', '嘴巴、背上長出白色棉絮狀的斑，鰭爛掉']],
    text: '發病很快，一兩天就可能死一缸，而且會傳染。馬上下抗生素，同時換水、把水溫降一點。抗生素會殺掉部分硝化菌，治療期間要多測水。新魚先在檢疫盒觀察可以避免。',
    unlock: (s) => s.events.some((e) => e.type === 'disease_visible' && e.cause === 'columnaris') || diedOf(s, 'columnaris'),
  },
  {
    id: 'disease:flukes',
    category: 'disease',
    name: '鰓吸蟲',
    facts: [['原因', '寄生在鰓上的小蟲，常跟著新魚進來'], ['症狀', '鰓蓋張開、呼吸很快、浮頭']],
    text: '症狀很像缺氧或氨中毒，容易誤判。先測水：水質正常、打氣也夠，魚還是一直喘，就可能是鰓吸蟲。下驅蟲藥，對蝦和硝化菌都安全。拖久了魚會慢慢衰弱。',
    unlock: (s) => s.events.some((e) => e.type === 'disease_visible' && e.cause === 'flukes') || diedOf(s, 'flukes'),
  },
  {
    id: 'disease:temperature',
    category: 'disease',
    name: '水溫過高或過低',
    facts: [['原因', '夏天沒降溫、加熱棒壞掉或卡住、冬天沒加熱'], ['症狀', '太熱會浮頭喘氣，太冷會縮在底部不動、不吃']],
    text: '每種魚有自己的適溫範圍，超出致死溫度很快就會死。夏天用風扇、冷水機或冷氣房降溫；冬天用加熱棒，再加控溫器防止加熱棒卡住。水溫要慢慢調，一天不要變超過 2°C。',
    unlock: (s) => diedOf(s, 'temperature') || s.events.some((e) => e.type === 'controller_cut' || e.type === 'heater_stuck'),
  },
];

export const CODEX: CodexEntry[] = [...fishEntries(), ...plantEntries(), ...gearEntries(), ...DISEASES];

// 已解鎖清單的讀寫在 codex-seen.ts（主程式開機就要，條目資料用到才載入）
export { CODEX_KEY, loadCodexSeen, saveCodexSeen } from './codex-seen';

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
