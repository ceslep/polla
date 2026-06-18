import { parseMessage } from './src/lib/parser.js';

const tests = [
    'Qatar 1 zuisa 1',
    'Brasil 3 Marruecos 1',
    'Haití 1escocia 1',
    'Austria 2 Turquía 1',
    'Canadá 2 catar o',
    'México 1 Corea del Sur 1',
    'R checa 1 Sudáfrica 1',
    'Suiza 2 bosnia 1',
    'Canadá 2 catar o\nMéxico 1 Corea del Sur 1',
    'Portugal 3\nCongo 1\n\nInglaterra 2\nCroacia 2\n\nGhana 2\nPanamá 1\n\nColombia 4 \nUzbequistan 1'
];

for (const text of tests) {
    console.log('\\nInput:', JSON.stringify(text));
    try {
        const result = parseMessage({
            Message: text,
            participant: 'TestUser',
            timestamp: '2026/6/13 12:00:00',
            status: 'pending'
        });
        console.log('Bets found:', result.length);
        result.forEach((b, i) => {
            console.log(`  Bet ${i}:`, b.type, JSON.stringify(b.prediction));
        });
    } catch (e) {
        console.log('Error:', e.message);
    }
}
