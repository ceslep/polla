import fs from 'node:fs';

const a = JSON.parse(fs.readFileSync('apolla.json', 'utf8'));
const t = JSON.parse(fs.readFileSync('pollat.json', 'utf8'));

const commonPhones = new Set(a.map(m => m.Phone));

const formattedFromPollat = new Map();
for (const m of t) {
    if (commonPhones.has(m.Phone) && !formattedFromPollat.has(m.Phone)) {
        formattedFromPollat.set(m.Phone, m['Formatted Name']);
    }
}

const pollatKept = t.filter(m => commonPhones.has(m.Phone));

const apollaRenamed = a.map(m => ({
    ...m,
    'Formatted Name': formattedFromPollat.get(m.Phone) ?? m['Formatted Name']
}));

const result = [...pollatKept, ...apollaRenamed];

fs.writeFileSync('nuevot.json', JSON.stringify(result, null, 2));

console.log(`OK: ${result.length} mensajes, ${new Set(result.map(m => m.Phone)).size} phones`);
