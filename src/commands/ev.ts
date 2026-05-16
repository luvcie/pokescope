import { Dex } from '@pkmn/sim';
import { bold, dim } from '../ansi';
import evData from '../../data/ev-yields.json';

const STAT_LABELS: Record<string, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

const yields = evData as Record<string, Record<string, number>>;

export function cmdEv(args: string[]): void {
  if (!args.length) {
    console.log('Usage: ev <pokemon>');
    return;
  }

  const name = args.join(' ').trim();
  const species = Dex.species.get(name);
  if (!species.exists) {
    console.error(`'${name}' not found.`);
    return;
  }

  const evs = yields[species.id] ?? yields[species.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '')];

  if (!evs) {
    console.log(`\n${bold(species.name)} — no EV yield found.`);
    console.log();
    return;
  }

  const parts = Object.entries(evs)
    .map(([stat, val]) => `${STAT_LABELS[stat]} ${val}`)
    .join(' | ');

  console.log(`\n${bold(species.name)} ${dim(`#${species.num}`)}`);
  console.log(`EV yield:  ${parts}`);
  console.log();
}
