import type { ModdedDex } from '@pkmn/sim';

export type DataSearchTable = 'Pokedex' | 'Moves' | 'Abilities' | 'Items' | 'Natures' | 'TypeChart';
export type DataSearchType = 'pokemon' | 'move' | 'ability' | 'item' | 'nature' | 'type';

export interface DataSearchResult {
  isInexact?: string;
  searchType: DataSearchType;
  name: string;
}

const TABLE_TO_FIELD: Record<DataSearchTable, { field: 'species' | 'moves' | 'abilities' | 'items' | 'natures' | 'types'; type: DataSearchType }> = {
  Pokedex:   { field: 'species',   type: 'pokemon' },
  Moves:     { field: 'moves',     type: 'move' },
  Abilities: { field: 'abilities', type: 'ability' },
  Items:     { field: 'items',     type: 'item' },
  Natures:   { field: 'natures',   type: 'nature' },
  TypeChart: { field: 'types',     type: 'type' },
};

function levenshtein(s: string, t: string, l: number): number {
  const n = s.length;
  const m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  if (Math.abs(m - n) > l) return Math.abs(m - n);
  const d: number[][] = [];
  for (let i = n; i >= 0; i--) d[i] = [];
  for (let i = n; i >= 0; i--) d[i][0] = i;
  for (let j = m; j >= 0; j--) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    const si = s.charAt(i - 1);
    for (let j = 1; j <= m; j++) {
      if (i === j && d[i][j] > 4) return n;
      const tj = t.charAt(j - 1);
      const cost = si === tj ? 0 : 1;
      let mi = d[i - 1][j] + 1;
      const b = d[i][j - 1] + 1;
      const c = d[i - 1][j - 1] + cost;
      if (b < mi) mi = b;
      if (c < mi) mi = c;
      d[i][j] = mi;
    }
  }
  return d[n][m];
}

function toID(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Mirrors pokemon-showdown's Dex.dataSearch: exact match across data tables, then a Levenshtein fuzz pass.
export function dataSearch(
  dex: ModdedDex,
  target: string,
  searchIn: DataSearchTable[] = ['Pokedex', 'Moves', 'Abilities', 'Items', 'Natures'],
  isInexact?: string,
): DataSearchResult[] | null {
  if (!target) return null;

  const exact: DataSearchResult[] = [];
  for (const table of searchIn) {
    const { field, type } = TABLE_TO_FIELD[table];
    const res = dex[field].get(target) as { exists?: boolean; gen?: number; name: string };
    if (res.exists && (res.gen ?? 0) <= dex.gen) {
      exact.push({ isInexact, searchType: type, name: res.name });
    }
  }
  if (exact.length) return exact;
  if (isInexact) return null;

  const cmpTarget = toID(target);
  if (cmpTarget.length <= 1) return null;
  let maxLd = 3;
  if (cmpTarget.length <= 4) maxLd = 1;
  else if (cmpTarget.length <= 6) maxLd = 2;

  let fuzzyResults: DataSearchResult[] | null = null;
  for (const table of [...searchIn, 'Aliases'] as (DataSearchTable | 'Aliases')[]) {
    const bucket = (dex.data as unknown as Record<string, Record<string, { name?: string }>>)[table];
    if (!bucket) continue;
    for (const key in bucket) {
      const ld = levenshtein(cmpTarget, key, maxLd);
      if (ld <= maxLd) {
        const word = bucket[key].name || key;
        const inner = dataSearch(dex, word, searchIn, word);
        if (inner) {
          fuzzyResults = inner;
          maxLd = ld;
        }
      }
    }
  }
  return fuzzyResults;
}
