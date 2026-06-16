const line = 'Alemania 4-0 Curazao, Costa de marfil 1-0 Ecuador';
const matchStrings = line.split(/[,;]\s*|\n/).filter(s => s.trim().length > 0);
console.log('matchStrings:', matchStrings);

for (const matchStr of matchStrings) {
    console.log('\n--- Processing:', matchStr);
    const cleanMatch = matchStr
        .replace(/\bvs\.?\b/gi, ' ')
        .replace(/\bvrs\.?\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    console.log('cleanMatch:', cleanMatch);

    const tokens = cleanMatch.split(' ').filter(Boolean);
    console.log('tokens:', tokens);

    const tokenData = [];
    for (const tok of tokens) {
        const hyphenMatch = tok.match(/^(\d+)[-–](\d+)$/);
        if (hyphenMatch) {
            tokenData.push({ raw: tok, num: parseInt(hyphenMatch[1]), awayScore: parseInt(hyphenMatch[2]), team: null });
        } else {
            tokenData.push({ raw: tok, num: /^\d+$/.test(tok) ? parseInt(tok) : null, awayScore: null, team: tok });
        }
    }
    console.log('tokenData:', JSON.stringify(tokenData, null, 2));

    const joinedTokens = [];
    let i = 0;
    while (i < tokenData.length) {
        const td = tokenData[i];
        if (td.num !== null) {
            joinedTokens.push(td);
            i++;
            continue;
        }

        let combined = td.raw;
        let j = i + 1;
        while (j < tokenData.length && tokenData[j].num === null) {
            combined += ' ' + tokenData[j].raw;
            j++;
        }

        joinedTokens.push({
            raw: combined,
            num: null,
            awayScore: null,
            team: combined
        });
        i = j;
    }
    console.log('joinedTokens length:', joinedTokens.length, JSON.stringify(joinedTokens, null, 2));

    let pos = 0;
    while (pos + 3 <= joinedTokens.length) {
        const t1 = joinedTokens[pos];
        const s1 = joinedTokens[pos + 1];
        const t2 = joinedTokens[pos + 2];
        const s2 = joinedTokens[pos + 3];

        console.log(`pos=${pos}, t1=${JSON.stringify(t1)}, s1=${JSON.stringify(s1)}, t2=${JSON.stringify(t2)}, s2=${JSON.stringify(s2)}`);

        if (t1.num === null && s1.num !== null && t2.num === null) {
            if (s1.awayScore !== null) {
                console.log(' -> MATCH (awayScore):', t1.team, s1.num, '-', s1.awayScore, t2.team);
                pos += 3;
            } else if (s2 && s2.num !== null) {
                console.log(' -> MATCH (two scores):', t1.team, s1.num, '-', s2.num, t2.team);
                pos += 4;
            } else {
                console.log(' -> no match, pos++');
                pos++;
            }
        } else {
            console.log(' -> no match (condition failed), pos++');
            pos++;
        }
    }
}
