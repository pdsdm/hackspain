import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildMadringFixtures } from '../backend/fixtures/madring.ts';

const check = process.argv.includes('--check');
const root = new URL('../backend/fixtures/madring/', import.meta.url);
const { seed, manifest, fixtures, world } = buildMadringFixtures();
const outputs: Array<[string, unknown]> = [
  ['seed.json', seed], ['manifest.json', manifest], ['world.json', world],
  ...Object.entries(fixtures).map(([name, f]): [string, unknown] => [`states/${name}.json`, f.state]),
];
const stale: string[] = [];
for (const [name, value] of outputs) {
  const target = new URL(name, root);
  const expected = JSON.stringify(value, null, 2) + '\n';
  if (check) {
    let actual = '';
    try { actual = await readFile(target, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (actual !== expected) stale.push(name);
  } else {
    await mkdir(new URL('.', target), { recursive: true });
    await writeFile(target, expected);
  }
}
if (stale.length) {
  console.error(`Fixtures desactualizados: ${stale.join(', ')}. Ejecuta npm run fixtures:generate en backend/.`);
  process.exitCode = 1;
} else console.log(`${check ? 'Verificados' : 'Generados'} ${outputs.length} JSON reproducibles en ${fileURLToPath(root)}`);
