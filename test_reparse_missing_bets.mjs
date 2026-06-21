globalThis.$state = (o) => o;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { reparseMissingBets } = await import('./src/lib/parser.js');

let pass = 0, fail = 0;

function assert(label, cond) {
    if (cond) { console.log('OK  ' + label); pass++; }
    else      { console.log('FAIL ' + label); fail++; }
}

// --- Caso 1: el del usuario (mensaje con score en nueva línea) ---
// Sheets tiene 3 bets; el parser arreglado ahora extrae 4. Esperado:
// reparseMissingBets devuelve solo la 4ª (USA 2-0 Australia).
// Nota: las bets existentes ya tienen el participant canónico (con
// phone override aplicado al guardarse en Sheets), así que el re-parse
// (que también pasa por el override) produce el mismo participant.
{
    const messageId = 'false_X_Y@lid';
    const originalMessage = 'Estados Unidos 2 Australia\n0\nEscocia 1 Marruecos 2\n\nBrasil 4   Haití 0\n\nTurquía 1 paraguay 1';
    const sheetsBets = [
        { id: messageId + '_score_0', messageId, participant: 'Olmer Ballesteros', phone: '+57 322 6018001',
          timestamp: '2026/6/19 12:35:25', type: 'score',
          prediction: { homeTeam: 'Scotland', awayTeam: 'Morocco', homeScore: 1, awayScore: 2 },
          originalMessage },
        { id: messageId + '_score_1', messageId, participant: 'Olmer Ballesteros', phone: '+57 322 6018001',
          timestamp: '2026/6/19 12:35:25', type: 'score',
          prediction: { homeTeam: 'Brazil', awayTeam: 'Haiti', homeScore: 4, awayScore: 0 },
          originalMessage },
        { id: messageId + '_score_2', messageId, participant: 'Olmer Ballesteros', phone: '+57 322 6018001',
          timestamp: '2026/6/19 12:35:25', type: 'score',
          prediction: { homeTeam: 'Turkey', awayTeam: 'Paraguay', homeScore: 1, awayScore: 1 },
          originalMessage }
    ];
    const recovered = reparseMissingBets(sheetsBets);
    assert('caso usuario: 1 sola bet recuperada', recovered.length === 1);
    if (recovered.length > 0) {
        const b = recovered[0];
        assert('caso usuario: homeTeam=USA', b.prediction.homeTeam === 'USA');
        assert('caso usuario: awayTeam=Australia', b.prediction.awayTeam === 'Australia');
        assert('caso usuario: homeScore=2', b.prediction.homeScore === 2);
        assert('caso usuario: awayScore=0', b.prediction.awayScore === 0);
        assert('caso usuario: id unico _reparse_0', b.id === messageId + '_score_reparse_0');
        assert('caso usuario: participant canonico', b.participant === 'Olmer Ballesteros');
        assert('caso usuario: phone preservado', b.phone === '+57 322 6018001');
    }
}

// --- Caso 2: mensaje completo ya en Sheets, no recupera nada ---
{
    const messageId = 'full_X@lid';
    const originalMessage = 'Brasil 3 Marruecos 1\nInglaterra 2 Croacia 1';
    const sheetsBets = [
        { id: messageId + '_score_0', messageId, participant: 'P1', phone: '+1',
          timestamp: '2026/6/13 09:00:00', type: 'score',
          prediction: { homeTeam: 'Brazil', awayTeam: 'Morocco', homeScore: 3, awayScore: 1 },
          originalMessage },
        { id: messageId + '_score_1', messageId, participant: 'P1', phone: '+1',
          timestamp: '2026/6/13 09:00:00', type: 'score',
          prediction: { homeTeam: 'England', awayTeam: 'Croatia', homeScore: 2, awayScore: 1 },
          originalMessage }
    ];
    const recovered = reparseMissingBets(sheetsBets);
    assert('caso completo: 0 bets recuperadas', recovered.length === 0);
}

// --- Caso 3: input vacío / inválido ---
{
    assert('input vacio: array vacio', reparseMissingBets([]).length === 0);
    assert('input null: array vacio', reparseMissingBets(null).length === 0);
    assert('input undefined: array vacio', reparseMissingBets(undefined).length === 0);
}

// --- Caso 4: bets sin messageId ni originalMessage ---
{
    const sheetsBets = [
        { id: 'no_msg', participant: 'X', type: 'score',
          prediction: { homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0 } }
    ];
    const recovered = reparseMissingBets(sheetsBets);
    assert('sin messageId: 0 recuperadas', recovered.length === 0);
}

// --- Caso 5: múltiples bets faltantes del mismo mensaje ---
{
    const messageId = 'multi_missing_X@lid';
    const originalMessage = 'USA 2 Australia 0\nEscocia 0 Marruecos 2';
    // Sheets solo tiene la primera
    const sheetsBets = [
        { id: messageId + '_score_0', messageId, participant: 'P1', phone: '+1',
          timestamp: '2026/6/19 10:00:00', type: 'score',
          prediction: { homeTeam: 'USA', awayTeam: 'Australia', homeScore: 2, awayScore: 0 },
          originalMessage }
    ];
    const recovered = reparseMissingBets(sheetsBets);
    assert('multi-faltantes: 1 bet recuperada', recovered.length === 1);
    if (recovered.length > 0) {
        assert('multi-faltantes: Scotland vs Morocco',
            recovered[0].prediction.homeTeam === 'Scotland' &&
            recovered[0].prediction.awayTeam === 'Morocco');
        assert('multi-faltantes: id reparse_0',
            recovered[0].id === messageId + '_score_reparse_0');
    }
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
