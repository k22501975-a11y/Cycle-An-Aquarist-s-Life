/**
 * MVP 功能開關（design/mvp.md §3.2）：還沒準備好的功能整個藏起來，不出現在選單、商店、設定和提示裡，
 * 也不會顯示「伺服器還沒上線」這種畫面。程式都留著，要打開時改這裡。
 * 本機想測藏起來的功能：建置時設 VITE_FEATURES=cloudSave,market（逗號分隔）。
 */
export const FEATURE_IDS = ['cloudSave', 'market', 'friends', 'mall', 'apisto'] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

const DEFAULTS: Record<FeatureId, boolean> = {
  /** 帳號、雲端存檔（L1、L2）：伺服器上線後。 */
  cloudSave: false,
  /** 玩家交易市場（L4）：單機版用「賣給店家」和訂單板代替。 */
  market: false,
  /** 好友、參觀、送禮（L3）。 */
  friends: false,
  /** 儲值點數與商城（L6）：正式上架前。 */
  mall: false,
  /** 鳳尾短鯛（不在首發 5 種）。 */
  apisto: false,
};

export function parseFeatures(list: string | undefined): Record<FeatureId, boolean> {
  const on = new Set((list ?? '').split(',').map((s) => s.trim()));
  return Object.fromEntries(FEATURE_IDS.map((id) => [id, DEFAULTS[id] || on.has(id)])) as Record<FeatureId, boolean>;
}

export const FEATURES = parseFeatures(import.meta.env.VITE_FEATURES);
