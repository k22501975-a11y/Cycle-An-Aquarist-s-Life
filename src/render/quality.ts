/**
 * 畫質設定（低／中／高）。手機或舊電腦可以降級：少畫幾層模糊濾鏡、粒子變少、解析度降低。
 * 畫面構圖不變，只拿掉最吃效能的效果（design/art-style.md §6 效能）。
 */
export type Quality = 'low' | 'medium' | 'high';

export const QUALITY_LABELS: Record<Quality, string> = { low: '低', medium: '中', high: '高' };

export interface QualitySpec {
  /** 繪圖解析度（裝置像素比上限）。 */
  resolution: number;
  /** 後景魚的景深模糊。 */
  depthBlur: boolean;
  /** 選取魚的輪廓光要不要模糊成柔光（不模糊就是一圈細邊）。 */
  softGlow: boolean;
  /** 懸浮微粒數量的倍率。 */
  motes: number;
  /** 焦散光紋用兩層交疊（低畫質只留一層）。 */
  doubleCaustics: boolean;
}

export function qualitySpec(q: Quality, dpr: number): QualitySpec {
  switch (q) {
    case 'low':
      return { resolution: 1, depthBlur: false, softGlow: false, motes: 0.35, doubleCaustics: false };
    case 'medium':
      return { resolution: Math.min(1.5, dpr), depthBlur: true, softGlow: true, motes: 0.6, doubleCaustics: true };
    case 'high':
      return { resolution: Math.min(2, dpr), depthBlur: true, softGlow: true, motes: 1, doubleCaustics: true };
  }
}

/** 沒設定過時的預設：手機（觸控、窄螢幕）用中，其他用高。 */
export function defaultQuality(screenWidth: number, coarsePointer: boolean): Quality {
  return coarsePointer && screenWidth < 900 ? 'medium' : 'high';
}

export function isQuality(v: unknown): v is Quality {
  return v === 'low' || v === 'medium' || v === 'high';
}
