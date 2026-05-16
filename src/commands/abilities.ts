import { Dex } from '@pkmn/sim';
import { bold, dim, blue } from '../ansi';
import { splitGen } from '../gen';

export function cmdAbilities(args: string[]): void {
  if (!args.length) {
    console.log('Usage: abilities [gen] <ability>');
    return;
  }

  const { dex, targets } = splitGen(args);
  const abilityName = targets.join(' ').trim();
  const ability = dex.abilities.get(abilityName);

  if (!ability.exists) {
    console.error(`'${abilityName}' not found.`);
    return;
  }

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  const maxGen = dex.gen;

  const regular: string[] = [];
  const hidden: string[] = [];

  for (const species of dex.species.all()) {
    if (!species.exists || species.num <= 0) continue;
    if (species.isNonstandard === 'Custom' || species.isNonstandard === 'LGPE') continue;
    if (species.gen > maxGen) continue;

    const abs = species.abilities;
    const inRegular = abs['0'] === ability.name || abs['1'] === ability.name;
    const inHidden = abs['H'] === ability.name;

    if (inRegular) regular.push(species.name);
    else if (inHidden) hidden.push(species.name);
  }

  regular.sort();
  hidden.sort();

  console.log(`\n${bold(ability.name)}${genLabel}`);
  if (ability.shortDesc || ability.desc) {
    console.log(dim(ability.shortDesc || ability.desc));
  }
  console.log();

  function printGroup(label: string, names: string[]): void {
    if (!names.length) return;
    const prefix = `  ${blue(label)}  `;
    const visualLen = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
    const indent = ' '.repeat(visualLen(prefix));
    const LINE = 80;
    let line = prefix;
    let vlen = visualLen(prefix);
    let first = true;
    for (const name of names) {
      const part = first ? name : `, ${name}`;
      if (vlen + part.length > LINE && !first) {
        console.log(line);
        line = indent + name;
        vlen = indent.length + name.length;
      } else {
        line += part;
        vlen += part.length;
      }
      first = false;
    }
    if (line.trim()) console.log(line);
    console.log();
  }

  printGroup('Regular', regular);
  printGroup('Hidden', hidden);

  if (!regular.length && !hidden.length) {
    console.log(dim('  No pokemon found.\n'));
  }
}
