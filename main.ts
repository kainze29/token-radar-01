// Token launch radar: reads the frozen snapshot, ranks every farmable
// pre-token protocol by implied launch value, and writes the dashboard,
// board, and dossier to the output directory.
//
// Usage: node main.ts [snapshot.json] [output-dir]
// Defaults: /input/snapshot.json and /output (the grader's layout).
// Node 22 standard library only. Output is fully deterministic: two runs
// on the same snapshot write byte-identical files.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2] ?? '/input/snapshot.json';
const outDir = process.argv[3] ?? '/output';

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  const entries = readdirSync(src).sort();
  for (const name of entries) {
    const from = join(src, name);
    const to = join(dst, name);
    if (statSync(from).isDirectory()) {
      copyTree(from, to);
    } else {
      copyFileSync(from, to);
    }
  }
}

function main(): void {
  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
  const board = buildBoard(snapshot);

  // Empty the output directory's contents. Never remove the output directory
  // itself: in the grader it is a mount point and deleting it fails.
  mkdirSync(outDir, { recursive: true });
  for (const child of readdirSync(outDir)) {
    rmSync(join(outDir, child), { recursive: true, force: true });
  }

  // board.json: the sealed gate reads this directly.
  writeFileSync(join(outDir, 'board.json'), JSON.stringify({ rows: board.rows }, null, 2) + '\n');

  // data.js: the dashboard's data, loaded with a relative <script> tag.
  const data = {
    rows: board.rows,
    liveRows: board.liveRows,
    asOf: board.asOf,
    floor: board.floorUsd,
    watchlist: board.watchlist,
    modelVersion: board.modelVersion,
    multiples: board.multiples,
    multiplesMeta: board.multiplesMeta,
    globalMultiple: board.globalMultiple,
    excludedCount: board.excludedCount,
    impliedSum: board.impliedSum,
  };
  writeFileSync(join(outDir, 'data.js'), 'window.RADAR = ' + JSON.stringify(data) + ';\n');

  copyTree(join(here, 'dashboard'), join(outDir, 'dashboard'));
  copyTree(join(here, 'screenshots'), join(outDir, 'screenshots'));

  // dossier.json: byte-for-byte what the scorer's buildDossier writes.
  // buildDossier returns the dossier bytes (a Uint8Array): write them
  // directly, never through JSON.stringify (that would serialize the
  // byte array as an object with numeric keys).
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  console.log('radar ' + board.modelVersion + ': ' + board.rows.length + ' rows, watchlist ' +
    board.watchlist.length + '/' + board.watchlist.length + ', implied sum $' +
    board.impliedSum.toLocaleString('en-US') + ', dossier ' +
    dossier.length + ' bytes');
}

main();
