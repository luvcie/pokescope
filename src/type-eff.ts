import type { ModdedDex, Move } from '@pkmn/sim';

// Calculates type effectiveness accounting for onEffectiveness overrides (Freeze-Dry, Flying Press, etc.)
export function calcTypeEff(dex: ModdedDex, source: Move | string, defTypes: string[]): number {
  const immune = dex.getImmunity(source, { types: defTypes });
  const isMove = typeof source !== 'string';
  const ignoreImm = isMove && source.ignoreImmunity &&
    (source.ignoreImmunity === true ||
      (typeof source.ignoreImmunity === 'object' && source.ignoreImmunity[source.type]));
  if (!immune && !ignoreImm) return 0;
  let totalTypeMod = 0;
  const isStatus = isMove && source.category === 'Status';
  const hasNoPower = isMove && !source.basePower && !source.basePowerCallback;
  if (!isStatus && !hasNoPower) {
    for (const type of defTypes) {
      const baseMod = dex.getEffectiveness(source, type);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const moveMod = isMove ? (source as any).onEffectiveness?.call({ dex }, baseMod, null, type, source) : undefined;
      totalTypeMod += typeof moveMod === 'number' ? moveMod : baseMod;
    }
  }
  return 2 ** totalTypeMod;
}
