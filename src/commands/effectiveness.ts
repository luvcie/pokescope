import { Dex } from 'pokemon-showdown';
import { bold, dim, red, green, cyan } from '../ansi';
import { splitGen } from '../gen';
import { calcTypeEff } from '../type-eff';

export function cmdEffectiveness(args: string[]): void {
  if (!args.length) {
    console.log('Usage: eff [gen] <move|type>, <pokemon|type>');
    return;
  }

  const { dex, targets } = splitGen(args);
  if (targets.length !== 2) {
    console.log('Usage: eff [gen] <move|type>, <pokemon|type>');
    return;
  }

  let source: ReturnType<typeof dex.moves.get> | string;
  let atkName: string;
  let defName: string;
  let defTypes: string[];

  const srcMove = dex.moves.get(targets[0]);
  const srcType = dex.types.get(targets[0]);
  if (srcMove.exists) {
    source = srcMove;
    atkName = srcMove.name;
  } else if (srcType.exists) {
    source = srcType.name;
    atkName = srcType.name;
  } else {
    console.error(`'${targets[0]}' is not a recognized move or type.`);
    return;
  }

  const defSpecies = dex.species.get(targets[1]);
  const defType = dex.types.get(targets[1]);
  if (defSpecies.exists) {
    defTypes = defSpecies.types;
    defName = `${defSpecies.name} (not counting abilities)`;
  } else if (defType.exists) {
    defTypes = [defType.name];
    defName = defType.name;
  } else {
    console.error(`'${targets[1]}' is not a recognized Pokemon or type.`);
    return;
  }

  const factor = calcTypeEff(dex, source, defTypes);

  let factorStr: string;
  if (factor === 0) factorStr = cyan('0x (immune)');
  else if (factor > 1) factorStr = red(`${factor}x`);
  else if (factor < 1) factorStr = green(`${factor}x`);
  else factorStr = `${factor}x`;

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  console.log(`\n${bold(atkName)} → ${bold(defName)}${genLabel}: ${factorStr}`);

  if (typeof source !== 'string' && source.id === 'thousandarrows' && defTypes.includes('Flying')) {
    console.log(dim('  (Thousand Arrows is 1x on the first hit against Flying types)'));
  }

  console.log();
}
