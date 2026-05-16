#!/usr/bin/env bun
import { mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const STAT: Record<string, string> = {
  'hp': 'hp',
  'attack': 'atk',
  'defense': 'def',
  'special-attack': 'spa',
  'special-defense': 'spd',
  'speed': 'spe',
};

function toId(name: string): string {
  return name.replace(/[^a-z0-9]/g, '');
}

async function main() {
  const listRes = await fetch(`${API}/pokemon?limit=2000`);
  const list = await listRes.json() as { results: { name: string; url: string }[] };

  const yields: Record<string, Record<string, number>> = {};
  const CHUNK = 30;

  for (let i = 0; i < list.results.length; i += CHUNK) {
    const chunk = list.results.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map(p => fetch(p.url).then(r => r.json()).catch(() => null))
    );

    for (const data of results) {
      if (!data || data.id > 10000) continue;

      const evs: Record<string, number> = {};
      for (const s of data.stats) {
        if (s.effort > 0 && STAT[s.stat.name]) {
          evs[STAT[s.stat.name]] = s.effort;
        }
      }

      if (Object.keys(evs).length > 0) {
        yields[toId(data.name)] = evs;
      }
    }

    process.stdout.write(`\r${Math.min(i + CHUNK, list.results.length)}/${list.results.length}`);
  }

  await mkdir('data', { recursive: true });
  await Bun.write('data/ev-yields.json', JSON.stringify(yields, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(yields).length} entries to data/ev-yields.json`);
}

main().catch(console.error);
