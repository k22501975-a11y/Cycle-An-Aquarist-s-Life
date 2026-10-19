import { BrowserAdapter, Container, DOMAdapter, Texture, type Renderer } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drawFinOverlay, liveFinGradients, type FinLook } from './fin-render';

/** 只有 drawFinOverlay 用到的欄位：身體範圍、長度、可以掛子物件。 */
function fakeRig(): Parameters<typeof drawFinOverlay>[0] {
  const rig = new Container() as unknown as Parameters<typeof drawFinOverlay>[0];
  Object.assign(rig, { art: { bodyEllipse: { x: 0, y: 0, rx: 0.2, ry: 0.07 }, R: 200 }, lengthPx: 200 });
  return rig;
}

const bigC: FinLook = { traits: { bigC: true, length: 0.9 }, color: 0x4fa3ff, alpha: 0.82, dumboArt: false, family: 'blue' };

// 測試環境沒有 DOM：漸層要畫在 canvas 上、模糊濾鏡要問 WebGL 精度，給一個什麼都不做的假 canvas
const noop = () => undefined;
const ctx2d = new Proxy({} as Record<string, unknown>, {
  get: (t, k) =>
    k in t ? t[k] : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k === 'getShaderPrecisionFormat' ? () => ({ precision: 23 }) : noop,
  set: (t, k, v) => ((t[k as string] = v), true),
});
beforeAll(() => DOMAdapter.set({ ...BrowserAdapter, createCanvas: (width = 1, height = 1) => ({ width, height, getContext: () => ctx2d }) as unknown as HTMLCanvasElement }));
afterAll(() => DOMAdapter.set(BrowserAdapter));

describe('大C 薄紗鰭的漸層不會漏記憶體（#151 審查）', () => {
  it('烘成貼圖後，漸層都釋放掉', () => {
    const renderer = { generateTexture: () => Texture.WHITE } as unknown as Renderer;
    const before = liveFinGradients();
    for (let i = 0; i < 5; i++) drawFinOverlay(fakeRig(), { ...bigC, alpha: 0.8 + i * 0.01 }, renderer);
    expect(liveFinGradients()).toBe(before);
  });

  it('沒烘的時候掛著 Graphics，Graphics 拆掉時漸層一起釋放', () => {
    const before = liveFinGradients();
    const rig = fakeRig();
    drawFinOverlay(rig, bigC);
    expect(liveFinGradients()).toBeGreaterThan(before);
    rig.destroy({ children: true });
    expect(liveFinGradients()).toBe(before);
  });
});
