import { Application, Container, Graphics, Text } from 'pixi.js';

/** 水缸畫面的佔位版本：只畫缸體與資訊列，魚與水草在第 3 步加入。 */
export class TankView {
  readonly root = new Container();
  private readonly tank = new Graphics();
  private readonly info = new Text({
    text: '',
    style: { fill: 0xcfe8ef, fontSize: 14, fontFamily: 'system-ui, sans-serif' },
  });

  constructor(private readonly app: Application) {
    this.root.addChild(this.tank, this.info);
    this.info.position.set(16, 16);
    this.layout();
    app.renderer.on('resize', () => this.layout());
  }

  setInfo(text: string): void {
    this.info.text = text;
  }

  private layout(): void {
    const { width, height } = this.app.screen;
    const margin = 16;
    const top = 56;
    this.tank
      .clear()
      .roundRect(margin, top, width - margin * 2, height - top - margin, 12)
      .fill({ color: 0x1d4e63, alpha: 0.9 })
      .stroke({ color: 0x8fc9d9, width: 3, alpha: 0.6 });
  }
}
