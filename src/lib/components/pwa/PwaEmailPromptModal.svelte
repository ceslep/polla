<script>
    import { savePwaEmail } from '../../api.js';
    import { pwaSession } from '../../pwa/session.svelte.js';

    /** @type {{ onClose: () => void }} */
    let { onClose } = $props();

    // Estados: 'choose' (sí/no), 'collect' (input email), 'saving' (request)
    let stage = $state(/** @type {'choose' | 'collect' | 'saving'} */('choose'));
    let email = $state('');
    let error = $state('');

    // Regex permisivo pero útil: exige @ y un punto en el dominio, sin
    // espacios. Coincide con la práctica de HTML5 (input[type=email]).
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailValid = $derived(EMAIL_RE.test(email.trim()));

    function chooseYes() {
        stage = 'collect';
        error = '';
    }

    function chooseNo() {
        // El usuario explícitamente rechaza notificaciones. Cierra el modal
        // sin llamar al backend — el email queda simplemente en blanco.
        onClose();
    }

    /** @param {Event} e */
    function handleEmailInput(e) {
        const t = /** @type {HTMLInputElement} */ (e.target);
        email = t.value;
        error = '';
    }

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Enter' && stage === 'collect' && emailValid) {
            save();
        }
        if (e.key === 'Escape') {
            // Escape: descartamos el modal (no guardamos nada).
            onClose();
        }
    }

    async function save() {
        if (!pwaSession.authUsername || !pwaSession.authPassword) {
            error = 'Sesión inválida. Vuelve a iniciar sesión.';
            return;
        }
        if (!emailValid) {
            error = 'El email no tiene un formato válido.';
            return;
        }

        stage = 'saving';
        error = '';
        try {
            await savePwaEmail({
                username: pwaSession.authUsername,
                currentPassword: pwaSession.authPassword,
                email: email.trim()
            });
            onClose();
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error desconocido';
            stage = 'collect';
        }
    }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 animate-fade-in">
    <div class="absolute inset-0 -z-10 bg-[#0a0a0a]"></div>
    <div
        class="absolute inset-0 -z-10 opacity-40 animate-gradient"
        style="background: radial-gradient(circle at 30% 30%, rgba(16, 185, 129, 0.30), transparent 50%), radial-gradient(circle at 70% 70%, rgba(6, 182, 212, 0.25), transparent 50%);"
    ></div>

    <div class="w-full max-w-md animate-fade-in">
        <!-- Header con botón cerrar -->
        <div class="mb-4 flex items-center justify-end">
            <button
                class="w-10 h-10 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-lg transition-all"
                onclick={onClose}
                aria-label="Cerrar"
            >✕</button>
        </div>

        <div class="glass-strong rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl shadow-black/40">
            {#if stage === 'choose'}
                <div class="text-center space-y-3 pb-2">
                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 ring-1 ring-white/10 mb-1">
                        <span class="text-3xl">📬</span>
                    </div>
                    <h3 class="text-2xl font-bold text-white">¿Querés recibir notificaciones?</h3>
                    <p class="text-gray-300 text-sm leading-relaxed">
                        Podemos avisarte por correo electrónico cuando se publiquen los
                        resultados, se cierre la ventana de apuestas o haya cambios
                        importantes en la polla.
                    </p>
                    <p class="text-gray-500 text-xs">Podés cambiar o eliminar tu email en cualquier momento.</p>
                </div>

                <div class="space-y-3 pt-1">
                    <button
                        class="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white text-base font-bold shadow-xl shadow-emerald-500/30 transition-all min-h-12 flex items-center justify-center gap-2"
                        onclick={chooseYes}
                    >
                        Sí, quiero notificaciones
                    </button>
                    <button
                        class="w-full py-3 text-sm text-gray-400 hover:text-white transition-all min-h-11 glass rounded-2xl"
                        onclick={chooseNo}
                    >
                        No, gracias
                    </button>
                </div>

            {:else}
                <div class="text-center space-y-2 pb-1">
                    <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 ring-1 ring-white/10 mb-1">
                        <span class="text-2xl">✉️</span>
                    </div>
                    <h3 class="text-xl font-bold text-white">Tu email</h3>
                    <p class="text-gray-400 text-xs">
                        Ingresá el correo donde querés recibir las notificaciones.
                    </p>
                </div>

                <div>
                    <label class="flex items-center justify-between text-sm text-gray-300 mb-2" for="pwa-email">
                        <span>Email</span>
                        {#if emailValid}
                            <span class="text-emerald-400 text-xs font-semibold animate-fade-in">✓ Válido</span>
                        {/if}
                    </label>
                    <input
                        id="pwa-email"
                        type="email"
                        inputmode="email"
                        autocomplete="email"
                        value={email}
                        oninput={handleEmailInput}
                        onkeydown={handleKeydown}
                        placeholder="nombre@dominio.com"
                        class="w-full bg-white/5 border-2 {email.length > 0 && !emailValid ? 'border-red-500/50' : emailValid ? 'border-emerald-500/60' : 'border-white/10'} rounded-2xl px-4 py-4 text-center text-lg text-white outline-none focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all"
                    />
                </div>

                {#if error}
                    <div class="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-red-200 text-sm text-center animate-slide-down">
                        ⚠️ {error}
                    </div>
                {/if}

                <div class="space-y-2 pt-1">
                    <button
                        class="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white text-base font-bold shadow-xl shadow-emerald-500/30 transition-all min-h-12 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                        onclick={save}
                        disabled={!emailValid}
                    >
                        Guardar y entrar →
                    </button>
                    <button
                        class="w-full py-3 text-sm text-gray-400 hover:text-white transition-all min-h-11"
                        onclick={onClose}
                    >
                        Omitir
                    </button>
                </div>
            {/if}
        </div>
    </div>
</div>
