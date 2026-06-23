/**
 * tools/strip-png-bg.mjs
 *
 * Quita el fondo blanco de un PNG haciendo BFS floodfill desde los 4
 * bordes. Solo se transparentan los píxeles "casi blancos" (R, G, B >=
 * threshold) que están conectados al borde — el blanco interno del balón
 * (hexágonos) se preserva.
 *
 * Uso:
 *   node tools/strip-png-bg.mjs [input.png] [output.png]
 *
 * Por defecto procesa public/balon.png y sobrescribe el mismo archivo.
 *
 * Dependencia: pngjs (devDependency).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';

const THRESHOLD = 240;
const input = process.argv[2] || 'public/balon.png';
const output = process.argv[3] || input;

if (!existsSync(input)) {
    console.error(`No existe: ${input}`);
    process.exit(1);
}

const raw = readFileSync(input);
const png = PNG.sync.read(raw);
const { width, height, data } = png;

/** @param {number} i */
const isNearWhite = (i) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return r >= THRESHOLD && g >= THRESHOLD && b >= THRESHOLD;
};

/** BFS floodfill desde los 4 bordes. */
const visited = new Uint8Array(width * height);
const queue = [];

// Sembrar la cola con todos los píxeles del borde que sean "casi blancos".
for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
        const i = (y * width + x) * 4;
        if (isNearWhite(i) && !visited[y * width + x]) {
            visited[y * width + x] = 1;
            queue.push(y * width + x);
        }
    }
}
for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
        const i = (y * width + x) * 4;
        if (isNearWhite(i) && !visited[y * width + x]) {
            visited[y * width + x] = 1;
            queue.push(y * width + x);
        }
    }
}

let transparentCount = 0;
let head = 0;
while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;

    // Vecinos 4-conexos
    /** @type {Array<[number, number]>} */
    const neighbors = [];
    if (x > 0)          neighbors.push([x - 1, y]);
    if (x < width - 1)  neighbors.push([x + 1, y]);
    if (y > 0)          neighbors.push([x, y - 1]);
    if (y < height - 1) neighbors.push([x, y + 1]);

    for (const [nx, ny] of neighbors) {
        const nIdx = ny * width + nx;
        if (visited[nIdx]) continue;
        const i = nIdx * 4;
        if (isNearWhite(i)) {
            visited[nIdx] = 1;
            queue.push(nIdx);
        }
    }
}

// Aplicar transparencia
for (let i = 0; i < visited.length; i++) {
    if (visited[i]) {
        const p = i * 4;
        data[p] = 0;
        data[p + 1] = 0;
        data[p + 2] = 0;
        data[p + 3] = 0;
        transparentCount++;
    }
}

const out = PNG.sync.write(png);
writeFileSync(output, out);
const totalPx = width * height;
console.log(`OK  ${output}  ${width}x${height}  ${transparentCount}/${totalPx} píxeles transparentados (${((transparentCount / totalPx) * 100).toFixed(1)}%)`);
