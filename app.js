(() => {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const TZ = 'Europe/Amsterdam';
    const comps = [
        { id: 'ned.1', leagueId: '725', name: 'Eredivisie', aliases: ['eredivisie', 'dutch eredivisie'] },
        { id: 'eng.1', leagueId: '700', name: 'Premier League', aliases: ['premier league', 'english premier league'] },
        { id: 'esp.1', leagueId: '740', name: 'La Liga', aliases: ['la liga', 'primera division', 'laliga'] },
        { id: 'ger.1', leagueId: '720', name: 'Bundesliga', aliases: ['bundesliga', 'german bundesliga'] },
        { id: 'ita.1', leagueId: '730', name: 'Serie A', aliases: ['serie a', 'italian serie a'] },
        { id: 'fra.1', leagueId: '710', name: 'Ligue 1', aliases: ['ligue 1', 'french ligue 1'] },
        { id: 'uefa.champions', leagueId: '775', name: 'Champions League', aliases: ['uefa champions league', 'champions league'] },
        { id: 'uefa.europa', leagueId: '776', name: 'Europa League', aliases: ['uefa europa league', 'europa league'] },
        { id: 'uefa.europa.conf', leagueId: '20296', name: 'Conference League', aliases: ['uefa conference league', 'conference league'] },
        { id: 'ned.cup', leagueId: '3957', name: 'KNVB-beker', aliases: ['knvb beker', 'knvb-beker', 'dutch cup'] },
        { id: 'eng.fa', leagueId: '3918', name: 'FA Cup', aliases: ['fa cup', 'english fa cup'] },
        { id: 'eng.league_cup', leagueId: '3920', name: 'EFL Cup', aliases: ['efl cup', 'league cup', 'carabao cup'] },
        { id: 'esp.copa_del_rey', leagueId: '3951', name: 'Copa del Rey', aliases: ['copa del rey'] },
        { id: 'ger.dfb_pokal', leagueId: '3954', name: 'DFB-Pokal', aliases: ['dfb pokal', 'dfb-pokal'] },
        { id: 'ita.coppa_italia', leagueId: '3956', name: 'Coppa Italia', aliases: ['coppa italia'] },
        { id: 'fra.coupe_de_france', leagueId: '3952', name: 'Coupe de France', aliases: ['coupe de france'] }
    ];
    const cupIds = new Set(comps.slice(9).map(c => c.id));
    const scoreboardUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard';
    const scoreboardDays = 7;
    let scoreboardData = null, matches = [], selected = 'all', loading = false;
    const footballStatus = $('#football-status'), footballList = $('#football-list');
    const fmtDay = d => new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(d));
    const fmtTime = d => new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(d));
    const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const localDateKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    async function fetchJSON(url, timeout = 9000) {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
        try { const r = await fetch(url, { signal: controller.signal, cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
        finally { clearTimeout(timer); }
    }
    function competitionForEvent(e) {
        const eventUid = e.uid || e.competitions?.[0]?.uid || '';
        const leagueId = String(eventUid).match(/~l:(\d+)~/)?.[1];
        const note = e.competitions?.[0]?.altGameNote || '';
        const known = comps.find(comp => comp.leagueId === leagueId);
        if (known) return known;
        const normalizedNote = note.toLowerCase();
        return comps.find(comp => comp.aliases.some(alias => normalizedNote.includes(alias))) || {
            id: leagueId || 'unknown',
            name: note || 'Onbekende competitie',
            aliases: []
        };
    }
    function parseESPN(e) {
        const comp = competitionForEvent(e);
        const teams = e.competitions?.[0]?.competitors || [];
        const h = teams.find(x => x.homeAway === 'home') || teams[0], a = teams.find(x => x.homeAway === 'away') || teams[1];
        if (!h || !a || !e.date) return null;
        const state = e.status?.type || {}; const hs = h.score, as = a.score;
        const scored = hs !== undefined && as !== undefined && hs !== null && as !== null && hs !== '' && as !== '';
        return { id: String(e.id || `${e.date}-${h.team?.id}-${a.team?.id}`), date: e.date, home: h.team?.displayName || h.team?.name || 'Thuis', away: a.team?.displayName || a.team?.name || 'Uit', homeScore: scored ? hs : null, awayScore: scored ? as : null, comp: comp.name, compId: comp.id, source: 'ESPN', state: state.shortDetail || state.detail || state.description || '', stateCode: state.state || '' };
    }
    async function loadScoreboard() {
        const start = localDateKey(new Date()).replace(/-/g, '');
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + scoreboardDays - 1);
        const end = localDateKey(endDate).replace(/-/g, '');
        const data = await fetchJSON(`${scoreboardUrl}?dates=${start}-${end}&limit=1000`);
        scoreboardData = data;
        const events = Array.isArray(data.events) ? data.events : [];
        const seen = new Set();
        matches = events.map(parseESPN).filter(Boolean).filter(match => {
            if (seen.has(match.id)) return false;
            seen.add(match.id);
            return true;
        });
        return matches;
    }
    function isOngoing(m) { const s = String(m.stateCode || m.state || '').toLowerCase(); return s === 'in' || /live|in progress|halftime|half time|1st half|2nd half|1st period|2nd period|3rd period|extra time|overtime|being played|playing/.test(s); }
    function setStatus(text, warn = false) { footballStatus.textContent = text; footballStatus.classList.toggle('warn', warn); }
    function renderMatches() {
        footballList.replaceChildren();
        const days = $('#period').value === 'today' ? 1 : Number($('#period').value);
        const currentTime = Date.now(), cutoff = currentTime + days * 86400000;
        let arr = matches.filter(m => {
            const time = Date.parse(m.date);
            const inPeriod = (time >= currentTime || isOngoing(m)) && time <= cutoff;
            const inCompetition = selected === 'all' || (selected === 'cups' ? cupIds.has(m.compId) : m.compId === selected);
            return inPeriod && inCompetition;
        });
        arr.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        if (!arr.length) { const box = document.createElement('div'); box.className = 'empty'; box.innerHTML = '<div class="emoji">⚽</div><h3>Geen wedstrijden gevonden</h3><p>De bronnen hebben voor deze selectie geen wedstrijden teruggegeven. Probeer een andere periode of ververs later.</p>'; footballList.append(box); return; }
        const now = Date.now(); arr.forEach(m => { const row = document.createElement('article'); row.className = 'match'; const top = document.createElement('div'); top.className = 'match-top'; const names = document.createElement('div'); names.className = 'teams'; names.textContent = `${m.home}  –  ${m.away}`; const when = document.createElement('div'); when.className = 'when'; const dt = Date.parse(m.date); when.innerHTML = `<strong>${fmtTime(m.date)}</strong>${fmtDay(m.date)}`; top.append(names, when); const meta = document.createElement('div'); meta.className = 'meta'; const comp = document.createElement('span'); comp.className = 'tag'; comp.textContent = m.comp; meta.append(comp); const state = document.createElement('span'); state.className = 'tag'; state.textContent = isOngoing(m) ? '🔴 Bezig' : 'Binnenkort'; meta.append(state); const source = document.createElement('span'); source.className = 'tag'; source.textContent = m.source; meta.append(source); const tv = document.createElement('span'); tv.className = 'tag'; tv.textContent = 'Tv-zender niet bevestigd'; meta.append(tv); row.append(top, meta); footballList.append(row); });
    }
    function getCache() { try { const x = JSON.parse(localStorage.getItem('mollyFootballCacheV10') || 'null'); return x && Array.isArray(x.matches) ? x : null; } catch { return null; } }
    function applyCache() { const c = getCache(); if (!c) return false; matches = c.matches; $('#last-updated').textContent = `Laatste voetbaldata: ${new Date(c.savedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} (opgeslagen` + `)`; renderMatches(); return true; }
    async function loadFootball() {
        if (loading) return; loading = true; const btn = $('#refresh-football'); btn.disabled = true; btn.textContent = 'Laden…'; setStatus('ESPN-scoreboard laden…'); footballList.replaceChildren();
        try {
            await loadScoreboard();
            try { localStorage.setItem('mollyFootballCacheV10', JSON.stringify({ savedAt: new Date().toISOString(), matches })); } catch { }
            $('#last-updated').textContent = 'Bijgewerkt ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
            setStatus(`${matches.length} wedstrijden gevonden in de ESPN-scoreboarddata.`, false);
            $('#source-details').textContent = 'Data ontvangen van ESPN. De competitieknoppen filteren de opgeslagen scoreboarddata lokaal.';
            renderMatches();
        } catch (e) {
            const hadCache = applyCache();
            setStatus(hadCache ? 'De live feed reageert niet. Eerder opgehaalde data wordt getoond.' : 'De ESPN-feed kon niet worden bereikt. Controleer je internetverbinding en probeer opnieuw.', true);
            if (!hadCache) renderMatches();
        } finally { loading = false; btn.disabled = false; btn.textContent = '↻ Ververs'; }
    }
    $('#competition-buttons').addEventListener('click', e => { const b = e.target.closest('button[data-comp]'); if (!b) return; selected = b.dataset.comp; $('#competition-buttons').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); renderMatches(); }); $('#refresh-football').addEventListener('click', loadFootball); $('#period').addEventListener('change', renderMatches);
    // Tabs
    const tabs = [...document.querySelectorAll('[role="tab"]')]; tabs.forEach(t => t.addEventListener('click', () => { tabs.forEach(x => { const active = x === t; x.setAttribute('aria-selected', String(active)); const p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !active; }); }));
    // Formula 1 calendar retained
    const f1Status = $('#f1-status'), f1List = $('#f1-list'); function f1date(date, time) { const d = new Date(`${date}T${time || '12:00:00Z'}`); return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d); }
    async function loadF1() { f1Status.textContent = 'Formule 1-kalender laden…'; f1List.replaceChildren(); try { let data; try { data = await fetchJSON('https://f1api.dev/api/current'); } catch { data = await fetchJSON('https://f1api.dev/api/2026'); } const races = data.races || data.race || data.season?.races || data.data?.races || []; const now = Date.now(), sessions = []; races.forEach(r => { const s = r.schedule || {};[['Vrije training 1', s.fp1], ['Vrije training 2', s.fp2], ['Vrije training 3', s.fp3], ['Sprint', s.sprintRace], ['Kwalificatie', s.qualy || s.qualifying], ['Race', s.race || { date: r.date, time: r.time }]].forEach(([label, v]) => { if (v?.date) { const dt = Date.parse(`${v.date}T${v.time || '12:00:00Z'}`); if (dt > now - 3600000) sessions.push({ name: r.raceName || r.name || r.gp || 'Grand Prix', label, date: v.date, time: v.time || '', dt }); } }) }); sessions.sort((a, b) => a.dt - b.dt); if (!sessions.length) throw Error('Geen sessies'); sessions.slice(0, 18).forEach(s => { const row = document.createElement('div'); row.className = 'f1row'; const title = document.createElement('strong'); title.textContent = `${s.name} · ${s.label}`; const small = document.createElement('div'); small.className = 'small'; small.textContent = f1date(s.date, s.time); row.append(title, small); f1List.append(row); }); f1Status.textContent = 'Kalender geladen · tijden weergegeven in Nederlandse tijd.'; } catch (e) { f1Status.textContent = 'De automatische kalender is tijdelijk niet beschikbaar.'; const a = document.createElement('a'); a.href = 'https://www.formula1.com/en/racing/2026'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Bekijk de officiële Formule 1-kalender'; f1List.append(a); } }
    $('#refresh-f1').addEventListener('click', loadF1);
    // User events, safely rendered as text
    const form = $('#event-form'), eventsEl = $('#custom-events'); function getEvents() { try { return JSON.parse(localStorage.getItem('mollySportsEvents') || '[]'); } catch { return []; } } function drawEvents() { eventsEl.replaceChildren(); getEvents().forEach((ev, index) => { const row = document.createElement('div'); row.className = 'eventrow'; const title = document.createElement('strong'); title.textContent = ev.title; const date = document.createElement('div'); date.className = 'small'; date.textContent = new Date(ev.date).toLocaleString('nl-NL'); row.append(title, date); if (ev.note) { const note = document.createElement('div'); note.className = 'small'; note.textContent = ev.note; row.append(note); } const del = document.createElement('button'); del.className = 'btn'; del.style.marginTop = '8px'; del.textContent = 'Verwijderen'; del.addEventListener('click', () => { const list = getEvents(); list.splice(index, 1); localStorage.setItem('mollySportsEvents', JSON.stringify(list)); drawEvents(); }); row.append(del); eventsEl.append(row); }); }
    form.addEventListener('submit', e => { e.preventDefault(); const list = getEvents(); list.push({ title: $('#event-title').value.trim(), date: $('#event-date').value, note: $('#event-note').value.trim() }); localStorage.setItem('mollySportsEvents', JSON.stringify(list)); form.reset(); drawEvents(); });
    // Register a versioned worker; do not cache live API responses.
    if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=9').catch(() => { }));
    loadFootball(); loadF1(); drawEvents();
})();
