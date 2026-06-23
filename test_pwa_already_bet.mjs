// Smoke test para la feature "ya enviaste tus apuestas hoy" — bloquea el
// reenvío cuando el usuario re-ingresa y ya tiene bets en la hoja.
//
// El effect vive dentro de PwaApp.svelte (no se puede importar desde Node
// porque es un .svelte), así que el test hace verificaciones estáticas
// sobre el código fuente + ejecuta la lógica del effect manualmente con
// un stub de getPwaBets.

import { readFileSync, existsSync } from 'node:fs';

globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();

const api = await import('./src/lib/api.js');

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
    const tag = ok ? 'OK  ' : 'FAIL';
    console.log(tag, label, detail ? '— ' + detail : '');
    if (ok) pass++; else fail++;
}

const pwaApp = readFileSync('./src/lib/components/pwa/PwaApp.svelte', 'utf8');
const pwaDone = readFileSync('./src/lib/components/pwa/PwaDone.svelte', 'utf8');
const apiSource = readFileSync('./src/lib/api.js', 'utf8');

// ============================================================================
// 1. PwaApp.svelte: el effect post-auth existe
// ============================================================================

check(
    'PwaApp.svelte declara alreadyBetCheckToken (race condition guard)',
    /let\s+alreadyBetCheckToken\s*=\s*0/.test(pwaApp)
);

check(
    'PwaApp.svelte declara doneMode reactivo',
    /let\s+doneMode\s*=\s*\$state\(\s*['"]success['"]\s*\)/.test(pwaApp)
);

// El effect: tiene que leer step, authUsername, authPassword, date y NO
// correr en dev. Busca el bloque que define este effect.
const effectBlockMatch = pwaApp.match(/Detecci[oó]n post-autenticaci[oó]n[\s\S]{0,3500}?\}\s*\)\s*\(\s*\)\s*;\s*\}\s*\)/);
const effectBlock = effectBlockMatch ? effectBlockMatch[0] : '';

check('PwaApp.svelte contiene el effect post-autenticación', effectBlock.length > 0);
check('effect post-auth salta en dev (isDev guard)', /if\s*\(\s*isDev\s*\)\s*return/.test(effectBlock));
check('effect post-auth sólo dispara con step==="form"', /step\s*!==\s*['"]form['"]/.test(effectBlock));
check(
    'effect post-auth requiere authUsername + authPassword',
    /pwaSession\.authUsername/.test(effectBlock) && /pwaSession\.authPassword/.test(effectBlock)
);
check('effect post-auth requiere pwaSession.date', /pwaSession\.date/.test(effectBlock));
check(
    'effect post-auth llama getPwaBets con matchDate: date',
    /getPwaBets\s*\(\s*\{[^}]*matchDate/.test(effectBlock)
);
check(
    'effect post-auth incrementa el token (race condition)',
    /\+\+alreadyBetCheckToken/.test(effectBlock) && /myToken\s*!==\s*alreadyBetCheckToken/.test(effectBlock)
);
check(
    'effect post-auth setea pwaSession.submitted = true',
    /pwaSession\.submitted\s*=\s*true/.test(effectBlock)
);
check(
    'effect post-auth cambia el step a "done"',
    /setStep\(\s*['"]done['"]\s*\)/.test(effectBlock)
);
check(
    'effect post-auth setea doneMode = "already-submitted"',
    /doneMode\s*=\s*['"]already-submitted['"]/.test(effectBlock)
);
check(
    'effect post-auth cancela triggerOnboardingTour',
    /triggerOnboardingTour\s*=\s*false/.test(effectBlock)
);
check(
    'effect post-auth hace console.warn si falla (fallback al form)',
    /console\.warn/.test(effectBlock) && /No pude verificar apuestas/.test(effectBlock)
);

// ============================================================================
// 2. PwaApp.svelte: el check en load() se reforzó
// ============================================================================

// El if dentro de load() debe incluir 'form' en la lista de steps que redirigen.
const loadBlockMatch = pwaApp.match(/if\s*\(\s*!isDev\s*&&\s*s\.status\s*===\s*['"]open['"][\s\S]{0,1500}?\}\s*\}/);
const loadBlock = loadBlockMatch ? loadBlockMatch[0] : '';
check('PwaApp.svelte: bloque de load() con el check de bets previas', loadBlock.length > 0);
check(
    'load() redirige desde step "form" si hay bets previas',
    /\[?['"]landing['"],\s*['"]login['"],\s*['"]ranking['"],\s*['"]form['"]\]?/.test(loadBlock)
);

// ============================================================================
// 3. PwaApp.svelte: pasa `mode` a PwaDone
// ============================================================================

check(
    'PwaApp.svelte pasa mode={doneMode} a PwaDone',
    /<PwaDone[^>]*mode=\{doneMode\}/.test(pwaApp)
);

// ============================================================================
// 4. PwaDone.svelte: la prop mode existe y es 'success' | 'already-submitted'
// ============================================================================

check(
    'PwaDone.svelte declara prop mode',
    /mode[?\s]*:\s*['"]success['"]\s*\|\s*['"]already-submitted['"]/.test(pwaDone) ||
    /mode\?\s*:\s*['"]success['"]\s*\|\s*['"]already-submitted['"]/.test(pwaDone) ||
    /mode\s*=\s*['"]success['"]/.test(pwaDone)
);

check(
    'PwaDone.svelte renderiza el confeti sólo en modo success',
    /\{#if\s+!isAlreadySubmitted\}[\s\S]{0,200}?confetti/i.test(pwaDone) ||
    /\{#if\s+mode\s*===\s*['"]success['"]\}/.test(pwaDone)
);

check(
    'PwaDone.svelte tiene isAlreadySubmitted derivado',
    /isAlreadySubmitted\s*=\s*\$derived\(/.test(pwaDone)
);

check(
    'PwaDone.svelte tiene bloque de título distinto para "already-submitted"',
    /\{#if\s+isAlreadySubmitted\}[\s\S]{0,1000}?Ya enviaste tus apuestas[\s\S]{0,500}?\{:else\}/.test(pwaDone)
);

// ============================================================================
// 5. Lógica de transición: simulamos el effect manualmente con stub
// ============================================================================

/**
 * Simula el effect post-autenticación con un stub de getPwaBets.
 * El tokenCounter es compartido para poder testear la condición de staleness.
 *
 * @param {{
 *   step: string,
 *   isDev: boolean,
 *   authUsername: string|null,
 *   authPassword: string|null,
 *   date: string|null,
 *   getPwaBetsResult: any,
 *   tokenCounter: { value: number }
 * }} args
 */
function simulateEffect({ step, isDev, authUsername, authPassword, date, getPwaBetsResult, tokenCounter }) {
    const state = {
        setStepCalled: null,
        submitted: false,
        doneMode: 'success',
        infoMessage: '',
        tourCancelled: false
    };
    if (isDev) return Promise.resolve(state);
    if (step !== 'form') return Promise.resolve(state);
    if (!authUsername || !authPassword) return Promise.resolve(state);
    if (!date) return Promise.resolve(state);

    const myToken = ++tokenCounter.value;
    const counterAtStart = tokenCounter;

    return Promise.resolve(getPwaBetsResult).then((result) => {
        if (myToken !== counterAtStart.value) return state;
        if (result.bets && result.bets.length > 0) {
            state.submitted = true;
            state.doneMode = 'already-submitted';
            state.infoMessage = 'Ya enviaste tus apuestas hoy. Son inmutables — no se pueden modificar.';
            state.setStepCalled = 'done';
            state.tourCancelled = true;
        }
        return state;
    });
}

// Token compartido entre simulaciones (como `alreadyBetCheckToken` en PwaApp)
const sharedToken = { value: 0 };

// Caso A: dev mode → check se salta
const a = await simulateEffect({
    step: 'form', isDev: true, authUsername: '3117250869', authPassword: '0869',
    date: '2026-06-22', getPwaBetsResult: { bets: [{ id: 'pwa_x' }] },
    tokenCounter: sharedToken
});
check('dev mode: submitted NO se setea', a.submitted === false);
check('dev mode: step NO cambia', a.setStepCalled === null);

// Caso B: sin auth → check se salta
const b = await simulateEffect({
    step: 'form', isDev: false, authUsername: null, authPassword: null,
    date: '2026-06-22', getPwaBetsResult: { bets: [{ id: 'pwa_x' }] },
    tokenCounter: sharedToken
});
check('sin auth: submitted NO se setea', b.submitted === false);

// Caso C: step distinto de 'form' → check se salta
const c = await simulateEffect({
    step: 'ranking', isDev: false, authUsername: '3117250869', authPassword: '0869',
    date: '2026-06-22', getPwaBetsResult: { bets: [{ id: 'pwa_x' }] },
    tokenCounter: sharedToken
});
check('step="ranking": submitted NO se setea', c.submitted === false);

// Caso D: bets vacías → check se ejecuta pero no redirige
const d = await simulateEffect({
    step: 'form', isDev: false, authUsername: '3117250869', authPassword: '0869',
    date: '2026-06-22', getPwaBetsResult: { bets: [] },
    tokenCounter: sharedToken
});
check('bets=[]: submitted NO se setea', d.submitted === false);
check('bets=[]: step NO cambia', d.setStepCalled === null);

// Caso E: bets con elementos → check redirige a done
const e = await simulateEffect({
    step: 'form', isDev: false, authUsername: '3117250869', authPassword: '0869',
    date: '2026-06-22', getPwaBetsResult: { bets: [
        { id: 'pwa_3117250869_2026-06-22_1', homeScore: 2, awayScore: 1 },
        { id: 'pwa_3117250869_2026-06-22_2', homeScore: 0, awayScore: 0 },
    ] },
    tokenCounter: sharedToken
});
check('bets con 2 elementos: submitted=true', e.submitted === true);
check('bets con 2 elementos: step="done"', e.setStepCalled === 'done');
check('bets con 2 elementos: doneMode="already-submitted"', e.doneMode === 'already-submitted');
check('bets con 2 elementos: tour cancelado', e.tourCancelled === true);
check(
    'infoMessage menciona "inmutables"',
    /inmutables/i.test(e.infoMessage)
);

// Caso F: race condition — la primera llamada se queda "stale" cuando un
// segundo effect dispara y bumpea el token. La respuesta tardía se ignora.
const slowResult = new Promise((resolve) => {
    setTimeout(() => resolve({ bets: [{ id: 'pwa_x' }] }), 30);
});
const f1Promise = simulateEffect({
    step: 'form', isDev: false, authUsername: '3117250869', authPassword: '0869',
    date: '2026-06-22', getPwaBetsResult: slowResult,
    tokenCounter: sharedToken
});
// Simulamos que un nuevo effect dispara (ej. usuario hace logout/login)
// e incrementa el token antes de que la primera respuesta llegue.
const f2 = await simulateEffect({
    step: 'form', isDev: false, authUsername: '3117250869', authPassword: '0869',
    date: '2026-06-22', getPwaBetsResult: { bets: [] },
    tokenCounter: sharedToken
});
const f1 = await f1Promise;
check('race condition (token stale): f1 ignora respuesta tardía', f1.submitted === false);
check('race condition (token stale): f1 step NO cambia', f1.setStepCalled === null);
check('race condition: f2 (nuevo) sí se ejecuta', f2.submitted === false && f2.setStepCalled === null);

// ============================================================================
// 6. Backend: la idempotencia sigue intacta (red de seguridad)
// ============================================================================

const savePwaBetPhp = readFileSync('./src/assets/save_pwa_bet.php', 'utf8');
check(
    'save_pwa_bet.php retorna saved + alreadyExists (idempotente)',
    /['"]saved['"]\s*=>\s*count\(\$inserts\)/.test(savePwaBetPhp) &&
    /['"]alreadyExists['"]\s*=>\s*count\(\$alreadyExists\)/.test(savePwaBetPhp)
);
check(
    'save_pwa_bet.php rechaza si passwordChanged es false (defense in depth)',
    /passwordChanged/.test(savePwaBetPhp) && /http_response_code\(403\)/.test(savePwaBetPhp)
);

// ============================================================================
// 7. getPwaBets está exportado y filtra por matchDate
// ============================================================================

check('api.getPwaBets está exportado', typeof api.getPwaBets === 'function');
check(
    'getPwaBets acepta matchDate en su firma',
    /matchDate\??\s*:\s*string/.test(apiSource)
);
check(
    'get_pwa_bets.php filtra por matchDate cuando viene',
    /\$filterDate\s*=\s*isset\(\$data\[['"]matchDate['"]\]\)/.test(readFileSync('./src/assets/get_pwa_bets.php', 'utf8'))
);

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
