/**
 * 魚的色調（餵得好更鮮豔、轉色期偏淡、老魚褪色）。
 * 以前每條魚掛一個 ColorMatrixFilter，每一格都要多畫一次離屏貼圖；魚一多（一整窩仔魚都在轉色期）就很吃效能。
 * 現在把色調直接烘進貼圖：同一張圖、同一組色調只算一次，所有同樣的魚共用（I1 貼圖快取）。
 */

/** 色調量化：飽和度到 0.1、亮度到 0.02，避免每條魚都生一張新圖。 */
export function quantizeTone(sat: number, bright: number): { sat: number; bright: number } {
  return { sat: Math.round(sat * 10) / 10, bright: Math.round(bright * 50) / 50 };
}

export function toneKey(sat: number, bright: number): string {
  return `${sat}:${bright}`;
}

/** 跟 PixiJS ColorMatrixFilter 的 saturate(sat) 再 brightness(bright) 一樣的算法（0–1 的顏色）。 */
export function toneRGB(r: number, g: number, b: number, sat: number, bright: number): [number, number, number] {
  const x = (sat * 2) / 3 + 1;
  const y = (x - 1) * -0.5;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [clamp((x * r + y * g + y * b) * bright), clamp((y * r + x * g + y * b) * bright), clamp((y * r + y * g + x * b) * bright)];
}

/** 整張圖套上色調（RGBA 位元組，原地修改）。 */
export function toneImage(data: Uint8ClampedArray, sat: number, bright: number): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [r, g, b] = toneRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, sat, bright);
    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
}
