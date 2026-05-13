import { Dex, TeamValidator } from '@pkmn/sim';
import { bold, dim, red, green } from '../ansi';
import { parseGenPrefix } from '../gen';

function parseSource(source: string): string {
  const gen = source.charAt(0);
  const method = source.charAt(1);
  const extra = source.slice(2);
  const methods: Record<string, string> = {
    L: `level-up${extra ? ' (' + extra + ')' : ''}`,
    M: 'TM/HM', T: 'tutor', E: 'egg', S: 'event', D: 'dream world', V: 'virtual console transfer',
  };
  return `Gen ${gen} ${methods[method] ?? method}`;
}

function findLearnSources(speciesId: string, moveId: string): { sources: string[]; learnedBy: string } | null {
  let current = Dex.species.get(speciesId);
  const allSources: string[] = [];
  let learnedBy: string | null = null;
  while (current.exists) {
    const data = Dex.species.getLearnsetData(current.id);
    const sources = data.learnset?.[moveId];
    if (sources && sources.length) {
      if (!learnedBy) learnedBy = current.name;
      for (const s of sources) {
        if (!allSources.includes(s)) allSources.push(s);
      }
    }
    if (!current.prevo) break;
    current = Dex.species.get(current.prevo);
  }
  if (!allSources.length) return null;
  return { sources: allSources, learnedBy: learnedBy! };
}

export function cmdLearn(args: string[]): void {
  if (!args.length) {
    console.log('Usage: learn [gen] <pokemon>, <move>[, <move2>, ...]');
    console.log('  e.g. learn pikachu, thunderbolt');
    console.log('       learn gen6, togekiss, nasty plot');
    console.log('       learn gen8, umbreon, wish');
    return;
  }

  const raw = args.join(' ');
  const { genMod = 'gen9', rest } = parseGenPrefix(raw);

  let restMut = rest;

  // check for lc (level 5) flag
  let level = 100;
  if (restMut.match(/\blc\b/i)) {
    level = 5;
    restMut = restMut.replace(/\blc\b/i, '').replace(/,\s*,/, ',').trim().replace(/^,|,$/, '').trim();
  }

  let pokemonName: string;
  let moveNames: string[];

  if (restMut.includes(',')) {
    const parts = restMut.split(',').map(s => s.trim());
    pokemonName = parts[0];
    moveNames = parts.slice(1);
  } else {
    const tokens = restMut.split(' ');
    pokemonName = tokens[0];
    moveNames = [tokens.slice(1).join(' ')];
    for (let i = 1; i < tokens.length; i++) {
      const testPoke = Dex.species.get(tokens.slice(0, i).join(' '));
      const testMove = Dex.moves.get(tokens.slice(i).join(' '));
      if (testPoke.exists && testMove.exists) {
        pokemonName = tokens.slice(0, i).join(' ');
        moveNames = [tokens.slice(i).join(' ')];
        break;
      }
    }
  }

  if (!moveNames[0]) {
    console.error('specify at least one move, e.g. learn pikachu thunderbolt');
    return;
  }

  const dex = Dex.mod(genMod);
  const species = dex.species.get(pokemonName);
  if (!species.exists) {
    console.error(`'${pokemonName}' is not a recognized pokemon`);
    return;
  }

  const moves = moveNames.map(m => dex.moves.get(m));
  for (const m of moves) {
    if (!m.exists) { console.error(`'${m.id}' is not a recognized move`); return; }
  }

  const formatId = `${genMod}ou`;
  const validator = TeamValidator.get(formatId);
  const setSources = validator.allSources(species);
  const problems = validator.validateMoves(species, moves.map(m => m.name), setSources, { name: species.name, species: species.name, level });

  const canLearn = problems.length === 0;
  const combo = moves.map(m => m.name).join(' + ');
  const genLabel = genMod !== 'gen9' ? dim(` [${genMod}]`) : '';
  console.log(`\n${bold(species.name)}${genLabel} ${canLearn ? green('can') : red("can't")} learn ${bold(combo)}`);

  const genNum = genMod.replace('gen', '');
  for (const move of moves) {
    const found = findLearnSources(species.id, move.id);
    if (!found) {
      console.log(`  ${move.name}: ${dim('not in learnset')}`);
      continue;
    }
    const { sources, learnedBy } = found;
    const relevant = sources.filter(s => parseInt(s.charAt(0)) <= parseInt(genNum));
    const display = relevant.slice(0, 5).map(parseSource);
    const origin = learnedBy !== species.name ? dim(` (via ${learnedBy})`) : '';
    let srcStr: string;
    if (display.length) {
      srcStr = display.join(', ') + (relevant.length > 5 ? dim(' ...') : '');
    } else if (canLearn) {
      srcStr = dim('available (no source records for this gen)');
    } else {
      srcStr = dim('not available in this gen');
    }
    console.log(`  ${move.name}${origin}: ${srcStr}`);
  }

  if (problems.length) {
    console.log(`\n  ${red('issues:')}`);
    for (const p of problems) console.log(`  ${dim(p)}`);
  }

  console.log();

}
