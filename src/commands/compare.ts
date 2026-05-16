import { Dex } from '@pkmn/sim';
import { bold, dim, green, red } from '../ansi';
import { splitGen } from '../gen';

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const STAT_LABELS: Record<string, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

export function cmdCompare(args: string[]): void {
  if (!args.length) {
    console.log('Usage: compare [gen] <pokemon1>, <pokemon2>');
    return;
  }

  const { dex, targets } = splitGen(args);

  if (targets.length < 2) {
    console.log('Usage: compare [gen] <pokemon1>, <pokemon2>');
    return;
  }

  const [a, b] = [dex.species.get(targets[0]), dex.species.get(targets[1])];

  if (!a.exists) { console.error(`'${targets[0]}' not found.`); return; }
  if (!b.exists) { console.error(`'${targets[1]}' not found.`); return; }

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  const nameA = a.name;
  const nameB = b.name;

  const colW = Math.max(nameA.length, nameB.length, 6) + 2;
  const labelW = 4;

  console.log(`\n${bold(nameA)} vs ${bold(nameB)}${genLabel}\n`);
  console.log(' '.repeat(labelW + 2) + nameA.padStart(colW) + nameB.padStart(colW));

  const bstA = STATS.reduce((s, k) => s + a.baseStats[k], 0);
  const bstB = STATS.reduce((s, k) => s + b.baseStats[k], 0);

  for (const stat of STATS) {
    const vA = a.baseStats[stat];
    const vB = b.baseStats[stat];
    const label = STAT_LABELS[stat].padEnd(labelW);
    const fmtA = vA > vB ? green(String(vA).padStart(colW)) : vA < vB ? red(String(vA).padStart(colW)) : String(vA).padStart(colW);
    const fmtB = vB > vA ? green(String(vB).padStart(colW)) : vB < vA ? red(String(vB).padStart(colW)) : String(vB).padStart(colW);
    console.log(`  ${label}${fmtA}${fmtB}`);
  }

  const fmtBstA = bstA > bstB ? green(String(bstA).padStart(colW)) : bstA < bstB ? red(String(bstA).padStart(colW)) : String(bstA).padStart(colW);
  const fmtBstB = bstB > bstA ? green(String(bstB).padStart(colW)) : bstB < bstA ? red(String(bstB).padStart(colW)) : String(bstB).padStart(colW);
  console.log(`  ${'BST'.padEnd(labelW)}${fmtBstA}${fmtBstB}`);
  console.log();
}
