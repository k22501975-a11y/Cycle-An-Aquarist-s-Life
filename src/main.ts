import { Application } from 'pixi.js';
import { GAME_SECONDS_PER_DAY, GameClock } from './sim';
import { TankView } from './render/tank-view';

async function start(): Promise<void> {
  const container = document.getElementById('app')!;
  const app = new Application();
  await app.init({ resizeTo: container, background: 0x0b1a24, antialias: true });
  container.appendChild(app.canvas);

  const clock = new GameClock();
  const view = new TankView(app);
  app.stage.addChild(view.root);

  app.ticker.add((ticker) => {
    clock.advance(ticker.deltaMS);
    const day = Math.floor(clock.gameTime / GAME_SECONDS_PER_DAY) + 1;
    const hours = Math.floor((clock.gameTime % GAME_SECONDS_PER_DAY) / 3600);
    view.setInfo(`第 ${day} 天 ${String(hours).padStart(2, '0')}:00  ×${clock.timeScale}`);
  });
}

start();
