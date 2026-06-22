<script>
    import { changePwaPassword } from '../../api.js';
    import { pwaSession, completePasswordChange, logout } from '../../pwa/session.svelte.js';

    /** @type {{ isDev?: boolean, onSuccess?: () => void }} */
    let { isDev = false, onSuccess = () => {} } = $props();

    let newPassword = $state('');
    let confirmPassword = $state('');
    let showNew = $state(false);
    let showConfirm = $state(false);
    let error = $state('');
    let loading = $state(false);

    const currentPassword = $derived(pwaSession.authPassword || '');
    const participant = $derived(pwaSession.authParticipant || '');

    const newValid = $derived(newPassword.length === 4);
    const confirmValid = $derived(confirmPassword.length === 4);
    const matches = $derived(newPassword === confirmPassword && newValid);
    const isDifferent = $derived(newPassword !== '' && newPassword !== currentPassword);

    // Strength: 4 segmentos. Cada check suma 1.
    const strength = $derived.by(() => {
        let n = 0;
        if (newValid) n++;
        if (/\d/.test(newPassword) && /(\d).*\1/.test(newPassword)) n++; // tiene repetidos
        if (isDifferent) n++;
        if (/^(?=\d*$)(?:(\d)(?!\1*$))+$/.test(newPassword)) n++; // todos distintos
        return Math.min(n, 4);
    });

    const strengthLabel = $derived(['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'][strength] || '');
    const strengthColor = $derived(
        strength >= 4 ? 'bg-emerald-500' :
        strength >= 3 ? 'bg-emerald-400' :
        strength >= 2 ? 'bg-amber-400' :
        'bg-red-400'
    );

    const canSubmit = $derived(newValid && confirmValid && matches && isDifferent && !loading);

    const stepReached = $derived({
        new: newValid,
        confirm: confirmValid && matches,
        ready: isDifferent
    });

    /** @param {Event} e */
    function handleNewInput(e) {
        const t = /** @type {HTMLInputElement} */ (e.target);
        newPassword = t.value.replace(/\D/g, '').slice(0, 4);
        error = '';
    }

    /** @param {Event} e */
    function handleConfirmInput(e) {
        const t = /** @type {HTMLInputElement} */ (e.target);
        confirmPassword = t.value.replace(/\D/g, '').slice(0, 4);
        error = '';
    }

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') logout();
    }

    async function submit() {
        if (!canSubmit) {
            if (newPassword === currentPassword) {
                error = 'La nueva contraseña debe ser distinta de la actual.';
            }
            return;
        }
        if (!pwaSession.authUsername) {
            error = 'Sesión inválida. Vuelve a iniciar sesión.';
            logout();
            return;
        }

        loading = true;
        error = '';
        try {
            await changePwaPassword({
                username: pwaSession.authUsername,
                currentPassword,
                newPassword
            });
            completePasswordChange(newPassword);
            onSuccess();
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
        style="background: radial-gradient(circle at 20% 100%, rgba(251, 191, 36, 0.18), transparent 50%), radial-gradient(circle at 80% 0%, rgba(16, 185, 129, 0.20), transparent 50%);"
    ></div>

    <div class="w-full max-w-md animate-fade-in">
        <!-- Header -->
        <div class="mb-6 flex items-center gap-3">
            <button
                class="w-11 h-11 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-xl transition-all"
                onclick={logout}
                aria-label="Cerrar sesión"
            >←</button>
            <h2 class="text-2xl font-bold">Cambia tu contraseña</h2>
        </div>

        {#if isDev}
            <div class="mb-4 glass border-amber-500/40 rounded-2xl p-3 text-amber-200 text-xs text-center font-medium space-y-1 animate-slide-down">
                <div>⚙️ DEV MODE — ventana siempre abierta</div>
                <div class="text-amber-300/80">El cambio SÍ se persiste en Sheets</div>
            </div>
        {/if}

        <!-- Banner motivacional -->
        <div class="glass border-amber-500/30 rounded-2xl p-4 mb-5 text-center">
            <p class="text-amber-100 text-sm leading-relaxed">
                🔐 <strong>Hola, {participant}.</strong> Es tu primer ingreso. Elegí una nueva contraseña de 4 dígitos para continuar.
            </p>
        </div>

        <!-- Progress steps visuales -->
        <div class="flex items-center gap-2 mb-5">
            {#each [1, 2, 3] as n}
                {@const reached = (n === 1 && stepReached.new) || (n === 2 && stepReached.confirm) || (n === 3 && stepReached.ready)}
                {@const active = (n === 1 && !stepReached.new) || (n === 2 && stepReached.new && !stepReached.confirm) || (n === 3 && stepReached.confirm && !stepReached.ready)}
                <div class="flex-1 flex items-center gap-2">
                    <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all {reached ? 'bg-emerald-500 text-black' : active ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50' : 'bg-white/5 text-gray-500'}">
                        {reached ? '✓' : n}
                    </div>
                    <div class="flex-1 h-1 rounded-full {reached ? 'bg-emerald-500' : 'bg-white/5'}"></div>
                </div>
            {/each}
        </div>

        <!-- Glass card -->
        <div class="glass-strong rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl shadow-black/40">
            <!-- Nueva contraseña -->
            <div>
                <label class="flex items-center justify-between text-sm text-gray-300 mb-2" for="new-password">
                    <span>Nueva contraseña (4 dígitos)</span>
                    {#if newValid}
                        <span class="text-emerald-400 text-xs font-semibold animate-fade-in">✓</span>
                    {/if}
                </label>
                <div class="relative">
                    <input
                        id="new-password"
                        type={showNew ? 'text' : 'password'}
                        inputmode="numeric"
                        autocomplete="new-password"
                        value={newPassword}
                        oninput={handleNewInput}
                        onkeydown={handleKeydown}
                        placeholder="····"
                        maxlength="4"
                        class="w-full bg-white/5 border-2 border-white/10 rounded-2xl pl-4 pr-12 py-4 text-center text-3xl tracking-[0.5em] text-white outline-none focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all font-mono"
                    />
                    <button
                        type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white text-lg transition-colors rounded-lg hover:bg-white/5"
                        onclick={() => showNew = !showNew}
                        aria-label={showNew ? 'Ocultar' : 'Mostrar'}
                        tabindex="-1"
                    >
                        {showNew ? '🙈' : '👁'}
                    </button>
                </div>

                <!-- Strength meter -->
                {#if newPassword.length > 0}
                    <div class="mt-3 animate-fade-in">
                        <div class="flex gap-1.5">
                            {#each [0, 1, 2, 3] as i}
                                <div class="flex-1 h-1.5 rounded-full transition-all {i < strength ? strengthColor : 'bg-white/5'}"></div>
                            {/each}
                        </div>
                        <div class="flex justify-between items-center mt-1.5">
                            <span class="text-xs text-gray-400">Fortaleza: <span class="font-semibold {strength >= 3 ? 'text-emerald-400' : strength >= 2 ? 'text-amber-400' : 'text-red-400'}">{strengthLabel}</span></span>
                            {#if newPassword === currentPassword && newPassword.length === 4}
                                <span class="text-xs text-red-400">Igual a la actual</span>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Confirmar -->
            <div>
                <label class="flex items-center justify-between text-sm text-gray-300 mb-2" for="confirm-password">
                    <span>Confirmar nueva contraseña</span>
                    {#if matches}
                        <span class="text-emerald-400 text-xs font-semibold animate-fade-in">✓ Coincide</span>
                    {/if}
                </label>
                <div class="relative">
                    <input
                        id="confirm-password"
                        type={showConfirm ? 'text' : 'password'}
                        inputmode="numeric"
                        autocomplete="new-password"
                        value={confirmPassword}
                        oninput={handleConfirmInput}
                        onkeydown={handleKeydown}
                        placeholder="····"
                        maxlength="4"
                        class="w-full bg-white/5 border-2 {confirmPassword.length > 0 && !matches ? 'border-red-500/50' : matches ? 'border-emerald-500/60' : 'border-white/10'} rounded-2xl pl-4 pr-12 py-4 text-center text-3xl tracking-[0.5em] text-white outline-none focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all font-mono"
                    />
                    <button
                        type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white text-lg transition-colors rounded-lg hover:bg-white/5"
                        onclick={() => showConfirm = !showConfirm}
                        aria-label={showConfirm ? 'Ocultar' : 'Mostrar'}
                        tabindex="-1"
                    >
                        {showConfirm ? '🙈' : '👁'}
                    </button>
                </div>
            </div>

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
                    Guardando…
                {:else}
                    Guardar y entrar →
                {/if}
            </button>

            <button
                class="w-full py-3 text-sm text-gray-400 hover:text-white transition-all min-h-11"
                onclick={logout}
            >
                Cancelar y cerrar sesión
            </button>
        </div>
    </div>
</div>
