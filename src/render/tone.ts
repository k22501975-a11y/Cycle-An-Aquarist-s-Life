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

/**
 * 邊緣光（畫面評測 V15）：寫實的魚圖放進插畫風的缸裡顯得灰暗。
 * 身體上緣（上方幾個像素是透明的地方）加一道偏青的亮光，像水面的光打在背上，魚就從背景跳出來。
 * width 是邊緣光的厚度（像素），strength 0–1。
 */
export function rimLight(data: Uint8ClampedArray, w: number, h: number, width: number, strength: number): void {
  const alphaAt = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
  const lit = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = alphaAt(x, y);
      if (a < 128) continue;
      // 往上找第一個透明的像素：越靠近邊緣越亮
      for (let d = 1; d <= width; d++) {
        if (alphaAt(x, y - d) < 64) {
          lit[y * w + x] = 1 - (d - 1) / width;
          break;
        }
      }
    }
  }
  for (let i = 0; i < lit.length; i++) {
    const k = lit[i] * strength;
    if (k <= 0) continue;
    const p = i * 4;
    data[p] = Math.round(data[p] + (210 - data[p]) * k);
    data[p + 1] = Math.round(data[p + 1] + (245 - data[p + 1]) * k);
    data[p + 2] = Math.round(data[p + 2] + (255 - data[p + 2]) * k);
  }
}
