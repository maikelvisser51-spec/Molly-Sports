/* Molly Sports app logic - v3
   No made-up fixtures or TV-channel guesses. F1 data is best-effort and falls back to official calendar. */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

  function activateTab(tab, moveFocus = false) {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(item.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
    if (moveFocus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      activateTab(tabs[next], true);
    });
  });
  if (tabs.length) activateTab(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]);

  const f1Status = $('#f1-status');
  const f1List = $('#f1-list');
  const officialF1Url = 'https://www.formula1.com/en/racing/2026';
  const nlDateTime = (date, time) => {
    if (!date) return 'Datum nog niet bekend';
    // The API returns UTC session times. Convert to the Netherlands' local time.
    const iso = time ? `${date}T${time.replace(/Z$/, '')}${time.endsWith('Z') ? 'Z' : 'Z'}` : `${date}T12:00:00Z`;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return date + (time ? ` · ${time}` : '');
    const dateText = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'short', day: 'numeric', month: 'short' }).format(parsed);
    const timeText = time ? new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(parsed) : '';
    return dateText + (timeText ? ` · ${timeText} Nederlandse tijd` : ' · tijd nog niet bekend');
  };

  function makeLink(label, href, className = 'link') {
    const a = document.createElement('a');
    a.className = className;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    return a;
  }

  function addSession(container, label, session) {
    if (!session || !session.date) return;
    const row = document.createElement('div');
    row.className = 'event';
    const title = document.createElement('strong');
    title.textContent = label;
    const when = document.createElement('div');
    when.className = 'small';
    when.textContent = nlDateTime(session.date, session.time || '');
    row.append(title, when);
    container.appendChild(row);
  }

  function getRaces(data) {
    // Current F1API.dev schema uses `races`; older API-compatible schemas differ.
    if (Array.isArray(data?.races)) return data.races;
    if (Array.isArray(data?.race)) return data.race;
    if (Array.isArray(data?.season?.races)) return data.season.races;
    if (Array.isArray(data?.MRData?.RaceTable?.Races)) return data.MRData.RaceTable.Races;
    return [];
  }

  async function loadF1() {
    if (!f1Status || !f1List) return;
    f1Status.textContent = 'Formule 1-kalender laden…';
    f1List.replaceChildren();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('https://f1api.dev/api/current', {
        headers: { Accept: 'application/json' },
        cache: 'no-cache',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const races = getRaces(data);
      if (!races.length) throw new Error('Geen races in de API-reactie');
      const now = Date.now();
      const sessions = [];
      races.forEach((race) => {
        const schedule = race.schedule || {};
        const circuit = race.circuit || {};
        const raceName = race.raceName || race.name || race.gpName || 'Grand Prix';
        const venue = circuit.circuitName || circuit.name || circuit.country || '';
        const candidates = [
          ['Vrije training 1', schedule.fp1],
          ['Vrije training 2', schedule.fp2],
          ['Vrije training 3', schedule.fp3],
          ['Sprintkwalificatie', schedule.sprintQualy || schedule.sprintQualifying],
          ['Sprint', schedule.sprintRace],
          ['Kwalificatie', schedule.qualy || schedule.qualifying],
          ['Race', schedule.race || { date: race.date || race.raceDate, time: race.time || race.raceTime }]
        ];
        candidates.forEach(([label, session]) => {
          if (!session?.date) return;
          const stamp = new Date(`${session.date}T${session.time || '12:00:00'}`).getTime();
          // Don't show sessions that are clearly in the past; retain upcoming sessions only.
          if (Number.isFinite(stamp) && stamp < now - 2 * 60 * 60 * 1000) return;
          sessions.push({ raceName, venue, label, date: session.date, time: session.time || '', stamp: Number.isFinite(stamp) ? stamp : 0 });
        });
      });
      sessions.sort((a, b) => a.stamp - b.stamp);
      if (!sessions.length) throw new Error('Geen komende sessies gevonden');
      const fragment = document.createDocumentFragment();
      sessions.forEach((session) => {
        const row = document.createElement('div');
        row.className = 'event';
        const top = document.createElement('div');
        top.className = 'f1row';
        const name = document.createElement('strong');
        name.textContent = session.raceName;
        const date = document.createElement('span');
        date.className = 'date';
        date.textContent = session.label;
        top.append(name, date);
        const details = document.createElement('div');
        details.className = 'small';
        details.textContent = nlDateTime(session.date, session.time) + (session.venue ? ` · ${session.venue}` : '');
        row.append(top, details);
        fragment.appendChild(row);
      });
      f1List.appendChild(fragment);
      f1Status.textContent = `Kalender geladen (${sessions.length} komende sessies). Controleer altijd de Nederlandse uitzending.`;
      const note = document.createElement('p');
      note.className = 'small';
      note.textContent = 'Tijden zijn omgerekend naar Nederlandse tijd wanneer de bron een tijd opgeeft. De API kan schemawijzigingen missen.';
      f1List.appendChild(note);
    } catch (error) {
      f1Status.textContent = 'De automatische kalender is nu niet beschikbaar. Gebruik de officiële kalender hieronder.';
      const explanation = document.createElement('p');
      explanation.className = 'small';
      explanation.textContent = 'Dit kan komen door een tijdelijke storing of een verbinding die de gegevensbron blokkeert.';
      f1List.append(explanation, makeLink('Officiële Formule 1-kalender openen ↗', officialF1Url));
    } finally {
      clearTimeout(timeout);
    }
  }
  const retry = $('#f1-retry');
  if (retry) retry.addEventListener('click', loadF1);
  loadF1();

  const STORAGE_KEY = 'mollySportsEventsV3';
  const form = $('#event-form');
  const list = $('#event-list');
  const clearButton = $('#clear-events');

  function readEvents() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.date === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  function saveEvents(events) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
      return true;
    } catch (_) {
      if (list) list.textContent = 'Opslaan lukt niet. Mogelijk is lokale opslag uitgeschakeld op dit apparaat.';
      return false;
    }
  }

  function renderEvents() {
    if (!list) return;
    const events = readEvents().sort((a, b) => a.date.localeCompare(b.date));
    list.replaceChildren();
    if (!events.length) {
      list.textContent = 'Nog geen eigen evenementen toegevoegd.';
      return;
    }
    events.forEach((event) => {
      const item = document.createElement('div');
      item.className = 'event';
      const title = document.createElement('strong');
      title.textContent = event.title;
      const details = document.createElement('div');
      details.className = 'small';
      const parsed = new Date(event.date);
      details.textContent = (Number.isNaN(parsed.getTime()) ? event.date : parsed.toLocaleString('nl-NL')) + ` · ${event.sport || 'Overig'}` + (event.channel ? ` · ${event.channel}` : '');
      item.append(title, details);
      if (event.notes) {
        const notes = document.createElement('p');
        notes.className = 'small';
        notes.textContent = event.notes;
        item.appendChild(notes);
      }
      const remove = document.createElement('button');
      remove.className = 'secondary';
      remove.type = 'button';
      remove.textContent = 'Verwijderen';
      remove.addEventListener('click', () => {
        const remaining = readEvents().filter((saved) => saved.id !== event.id);
        if (saveEvents(remaining)) renderEvents();
      });
      item.appendChild(remove);
      list.appendChild(item);
    });
  }

  if (form) form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = $('#event-title')?.value.trim() || '';
    const date = $('#event-date')?.value || '';
    if (!title || !date || Number.isNaN(new Date(date).getTime())) return;
    const events = readEvents();
    events.push({
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      date,
      sport: $('#event-sport')?.value || 'Overig',
      channel: $('#event-channel')?.value.trim() || '',
      notes: $('#event-notes')?.value.trim() || ''
    });
    if (saveEvents(events)) {
      form.reset();
      renderEvents();
    }
  });

  if (clearButton) clearButton.addEventListener('click', () => {
    if (window.confirm('Alle eigen evenementen uit deze browser verwijderen?')) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* show current view */ }
      renderEvents();
    }
  });
  renderEvents();
})();
