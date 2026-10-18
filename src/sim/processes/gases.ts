import { co2Equilibrium, oxygenSaturation, phFromCo2 } from '../chemistry';
import { isCo2Injecting, isFilterRunning, type TankState } from '../state';
import { hardscapePhOffset } from './hardscape';

/**
 * 水面氣體交換係數（每小時）。過濾器擾動水面、打氣機都會加快交換：
 * 溶氧更多，但注入的 CO₂ 也跑得更快。
 */
export function gasExchangeRate(state: TankState): number {
  const { equipment, environment } = state;
  let k = 0.02;
  if (equipment.filter && isFilterRunning(state)) k += equipment.filter.spec.surfaceAgitation * 0.15;
  if (equipment.airPump?.on && !environment.powerOut) k += equipment.airPump.spec.aeration * 0.2;
  // 水面積相對水量越大，交換越快（以 40L 標準缸為基準）。
  return k * (equipment.tank.surfaceCm2 / equipment.tank.volumeL / 33.75);
}

export function updateGases(state: TankState, dt: number): void {
  const { water, equipment } = state;
  const volume = equipment.tank.volumeL;
  const exchange = 1 - Math.exp(-gasExchangeRate(state) * dt);

  const co2 = equipment.co2;
  if (co2 && isCo2Injecting(state)) {
    water.co2 += (co2.spec.mgPerHour / volume) * dt;
  }

  water.o2 += (oxygenSaturation(water.tempC) - water.o2) * exchange;
  water.co2 += (co2Equilibrium(water.tempC) - water.co2) * exchange;
  water.o2 = Math.max(0, water.o2);
  water.co2 = Math.max(0, water.co2);

  water.ph = phFromCo2(water.kh, water.co2) - hardscapePhOffset(state);
  water.phAvg += (water.ph - water.phAvg) * (1 - Math.exp(-dt / 3));
}
