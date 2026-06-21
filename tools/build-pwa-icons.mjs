import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const svg = fs.readFileSync('public/favicon.svg', 'utf8');
const out = (size) => {
    const r = new Resvg(svg, {
        fitTo: { mode: 'width', value: size },
        background: 'rgba(17, 17, 17, 1)'
    });
    const png = r.render().asPng();
    fs.writeFileSync(`public/icon-${size}.png`, png);
    console.log(`public/icon-${size}.png  ${png.length} bytes`);
};
out(192);
out(512);
