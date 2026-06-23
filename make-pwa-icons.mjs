/**
 * make-pwa-icons.mjs
 *
 * Lee public/balon.png (304x302) y genera public/icon-192.png y
 * public/icon-512.png con bilinear resampling sobre fondo #111111
 * (mismo color que PWA `background_color` en vite.config.ts).
 *
 * Reemplaza los iconos default de Vite/Svelte (rayo morado sobre dark)
 * que el manifest apuntaba antes y que se veían como "cuadro negro"
 * al instalar la PWA.
 *
 * Una sola corrida: `npm run make-icons`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const BG = [0x11, 0x11, 0x11, 0xff];
const SRC = 'public/balon.png';
const SIZES = [
    { out: 'public/icon-192.png', size: 192 },
    { out: 'public/icon-512.png', size: 512 }
];

/**
 * Resamplea `src` a dstSize x dstSize con bilinear filtering y compone
 * sobre BG (straight alpha). Devuelve un PNG nuevo (no modifica `src`).
 * @param {PNG} src
 * @param {number} dstSize
 * @returns {PNG}
 */
function bilinear(src, dstSize) {
    const dst = new PNG({ width: dstSize, height: dstSize });
    const sx = src.width / dstSize;
    const sy = src.height / dstSize;
    for (let y = 0; y < dstSize; y++) {
        for (let x = 0; x < dstSize; x++) {
            // Centro del pixel destino mapeado a espacio origen
            const fx = (x + 0.5) * sx - 0.5;
            const fy = (y + 0.5) * sy - 0.5;
            const x0 = Math.max(0, Math.floor(fx));
            const y0 = Math.max(0, Math.floor(fy));
            const x1 = Math.min(src.width - 1, x0 + 1);
            const y1 = Math.min(src.height - 1, y0 + 1);
            const dx = fx - x0;
            const dy = fy - y0;
            const sIdx = (cx, cy) => (cy * src.width + cx) * 4;
            const sCh = (cx, cy, ch) => src.data[sIdx(cx, cy) + ch];
            const di = (y * dstSize + x) * 4;
            for (let ch = 0; ch < 4; ch++) {
                const a = sCh(x0, y0, ch);
                const b = sCh(x1, y0, ch);
                const c = sCh(x0, y1, ch);
                const d = sCh(x1, y1, ch);
                const top = a * (1 - dx) + b * dx;
                const bot = c * (1 - dx) + d * dx;
                const va = top * (1 - dy) + bot * dy;
                const sa = va / 255;
                dst.data[di + ch] = Math.round(BG[ch] * (1 - sa) + va * sa);
            }
        }
    }
    return dst;
}

const raw = readFileSync(SRC);
const src = PNG.sync.read(raw);
console.log(`Origen: ${SRC} (${src.width}x${src.height})`);
for (const { out, size } of SIZES) {
    const dst = bilinear(src, size);
    const bytes = PNG.sync.write(dst);
    writeFileSync(out, bytes);
    console.log(`Generado: ${out} (${size}x${size}, ${(bytes.length / 1024).toFixed(1)} KB)`);
}
