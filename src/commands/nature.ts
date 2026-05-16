import { Dex } from '@pkmn/sim';
import { bold, dim, green, red } from '../ansi';

const STAT_NAMES: Record<string, string> = {
  hp: 'HP', atk: 'Attack', def: 'Defense',
  spa: 'Special Attack', spd: 'Special Defense', spe: 'Speed',
};

const ALL_NATURES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
];

function printNature(name: string): void {
  const nature = Dex.natures.get(name);
  if (!nature.exists) {
    console.error(`'${name}' is not a nature.`);
    return;
  }

  if (!nature.plus || !nature.minus) {
    console.log(`\n${bold(nature.name)} — ${dim('neutral (no stat changes)')}`);
  } else {
    const plus = STAT_NAMES[nature.plus] ?? nature.plus;
    const minus = STAT_NAMES[nature.minus] ?? nature.minus;
    console.log(`\n${bold(nature.name)}: ${green('+10%')} ${plus}, ${red('-10%')} ${minus}`);
  }
}

export function cmdNature(args: string[]): void {
  if (!args.length) {
    console.log(`\n${bold('Natures:')}`);
    for (const name of ALL_NATURES) {
      const nature = Dex.natures.get(name);
      if (!nature.plus || !nature.minus) {
        console.log(`  ${name.padEnd(10)} ${dim('neutral')}`);
      } else {
        const plus = STAT_NAMES[nature.plus] ?? nature.plus;
        const minus = STAT_NAMES[nature.minus] ?? nature.minus;
        console.log(`  ${name.padEnd(10)} ${green('+' + plus.padEnd(16))} ${red('-' + minus)}`);
      }
    }
    console.log();
    return;
  }

  const name = args.join(' ').trim();
  printNature(name);
  console.log();
}
