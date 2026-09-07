// Bundles the server (including @scoreboard/shared) into dist/ with esbuild.
// All third-party dependencies stay external so native modules and Prisma work.
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@scoreboard/'));

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
};

await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' });
if (existsSync('prisma/seed.ts')) {
  await build({ ...common, entryPoints: ['prisma/seed.ts'], outfile: 'dist/seed.js' });
}
