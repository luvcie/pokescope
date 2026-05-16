import { Dex } from '@pkmn/sim';
import { bold, dim, red, yellow, green, cyan } from '../ansi';
import { splitGen } from '../gen';

export function cmdTeam(args: string[]): void {
  if (!args.length) {
    console.log('Usage: team [gen] <pokemon1>, <pokemon2>[, ...]');
    return;
  }

  const { dex, targets } = splitGen(args);

  if (!targets.length) {
    console.log('Usage: team [gen] <pokemon1>, <pokemon2>[, ...]');
    return;
  }

  const members: Array<{ name: string; types: string[] }> = [];
  for (const t of targets) {
    const species = dex.species.get(t);
    if (!species.exists) {
      console.error(`'${t}' not found.`);
      return;
    }
    members.push({ name: species.name, types: [...species.types] });
  }

  if (members.length < 2) {
    console.error('Need at least 2 pokemon for a team analysis.');
    return;
  }

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  const teamLabel = members.map(m => m.name).join(' / ');
  const n = members.length;

  type Entry = {
    type: string;
    weak: Array<{ name: string; mod: number }>;
    immune: string[];
    resistCount: number;
  };

  const entries: Entry[] = [];

  for (const attackType of dex.types.names()) {
    const weak: Array<{ name: string; mod: number }> = [];
    const immune: string[] = [];
    let resistCount = 0;

    for (const member of members) {
      const notImmune = dex.getImmunity(attackType, member.types);
      if (!notImmune) {
        immune.push(member.name);
        continue;
      }
      const mod = dex.getEffectiveness(attackType, member.types);
      if (mod < 0) resistCount++;
      else if (mod >= 1) weak.push({ name: member.name, mod });
    }

    entries.push({ type: attackType, weak, immune, resistCount });
  }

  entries.sort((a, b) => {
    const diff = b.weak.length - a.weak.length;
    if (diff !== 0) return diff;
    return a.type.localeCompare(b.type);
  });

  const hasWeakness = entries.filter(e => e.weak.length > 0);
  const noResist = entries.filter(e => e.resistCount === 0 && e.immune.length === 0 && e.weak.length > 0);

  const immunityMap: Record<string, string[]> = {};
  for (const entry of entries) {
    for (const name of entry.immune) {
      if (!immunityMap[name]) immunityMap[name] = [];
      immunityMap[name].push(entry.type);
    }
  }

  console.log(`\n${bold('Team')}${genLabel}: ${teamLabel}\n`);

  if (!hasWeakness.length) {
    console.log(dim('  No weaknesses.\n'));
  } else {
    console.log(`${red('Weaknesses')}:`);
    const colWidth = Math.max(...hasWeakness.map(e => e.type.length)) + 2;
    for (const entry of hasWeakness) {
      const count = `${entry.weak.length}/${n}`;
      const names = entry.weak.map(m => m.name + (m.mod >= 2 ? yellow(' (4x)') : '')).join(', ');
      console.log(`  ${entry.type.padEnd(colWidth)} ${count.padEnd(5)}  ${names}`);
    }
    console.log();
  }

  if (noResist.length) {
    console.log(`${yellow('Nobody resists')}: ${noResist.map(e => e.type).join(', ')}`);
    console.log();
  }

  if (Object.keys(immunityMap).length) {
    console.log(`${cyan('Immunities')}:`);
    for (const [name, types] of Object.entries(immunityMap)) {
      console.log(`  ${name.padEnd(16)} ${types.join(', ')}`);
    }
    console.log();
  }

  const hasResist = entries.filter(e => e.resistCount > 0);
  hasResist.sort((a, b) => b.resistCount - a.resistCount || a.type.localeCompare(b.type));

  if (hasResist.length) {
    console.log(`${green('Resistances')}:`);
    const colWidth = Math.max(...hasResist.map(e => e.type.length)) + 2;
    for (const entry of hasResist) {
      const resisters = members
        .filter(m => {
          const notImmune = dex.getImmunity(entry.type, m.types);
          if (!notImmune) return false;
          return dex.getEffectiveness(entry.type, m.types) < 0;
        })
        .map(m => m.name)
        .join(', ');
      console.log(`  ${entry.type.padEnd(colWidth)} ${resisters}`);
    }
    console.log();
  }
}
