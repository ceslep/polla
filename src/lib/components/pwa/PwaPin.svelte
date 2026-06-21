<script>
    import { login, setStep, hashPin } from '../../pwa/session.svelte.js';

    /** @type {{ participant: string, phone: string, onBack: () => void }} */
    let { participant, phone, onBack } = $props();

    let pin = $state('');
    let error = $state(false);
    let loading = $state(false);

    const last4hint = $derived(phone.replace(/\D/g, '').slice(-4));

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Enter') verify();
        if (e.key === 'Escape') onBack();
    }

    /** @param {Event} e */
    function handleInput(e) {
        const t = /** @type {HTMLInputElement} */ (e.target);
        const v = t.value.replace(/\D/g, '').slice(0, 4);
        pin = v;
        error = false;
    }

    async function verify() {
        if (pin.length !== 4) {
            error = true;
            return;
        }
        const expected = phone.replace(/\D/g, '').slice(-4);
        if (pin !== expected) {
            error = true;
            pin = '';
            return;
        }
        loading = true;
        try {
            const hash = await hashPin(phone, pin);
            login(participant, phone, hash);
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
            <h2 class="text-2xl font-bold text-cyan-400">Verificación</h2>
        </div>

        <div class="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 space-y-6">
            <div class="text-center">
                <div class="text-5xl mb-3">👋</div>
                <h3 class="text-xl font-bold mb-1">Hola, {participant}</h3>
                <p class="text-sm text-gray-400 font-mono">{phone}</p>
            </div>

            <div class="border-t border-white/10 pt-6">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label class="block text-sm text-gray-300 mb-2 text-center">
                    Ingresa los últimos 4 dígitos de tu número
                </label>
                <!-- svelte-ignore a11y_autofocus -->
                <input
                    type="password"
                    inputmode="numeric"
                    autocomplete="off"
                    value={pin}
                    oninput={handleInput}
                    onkeydown={handleKeydown}
                    placeholder="····"
                    maxlength="4"
                    class="w-full bg-white/5 border {error ? 'border-red-500' : 'border-white/10'} rounded-2xl px-4 py-5 text-center text-3xl tracking-[0.5em] text-white outline-none focus:border-cyan-500 transition-all font-mono"
                    autofocus
                />
                {#if error}
                    <p class="text-red-400 text-sm text-center mt-3 font-medium">
                        PIN incorrecto. Vuelve a intentarlo.
                    </p>
                {/if}
                <p class="text-xs text-gray-500 text-center mt-3">
                    Tu número termina en <span class="text-gray-300 font-mono">…{last4hint}</span>
                </p>
            </div>

            <button
                class="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-2xl text-white text-lg font-bold shadow-lg shadow-cyan-500/30 transition-all min-h-12 disabled:opacity-50"
                onclick={verify}
                disabled={loading || pin.length !== 4}
            >
                {loading ? 'Verificando…' : 'Continuar →'}
            </button>
        </div>
    </div>
</div>
