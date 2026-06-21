<script>
    import { loginPwa } from '../../api.js';
    import { pwaSession, loginAs, setStep } from '../../pwa/session.svelte.js';

    /** @type {{ onBack: () => void, isDev?: boolean }} */
    let { onBack, isDev = false } = $props();

    const DEV_USERNAME = '0000000000';
    const DEV_PASSWORD = '0000';

    let username = $state('');
    let password = $state('');
    let error = $state('');
    let loading = $state(false);

    // En dev mode, auto-completar y lanzar submit inmediatamente.
    // En dev NO se hace ninguna llamada a la red: loginAs() se llama directo.
    $effect(() => {
        if (isDev && !loading && !pwaSession.authUsername) {
            loginAs('Dev User (modo pruebas)', '0000000000', DEV_USERNAME, DEV_PASSWORD);
        }
    });

    /** @param {Event} e */
    function handleUsernameInput(e) {
        const t = /** @type {HTMLInputElement} */ (e.target);
        username = t.value.replace(/\D/g, '').slice(0, 10);
        error = '';
    }

    /** @param {Event} e */
    function handlePasswordInput(e) {
        const t = /** @type {HTMLInputElement} */ (e.target);
        password = t.value.replace(/\D/g, '').slice(0, 4);
        error = '';
    }

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') onBack();
    }

    async function submit() {
        if (loading) return;
        if (username.length !== 10) {
            error = 'El usuario debe tener exactamente 10 dígitos.';
            return;
        }
        if (password.length !== 4) {
            error = 'La contraseña debe tener exactamente 4 dígitos.';
            return;
        }

        loading = true;
        error = '';
        try {
            const result = await loginPwa({
                username,
                password
            });
            if (!result.success) {
                error = result.error || 'No se pudo iniciar sesión.';
                return;
            }
            loginAs(
                result.participant || username,
                result.phone || username,
                result.username || username,
                password
            );
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error desconocido';
        } finally {
            loading = false;
        }
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-4 md:p-8 flex flex-col items-center">
    <div class="w-full max-w-md">
        <div class="mb-6 flex items-center gap-3">
            <button
                class="w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-xl transition-all border border-white/10"
                onclick={onBack}
                aria-label="Volver"
            >←</button>
            <h2 class="text-2xl font-bold text-cyan-400">Iniciar sesión</h2>
        </div>

        {#if isDev}
            <div class="mb-4 bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 text-amber-200 text-sm text-center font-medium">
                ⚙️ DEV MODE — saltando login con credenciales dummy
            </div>
        {/if}

        <div class="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 space-y-5">
            <div class="text-center">
                <div class="text-5xl mb-3">🔐</div>
                <p class="text-gray-300 text-sm">
                    Ingresa los últimos 10 dígitos de tu celular y los últimos 4 como contraseña.
                </p>
            </div>

            <div>
                <label class="block text-sm text-gray-300 mb-2" for="username">
                    Usuario (10 dígitos)
                </label>
                <input
                    id="username"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    value={username}
                    oninput={handleUsernameInput}
                    onkeydown={handleKeydown}
                    placeholder="3117250869"
                    maxlength="10"
                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-center text-2xl tracking-widest text-white outline-none focus:border-cyan-500 transition-all font-mono"
                />
            </div>

            <div>
                <label class="block text-sm text-gray-300 mb-2" for="password">
                    Contraseña (4 dígitos)
                </label>
                <input
                    id="password"
                    type="password"
                    inputmode="numeric"
                    autocomplete="off"
                    value={password}
                    oninput={handlePasswordInput}
                    onkeydown={handleKeydown}
                    placeholder="····"
                    maxlength="4"
                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-center text-3xl tracking-[0.5em] text-white outline-none focus:border-cyan-500 transition-all font-mono"
                />
            </div>

            {#if error}
                <p class="text-red-400 text-sm text-center font-medium">{error}</p>
            {/if}

            <button
                class="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-2xl text-white text-lg font-bold shadow-lg shadow-cyan-500/30 transition-all min-h-12 disabled:opacity-50"
                onclick={submit}
                disabled={loading || username.length !== 10 || password.length !== 4}
            >
                {loading ? 'Verificando…' : 'Entrar →'}
            </button>
        </div>
    </div>
</div>
