const line = 'Alemania 4-0 Curazao, Costa de marfil 1-0 Ecuador';
const cleanLine = line
    .replace(/\bvs\.?\b/gi, ' ')
    .replace(/\bvrs\.?\b/gi, ' ')
    .replace(/(\d)[-–](\d)/g, '$1 $2')
    .replace(/[-–]/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
console.log('cleanLine:', cleanLine);
const tokens = cleanLine.split(' ').filter(Boolean);
console.log('tokens:', tokens);

const tokenData = tokens.map(tok => ({
    raw: tok,
    num: /^\d+$/.test(tok) ? parseInt(tok) : null,
    team: tok
}));
console.log('tokenData:', JSON.stringify(tokenData, null, 2));
