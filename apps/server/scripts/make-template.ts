/** Writes docs/fixtures-template.xlsx from the same builder the API serves. Usage: tsx scripts/make-template.ts [out] */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ImportService } from '../src/services/import.service.js';

const out = resolve(process.argv[2] ?? '../../docs/fixtures-template.xlsx');
const service = new ImportService(null as never, null as never, () => Date.now());
const buffer = await service.buildTemplate();
writeFileSync(out, buffer);
console.log(`wrote ${out} (${buffer.length} bytes)`);
