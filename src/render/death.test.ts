import { describe, expect, it } from 'vitest';
import { DEATH_SECONDS, deathPose } from './fish-motion';

describe('死亡演出', () => {
  it('剛死時身體還是正的、尾巴還在抽動', () => {
    const p = deathPose(0.1);
    expect(p.flip).toBeCloseTo(1);
    expect(p.swing).toBeGreaterThan(0);
  });

  it('慢慢翻過去，演完時白肚朝上、完全褪色、不再動', () => {
    expect(deathPose(DEATH_SECONDS / 2).flip).toBeLessThan(0.9);
    expect(deathPose(DEATH_SECONDS / 2).flip).toBeGreaterThan(-0.9);
    const end = deathPose(DEATH_SECONDS + 5);
    expect(end.flip).toBeCloseTo(-1);
    expect(end.fade).toBe(1);
    expect(end.swing).toBe(0);
    expect(end.tilt).toBeCloseTo(0);
  });

  it('蝦子側躺，不翻白肚', () => {
    expect(deathPose(DEATH_SECONDS + 1, true).flip).toBe(1);
  });
});
