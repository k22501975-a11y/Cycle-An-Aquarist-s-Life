import { guppyLook } from '../render/strains';
import { FISH_SPECIES, growthStage, SNAILS, phenotype, PLANT_SPECIES, sexVisible, strainName, type Fish, type SimEvent, type Symptom, type TankState } from '../sim';

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
  old_age: '老死（壽終正寢）',
  molt: '脫殼失敗（卡殼）：GH 太低或水質一下變太多',
  ph: 'pH 超出牠能撐的範圍',
  ph_shock: '沒對水直接放進去，水質差太多休克',
  columnaris: '柱狀病（爛嘴爛身）',
  flukes: '鰓吸蟲',
  unknown: '原因不明',
};

export function fishName(fish: Fish): string {
  const shrimp = fish.species === 'cherry_shrimp';
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
      const shrimp = fish?.species === 'cherry_shrimp';
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
    case 'trap_rotted':
      return { text: '螺陷阱裡的菜放太久爛掉了，弄髒了水', tone: 'warn' };
  }
}

export function plantName(species: keyof typeof PLANT_SPECIES): string {
  const sp = PLANT_SPECIES[species];
  return `${sp.name}（${sp.lightType === 'low' ? '陰性草' : '陽性草'}）`;
}
