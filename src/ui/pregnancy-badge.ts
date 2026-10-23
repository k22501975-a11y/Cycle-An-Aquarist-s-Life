import { h } from './dom';

/**
 * 商店母魚卡上的「懷孕程度」小圖示（midgame.md §6.6）：側面的母魚剪影，肚子越鼓、肚子後面的胎斑越黑，
 * 旁邊寫「剛懷上／肚子圓了／快生了」。現實的店家也看得出來，玩家開局能挑快生的那尾。
 */

export type PregnancyStage = 'early' | 'round' | 'due';

/** 從懷孕進度（0～1）分三級：肚子圓起來（同早上報告的 BELLY_SHOWS 0.5）、快生了（剩約四分之一孕期）。 */
export const PREGNANCY_STAGE_AT = { round: 0.5, due: 0.75 } as const;

export const PREGNANCY_LABEL: Record<PregnancyStage, string> = { early: '剛懷上', round: '肚子圓了', due: '快生了' };

/** 沒懷孕回傳 null。 */
export function pregnancyStage(pregnancy: number): PregnancyStage | null {
  if (!(pregnancy > 0)) return null;
  return pregnancy >= PREGNANCY_STAGE_AT.due ? 'due' : pregnancy >= PREGNANCY_STAGE_AT.round ? 'round' : 'early';
}

/** 肚子鼓多少（下緣往下幾格）、胎斑多黑。 */
const LOOK: Record<PregnancyStage, { belly: number; spot: number }> = {
  early: { belly: 0, spot: 0.2 },
  round: { belly: 2.6, spot: 0.55 },
  due: { belly: 4.6, spot: 0.95 },
};

/** 母魚剪影（頭朝右）：肚子下緣跟著 belly 鼓出來，肚子後面一塊胎斑。 */
export function pregnancySvg(stage: PregnancyStage): string {
  const { belly, spot } = LOOK[stage];
  const b = (y: number) => (y + belly).toFixed(1);
  return (
    `<svg viewBox="0 0 40 24" aria-hidden="true">` +
    // 尾巴（扇形）
    `<path d="M10 12 L2 5 Q0 12 2 19Z" fill="#e8b89a" fill-opacity=".85"/>` +
    // 身體：上緣固定，下緣在肚子那段往下鼓
    `<path d="M9 12 Q14 6 26 6.5 Q34 7 37.5 11.5 Q36 15 31 16 Q27 ${b(16.5)} 21 ${b(16.8)} Q14 ${b(16.2)} 9 12Z" fill="#d9dde0" stroke="#f3ead8" stroke-opacity=".6" stroke-width=".6"/>` +
    // 背鰭、眼睛
    `<path d="M20 6.6 Q23 3.5 26 6.6Z" fill="#c9ced2"/><circle cx="33.5" cy="10.5" r="1.3" fill="#1b2a33"/>` +
    // 胎斑：肚子後面靠近肛鰭
    `<ellipse cx="23.5" cy="${b(13.4)}" rx="${(2.2 + belly * 0.25).toFixed(1)}" ry="${(1.6 + belly * 0.2).toFixed(1)}" fill="#1b1410" opacity="${spot}"/>` +
    `</svg>`
  );
}

/** 卡片左下角的小徽章。 */
export function pregnancyBadge(stage: PregnancyStage): HTMLElement {
  const icon = h('i.preg-icon');
  icon.innerHTML = pregnancySvg(stage);
  return h(`span.preg.${stage}`, { title: PREGNANCY_LABEL[stage] }, icon, h('b', {}, PREGNANCY_LABEL[stage]));
}
