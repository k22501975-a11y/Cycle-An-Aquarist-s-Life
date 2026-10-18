/**
 * 孔雀魚品系的外觀（Phase 0 依個體編號輪替；Phase 1 改由基因決定）。
 * 顏色取自 art-style-cartoon-guppies.svg 與主畫面示意圖。純資料，介面與繪圖都會用到。
 */

export type TailPattern = 'none' | 'dots' | 'lace';
export type BodyPattern = 'none' | 'lace' | 'tuxedo';

export interface GuppyLook {
  strain: string;
  tail: number;
  tailOuter: number;
  fin: number;
  body: number;
  shade: number;
  tailPattern: TailPattern;
  bodyPattern: BodyPattern;
  patternColor: number;
  /** 瞳孔顏色（白子是紅眼）。 */
  eye: number;
  /** 稀有基因的金邊／虹彩（鰭緣發光的顏色）。 */
  rim?: number;
}

/** 示意圖與 art-style-cartoon-guppies.svg 的四個品系，再加一個紅蛇王。黃金蛇王示範稀有的金邊圖層。 */
export const GUPPY_LOOKS: GuppyLook[] = [
  { strain: '藍草', tail: 0x4a8cf0, tailOuter: 0x7db8ff, fin: 0x4a8cf0, body: 0xc9d6e2, shade: 0x7f93a8, tailPattern: 'dots', bodyPattern: 'none', patternColor: 0x13306e, eye: 0x111111 },
  { strain: '黃金蛇王', tail: 0xffc928, tailOuter: 0xffe57a, fin: 0xffc928, body: 0xffd54a, shade: 0xd49a1c, tailPattern: 'lace', bodyPattern: 'lace', patternColor: 0x6b4a0c, eye: 0x111111, rim: 0xffe08a },
  { strain: '白子全紅', tail: 0xe8202e, tailOuter: 0xff6a55, fin: 0xff3b3b, body: 0xff4b4b, shade: 0xb81d2c, tailPattern: 'none', bodyPattern: 'none', patternColor: 0, eye: 0xd1122a },
  { strain: '藍尾禮服', tail: 0x2f6ee0, tailOuter: 0x6fb0ff, fin: 0x3d78e8, body: 0xe4ebf1, shade: 0x97a6b5, tailPattern: 'none', bodyPattern: 'tuxedo', patternColor: 0x20263a, eye: 0x111111 },
  { strain: '紅蛇王', tail: 0xff5a3a, tailOuter: 0xffa05a, fin: 0xff5a3a, body: 0xf3e3c3, shade: 0xc7a77a, tailPattern: 'lace', bodyPattern: 'lace', patternColor: 0x7a1a10, eye: 0x111111 },
];

export function guppyLook(variant: number): GuppyLook {
  return GUPPY_LOOKS[variant % GUPPY_LOOKS.length];
}

