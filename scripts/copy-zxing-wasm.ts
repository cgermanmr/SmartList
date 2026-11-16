// Copia el .wasm de ZXing a public/ para servirlo desde el propio dominio (spec 11).
// Corre en el postinstall: el archivo no se versiona y siempre coincide con la versión instalada.

import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm'));
const target = fileURLToPath(new URL('../public/zxing_reader.wasm', import.meta.url));

copyFileSync(source, target);
console.log(`zxing_reader.wasm copiado a ${target}`);
