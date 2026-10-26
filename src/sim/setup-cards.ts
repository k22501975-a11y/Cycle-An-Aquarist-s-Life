import { CARDS, HEATER_FOR_TANK, SETUP_CATEGORIES, setupOptionPrice, recommendedFor, type SetupCategory, type SetupChoice, type SetupDraft, type SetupCategoryCards } from './setup';

/** 挑設備的卡片資料：開機用不到，分出來讓開機少載一點。 */
/** 每一類的卡片（給開缸畫面用）。locked 的卡畫成灰的、不能點。 */
export function setupCards(choice: SetupDraft = {}): SetupCategoryCards[] {
  return SETUP_CATEGORIES.map(({ category, title }) => ({
    category,
    title,
    options: CARDS[category].map((c) => ({
      id: c.id,
      name: c.name,
      price: setupOptionPrice(category, c.id),
      pro: c.pro,
      con: c.con,
      ...(c.art ? { art: c.art } : {}),
      recommended: recommendedFor(choice, category) === c.id,
      ...(c.locked ? { locked: c.locked } : {}),
      ...(warningFor(choice, category, c.id) ? { warning: warningFor(choice, category, c.id) } : {}),
    })),
  }));
}

/** 換了缸之後，加熱棒跟著換成適合的（玩家之後還可以自己改）。 */
export function withTank(choice: SetupDraft, tank: SetupChoice['tank']): SetupDraft {
  if (choice.tank === undefined || choice.heater !== HEATER_FOR_TANK[choice.tank]) return { ...choice, tank };
  return { ...choice, tank, heater: HEATER_FOR_TANK[tank] };
}

/** 照目前其他選擇，選這張時阿德老闆要提醒什麼（只提醒，不擋）。 */
function warningFor(choice: SetupDraft, category: SetupCategory, id: string): string | undefined {
  const big = choice.tank === 'std40';
  if (category === 'heater' && big && id === 'h25') return '40L 用 25W，冬天寒流水溫會掉，菌長得慢、魚也容易生病';
  if (category === 'heater' && choice.tank === 'nano20' && id === 'h100') return '20L 用 100W，萬一加熱棒卡住，水溫幾小時就會衝到危險';
  if (category === 'filter' && big && id === 'sponge') return '水妖精顧 40L 有點吃力，魚別放太多';
  if (category === 'filter' && id === 'canister' && choice.air === 'none') return '圓桶水面攪動少，魚多時記得加打氣';
  if (category === 'light' && id === 'planted') return '水草燈不配 CO₂ 很容易長藻，記得多換水、多種草';
  return undefined;
}
