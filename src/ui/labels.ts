import { FISH_SPECIES, isJuvenile, PLANT_SPECIES, type Fish, type SimEvent, type Symptom, type TankState } from '../sim';

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
};

export const DEATH_CAUSE_LABELS: Record<string, string> = {
  ammonia: '氨中毒',
  nitrite: '亞硝酸鹽中毒',
  oxygen: '缺氧',
  co2: 'CO₂ 過量窒息',
  temperature: '水溫不適',
  starvation: '餓死',
  medication: '藥物中毒',
  ich: '白點病',
  chronic_stress: '長期緊迫',
  fin_nip: '被咬鰭',
  unknown: '原因不明',
};

export function fishName(fish: Fish): string {
  const shrimp = fish.species === 'cherry_shrimp';
  const young = isJuvenile(fish) ? (shrimp ? '仔蝦' : '仔魚') : fish.sex === 'male' ? (shrimp ? '公蝦' : '公魚') : shrimp ? '母蝦' : '母魚';
  return `${FISH_SPECIES[fish.species].name}${young} #${fish.id}`;
}

export function describeEvent(state: TankState, e: SimEvent): { text: string; tone: 'bad' | 'warn' | 'info' } | null {
  const fish = state.fish.find((f) => f.id === e.subjectId);
  switch (e.type) {
    case 'fish_died':
      return { text: `${fish ? fishName(fish) : '一條魚'} 死了。可能原因：${DEATH_CAUSE_LABELS[e.cause ?? 'unknown'] ?? e.cause}`, tone: 'bad' };
    case 'ich_visible':
      return { text: `${fish ? fishName(fish) : '有魚'} 身上出現白點`, tone: 'warn' };
    case 'plant_died':
      return { text: '有一株水草溶光了', tone: 'warn' };
    case 'heater_broke':
      return { text: '加熱棒故障了！', tone: 'bad' };
    case 'power_out':
      return { text: '停電了，所有設備停止運作', tone: 'bad' };
    case 'power_restored':
      return { text: '電力恢復', tone: 'info' };
    case 'fry_born': {
      const shrimp = fish?.species === 'cherry_shrimp';
      return { text: `${fish ? fishName(fish) : '有隻母魚'} ${shrimp ? '孵出' : '生了'} ${e.count ?? 0} ${shrimp ? '隻仔蝦' : '尾仔魚'}。成魚會吃小魚小蝦，水草越密越好躲`, tone: 'info' };
    }
  }
}

export function plantName(species: keyof typeof PLANT_SPECIES): string {
  const sp = PLANT_SPECIES[species];
  return `${sp.name}（${sp.lightType === 'low' ? '陰性草' : '陽性草'}）`;
}
