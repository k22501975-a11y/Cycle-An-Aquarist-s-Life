import type { DeathAdviceCause } from './moments';
import { guppyLook } from '../render/strains';
import { dueMothers, hidingFactor, nurseryFish, NURSERY_FRY_CAPACITY, NURSERY_RELEASE_CM, isJuvenile, isShrimpSpecies, FISH_SPECIES, growthStage, ICH_CAUSE_LABELS, type IchCause, SNAILS, phenotype, PLANT_SPECIES, sexVisible, strainName, type Fish, type SimEvent, type Symptom, type TankState } from '../sim';

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

/** 第一次在缸裡看到搭便車的扁卷螺，阿德老闆的完整說明（polish-to-9.md §4「第二次確認」）；提示小卡點「為什麼？」才顯示。 */
export const FIRST_PESTS_LINE = '缸裡多了幾隻小扁卷螺，是跟著水草搭便車來的。牠們吃殘餌和藻，不多就不用管；店裡也收小螺，攢到 5 隻就能交單換錢。';

/**
 * 魚第一次餓死、病死時阿德老闆直接說原因和下次怎麼做（#169）：
 * 只看通知裡的「可能原因」玩家常常不知道下一步，餓死的人甚至不知道魚要一直餵。
 */
export const DEATH_ADVICE: Record<DeathAdviceCause, string> = {
  starvation: '這條是餓死的。魚一天要吃一到兩餐，關掉遊戲時間也照樣在走。要出門好幾天，商店「設備」最下面的「出遠門」有假期飼料錠，常常不在家就裝自動餵食器。',
  ich: '這條是白點病死的。白點蟲會在水裡傳給其他魚：先下白點藥，把水溫慢慢調高一點，整個療程撐完，白點看不到了也要再下幾天。',
  columnaris: '這條是柱狀病（爛嘴爛身）死的，是細菌感染，水質差、魚緊迫就容易爆發。先換水，再下抗生素，病魚最好撈去檢疫盒。',
  flukes: '這條是鰓吸蟲死的，蟲咬鰓讓魚喘不過氣。下驅蟲藥整缸一起處理，新買的魚先放檢疫盒觀察幾天再放進來。',
};

/** 每種死因下次怎麼避免（一句話，早上報告的死亡那條要寫，U4）。 */
export const DEATH_AVOID: Record<string, string> = {
  ammonia: '新缸先養好水再放魚，少餵一點、每週換三成水，測到氨就馬上換水',
  nitrite: '亞硝酸高代表硝化菌還沒長好：多換水、少餵，養水完成前別一次放太多魚',
  oxygen: '開打氣或把過濾出水口調高、攪動水面，停電時先手動打氣；魚太多也會缺氧',
  co2: 'CO₂ 只在開燈時打、關燈就關掉，並開打氣；看到魚浮頭先關 CO₂',
  temperature: '用有控溫的加熱棒、夏天開冷氣或風扇，每天看一眼溫度計，別讓水溫超出魚能撐的範圍',
  starvation: '魚一天要吃一到兩餐，關掉遊戲時間也照樣在走；要出門就裝自動餵食器或放假期飼料錠',
  medication: '下藥照份量，蝦和怕藥的魚先撈到別缸再下',
  copper: '有蝦的缸不要下除螺藥（含銅），改用捕螺器或用手撈',
  ich: '新魚先檢疫、水溫別忽高忽低；看到白點就下白點藥，整個療程做完',
  chronic_stress: '點魚看「為什麼？」找出讓牠緊張的原因：水質、太擠、被欺負或沒地方躲',
  fin_nip: '別把愛咬鰭的魚跟長尾魚養在一起，多種水草讓牠躲',
  fight: '一缸只養一尾公鬥魚',
  betta_attack: '鬥魚產完卵就把母魚撈到別缸',
  old_age: '這是自然的，想讓品系傳下去就趁年輕留下小魚',
  molt: '換水別一次換太多，GH 保持在 6 以上（不夠就加礦物鹽）',
  ph: '換水用跟缸水差不多的水，別用藥劑大幅調 pH，要調就分好幾天慢慢來',
  ph_shock: '新魚一定要滴水對水，水溫和 pH 慢慢對齊再放進缸',
  columnaris: '保持水質乾淨、別讓魚緊迫；看到白色棉絮就換水、下抗生素，病魚撈去檢疫盒',
  flukes: '新魚先放檢疫盒觀察幾天；看到鰓蓋張開喘氣就下驅蟲藥',
  unknown: '每天看一眼魚、測一次水，有異狀早點處理',
};

/** 小數：小於 1 留兩位（0.25 ppm），其他留一位。 */
const reading = (v: number) => (Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1));

/** 死的那一刻的讀數（fish_died 事件的 value，見 deathReading）寫成一句；舊存檔沒記就回空字串。 */
export function deathReadingText(e: SimEvent, fish?: Fish): string {
  const v = e.value;
  if (v === undefined) return '';
  switch (e.cause) {
    case 'ammonia':
      return `氨 ${reading(v)} ppm`;
    case 'nitrite':
      return `亞硝酸 ${reading(v)} ppm`;
    case 'oxygen':
      return `溶氧 ${v.toFixed(1)} mg/L，魚要 5 以上才舒服`;
    case 'co2':
      return `CO₂ ${Math.round(v)} mg/L，超過 30 魚就會喘`;
    case 'temperature': {
      const lethal = fish ? FISH_SPECIES[fish.species].tempLethal : null;
      const over = lethal ? (v > lethal.max ? v - lethal.max : lethal.min - v) : 0;
      const side = lethal && v > lethal.max ? '高' : '低';
      return `水溫 ${v.toFixed(1)}°C${lethal && over > 0 ? `，比牠能撐的${side === '高' ? '上限' : '下限'}${side} ${over.toFixed(1)}°C` : ''}`;
    }
    case 'ph':
    case 'ph_shock':
      return `缸水 pH ${v.toFixed(1)}`;
    case 'starvation':
      return `飢餓 ${Math.max(1, Math.round(v))} 天`;
    case 'old_age':
      return `活了 ${Math.round(v)} 天`;
    case 'chronic_stress':
      return `壓力 ${Math.round(v * 100)}%`;
    case 'copper':
      return `銅 ${reading(v)} ppm`;
    case 'molt':
      return `GH ${Math.round(v)}`;
    default:
      return `當時水溫 ${v.toFixed(1)}°C`;
  }
}

/** 早上報告的死亡那條：死因、當時的數值、下次怎麼避免（U4）。name 是魚的稱呼。 */
export function deathText(name: string, e: SimEvent, fish?: Fish): string {
  const cause = e.cause ?? 'unknown';
  const label = DEATH_CAUSE_LABELS[cause] ?? cause;
  const value = deathReadingText(e, fish);
  return `${name}死了。死因：${label}${value ? `（${value}）` : ''}。下次：${DEATH_AVOID[cause] ?? DEATH_AVOID.unknown}`;
}

/**
 * 玩家第一次死魚（不管什麼死法）阿德老闆安慰一次、說怎麼避免（U4）。
 * 餓死、病死有更細的說明（DEATH_ADVICE）就用那段。
 */
export function firstDeathOwnerLine(e: SimEvent, fish?: Fish): string {
  const cause = e.cause ?? 'unknown';
  const value = deathReadingText(e, fish);
  const advice =
    (DEATH_ADVICE as Record<string, string>)[cause] ??
    `這條是${DEATH_CAUSE_LABELS[cause] ?? cause}${value ? `，當時${value}` : ''}。下次${DEATH_AVOID[cause] ?? DEATH_AVOID.unknown}。`;
  return `別太難過，養魚的人都送走過魚，我也是。重點是知道為什麼。${advice}`;
}

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

/** 白點病的原因（polish-to-9.md G3：早上報告寫出原因）；沒記原因的舊事件回空字串。 */
export function ichCauseText(e: SimEvent): string {
  return e.cause && e.cause in ICH_CAUSE_LABELS ? `。原因：${ICH_CAUSE_LABELS[e.cause as IchCause]}` : '';
}

export function describeEvent(state: TankState, e: SimEvent): { text: string; tone: 'bad' | 'warn' | 'info' } | null {
  const fish = state.fish.find((f) => f.id === e.subjectId) ?? state.quarantine?.fish.find((f) => f.id === e.subjectId);
  switch (e.type) {
    case 'fish_died':
      return { text: `${fish ? fishName(fish) : '一條魚'} 死了（${DEATH_CAUSE_LABELS[e.cause ?? 'unknown'] ?? e.cause}）`, tone: 'bad' };
    case 'power_bill':
      return { text: `電費 ${e.count ?? 0} 元${Number(e.cause) > 0 ? `、飼料 ${e.cause} 元` : ''}`, tone: 'info' };
    case 'disease_visible':
      return {
        text: `${fish ? fishName(fish) : '有魚'} ${e.cause === 'columnaris' ? '得了柱狀病，快下抗生素' : '呼吸很急，可能是鰓吸蟲，下驅蟲藥'}`,
        tone: e.cause === 'columnaris' ? 'bad' : 'warn',
      };
    case 'ich_visible':
      return { text: `${fish ? fishName(fish) : '有魚'} 身上出現白點${ichCauseText(e)}`, tone: 'warn' };
    case 'plant_died':
      return { text: '有一株水草溶光了', tone: 'warn' };
    case 'heater_broke':
      return { text: '加熱棒故障了！', tone: 'bad' };
    case 'heater_stuck':
      return { text: '加熱棒卡住了，快拔插頭', tone: 'bad' };
    case 'power_out':
      return { text: '停電了', tone: 'bad' };
    case 'power_restored':
      return { text: '電力恢復', tone: 'info' };
    case 'controller_cut':
      return { text: '控溫器斷電了：加熱棒可能卡住', tone: 'warn' };
    case 'heater_exposed':
      return { text: '加熱棒露出水面燒壞了，記得補水', tone: 'bad' };
    case 'fry_born': {
      const shrimp = !!fish && isShrimpSpecies(fish.species);
      return { text: `${fish ? fishName(fish) : '有隻母魚'} ${shrimp ? '孵出' : '生了'} ${e.count ?? 0} ${shrimp ? '隻仔蝦' : '尾仔魚'}`, tone: 'info' };
    }
    case 'snail_died': {
      const snail = state.snails?.snails.find((x) => x.id === e.subjectId);
      const name = snail ? SNAILS[snail.kind].name : '一隻螺';
      return { text: `${name}死了，記得撈出來`, tone: 'warn' };
    }
    case 'snail_eggs':
      return { text: '蘋果螺產卵了，不要小螺就摘掉', tone: 'info' };
    case 'snail_hatched':
      return { text: `蘋果螺的卵孵出 ${e.count ?? 0} 隻小螺`, tone: 'info' };
    case 'brood_laid':
      if (e.cause === 'bubble') return { text: `${fish ? fishName(fish) : '公鬥魚'} 產卵了，把母魚撈到別缸`, tone: 'info' };
      return { text: `${fish ? fishName(fish) : '短鯛母魚'} 產卵了，這幾天別大換水`, tone: 'info' };
    case 'brood_eaten':
      if (fish?.species === 'betta') return { text: `${fishName(fish)} 把卵吃掉了（${BROOD_ISSUE_LABELS[e.cause ?? 'stress'] ?? '太緊張了'}）`, tone: 'warn' };
      return { text: `${fish ? fishName(fish) : '短鯛母魚'} 把卵吃掉了（${BROOD_ISSUE_LABELS[e.cause ?? 'stress'] ?? '太緊張了'}）`, tone: 'warn' };
    case 'brood_left':
      if (fish?.species === 'betta') return { text: `小鬥魚會游了，把公魚撈走`, tone: 'warn' };
      return { text: `${e.count ?? 0} 尾小魚離巢了，可以分缸`, tone: 'info' };
    case 'fry_eaten': {
      const shrimp = isShrimpSpecies((e.cause ?? 'guppy') as Fish['species']);
      return { text: fryEatenText(state, e.count ?? 1, shrimp), tone: 'warn' };
    }
    case 'betta_chase_female':
      return { text: `公鬥魚追咬${fish ? ` ${fishName(fish)}` : '母魚'}，快撈到別缸`, tone: 'bad' };
    case 'betta_fight':
      return { text: `${e.count ?? 2} 尾公鬥魚在打架，快分缸`, tone: 'bad' };
    case 'betta_ate_shrimp':
      return { text: `${fish ? fishName(fish) : '鬥魚'} 吃掉一隻蝦`, tone: 'warn' };
    case 'nursery_gift':
      return { text: `老闆送你育幼盒：${fish ? fishName(fish) : '母魚'}快生了，放進去`, tone: 'info' };
    case 'nursery_released':
      return { text: `育幼盒的 ${e.count ?? 0} 尾小魚長大，放回主缸了`, tone: 'info' };
    case 'trap_rotted':
      return { text: '螺陷阱的菜爛了，記得拿出來', tone: 'warn' };
    case 'pests_seen':
      return { text: `缸裡發現了 ${e.count ?? 5} 隻小螺，是跟著水草搭便車來的`, tone: 'info' };
  }
}

/** 同一幀、同一缸的同一種事件好幾筆：合併成一句（通知太亂）。沒有合併說法的回 null，只留第一則。 */
export function pluralEventText(type: string, n: number): string | null {
  switch (type) {
    case 'fish_died':
      return `${n} 尾魚死了，打開紀錄看原因`;
    case 'ich_visible':
      return `${n} 條魚有白點`;
    case 'disease_visible':
      return `${n} 條魚生病了，打開魚的資料看怎麼治`;
    case 'plant_died':
      return `${n} 株水草溶光了`;
    case 'snail_died':
      return `${n} 隻螺死了，記得撈出來`;
    case 'fry_eaten':
      return null;
    default:
      return null;
  }
}

const pick = (options: string[], day: number) => options[day % options.length];

/**
 * 小魚、小蝦被吃的說法（UX r12）：看缸裡現在的情況給不同的建議，同一種情況也每天換一句，連續幾天被吃才不會一直看到同一句。
 * 開頭像「3 尾小魚被大魚吃掉了」，早上報告前面再加「昨晚有」。
 */
export function fryEatenText(state: TankState, count: number, shrimp: boolean): string {
  const day = Math.floor(state.hours / 24);
  const who = shrimp ? '隻小蝦' : '尾小魚';
  const head = `${count} ${who}${pick(shrimp ? ['被魚吃掉了', '沒躲好，被魚叼走了'] : ['被大魚吃掉了', '沒躲好，被成魚吞下去了', '被大魚當點心吃了'], day)}`;
  const hiding = hidingFactor(state);
  // 育幼盒（#191）：母魚放進去生，小魚長到 1.6 cm 自動放回主缸
  const box = !!state.nurseryBox;
  const boxFish = nurseryFish(state);
  const boxRoom = box && boxFish.filter((f) => isJuvenile(f)).length < NURSERY_FRY_CAPACITY;
  const momInBox = boxFish.some((f) => f.sex === 'female' && !isJuvenile(f));
  const fry = state.fish.filter((f) => f.alive && !f.nursery && isJuvenile(f) && f.lengthCm < NURSERY_RELEASE_CM && !isShrimpSpecies(f.species)).length;
  const due = dueMothers(state).length > 0;
  let tip: string;
  if (shrimp) {
    tip = hiding < 0.35
      ? pick(['小蝦最愛躲在莫絲裡，多綁幾團就好', '缸裡能躲的地方太少，莫絲和矮珍珠是小蝦的家'], day)
      : pick(['水草已經不少，被吃掉一些是正常的，蝦群會慢慢補回來', '小蝦長到看得清楚的大小，魚就不太吃了，再撐幾天'], day);
  } else if (due && boxRoom && !momInBox) {
    tip = pick(['又有母魚肚子很鼓了，生之前先放進育幼盒，生下的就一尾都不會少', '下一胎快生了，趁現在把母魚放進育幼盒'], day);
  } else if (due && !box) {
    tip = pick(['又有母魚快生了。商店的育幼盒掛在缸上，母魚在裡面生，小魚就不會被吃', '下一胎快生了，想多留幾尾，可以先買個育幼盒'], day);
  } else if (fry > 0 && momInBox) {
    tip = pick([`母魚還在育幼盒裡待產，主缸的 ${fry} 尾小魚先靠水草躲，等她生完再撈進去`, '育幼盒現在給待產的母魚用，等她生完、回到主缸，再把小魚撈進去'], day);
  } else if (fry > 0 && boxRoom) {
    tip = pick([`主缸還有 ${fry} 尾小魚，撈進育幼盒，長到 1.6 cm 會自己放回來`, `剩下的 ${fry} 尾小魚趕快撈進育幼盒，大魚就吃不到了`], day);
  } else if (fry > 0 && box) {
    tip = pick(['育幼盒滿了，盒裡大一點的先放回主缸，騰出位子給更小的', '盒子塞不下了，把盒裡快 1.6 cm 的先放出去'], day);
  } else if (hiding < 0.35) {
    tip = pick(['水草太少，大魚一眼就看到小魚。莫絲、矮珍珠這種又密又低的草最好躲', '多種一點莫絲或矮珍珠，小魚鑽進去大魚就抓不到', '缸裡空蕩蕩的，小魚沒地方躲；密一點的水草能救下不少'], day);
  } else if (!box) {
    tip = pick(['水草已經夠密了，還是會被吃掉幾尾，這是正常的。想全部留下，商店有育幼盒', '草夠密了，剩下的就靠運氣；下次母魚肚子鼓起來，可以放進育幼盒生'], day);
  } else {
    tip = pick(['水草夠密了，被吃掉幾尾是正常的。下次母魚快生時放進育幼盒，就能全部留下', '躲得過的會長大，長到 1.6 cm 大魚就吞不下了'], day);
  }
  return `${head}。${tip}`;
}

export function plantName(species: keyof typeof PLANT_SPECIES): string {
  const sp = PLANT_SPECIES[species];
  return `${sp.name}（${sp.lightType === 'low' ? '陰性草' : '陽性草'}）`;
}
