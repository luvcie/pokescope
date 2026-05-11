// Splits a filter string into tokens with smart merging for multi-word patterns.
// Commas separate independent filters; within each comma group, spaces are smart-split.
export function splitFilterTokens(raw: string): string[] {
  const result: string[] = [];
  for (const group of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    if (!group.includes(' ')) { result.push(group); continue; }
    const words = group.split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length) {
      const w = words[i].toLowerCase();
      const next = words[i + 1] ?? '';
      const nextlc = next.toLowerCase();
      const after = words[i + 2] ?? '';
      if (next && /^(>=|<=|!=|>|<|=)$/.test(next) && after) { result.push(words[i] + ' ' + next + ' ' + after); i += 3; continue; }
      if (nextlc === 'asc' || nextlc === 'desc') { result.push(words[i] + ' ' + next); i += 2; continue; }
      if ((w === 'resists' || w === 'resist' || w === 'weak' || w === 'weakness') && next) { result.push(words[i] + ' ' + next); i += 2; continue; }
      if ((w === 'boosts' || w === 'boost' || w === 'lowers' || w === 'lower' || w === 'zboosts' || w === 'zboost') && next) { result.push(words[i] + ' ' + next); i += 2; continue; }
      if (w === 'egg' && nextlc === 'group' && after) { result.push(words[i] + ' ' + next + ' ' + after); i += 3; continue; }
      if (w === 'fully' && nextlc === 'evolved') { result.push(words[i] + ' ' + next); i += 2; continue; }
      result.push(words[i]); i++;
    }
  }
  return result;
}
