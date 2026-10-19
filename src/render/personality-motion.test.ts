import { describe, expect, it } from 'vitest';
import { PERSONALITY_SPECS } from '../sim';
import { comesToPoke, spawnSwimmer, updateSwimmer, type FishMood, type Swimmer } from './fish-motion';

function rng(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

const BODY = { halfLen: 30, halfH: 9 };
const bounds = { width: 900, height: 500, surface: 40, bottom: 440 };
const mood = (p: keyof typeof PERSONALITY_SPECS): FishMood => PERSONALITY_SPECS[p];

/** 兩尾魚離飼料一樣遠，看誰先游到（秒）。 */
function raceToFood(a: FishMood, b: FishMood, seed: number): [number, number] {
  const rand = rng(seed);
  const fish: Swimmer[] = [spawnSwimmer(1, 'guppy', bounds, rand), spawnSwimmer(2, 'guppy', bounds, rand)];
  fish[0].x = 200; fish[1].x = 700;
  fish[0].y = fish[1].y = 300;
  fish[0].vx = fish[1].vx = 0;
  const food = [{ x: 450, y: 120 }];
  const moods = [a, b];
  const arrived: [number, number] = [Infinity, Infinity];
  for (let i = 0; i < 30 * 20; i++) {
    fish.forEach((s, k) => {
      updateSwimmer(s, fish, { alive: true, hungry: true, symptoms: [], body: BODY, mood: moods[k] }, { bounds, scale: 1, food, frenzy: 1 }, 1 / 30, rand);
      if (arrived[k] === Infinity && Math.hypot(s.x - food[0].x, s.y - food[0].y) < 40) arrived[k] = i / 30;
    });
  }
  return arrived;
}

describe('魚的個性改變游法（F6）', () => {
  it('貪吃的比膽小的先游到飼料', () => {
    let greedyWins = 0;
    for (const seed of [2, 5, 9, 13, 21]) {
      const [g, s] = raceToFood(mood('greedy'), mood('shy'), seed);
      if (g < s) greedyWins++;
    }
    expect(greedyWins).toBeGreaterThanOrEqual(4);
  });

  it('手指點水面：好奇的大多會來，膽小的幾乎不來；同一次點擊結果固定', () => {
    const rate = (approach: number) => {
      let n = 0;
      for (let id = 1; id <= 400; id++) if (comesToPoke(id, 7, approach)) n++;
      return n / 400;
    };
    expect(rate(PERSONALITY_SPECS.curious.approach)).toBeGreaterThan(0.8);
    expect(rate(PERSONALITY_SPECS.shy.approach)).toBeLessThan(0.12);
    expect(comesToPoke(42, 3, 0.5)).toBe(comesToPoke(42, 3, 0.5));
  });

  it('好奇的魚會游到手指點的地方', () => {
    const rand = rng(4);
    const s = spawnSwimmer(1, 'guppy', bounds, rand);
    s.x = 330; s.y = 250;
    const id = [...Array(50).keys()].map((k) => k + 1).find((k) => comesToPoke(k, 1, mood('curious').approach))!;
    s.id = id;
    const poke = { x: 650, y: 200, age: 0, seq: 1 };
    for (let i = 0; i < 30 * 4; i++) {
      updateSwimmer(s, [s], { alive: true, hungry: false, symptoms: [], body: BODY, mood: mood('curious') }, { bounds, scale: 1, food: [], poke }, 1 / 30, rand);
      poke.age += 1 / 30;
    }
    expect(Math.hypot(s.x - poke.x, s.y - poke.y)).toBeLessThan(120);
  });
});
