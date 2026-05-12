import { Dex } from 'pokemon-showdown';
import type { ModdedDex } from 'pokemon-showdown/dist/sim/dex';

export const GEN_ALIASES: Record<string, string> = {
  rby: 'gen1', rb: 'gen1',
  gsc: 'gen2', gs: 'gen2',
  adv: 'gen3', rs: 'gen3',
  dpp: 'gen4', dp: 'gen4',
  bw: 'gen5', bw2: 'gen5',
  oras: 'gen6', xy: 'gen6',
  usum: 'gen7', sm: 'gen7',
  ss: 'gen8',
  sv: 'gen9',
};

export const GEN_PATTERN = /^(gen[1-9]|rby|rb|gsc|gs|adv|rs|dpp|dp|bw2?|oras|xy|usum|sm|ss|sv)$/;

// Returns undefined genMod when no prefix is present (callers can distinguish "no gen" from "gen9 explicit").
export function parseGenPrefix(raw: string): { genMod: string | undefined; rest: string } {
  const m = raw.match(/^(gen[1-9]|rby|rb|gsc|gs|adv|rs|dpp|dp|bw2?|oras|xy|usum|sm|ss|sv)\s*,?\s*/i);
  if (!m) return { genMod: undefined, rest: raw };
  const rawGen = m[1].toLowerCase();
  return { genMod: GEN_ALIASES[rawGen] ?? rawGen, rest: raw.slice(m[0].length) };
}

export function splitGen(args: string[]): { dex: ModdedDex; targets: string[] } {
  const raw = args.join(' ');
  const { genMod, rest } = parseGenPrefix(raw);
  const dex: ModdedDex = genMod ? Dex.mod(genMod) : Dex;
  const targets = rest.split(/[,/]/).map(s => s.trim()).filter(Boolean);
  return { dex, targets };
}
