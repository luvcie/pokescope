import { Dex } from '@pkmn/sim';
import { bold, dim, blue } from '../ansi';
import { parseGenPrefix, GEN_ALIASES } from '../gen';
import evData from '../../data/ev-yields.json';

const yields = evData as Record<string, Record<string, number>>;

const STAT_ALIASES: Record<string, string> = {
  hp: 'hp',
  atk: 'atk', attack: 'atk',
  def: 'def', defense: 'def', defence: 'def',
  spa: 'spa', spatk: 'spa', specialattack: 'spa',
  spd: 'spd', spdef: 'spd', specialdefense: 'spd', specialdefence: 'spd',
  spe: 'spe', speed: 'spe',
};

const STAT_LABELS: Record<string, string> = {
  hp: 'HP', atk: 'Attack', def: 'Defense',
  spa: 'Special Attack', spd: 'Special Defense', spe: 'Speed',
};

function idToName(id: string): string {
  let s = Dex.species.get(id);
  if (!s.exists) s = Dex.species.get(id.replace(/(male|female)$/, ''));
  return s.exists ? s.name : id;
}

function idToGen(id: string): number {
  let s = Dex.species.get(id);
  if (!s.exists) s = Dex.species.get(id.replace(/(male|female)$/, ''));
  return s.exists ? s.gen : 99;
}

export function cmdEvspread(args: string[]): void {
  if (!args.length) {
    console.log('Usage: evspread [gen] <stat>  (hp, atk, def, spa, spd, spe)');
    return;
  }

  const { genMod, rest } = parseGenPrefix(args.join(' '));
  const maxGen: number = genMod ? parseInt(genMod.replace('gen', '')) : 9;
  const genLabel = genMod ? dim(` [${genMod}]`) : '';

  const key = rest.toLowerCase().replace(/[^a-z]/g, '');
  const stat = STAT_ALIASES[key];
  if (!stat) {
    console.error(`Unknown stat '${rest.trim()}'. Use: hp, atk, def, spa, spd, spe`);
    return;
  }

  const groups: Record<number, string[]> = { 3: [], 2: [], 1: [] };
  for (const [id, evs] of Object.entries(yields)) {
    if (!(stat in evs)) continue;
    if (idToGen(id) > maxGen) continue;
    const val = evs[stat];
    if (val in groups) groups[val].push(idToName(id));
  }

  for (const g of Object.values(groups)) g.sort();

  const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

  console.log(`\n${bold(STAT_LABELS[stat])} EVs${genLabel}:\n`);
  for (const amount of [3, 2, 1]) {
    const names = groups[amount];
    if (!names.length) continue;
    const prefix = `  ${blue('+' + amount)}  `;
    const visualPrefixLen = stripAnsi(prefix).length;
    const indent = ' '.repeat(visualPrefixLen);
    const LINE = 80;
    let line = prefix;
    let visualLen = visualPrefixLen;
    let first = true;
    for (const name of names) {
      const part = first ? name : `, ${name}`;
      if (visualLen + part.length > LINE && !first) {
        console.log(line);
        line = indent + name;
        visualLen = visualPrefixLen + name.length;
      } else {
        line += part;
        visualLen += part.length;
      }
      first = false;
    }
    if (line.trim()) console.log(line);
    console.log();
  }
}
