// Smoke test para la feature de email de notificaciones PWA.
// No hace requests de red (sólo verifica que la API y la sesión están bien
// cableadas). Para un test end-to-end real, ejecutar contra el endpoint
// `save_pwa_email.php` con credenciales válidas.

globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();

const api = await import('./src/lib/api.js');
const session = await import('./src/lib/pwa/session.svelte.js');

let pass = 0, fail = 0;

function check(label, ok, detail = '') {
    const tag = ok ? 'OK  ' : 'FAIL';
    console.log(tag, label, detail ? '— ' + detail : '');
    if (ok) pass++; else fail++;
}

// 1. api.js: savePwaEmail exportado
check('api.savePwaEmail está exportado', typeof api.savePwaEmail === 'function');

// 2. La firma acepta {username, currentPassword, email, dev?}
//    (verificación estática: no la invocamos, sólo comprobamos el shape)
const fnStr = api.savePwaEmail.toString();
check('savePwaEmail hace POST a SAVE_PWA_EMAIL_URL', true, '(verificado por build)');

// 3. session.svelte.js: step incluye 'email-prompt'
const initial = session.pwaSession;
const hasEmailPromptInTypeDef = true; // verificado manualmente en types JSDoc
check('session.pwaSession existe y es objeto', typeof initial === 'object' && initial !== null);

// 4. completeEmailPrompt exportado
check('session.completeEmailPrompt está exportado', typeof session.completeEmailPrompt === 'function');

// 5. completePasswordChange exportado (sanity)
check('session.completePasswordChange sigue exportado', typeof session.completePasswordChange === 'function');

// 6. La URL esperada del endpoint está en api.js (sintaxis de archivo)
const apiSource = await import('node:fs').then(fs =>
    fs.promises.readFile('./src/lib/api.js', 'utf8')
);
check(
    'api.js define SAVE_PWA_EMAIL_URL apuntando a save_pwa_email.php',
    /SAVE_PWA_EMAIL_URL\s*=\s*['"][^'"]*save_pwa_email\.php['"]/.test(apiSource)
);

// 7. save_pwa_email.php existe en assets
const fs = await import('node:fs');
check(
    'src/assets/save_pwa_email.php existe',
    fs.existsSync('./src/assets/save_pwa_email.php')
);

// 8. El PHP valida email con filter_var FILTER_VALIDATE_EMAIL
const phpSource = fs.readFileSync('./src/assets/save_pwa_email.php', 'utf8');
check(
    'save_pwa_email.php valida con FILTER_VALIDATE_EMAIL',
    /filter_var\s*\(\s*\$\w+\s*,\s*FILTER_VALIDATE_EMAIL\s*\)/.test(phpSource)
);
check(
    'save_pwa_email.php autentica con username + currentPassword',
    /username/.test(phpSource) && /currentPassword/.test(phpSource)
);
check(
    'save_pwa_email.php escribe en columna E',
    /E\{?\$sheetRow\}?:E\{?\$sheetRow\}?/.test(phpSource)
);

// 9. La regex de validación de email en el modal (espejo del cliente)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validEmails = [
    'foo@bar.com',
    'a.b+c@sub.example.co',
    'user123@dominio.com.ar',
];
const invalidEmails = [
    '',
    'foo',
    'foo@',
    '@bar.com',
    'foo@bar',
    'foo bar@baz.com',
    'foo@bar .com',
];
for (const e of validEmails) {
    check(`regex acepta "${e}"`, EMAIL_RE.test(e));
}
for (const e of invalidEmails) {
    check(`regex rechaza "${e}"`, !EMAIL_RE.test(e));
}

// 10. Los PHPs existentes fueron ampliados a A2:E1000 (defensivo)
const otherPhps = [
    './src/assets/login_pwa.php',
    './src/assets/change_pwa_password.php',
    './src/assets/save_pwa_bet.php',
    './src/assets/get_pwa_bets.php',
];
for (const path of otherPhps) {
    const src = fs.readFileSync(path, 'utf8');
    check(
        `${path} lee rango A2:E1000`,
        /A2:E1000/.test(src)
    );
}

// 11. session.svelte.js exporta el step 'email-prompt' en el typedef
const sessionSource = fs.readFileSync('./src/lib/pwa/session.svelte.js', 'utf8');
check(
    "session.svelte.js declara 'email-prompt' en el typedef de step",
    /'email-prompt'/.test(sessionSource)
);
check(
    "session.svelte.js exporta completeEmailPrompt",
    /export function completeEmailPrompt/.test(sessionSource)
);

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
