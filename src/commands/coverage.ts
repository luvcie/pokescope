import { Dex } from 'pokemon-showdown';
import { bold, dim, red, green, cyan, WHITE, R } from '../ansi';
import { splitGen } from '../gen';

export function cmdCoverage(args: string[]): void {
  if (!args.length) {
    console.log('Usage: coverage [gen] <move1[,move2,move3,move4]>');
    return;
  }

  const { dex, targets } = splitGen(args);

  if (targets.length > 4) {
    console.error('Specify a maximum of 4 moves or types.');
    return;
  }

  const sources: string[] = [];
  const bestCoverage: Record<string, number> = {};
  for (const type of dex.types.names()) bestCoverage[type] = -5;

  for (const arg of targets) {
    const argType = arg.charAt(0).toUpperCase() + arg.slice(1).toLowerCase();
    if (dex.types.isName(argType)) {
      sources.push(argType);
      for (const type in bestCoverage) {
        if (!dex.getImmunity(argType, type)) continue;
        const eff = dex.getEffectiveness(argType, type);
        if (eff > bestCoverage[type]) bestCoverage[type] = eff;
      }
      continue;
    }

    const move = dex.moves.get(arg);
    if (!move.exists) {
      console.error(`Type or move '${arg}' not found.`);
      return;
    }
    if (move.gen > dex.gen) {
      console.error(`Move '${move.name}' is not available in ${dex.currentMod}.`);
      return;
    }
    if (!move.basePower && !move.basePowerCallback) continue;
    if (move.id === 'struggle') continue;
    sources.push(move.name);
    for (const type in bestCoverage) {
      const immune = dex.getImmunity(move.type, type);
      const ignoreImm = move.ignoreImmunity &&
        (move.ignoreImmunity === true ||
          (typeof move.ignoreImmunity === 'object' && move.ignoreImmunity[move.type]));
      if (!immune && !ignoreImm) continue;
      const baseMod = dex.getEffectiveness(move, type);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const moveMod = (move as any).onEffectiveness?.call({ dex }, baseMod, null, type, move);
      const eff = typeof moveMod === 'number' ? moveMod : baseMod;
      if (eff > bestCoverage[type]) bestCoverage[type] = eff;
    }
  }

  if (sources.length === 0) {
    console.error('No valid moves or types specified.');
    return;
  }

  for (const type in bestCoverage) {
    bestCoverage[type] = bestCoverage[type] === -5 ? 0 : 2 ** bestCoverage[type];
  }

  const superEff: string[] = [], neutral: string[] = [], resists: string[] = [], immune: string[] = [];
  for (const type in bestCoverage) {
    const v = bestCoverage[type];
    if (v === 0) immune.push(type);
    else if (v > 1) superEff.push(type);
    else if (v < 1) resists.push(type);
    else neutral.push(type);
  }

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  console.log(`\n${bold('Coverage for ' + sources.join(' + '))}${genLabel}:`);
  console.log(`${red('Super Effective')}: ${superEff.join(', ') || dim('None')}`);
  console.log(`${WHITE}Neutral${R}:         ${neutral.join(', ') || dim('None')}`);
  console.log(`${green('Resisted')}:        ${resists.join(', ') || dim('None')}`);
  console.log(`${cyan('Immune')}:          ${immune.join(', ') || dim('None')}`);
  console.log();
}
