<script>
    import { onMount } from 'svelte';
    import { loginPwa } from '../../api.js';
    import { pwaSession, loginAs, setStep } from '../../pwa/session.svelte.js';

    /** @type {{ onBack: () => void, isDev?: boolean }} */
    let { onBack, isDev = false } = $props();

    const REMEMBER_KEY = 'pwaRememberedUser';

    let username = $state('');
    let password = $state('');
    let showPassword = $state(false);
    let remember = $state(false);
    let error = $state('');
    let loading = $state(false);

    const usernameValid = $derived(username.length === 10);
    const passwordValid = $derived(password.length === 4);
    const canSubmit = $derived(usernameValid && passwordValid && !loading);

    onMount(() => {
        try {
            const saved = localStorage.getItem(REMEMBER_KEY);
            if (saved && /^\d{10}$/.test(saved)) {
                username = saved;
                remember = true;
            }
        } catch {}
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

    function persistRemember() {
        try {
            if (remember) {
                localStorage.setItem(REMEMBER_KEY, username);
            } else {
                localStorage.removeItem(REMEMBER_KEY);
            }
        } catch {}
    }

    async function submit() {
        if (!canSubmit) return;

        loading = true;
        error = '';
        try {
            const result = await loginPwa({ username, password });
            if (!result.success) {
                error = result.error || 'No se pudo iniciar sesión.';
                return;
            }
            persistRemember();
            loginAs(
                result.participant || username,
                result.phone || username,
                result.username || username,
                password,
                result.mustChangePassword === true
            );
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error desconocido';
        } finally {
            loading = false;
        }
    }
</script>

<div class="min-h-screen relative overflow-hidden flex flex-col items-center text-white p-4 md:p-8">
    <div class="absolute inset-0 -z-10 bg-[#0a0a0a]"></div>
    <div
        class="absolute inset-0 -z-10 opacity-40 animate-gradient"
        style="background: radial-gradient(circle at 30% 0%, rgba(16, 185, 129, 0.30), transparent 50%), radial-gradient(circle at 70% 100%, rgba(6, 182, 212, 0.20), transparent 50%);"
    ></div>

    <div class="w-full max-w-md animate-fade-in">
        <!-- Header -->
        <div class="mb-6 flex items-center gap-3">
            <button
                class="w-11 h-11 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-xl transition-all"
                onclick={onBack}
                aria-label="Volver"
            >←</button>
            <h2 class="text-2xl font-bold">Iniciar sesión</h2>
        </div>

        {#if isDev}
            <div class="mb-4 glass border-amber-500/40 rounded-2xl p-3 text-amber-200 text-xs text-center font-medium space-y-1 animate-slide-down">
                <div>⚙️ DEV MODE — ventana siempre abierta</div>
                <div class="text-amber-300/80">Login real contra gsheets: ingresá tus credenciales</div>
            </div>
        {/if}

        <!-- Glass card -->
        <div class="glass-strong rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl shadow-black/40">
            <div class="text-center pb-2">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 ring-1 ring-white/10 mb-3">
                    <img src="./balon.png" alt="" class="w-9 h-9" />
                </div>
                <p class="text-gray-300 text-sm">
                    Ingresa los últimos 10 dígitos de tu celular y los últimos 4 como contraseña.
                </p>
            </div>

            <!-- Username -->
            <div>
                <label class="flex items-center justify-between text-sm text-gray-300 mb-2" for="username">
                    <span>Usuario (10 dígitos)</span>
                    {#if usernameValid}
                        <span class="text-emerald-400 text-xs font-semibold animate-fade-in">✓ Listo</span>
                    {/if}
                </label>
                <div class="relative">
                    <input
                        id="username"
                        type="text"
                        inputmode="numeric"
                        autocomplete="username"
                        value={username}
                        oninput={handleUsernameInput}
                        onkeydown={handleKeydown}
                        placeholder="3117250869"
                        maxlength="10"
                        class="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-4 py-4 text-center text-2xl tracking-widest text-white outline-none focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all font-mono"
                    />
                </div>
            </div>

            <!-- Password -->
            <div>
                <label class="flex items-center justify-between text-sm text-gray-300 mb-2" for="password">
                    <span>Contraseña (4 dígitos)</span>
                    {#if passwordValid}
                        <span class="text-emerald-400 text-xs font-semibold animate-fade-in">✓ Listo</span>
                    {/if}
                </label>
                <div class="relative">
                    <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        inputmode="numeric"
                        autocomplete="current-password"
                        value={password}
                        oninput={handlePasswordInput}
                        onkeydown={handleKeydown}
                        placeholder="····"
                        maxlength="4"
                        class="w-full bg-white/5 border-2 border-white/10 rounded-2xl pl-4 pr-12 py-4 text-center text-3xl tracking-[0.5em] text-white outline-none focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all font-mono"
                    />
                    <button
                        type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white text-lg transition-colors rounded-lg hover:bg-white/5"
                        onclick={() => showPassword = !showPassword}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        tabindex="-1"
                    >
                        {showPassword ? '🙈' : '👁'}
                    </button>
                </div>
            </div>

            <!-- Recordarme -->
            <label class="flex items-center gap-3 cursor-pointer text-sm text-gray-300 select-none py-1">
                <input
                    type="checkbox"
                    bind:checked={remember}
                    class="w-5 h-5 rounded accent-emerald-500 cursor-pointer"
                />
                <span>Recordar mi usuario</span>
            </label>

            <!-- Error toast -->
            {#if error}
                <div class="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-red-200 text-sm text-center animate-slide-down">
                    ⚠️ {error}
                </div>
            {/if}

            <!-- Submit -->
            <button
                class="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white text-lg font-bold shadow-xl shadow-emerald-500/30 transition-all min-h-12 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                onclick={submit}
                disabled={!canSubmit}
            >
                {#if loading}
                    <span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Verificando…
                {:else}
                    Entrar →
                {/if}
            </button>
        </div>
    </div>
</div>
