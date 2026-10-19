import { expect, openGame, test } from './fixtures';

type Cycle = {
  cycle: {
    sim: { addFish: (s: unknown, species: string, o: object) => { genome: { ribbon?: [number, number]; fins?: number } } };
    game: { act: (f: (s: unknown) => void) => void };
  };
};

/** 大C 公魚的薄紗鰭用漸層畫，烘完不能把畫過的貼圖 destroy 掉，不然主控台一直跳 PixiJS 警告（畫面評測第 5 輪）。 */
test('加大C公魚時主控台沒有 PixiJS 貼圖警告', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('PixiJS Warning')) warnings.push(m.text());
  });
  await openGame(page);
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.act((s) => {
      for (let i = 0; i < 6; i++) {
        const f = sim.addFish(s, 'guppy', { carriesIch: false, sex: 'male', fin: 'bigC' });
        f.genome.ribbon = [1, 1];
        f.genome.fins = 100 - i * 5;
      }
    });
  });
  await page.waitForTimeout(5000);
  expect(warnings).toEqual([]);
});
