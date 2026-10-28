/// <reference types="node" />
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, inject } from 'vitest';
import { strainFacts, strainRun } from './strain-fixing-run';

/**
 * 固定品系 300 天劇本的驗收（strain-fixing.md §3、§5、§7、§10，#344、#351、#378），種子 1～6 各一個檔平行跑，照推薦選。
 * 種子固定用 1～6，看比例（企劃 2026-10-24 §10：每次重挑種子看不出是真的變好還是挑到好種子）：
 * - 開獎那窩有白子紅蛇王（一鍵買的紅蛇王帶白子）≥ 5/6
 * - C18 取名（40%）≤ 第 200 天 ≥ 4/6；品系完成（75%）≤ 第 360 天 ≥ 4/6
 * - 尾鰭：第一代到最新一代少的分數，6 個種子的中位數 ≤ 15，每個種子 ≤ 20（§6 第 3 點）
 * - 節奏：第 80～200 天懷孕期間相鄰的卡或里程碑 ≤ 7 天、其他 ≤ 6 天 ≥ 5/6，而且每個種子都沒有超過 8 天的空檔
 * - 錢：第 260 天金幣 ≥ 第 120 天 − 這段買缸花的一半（缸算半價的資產，§9）≥ 5/6；第 120～260 天隨時 ≥ 300 每個種子都要
 * 每個種子都要：第二代穩定度比第一代高；種魚不餓死（midgame.md §7.9）；一天最多一張；擠缸死魚 ≤ 2 尾；
 * 前 120 天白點 ≤ 2 波、照推薦買東西買完都剩 ≥ 500 元（polish-to-9.md §11）。
 * 比例要 6 個種子都跑完才算：每檔把結果記在這次測試的資料夾，最後跑完的那檔算（只跑一檔就只看那個種子）。
 * 注意：結果記在這台機器的暫存資料夾，以後 vitest 改用 --shard 分機器跑的話，6 份不會在同一台，比例就不會算，到時要改成同一台跑這 6 檔。
 */
export const STRAIN_SEEDS = [1, 2, 3, 4, 5, 6];

interface SeedResult {
  seed: number;
  reveal: boolean;
  named: boolean;
  done: boolean;
  paced: boolean;
  coins: boolean;
  tailDrop: number;
  log: string;
  /** 結果表用的數字（PR 上對照）。 */
  numbers: Record<string, unknown>;
}

const atLeast = (rs: SeedResult[], key: 'reveal' | 'named' | 'done' | 'paced' | 'coins') => rs.filter((r) => r[key]).length;

export function strainSeed(seed: number): void {
  const run = strainRun(seed);
  const f = strainFacts(run);
  const mine: SeedResult = {
    seed,
    reveal: f.revealDream > 0,
    named: run.namedDay <= 200,
    done: run.doneDay <= 360,
    paced: f.gaps.length === 0,
    coins: f.coins260 >= f.coins120 - f.tankSpend / 2,
    tailDrop: f.tailDrop,
    log: f.log,
    numbers: {
      reveal: `${f.revealDream}/${run.broods[0]?.n ?? 0}`,
      named: run.namedDay,
      done: run.doneDay,
      gaps: f.gaps,
      coins120: f.coins120,
      coins260: f.coins260,
      tankSpend: f.tankSpend,
      minCoins: f.minCoins,
    },
  };
  const dir = join(tmpdir(), 'cycle-strain-fixing', inject('runId') ?? 'local');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${seed}.json`), JSON.stringify(mine));
  const all = readdirSync(dir).map((x) => JSON.parse(readFileSync(join(dir, x), 'utf8')) as SeedResult);
  if (STRAIN_SEEDS.every((s) => all.some((r) => r.seed === s))) {
    const sum = all
      .sort((a, b) => a.seed - b.seed)
      .map(
        (r) =>
          `種子 ${r.seed}：開獎${r.reveal ? '有' : '沒有'}夢想魚、取名${r.named ? '≤200' : '>200'}、完成${r.done ? '≤360' : '>360'}、節奏${r.paced ? '沒' : '有'}空太久、錢${r.coins ? '夠' : '不夠'}、尾鰭少 ${r.tailDrop}`,
      )
      .join('\n');
    expect(atLeast(all, 'reveal'), sum).toBeGreaterThanOrEqual(5);
    expect(atLeast(all, 'named'), sum).toBeGreaterThanOrEqual(4);
    expect(atLeast(all, 'done'), sum).toBeGreaterThanOrEqual(4);
    expect(atLeast(all, 'paced'), sum).toBeGreaterThanOrEqual(5);
    expect(atLeast(all, 'coins'), sum).toBeGreaterThanOrEqual(5);
    const tails = all.map((r) => r.tailDrop).sort((a, b) => a - b);
    expect((tails[2] + tails[3]) / 2, sum).toBeLessThanOrEqual(15);
  }
  expect(f.gen2, f.log).toBeGreaterThan(f.gen1);
  expect(f.doubleCards, f.log).toEqual([]);
  // 空檔再長也不能超過 8 天（§10 保底）
  expect(
    f.gaps.filter((g) => {
      const [a, b] = g.split('→').map(Number);
      return b - a > 8;
    }),
    f.log,
  ).toEqual([]);
  expect(f.minCoins, f.log).toBeGreaterThanOrEqual(300);
  expect(f.breederStarved, f.log).toBe(0);
  expect(f.crowdDeaths, f.log).toBeLessThanOrEqual(2);
  expect(f.tailDrop, f.log).toBeLessThanOrEqual(20);
  // polish-to-9.md §11：前 120 天白點最多 2 波；照推薦買東西，買完手上都還有 BUY_RESERVE
  const early = run.nights.filter((n) => n.day <= 120);
  expect(early.reduce((a, n) => a + n.ichNew, 0), f.log).toBeLessThanOrEqual(2);
  expect(early.filter((n) => n.lowBuy !== undefined).map((n) => `${n.day}:${n.lowBuy}`), f.log).toEqual([]);
}
