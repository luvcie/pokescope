import { Dex } from 'pokemon-showdown';
import { bold, dim, red, green, cyan, yellow } from '../ansi';
import { splitGen } from '../gen';

export function cmdWeakness(args: string[]): void {
  if (!args.length) {
    console.log('Usage: weakness [gen] <pokemon|type[,type2]> [inverse]');
    return;
  }

  let isInverse = false;
  let raw = args.join(' ').trim();
  if (/\binverse$/i.test(raw)) {
    isInverse = true;
    raw = raw.replace(/[,\s]+inverse$/i, '').trim();
  }

  const { dex, targets } = splitGen(raw.split(/\s+/));

  if (!targets.length) {
    console.log('Usage: weakness [gen] <pokemon|type[,type2]> [inverse]');
    return;
  }

  const types: string[] = [];
  let label = '';
  let isSpecies = false;

  const firstSpecies = dex.species.get(targets[0]);
  const firstType = dex.types.get(targets[0]);

  if (firstSpecies.exists) {
    isSpecies = true;
    for (const t of firstSpecies.types) types.push(t);
    label = firstSpecies.name;
    for (let i = 1; i < targets.length; i++) {
      let extra = dex.types.get(targets[i]);
      if (!extra.exists) {
        const fuzzy = dex.dataSearch(targets[i], ['TypeChart']);
        if (fuzzy?.length) extra = dex.types.get(fuzzy[0].name as string);
      }
      if (extra.exists && !types.includes(extra.name)) {
        types.push(extra.name);
        label += '/' + extra.name;
      }
    }
  } else if (firstType.exists) {
    types.push(firstType.name);
    label = firstType.name;
    for (let i = 1; i < targets.length; i++) {
      let extra = dex.types.get(targets[i]);
      if (!extra.exists) {
        const fuzzy = dex.dataSearch(targets[i], ['TypeChart']);
        if (fuzzy?.length) extra = dex.types.get(fuzzy[0].name as string);
      }
      if (extra.exists && !types.includes(extra.name)) {
        types.push(extra.name);
        label += '/' + extra.name;
      }
    }
  } else {
    const fuzzySpecies = dex.dataSearch(targets[0], ['Pokedex']);
    const fuzzyType = dex.dataSearch(targets[0], ['TypeChart']);
    if (fuzzySpecies?.length) {
      const sp = dex.species.get(fuzzySpecies[0].name as string);
      if (sp.exists) {
        isSpecies = true;
        for (const t of sp.types) types.push(t);
        label = sp.name;
      }
    } else if (fuzzyType?.length) {
      const t = dex.types.get(fuzzyType[0].name as string);
      if (t.exists) { types.push(t.name); label = t.name; }
    }
  }

  if (types.length === 0) {
    console.error(`'${targets.join(', ')}' is not a recognized Pokemon or type${dex !== Dex ? ' in ' + dex.currentMod : ''}.`);
    return;
  }

  const weaknesses: string[] = [], resistances: string[] = [], immunities: string[] = [];
  const statuses: Record<string, string> = {
    brn: 'Burn', frz: 'Frozen', hail: 'Hail damage', par: 'Paralysis',
    powder: 'Powder moves', prankster: 'Prankster',
    sandstorm: 'Sandstorm damage', tox: 'Toxic', trapped: 'Trapping',
  };

  for (const type of dex.types.names()) {
    const notImmune = dex.getImmunity(type, types);
    if (notImmune || isInverse) {
      let typeMod = (!notImmune && isInverse) ? 1 : 0;
      typeMod += (isInverse ? -1 : 1) * dex.getEffectiveness(type, types);
      if (typeMod === 1) weaknesses.push(type);
      else if (typeMod === 2) weaknesses.push(bold(type) + yellow(' (4x)'));
      else if (typeMod >= 3) weaknesses.push(bold(type) + red(' (8x)'));
      else if (typeMod === -1) resistances.push(type);
      else if (typeMod === -2) resistances.push(bold(type) + dim(' (0.25x)'));
      else if (typeMod <= -3) resistances.push(bold(type) + dim(' (0.125x)'));
    } else {
      immunities.push(type);
    }
  }

  for (const status in statuses) {
    if (!dex.getImmunity(status, types)) {
      immunities.push(dim(statuses[status]));
    }
  }

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  const ignLabel = isSpecies ? dim(' (ignoring abilities)') : '';
  const invLabel = isInverse ? ' [Inverse]' : '';
  console.log(`\n${bold(label)}${ignLabel}${genLabel}${invLabel}`);
  console.log(`${red('Weaknesses')}:   ${weaknesses.join(', ') || dim('None')}`);
  console.log(`${green('Resistances')}: ${resistances.join(', ') || dim('None')}`);
  console.log(`${cyan('Immunities')}:  ${immunities.join(', ') || dim('None')}`);
  console.log();

}
