import fs from 'node:fs';

globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();

const { parseWhatsAppExport } = await import('./src/lib/parser.js');
const data = JSON.parse(fs.readFileSync('nuevot.json', 'utf8'));
const bets = parseWhatsAppExport(data);
console.log('Parser OK. Bets extraídos:', bets.length);
console.log('Sample bet keys:', Object.keys(bets[0] || {}));
const types = {};
bets.forEach(b => types[b.type] = (types[b.type] || 0) + 1);
console.log('Por tipo:', types);
console.log('Phones únicos en bets:', new Set(bets.map(b => b.phone)).size);
