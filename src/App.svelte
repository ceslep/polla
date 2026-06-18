<script>
    import { onMount } from 'svelte';
    import { appState, findMatchForBet, findMatchSuggestion, applyMatchSuggestion, dismissMatchSuggestion, participants, safeFormatDate, uniqueBets } from './lib/stores.svelte.js';
    import { loadMatches, loadMatchesFromGitHub, loadWorldCupMatches, compareBetWithMatch, saveBetsToSheets, loadBetsFromSheets, clearBetsFromSheets } from './lib/api.js';
    import { normalizeTeamName, parseWhatsAppExport } from './lib/parser.js';
    import DropZone from './lib/components/DropZone.svelte';
    import StatsGrid from './lib/components/StatsGrid.svelte';
    import BetTable from './lib/components/BetTable.svelte';
    import BetModal from './lib/components/BetModal.svelte';
    import WorldCupResultsModal from './lib/components/WorldCupResultsModal.svelte';
    import ResultsModal from './lib/components/ResultsModal.svelte';
    import PendingBetsModal from './lib/components/PendingBetsModal.svelte';
    import RankingModal from './lib/components/RankingModal.svelte';
    import ParticipantDetailModal from './lib/components/ParticipantDetailModal.svelte';
    import AdminModal from './lib/components/AdminModal.svelte';
    import AdminUploadModal from './lib/components/AdminUploadModal.svelte';
    import ResetAllModal from './lib/components/ResetAllModal.svelte';
    import MessageModal from './lib/components/MessageModal.svelte';
    import MobileMenu from './lib/components/MobileMenu.svelte';
    import StatsModal from './lib/components/StatsModal.svelte';

    let selectedBet = $state(/** @type {any} */ (null));
    let mobileMenuOpen = $state(false);
    let showResultsModal = $state(false);
    let showAnalysisModal = $state(false);
    let showPendingModal = $state(false);
    let showRankingModal = $state(false);
    let showAdminModal = $state(false);
    let showAdminUploadModal = $state(false);
    let showResetAllModal = $state(false);
    let showMessageModal = $state(false);
    let showStatsModal = $state(false);
    let isSavingToSheets = $state(false);
    let isLoadingFromSheets = $state(false);
    let loadFromSheetsFailed = $state(false);
    let messageModalType = $state(/** @type {'info' | 'warning' | 'error' | 'success'} */ ('info'));
    let messageModalContent = $state('');
    let adminAction = $state(/** @type {(() => void) | null} */ (null));
    let adminTitle = $state('');
    let adminMessage = $state('');
    let selectedParticipantName = $state(/** @type {string|null} */ (null));
    let analysisSummary = $state(/** @type {{ summary: { total: number, updated: number, errors: number }, errors: string[], winners: Array<{participant: string, points: number, rank: number}> }} */ ({ summary: { total: 0, updated: 0, errors: 0 }, errors: [], winners: [] }));
    const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    /** @param {any} bet */
    function handleSelectBet(bet) {
        selectedBet = bet;
    }

    function handleHashChange() {
        const hash = window.location.hash.slice(2) || '/';
        if (hash.startsWith('participant/')) {
            const name = decodeURIComponent(hash.split('/')[1]);
            selectedParticipantName = name;
            showRankingModal = false;
        } else if (hash === 'ranking') {
            showRankingModal = true;
            selectedParticipantName = null;
        } else {
            showRankingModal = false;
            selectedParticipantName = null;
        }
    }

    export function goToParticipant(/** @type {string} */ name) {
        window.location.hash = `/participant/${encodeURIComponent(name)}`;
    }

    export function goToRanking() {
        window.location.hash = '/ranking';
    }

    export function closeModals() {
        window.location.hash = '/';
    }

    /** @param {any[]} updatedBets */
    function handleBetUpdate(updatedBets) {
        console.log('Bets updated:', updatedBets.length);
        if (updatedBets.length > 0) {
            selectedBet = updatedBets[0];
        }
    }

    /** @param {string} betId */
    async function handleApplySuggestion(betId) {
        applyMatchSuggestion(betId);
        await analyzeBets(true);
    }

    /** @param {string} betId */
    function handleDismissSuggestion(betId) {
        dismissMatchSuggestion(betId);
    }

    /** @returns {Array<{participant: string, points: number, rank: number}>} */
    function calculateWinners() {
        const pointsByParticipant = new Map();

        for (const bet of uniqueBets()) {
            if (bet.status === 'pending') continue;
            const current = pointsByParticipant.get(bet.participant) || 0;
            pointsByParticipant.set(bet.participant, current + (Number(bet.points) || 0));
        }

        const sorted = [...pointsByParticipant.entries()]
            .map(([participant, points]) => ({ participant, points }))
            .sort((a, b) => b.points - a.points);

        return sorted.map((w, i) => ({ ...w, rank: i + 1 }));
    }

    /**
     * @param {boolean} useGitHub
     */
    async function analyzeBets(useGitHub = false) {
        console.log('analyzeBets called, useGitHub:', useGitHub);
        if (appState.bets.length === 0) {
            console.log('No bets to analyze');
            return;
        }

        appState.isLoading = true;
        /** @type {string[]} */
        const errors = [];
        let updatedCount = 0;

        try {
            console.log('Loading matches...');
            const matches = useGitHub
                ? await loadMatchesFromGitHub()
                : await loadMatches();
            console.log('Matches loaded:', matches.length, matches);
            console.log('Match dates in scored matches:', [...new Set(matches.map(m => m.date))].sort());
            appState.matches = matches;

            console.log('Loading all matches for validation...');
            const allRawMatches = await loadWorldCupMatches();
            const allMatchesFormatted = allRawMatches
                .filter(m => m.team1 && m.team2)
                .map((m, i) => ({
                    id: i + 1,
                    date: m.date,
                    homeTeam: normalizeTeamName(m.team1),
                    homeShort: m.team1,
                    awayTeam: normalizeTeamName(m.team2),
                    awayShort: m.team2,
                    homeScore: m.score?.ft?.[0] ?? null,
                    awayScore: m.score?.ft?.[1] ?? null,
                    resultString: m.score ? `${m.team1} ${m.score.ft[0]} - ${m.score.ft[1]} ${m.team2}` : `${m.team1} vs ${m.team2}`
                }));
            appState.allMatches = allMatchesFormatted;
            console.log('All matches loaded:', allMatchesFormatted.length);
            console.log('Has Qatar in allMatches:', allMatchesFormatted.some(m => m.homeTeam.includes('Qatar') || m.awayTeam.includes('Qatar')));

            const updatedBets = appState.bets.map(bet => {
                if (bet.status !== 'pending' && bet.verified) {
                    return bet;
                }

                let effectiveBet = bet;
                const betDate = safeFormatDate(bet.timestamp);
                const cutoffDateStr = '2026-06-14';

                if (betDate && betDate < cutoffDateStr) {
                    const matchInAll = findMatchForBet(effectiveBet, allMatchesFormatted);
                    console.log('matchInAll:', bet.bet_text, '| prediction:', JSON.stringify(bet.prediction), '|', matchInAll ? matchInAll.homeTeam + ' '+ matchInAll.awayTeam : 'null');
                    if (matchInAll) {
                        const adjustedTimestamp = matchInAll.date + ' ' + bet.timestamp.substring(10);
                        console.log('Adjusted:', bet.bet_text, 'from', bet.timestamp, 'to', adjustedTimestamp);
                        effectiveBet = { ...bet, timestamp: adjustedTimestamp };
                    } else if (bet.prediction) {
                        const homeNorm = normalizeTeamName(bet.prediction.homeTeam || '');
                        const awayNorm = normalizeTeamName(bet.prediction.awayTeam || '');
                        const matchAnyDate = allMatchesFormatted.find(m => {
                            const mHomeNorm = normalizeTeamName(m.homeTeam);
                            const mAwayNorm = normalizeTeamName(m.awayTeam);
                            return (homeNorm === mHomeNorm && awayNorm === mAwayNorm) ||
                                   (homeNorm === mAwayNorm && awayNorm === mHomeNorm);
                        });
                        if (matchAnyDate) {
                            const adjustedTimestamp = matchAnyDate.date + ' ' + bet.timestamp.substring(10);
                            console.log('Adjusted (team match only):', bet.bet_text, 'from', bet.timestamp, 'to', adjustedTimestamp);
                            effectiveBet = { ...bet, timestamp: adjustedTimestamp };
                        }
                    }
                }

                const match = findMatchForBet(effectiveBet, matches);
                console.log('match graded:', bet.bet_text, '|', match ? match.homeTeam + ' '+ match.awayTeam + ' '+ match.date + ' Score:' + match.homeScore + '-' + match.awayScore : 'null');
                if (match) {
                    const result = compareBetWithMatch(effectiveBet, match);
                    console.log('compareBetWithMatch result:', bet.bet_text, '|', JSON.stringify(result));
                    updatedCount++;
                    return { ...effectiveBet, ...result, suggestedMatch: null };
                }
                const fuzzy = findMatchSuggestion(effectiveBet, matches);
                if (fuzzy) {
                    console.log('fuzzy suggestion:', bet.bet_text, '->', fuzzy.match.homeTeam + ' ' + fuzzy.match.homeScore + '-' + fuzzy.match.awayScore + ' ' + fuzzy.match.awayTeam, '(dist ' + fuzzy.distance + ')');
                    return {
                        ...effectiveBet,
                        suggestedMatch: {
                            homeTeam: fuzzy.match.homeTeam,
                            awayTeam: fuzzy.match.awayTeam,
                            homeScore: fuzzy.match.homeScore,
                            awayScore: fuzzy.match.awayScore,
                            date: fuzzy.match.date,
                            distance: fuzzy.distance
                        }
                    };
                }
                return { ...effectiveBet, suggestedMatch: null };
            });

            console.log('Updated bets:', updatedBets.length);
            appState.bets = updatedBets;
            localStorage.setItem('polla_bets', JSON.stringify(updatedBets));

            const winners = calculateWinners();
            analysisSummary = {
                summary: { total: appState.bets.length, updated: updatedCount, errors: errors.length },
                errors,
                winners
            };
            showAnalysisModal = true;
        } catch (err) {
            console.error('Error analyzing bets:', err);
            analysisSummary = {
                summary: { total: appState.bets.length, updated: updatedCount, errors: errors.length + 1 },
                errors: [...errors, err instanceof Error ? err.message : 'Error desconocido'],
                winners: []
            };
            showAnalysisModal = true;
        } finally {
            appState.isLoading = false;
        }
    }

    onMount(() => {
        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
        if (!window.location.hash) {
            showRankingModal = true;
        }

        (async () => {
            const isGitHubPages = window.location.hostname === 'ceslep.github.io';
            const saved = localStorage.getItem('polla_bets');

            if (saved && !isGitHubPages) {
                try {
                    appState.bets = JSON.parse(saved);
                    await analyzeBets(true);
                } catch (e) { console.error(e); }
            } else {
                isLoadingFromSheets = true;
                loadFromSheetsFailed = false;
                try {
                    console.log(isGitHubPages ? 'Forced GitHub Pages load from Sheets...' : 'No localStorage, loading from Sheets...');
                    const sheetsBets = await loadBetsFromSheets();
                    if (sheetsBets.length > 0) {
                        const betsToAnalyze = sheetsBets.map((bet) => ({
                            ...bet,
                            verified: false,
                            status: 'pending',
                            points: Number(bet.points) || 0
                        }));
                        appState.bets = betsToAnalyze;
                        localStorage.setItem('polla_bets', JSON.stringify(betsToAnalyze));
                        await analyzeBets(true);
                    }
                } catch (e) {
                    console.error('Failed to load from Sheets:', e);
                    loadFromSheetsFailed = true;
                } finally {
                    isLoadingFromSheets = false;
                }
            }
        })();

        return () => {
            window.removeEventListener('hashchange', handleHashChange);
        };
    });
</script>

<main class="min-h-screen bg-[#111] text-white selection:bg-cyan-500/30">
    <header class="bg-black/40 border-b border-white/5 backdrop-blur-md sticky top-0 z-40">
        <div class="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
            <h1 class="text-xl md:text-2xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent italic tracking-tighter">
                POLLA 2026
            </h1>

            <div class="flex items-center gap-2 md:gap-4">
                <button
                    class="px-3 md:px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-bold transition-all shadow-lg shadow-green-500/20 min-h-11"
                    onclick={() => showResultsModal = true}
                >
                    <span class="hidden sm:inline">🌐</span> <span class="sm:hidden">📊</span><span class="ml-1 hidden sm:inline">Resultados</span>
                </button>

                <button
                    class="hidden md:flex px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-bold transition-all shadow-lg shadow-purple-500/20 min-h-11"
                    onclick={() => showStatsModal = true}
                >
                    📊 Estadísticas
                </button>

                <button
                    class="hidden md:flex px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-semibold transition-all border border-white/10 min-h-11"
                    onclick={() => {
                        if (confirm('¿Estás seguro de querer borrar todos los datos?')) {
                            appState.bets = [];
                            localStorage.removeItem('polla_bets');
                        }
                    }}
                >
                    Resetear
                </button>

                <button
                    class="hidden md:flex px-4 py-2 bg-red-600/20 hover:bg-red-600/30 rounded-xl text-sm font-semibold transition-all border border-red-500/30 text-red-400 min-h-11"
                    onclick={() => {
                        adminAction = () => { showResetAllModal = true; };
                        adminTitle = "Reset Total";
                        adminMessage = "Se requiere clave de administrador para borrar todos los datos de Google Sheets y localStorage.";
                        showAdminModal = true;
                    }}
                >
                    ⚠️ Reset Total
                </button>

                <button
                    class="hidden md:flex px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-sm font-bold transition-all shadow-lg shadow-orange-500/20 min-h-11 disabled:opacity-50"
                    onclick={() => {
                        if (isDev) {
                            analyzeBets(true);
                        } else {
                            adminAction = () => analyzeBets(true);
                            adminTitle = "Análisis con GitHub";
                            adminMessage = "Se requiere acceso administrativo para realizar el análisis utilizando los datos de GitHub.";
                            showAdminModal = true;
                        }
                    }}
                    disabled={appState.isLoading}
                >
                    {appState.isLoading ? 'Analizando...' : '🔗 Analizar'}
                </button>

                <button
                    class="hidden md:flex px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 min-h-11 disabled:opacity-50"
                    onclick={() => {
                        if (isDev) {
                            isSavingToSheets = true;
                            saveBetsToSheets(appState.bets).then(result => {
                                messageModalContent = `¡Éxito!\nSe han guardado ${result.saved} apuestas correctamente en Google Sheets.`;
                                messageModalType = 'success';
                                showMessageModal = true;
                                isSavingToSheets = false;
                            }).catch(err => {
                                messageModalContent = 'Error al guardar:\n' + (err.message || err);
                                messageModalType = 'error';
                                showMessageModal = true;
                                isSavingToSheets = false;
                            });
                        } else {
                            adminAction = async () => {
                                isSavingToSheets = true;
                                try {
                                    const result = await saveBetsToSheets(appState.bets);
                                    messageModalContent = `¡Éxito!\nSe han guardado ${result.saved} apuestas correctamente en Google Sheets.`;
                                    messageModalType = 'success';
                                    showMessageModal = true;
                                } catch (/** @type {any} */ err) {
                                    messageModalContent = 'Error al guardar:\n' + (err.message || err);
                                    messageModalType = 'error';
                                    showMessageModal = true;
                                } finally {
                                    isSavingToSheets = false;
                                }
                            };
                            adminTitle = "Guardar en Sheets";
                            adminMessage = "Se requiere acceso administrativo para guardar los datos en Google Sheets.";
                            showAdminModal = true;
                        }
                    }}
                    disabled={appState.isLoading || appState.bets.length === 0 || isSavingToSheets}
                >
                    {#if isSavingToSheets}
                        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    {:else}
                        💾
                    {/if}
                </button>

                <button
                    class="hidden md:flex px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-bold transition-all shadow-lg shadow-green-500/20 min-h-11 disabled:opacity-50"
                    onclick={() => {
                        if (isDev) {
                            showAdminUploadModal = true;
                        } else {
                            adminAction = () => {
                                showAdminUploadModal = true;
                            };
                            adminTitle = "Cargar JSON";
                            adminMessage = "Se requiere acceso administrativo para cargar un archivo JSON.";
                            showAdminModal = true;
                        }
                    }}
                    disabled={appState.isLoading}
                >
                    📁
                </button>

                <button
                    class="md:hidden w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-xl transition-all border border-white/10"
                    onclick={() => mobileMenuOpen = true}
                >
                    ☰
                </button>
            </div>
        </div>
    </header>

    <div class="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {#if isLoadingFromSheets}
            <div class="flex flex-col items-center justify-center py-20">
                <div class="text-6xl mb-6 animate-spin">⚙️</div>
                <h2 class="text-2xl font-bold text-cyan-400 mb-2">Cargando desde Google Sheets...</h2>
                <p class="text-gray-400">Obteniendo tus apuestas guardadas</p>
            </div>
        {:else if appState.bets.length === 0}
            {#if loadFromSheetsFailed}
                <div class="text-center mb-8">
                    <div class="bg-red-500/20 border border-red-500/30 rounded-xl px-6 py-4 mb-6 inline-block">
                        <p class="text-red-400">⚠️ No se pudo cargar desde Sheets</p>
                        <p class="text-gray-400 text-sm">Carga el archivo JSON de WhatsApp para comenzar</p>
                    </div>
                </div>
            {/if}
            <div class="max-w-2xl mx-auto mt-20 text-center">
                <h2 class="text-4xl font-bold mb-4">🏆 ¡Bienvenido a la Polla!</h2>
                <p class="text-gray-400 mb-12">Carga tu exportación de WhatsApp para empezar a calcular puntos.</p>
                <DropZone />
            </div>
        {:else}
            <StatsGrid onPendingClick={() => showPendingModal = true} onRankingClick={() => showRankingModal = true} />
            <BetTable
                onSelectBet={handleSelectBet}
                onApplySuggestion={handleApplySuggestion}
                onDismissSuggestion={handleDismissSuggestion}
            />
        {/if}
    </div>

    {#if selectedBet}
        <BetModal bet={selectedBet} onClose={() => selectedBet = null} onUpdate={handleBetUpdate} />
    {/if}

    {#if showAnalysisModal}
        <ResultsModal
            summary={analysisSummary.summary}
            errors={analysisSummary.errors}
            winners={analysisSummary.winners}
            bets={appState.bets}
            matches={appState.matches}
            onClose={() => showAnalysisModal = false}
        />
    {/if}

    {#if showResultsModal}
        <WorldCupResultsModal onClose={() => showResultsModal = false} />
    {/if}

    {#if showPendingModal}
        <PendingBetsModal onClose={() => showPendingModal = false} />
    {/if}

    {#if showRankingModal}
        <RankingModal
            onClose={() => showRankingModal = false}
        />
    {/if}

    {#if selectedParticipantName}
        <ParticipantDetailModal
            name={selectedParticipantName}
            onClose={() => selectedParticipantName = null}
        />
    {/if}

    {#if showAdminModal}
        <AdminModal
            title={adminTitle}
            message={adminMessage}
            onConfirm={() => {
                showAdminModal = false;
                if (adminAction) adminAction();
                adminAction = null;
            }}
            onClose={() => {
                showAdminModal = false;
                adminAction = null;
            }}
        />
    {/if}

    {#if showAdminUploadModal}
        <AdminUploadModal
            onConfirm={async (file) => {
                showAdminUploadModal = false;
                isSavingToSheets = true;
                try {
                    const text = await file.text();
                    const rawMessages = JSON.parse(text);
                    if (!Array.isArray(rawMessages)) throw new Error('El JSON debe ser un arreglo de mensajes');

                    const parsedBets = parseWhatsAppExport(rawMessages);

                    // Sin filtro de fecha por ahora - cargar todos
                    const betMap = new Map();
                    for (const bet of appState.bets) {
                        const key = bet.id || '';
                        betMap.set(key, bet);
                    }
                    for (const newBet of parsedBets) {
                        const key = newBet.id || '';
                        const existing = betMap.get(key);
                        if (existing) {
                            const merged = { ...existing };
                            for (const [k, v] of Object.entries(newBet)) {
                                if (v !== undefined && v !== null && v !== '') {
                                    if (['status', 'points', 'real_result', 'realResult'].includes(k)) {
                                        if (v !== undefined && v !== null && v !== '') {
                                            merged[k] = v;
                                        }
                                    } else {
                                        merged[k] = v;
                                    }
                                }
                            }
                            betMap.set(key, merged);
                        } else {
                            betMap.set(key, newBet);
                        }
                    }
                    appState.bets = Array.from(betMap.values());
                    localStorage.setItem('polla_bets', JSON.stringify(appState.bets));

                    // Subir JSON original al servidor
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('token', 'polla2026');
                    let uploadResult = null;
                    try {
                        const uploadRes = await fetch('https://app.iedeoccidente.com/polla/upload_json.php', {
                            method: 'POST',
                            body: formData
                        });
                        uploadResult = await uploadRes.json();
                    } catch (/** @type {any} */ uploadErr) {
                        console.warn('Upload JSON failed:', uploadErr.message);
                    }

                    await analyzeBets(true);
                    const result = await saveBetsToSheets(appState.bets);

                    // Recargar desde Sheets y reprocesar para mostrar resultados actualizados
                    isLoadingFromSheets = true;
                    const sheetsBets = await loadBetsFromSheets();
                    appState.bets = sheetsBets;
                    localStorage.setItem('polla_bets', JSON.stringify(appState.bets));
                    await analyzeBets(true);
                    isLoadingFromSheets = false;

                    messageModalContent = `¡Éxito!\nJSON fusionado (${parsedBets.length} apuestas) y guardado en Google Sheets.\nActualizadas: ${result.updated}, insertadas: ${result.inserted}${uploadResult?.success ? '\nJSON subido: ' + uploadResult.filename : ''}`;
                    messageModalType = 'success';
                    showMessageModal = true;
                } catch (/** @type {any} */ err) {
                    messageModalContent = 'Error al procesar:\n' + (err.message || err);
                    messageModalType = 'error';
                    showMessageModal = true;
                } finally {
                    isSavingToSheets = false;
                }
            }}
            onClose={() => {
                showAdminUploadModal = false;
            }}
        />
    {/if}

    {#if showMessageModal}
        <MessageModal
            message={messageModalContent}
            type={messageModalType}
            onClose={() => showMessageModal = false}
        />
    {/if}

    {#if showStatsModal}
        <StatsModal onClose={() => showStatsModal = false} />
    {/if}

    {#if showResetAllModal}
        <ResetAllModal
            onConfirm={async () => {
                showResetAllModal = false;
                isSavingToSheets = true;
                try {
                    // 1. Borrar todos los datos de Google Sheets
                    await clearBetsFromSheets();

                    // 2. Borrar localStorage
                    localStorage.removeItem('polla_bets');

                    // 3. Limpiar estado
                    appState.bets = [];

                    // 4. Pedir archivo JSON
                    showAdminUploadModal = true;

                    messageModalContent = 'Datos borrados. Ahora carga el archivo JSON completo.';
                    messageModalType = 'success';
                    showMessageModal = true;
                } catch (/** @type {any} */ err) {
                    messageModalContent = 'Error al hacer reset:\n' + (err.message || err);
                    messageModalType = 'error';
                    showMessageModal = true;
                } finally {
                    isSavingToSheets = false;
                }
            }}
            onClose={() => showResetAllModal = false}
        />
    {/if}

    <MobileMenu
        bind:isOpen={mobileMenuOpen}
        hasBets={appState.bets.length > 0}
        isLoading={appState.isLoading}
        isSavingToSheets={isSavingToSheets}
        onStats={() => showStatsModal = true}
        onReset={() => {
            if (confirm('¿Estás seguro de querer borrar todos los datos?')) {
                appState.bets = [];
                localStorage.removeItem('polla_bets');
            }
        }}
        onAnalyze={() => {
            adminAction = () => analyzeBets(true);
            adminTitle = "Análisis con GitHub";
            adminMessage = "Se requiere acceso administrativo para realizar el análisis utilizando los datos de GitHub.";
            showAdminModal = true;
        }}
        onSaveSheets={() => {
            adminAction = async () => {
                isSavingToSheets = true;
                try {
                    const result = await saveBetsToSheets(appState.bets);
                    messageModalContent = `¡Éxito!\nSe han guardado ${result.saved} apuestas correctamente en Google Sheets.`;
                    messageModalType = 'success';
                    showMessageModal = true;
                } catch (/** @type {any} */ err) {
                    messageModalContent = 'Error al guardar:\n' + (err.message || err);
                    messageModalType = 'error';
                    showMessageModal = true;
                } finally {
                    isSavingToSheets = false;
                }
            };
            adminTitle = "Guardar en Sheets";
            adminMessage = "Se requiere acceso administrativo para guardar los datos en Google Sheets.";
            showAdminModal = true;
        }}
        onResetAll={() => {
            adminAction = () => { showResetAllModal = true; };
            adminTitle = "Reset Total";
            adminMessage = "Se requiere clave de administrador para borrar todos los datos de Google Sheets y localStorage.";
            showAdminModal = true;
        }}
    />
</main>

<style>
    :global(body) {
        background-color: #111;
    }
</style>
