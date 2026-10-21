import { WebGLUnavailableError } from '../ui/crash';
import { Container, isWebGLSupported, ResizePlugin, TickerPlugin, type Rectangle, type Ticker, type WebGLOptions, type WebGLRenderer } from 'pixi.js';

/**
 * 只用 WebGL 的 Application：跟 PixiJS 的 Application 一樣掛 Ticker、Resize 兩個外掛，
 * 但不經過 autoDetectRenderer，打包時就不會帶 WebGPU 和 Canvas 兩套渲染器（約 22 KB gzip，
 * 手機上本來就不會用到，見 docs/performance-budget.md §3）。
 */
export class GlApplication {
  readonly stage = new Container();
  renderer!: WebGLRenderer;
  // 下面幾個由 TickerPlugin／ResizePlugin.init 掛上
  declare ticker: Ticker;
  declare resizeTo: HTMLElement | Window;
  declare resize: () => void;
  declare start: () => void;
  declare stop: () => void;

  async init(options: Partial<WebGLOptions> & { resizeTo?: HTMLElement | Window; autoStart?: boolean }): Promise<void> {
    // 以前 Pixi 會退回 WebGPU 或 Canvas；現在只有 WebGL，開不起來就顯示看得懂的原因（ui/crash.ts）
    if (!isWebGLSupported()) throw new WebGLUnavailableError();
    const { WebGLRenderer } = await import('./gl-renderer');
    this.renderer = new WebGLRenderer();
    try {
      await this.renderer.init(options);
    } catch (error) {
      throw new WebGLUnavailableError(error);
    }
    // 跟 Application.init 一樣的順序：先掛 ticker（每幀 render），再掛 resize
    TickerPlugin.init.call(this as never, options);
    ResizePlugin.init.call(this as never, options);
  }

  render(): void {
    this.renderer.render({ container: this.stage });
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.canvas;
  }

  get screen(): Rectangle {
    return this.renderer.screen;
  }
}
