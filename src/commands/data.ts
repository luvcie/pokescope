import { Dex } from '@pkmn/sim';
import { dataSearch } from '../datasearch';
import { bold, dim } from '../ansi';
import { splitGen } from '../gen';
import { stripHtml } from '../format';

export function cmdData(args: string[]): void {
  if (!args.length) {
    console.log('Usage: data [gen] <pokemon|move|item|ability>');
    return;
  }

  const { dex, targets } = splitGen(args);
  let target = targets.join(', ').trim();

  if (!target) {
    console.log('Usage: data [gen] <pokemon|move|item|ability>');
    return;
  }

  // dex number lookup: "data 248" -> Tyranitar
  const targetNum = parseInt(target);
  if (!isNaN(targetNum) && String(targetNum) === target.trim()) {
    const found = Dex.species.all().find(s => s.num === targetNum);
    if (found) target = found.baseSpecies;
  }

  const results = dataSearch(dex, target);

  if (!results || results.length === 0) {
    console.error(`'${target}' doesn't match any Pokemon, item, move, ability, or nature${dex !== Dex ? ' in ' + dex.currentMod : ''}.`);
    return;
  }

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';

  for (const result of results) {
    if (result.isInexact) {
      console.log(dim(`No exact match for '${target}'. Showing: ${result.name as string}`));
    }
    switch (result.searchType) {
    case 'pokemon': {
      const p = dex.species.get(result.name as string);
      const stats = p.baseStats;
      const bst = stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe;
      console.log(`\n${bold(p.name)} ${dim(`#${p.num}`)}${genLabel}`);
      console.log(`Type:       ${p.types.join(' / ')}`);
      console.log(`Abilities:  ${p.abilities[0]}${p.abilities[1] ? ' | ' + p.abilities[1] : ''}${p.abilities.H ? ' | ' + dim(p.abilities.H + ' (H)') : ''}`);
      console.log(`Stats:      HP ${stats.hp} | Atk ${stats.atk} | Def ${stats.def} | SpA ${stats.spa} | SpD ${stats.spd} | Spe ${stats.spe}  ${dim('(BST ' + bst + ')')}`);
      if (p.tier) console.log(`Tier:       ${p.tier}`);
      if (p.prevo && Dex.species.get(p.prevo).gen <= dex.gen) console.log(`Pre-evo:    ${p.prevo}`);
      if (p.evos?.length) {
        const evos = p.evos.filter(e => Dex.species.get(e).gen <= dex.gen);
        if (evos.length) console.log(`Evolves:    ${evos.join(', ')}`);
      }
      if (p.eggGroups?.length) console.log(`Egg Groups: ${p.eggGroups.join(', ')}`);
      console.log();
      break;
    }
    case 'move': {
      const m = dex.moves.get(result.name as string);
      const bp = m.basePower || (m.basePowerCallback ? '(variable)' : '-');
      const acc = m.accuracy === true ? '-' : m.accuracy;
      console.log(`\n${bold(m.name)}${genLabel}`);
      console.log(`Type: ${m.type} | Cat: ${m.category} | BP: ${bp} | Acc: ${acc} | PP: ${m.pp}`);
      if (m.desc || m.shortDesc) console.log(stripHtml(m.desc || m.shortDesc));
      console.log();
      break;
    }
    case 'item': {
      const item = dex.items.get(result.name as string);
      console.log(`\n${bold(item.name)}${genLabel}`);
      if (item.desc || item.shortDesc) console.log(stripHtml(item.desc || item.shortDesc));
      if (item.fling) console.log(`Fling BP: ${item.fling.basePower}`);
      console.log();
      break;
    }
    case 'ability': {
      const ab = dex.abilities.get(result.name as string);
      console.log(`\n${bold(ab.name)}${genLabel}`);
      if (ab.desc || ab.shortDesc) console.log(stripHtml(ab.desc || ab.shortDesc));
      console.log();
      break;
    }
    case 'nature': {
      const nat = Dex.natures.get(result.name as string);
      console.log(`\n${bold(nat.name)} nature`);
      if (nat.plus) {
        console.log(`+10% ${Dex.stats.names[nat.plus]}, -10% ${Dex.stats.names[nat.minus!]}`);
      } else {
        console.log('No effect.');
      }
      console.log();
      break;
    }
    }
  }
}
