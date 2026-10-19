import { guppyLook } from '../render/strains';
import { isShrimpSpecies, FISH_SPECIES, growthStage, SNAILS, phenotype, PLANT_SPECIES, sexVisible, strainName, type Fish, type SimEvent, type Symptom, type TankState } from '../sim';

export const SYMPTOM_LABELS: Record<Symptom, string> = {
  hiding: '躲在角落',
  clamped_fins: '鰭收起來（夾鰭）',
  not_eating: '不太吃東西',
  gasping: '在水面浮頭喘氣',
  flashing: '身體去摩擦底砂、造景',
  white_spots: '身上有白色小點',
  lethargic: '游得很慢、沒精神',
  loss_of_balance: '失去平衡、側翻',
  thin: '看起來很瘦',
  torn_fins: '鰭破破爛爛的（被咬鰭）',
  pregnant: '肚子鼓起來（懷孕／抱卵）',
  elderly: '顏色變淡、背有點彎（年紀大了）',
  white_patches: '嘴巴和身上有白色棉絮狀的斑，像在爛',
  gill_flare: '鰓蓋張開、呼吸很快',
  begging: '在水面游來游去討食（餓了）',
};

export const DEATH_CAUSE_LABELS: Record<string, string> = {
  ammonia: '氨中毒',
  nitrite: '亞硝酸鹽中毒',
  oxygen: '缺氧',
  co2: 'CO₂ 過量窒息',
  temperature: '水溫不適',
  starvation: '餓死',
  medication: '藥物中毒',
  copper: '除螺藥（銅）中毒',
  ich: '白點病',
  chronic_stress: '長期緊迫',
  fin_nip: '被咬鰭',
  fight: '被另一尾公鬥魚打死（兩尾公鬥魚不能養在同一缸）',
  betta_attack: '被鬥魚追咬',
  old_age: '老死（壽終正寢）',
  molt: '脫殼失敗（卡殼）：GH 太低或水質一下變太多',
  ph: 'pH 超出牠能撐的範圍',
  ph_shock: '沒對水直接放進去，水質差太多休克',
  columnaris: '柱狀病（爛嘴爛身）',
  flukes: '鰓吸蟲',
  unknown: '原因不明',
};

/** 母魚為什麼顧不好小孩（design: market-and-breeding.md §1.3.3）。 */
export const BROOD_ISSUE_LABELS: Record<string, string> = {
  noisy: '缸裡太吵了，魚太多',
  water: '水質變動太大',
  stress: '親魚太緊張了',
  current: '水流太強，泡巢一直被沖散（換成海綿過濾或關小）',
};

export function fishName(fish: Fish): string {
  const shrimp = isShrimpSpecies(fish.species);
  // 轉色前看不出公母：叫仔魚、幼魚（design/growth.md §6）
  const stage = growthStage(fish);
  const young = !sexVisible(fish)
    ? shrimp ? (stage === 'fry' ? '仔蝦' : '幼蝦') : stage === 'fry' ? '仔魚' : '幼魚'
    : fish.sex === 'male' ? (shrimp ? '公蝦' : '公魚') : shrimp ? '母蝦' : '母魚';
  return `${FISH_SPECIES[fish.species].name}${young} #${fish.id}`;
}

/** 品系名（目前只有成年的公孔雀魚看得出品系）。 */
export function fishStrain(fish: Fish): string | null {
  if (fish.species !== 'guppy' || fish.sex !== 'male' || !sexVisible(fish)) return null;
  return fish.genome ? strainName(phenotype(fish.genome)) : guppyLook(fish.id).strain;
}

export function describeEvent(state: TankState, e: SimEvent): { text: string; tone: 'bad' | 'warn' | 'info' } | null {
  const fish = state.fish.find((f) => f.id === e.subjectId) ?? state.quarantine?.fish.find((f) => f.id === e.subjectId);
  switch (e.type) {
    case 'fish_died':
      return { text: `${fish ? fishName(fish) : '一條魚'} 死了。可能原因：${DEATH_CAUSE_LABELS[e.cause ?? 'unknown'] ?? e.cause}`, tone: 'bad' };
    case 'power_bill':
      return { text: `繳了這週的電費 ${e.count ?? 0} 元${Number(e.cause) > 0 ? `、飼料 ${e.cause} 元` : ''}`, tone: 'info' };
    case 'disease_visible':
      return { text: `${fish ? fishName(fish) : '有魚'} ${e.cause === 'columnaris' ? '嘴巴和身上長出白色棉絮狀的斑' : '鰓蓋張開、呼吸很急'}`, tone: e.cause === 'columnaris' ? 'bad' : 'warn' };
    case 'ich_visible':
      return { text: `${fish ? fishName(fish) : '有魚'} 身上出現白點`, tone: 'warn' };
    case 'plant_died':
      return { text: '有一株水草溶光了', tone: 'warn' };
    case 'heater_broke':
      return { text: '加熱棒故障了！', tone: 'bad' };
    case 'heater_stuck':
      return { text: '加熱棒卡住一直加熱！水溫會一路升高，快到「設備與維護」拔掉插頭', tone: 'bad' };
    case 'power_out':
      return { text: '停電了，所有設備停止運作', tone: 'bad' };
    case 'power_restored':
      return { text: '電力恢復', tone: 'info' };
    case 'controller_cut':
      return { text: '控溫器切斷了加熱棒的電源：水溫超過上限，加熱棒可能卡住了', tone: 'warn' };
    case 'heater_exposed':
      return { text: '水位太低，加熱棒露出水面空燒壞掉了！記得補水', tone: 'bad' };
    case 'fry_born': {
      const shrimp = !!fish && isShrimpSpecies(fish.species);
      return { text: `${fish ? fishName(fish) : '有隻母魚'} ${shrimp ? '孵出' : '生了'} ${e.count ?? 0} ${shrimp ? '隻仔蝦' : '尾仔魚'}。成魚會吃小魚小蝦，水草越密越好躲`, tone: 'info' };
    }
    case 'snail_died': {
      const snail = state.snails?.snails.find((x) => x.id === e.subjectId);
      const name = snail ? SNAILS[snail.kind].name : '一隻螺';
      return { text: `${name}死了（${DEATH_CAUSE_LABELS[e.cause ?? 'unknown'] ?? e.cause}）。大螺死了很髒，記得撈出來`, tone: 'warn' };
    }
    case 'snail_eggs':
      return { text: '蘋果螺在水面上方的缸壁產了一團卵。不想要一堆小螺就摘掉', tone: 'info' };
    case 'snail_hatched':
      return { text: `蘋果螺的卵孵出 ${e.count ?? 0} 隻小螺`, tone: 'info' };
    case 'brood_laid':
      if (e.cause === 'bubble') return { text: `${fish ? fishName(fish) : '公鬥魚'} 在水面吐了泡巢，跟母魚產下約 ${e.count ?? 0} 顆卵，正一顆顆含進泡巢。現在把母魚撈到別缸，不然公魚會追咬牠；也別開強水流`, tone: 'info' };
      return { text: `${fish ? fishName(fish) : '短鯛母魚'} 在洞穴裡產了約 ${e.count ?? 0} 顆卵，轉成護幼色守著。這幾天別大換水、別動造景`, tone: 'info' };
    case 'brood_eaten':
      if (fish?.species === 'betta') return { text: `${fishName(fish)} 把泡巢裡的卵吃掉了：${BROOD_ISSUE_LABELS[e.cause ?? 'stress'] ?? '太緊張了'}。第一次常這樣，養好再配一次`, tone: 'warn' };
      return { text: `${fish ? fishName(fish) : '短鯛母魚'} 把整窩卵吃掉了：${BROOD_ISSUE_LABELS[e.cause ?? 'stress'] ?? '太緊張了'}。新手第一窩常這樣，下次會好一點`, tone: 'warn' };
    case 'brood_left':
      if (fish?.species === 'betta') return { text: `${fish ? fishName(fish) : '公鬥魚'} 顧的 ${e.count ?? 0} 尾小鬥魚會自己游了。把公魚撈走，不然牠會開始吃小魚；小魚要餵很細的飼料`, tone: 'warn' };
      return { text: `${fish ? fishName(fish) : '短鯛母魚'} 帶大的 ${e.count ?? 0} 尾小魚離巢了，可以分缸了`, tone: 'info' };
    case 'betta_chase_female':
      return { text: `公鬥魚在顧泡巢，一直追咬 ${fish ? fishName(fish) : '母魚'}。快把母魚撈到別缸`, tone: 'bad' };
    case 'betta_fight':
      return { text: `缸裡有 ${e.count ?? 2} 尾公鬥魚在打架！打輸的撐不了幾天，快把牠們分到不同缸`, tone: 'bad' };
    case 'betta_ate_shrimp':
      return { text: `${fish ? fishName(fish) : '鬥魚'} 吃掉了一隻蝦。這尾鬥魚會獵蝦，多種水草讓蝦躲，或分開養`, tone: 'warn' };
    case 'trap_rotted':
      return { text: '螺陷阱裡的菜放太久爛掉了，弄髒了水', tone: 'warn' };
  }
}

export function plantName(species: keyof typeof PLANT_SPECIES): string {
  const sp = PLANT_SPECIES[species];
  return `${sp.name}（${sp.lightType === 'low' ? '陰性草' : '陽性草'}）`;
}
