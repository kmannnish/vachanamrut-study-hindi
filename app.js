// Vachanamrut Study Web App (Zero-Budget PWA)
const HINDI_AUDIO_BASE = 'https://github.com/kmannnish/vachanamrut-study-hindi/releases/download/v1.0/';
const GUJARATI_AUDIO_BASE = 'https://download.baps.org/apps/Vachanamrut/link.php?v=';

const state = {
  languages: [],
  sections: [],
  subjects: [],
  subjectVerses: {},
  versesCache: {},
  quizCache: {},
  infoCache: {},
  currentScreen: 'screen-home',
  prevScreen: 'screen-browse',
  browseTab: 'sections',
  expandedSection: null,
  expandedSubject: null,
  currentVerseSeq: 1,
  audioSpeed: 1,
  prefs: loadPrefs()
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem('vma_prefs');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    uiLangID: 5,       // Default Hindi UI
    contentLangID: 5,  // Default Hindi Text & Audio
    fontSize: 18,
    nightMode: false,
    favs: [],
    readingList: [],
    readVerses: [],
    history: [],
    notes: {},
    bookmark: 1,
    lastVisited: 1
  };
}

function savePrefs() {
  try {
    localStorage.setItem('vma_prefs', JSON.stringify(state.prefs));
  } catch (e) {}
}

function getUiText(key, fallback) {
  const lang = state.languages.find(l => l.langID === state.prefs.uiLangID);
  if (lang && lang.uiTexts && lang.uiTexts[key]) return lang.uiTexts[key];
  const en = state.languages.find(l => l.langID === 4);
  if (en && en.uiTexts && en.uiTexts[key]) return en.uiTexts[key];
  return fallback;
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('Failed to load ' + path);
  return res.json();
}

async function ensureVerses(langID) {
  if (!state.versesCache[langID]) {
    state.versesCache[langID] = await fetchJson(`./data/verses_${langID}.json`);
  }
  return state.versesCache[langID];
}

async function ensureQuiz(langID) {
  if (!state.quizCache[langID]) {
    state.quizCache[langID] = await fetchJson(`./data/quiz_${langID}.json`);
  }
  return state.quizCache[langID];
}

async function ensureInfo(langID) {
  if (!state.infoCache[langID]) {
    state.infoCache[langID] = await fetchJson(`./data/info_${langID}.json`);
  }
  return state.infoCache[langID];
}

let metadataPromise = null;
function ensureMetadata() {
  if (!metadataPromise) {
    metadataPromise = Promise.all([
      fetchJson('./data/languages.json'),
      fetchJson('./data/sections.json'),
      fetchJson('./data/subjects.json'),
      fetchJson('./data/subject_verses.json')
    ]).then(([langs, secs, subjs, sv]) => {
      state.languages = langs;
      state.sections = secs;
      state.subjects = subjs;
      state.subjectVerses = sv;
      applyUiStrings();
    });
  }
  return metadataPromise;
}

async function initApp() {
  applyTheme();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  await ensureMetadata();
  // Prefetch active reading language in background without blocking Home screen
  setTimeout(() => { ensureVerses(state.prefs.contentLangID).catch(() => {}); }, 200);
}

function applyTheme() {
  document.body.classList.toggle('night-mode', !!state.prefs.nightMode);
  const bodyEl = document.getElementById('reader-body');
  if (bodyEl) bodyEl.style.fontSize = state.prefs.fontSize + 'px';
}

function applyUiStrings() {
  const set = (id, key, fb) => {
    const el = document.getElementById(id);
    if (el) el.textContent = getUiText(key, fb);
  };
  set('btn-home-vach', 'vachanamrut', 'Vachanamrut');
  set('btn-home-last', 'last_visited', 'Last Visited');
  set('browse-title', 'vachanamrut', 'Vachanamrut');
  set('search-title', 'search', 'Search');
  set('lbl-fav', 'favourite', 'Favourite');
  set('lbl-reading-list', 'reading_list', 'Reading List');
  set('lbl-read', 'read', 'Read');
  set('lbl-tab-quiz', 'quiz', 'Quiz');
  set('lbl-tab-notes', 'notes', 'Notes');
  set('lbl-tab-audio', 'audio', 'Audio');
  set('lbl-tab-settings', 'settings', 'Settings');
  set('d-home', 'home', 'Home');
  set('d-vach', 'vachanamrut', 'Vachanamrut');
  set('d-search', 'search', 'Search');
  set('d-fav', 'favourites', 'Favourites');
  set('d-rlist', 'reading_list', 'Reading Lists');
  set('d-settings', 'settings', 'Settings');

  const tabMap = {
    sections: getUiText('sections', 'Sections'),
    reading: getUiText('reading_list', 'Reading Lists'),
    subjects: getUiText('subjects', 'Subjects'),
    favourites: getUiText('favourites', 'Favourites'),
    history: getUiText('history', 'History')
  };
  document.querySelectorAll('#browse-tabs .browse-tab').forEach(btn => {
    const k = btn.getAttribute('data-tab');
    if (tabMap[k]) btn.textContent = tabMap[k];
  });
}

function showScreen(id) {
  if (state.currentScreen !== id) {
    state.prevScreen = state.currentScreen;
  }
  state.currentScreen = id;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const shell = document.querySelector('.app-shell');
  if (shell) shell.classList.toggle('has-sidebar', id !== 'screen-home');
}

function openDrawer() {
  document.getElementById('drawer-backdrop').classList.add('open');
  document.getElementById('drawer-panel').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer-backdrop').classList.remove('open');
  document.getElementById('drawer-panel').classList.remove('open');
}

async function goBrowse(tab) {
  state.browseTab = tab || 'sections';
  showScreen('screen-browse');
  document.querySelectorAll('#browse-tabs .browse-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === state.browseTab);
  });
  await renderBrowseList();
}

function switchBrowseTab(tab) {
  goBrowse(tab);
}

async function renderBrowseList() {
  const container = document.getElementById('browse-list');
  container.innerHTML = '<div class="loading-banner">Loading...</div>';
  const verses = await ensureVerses(state.prefs.contentLangID);
  const lid = state.prefs.contentLangID;

  if (state.browseTab === 'sections') {
    const secs = state.sections.filter(s => s.langID === lid);
    let html = '';
    for (const s of secs) {
      const secVerses = verses.filter(v => v.sSeqNo === s.sSeqNo);
      const readCount = secVerses.filter(v => state.prefs.readVerses.includes(v.vSeqNo)).length;
      const total = secVerses.length || s.vCount || 0;
      const pct = total ? Math.round((readCount / total) * 100) : 0;
      const isOpen = state.expandedSection === s.sSeqNo;
      html += `
        <div class="section-header" onclick="toggleSection(${s.sSeqNo})">
          <div class="section-header-left">
            <div class="section-title">${esc(s.sName)}</div>
            ${s.sDescription ? `<div class="section-desc">${esc(s.sDescription)}</div>` : ''}
          </div>
          <div class="section-progress-wrap">
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="progress-count">${readCount}/${total}</div>
          </div>
          <div class="section-more vma-icon">${isOpen ? '▴' : 'i'}</div>
        </div>
      `;
      if (isOpen) {
        html += secVerses.map(v => renderVerseRow(v)).join('');
      }
    }
    container.innerHTML = html;
    return;
  }

  if (state.browseTab === 'subjects') {
    const subjs = state.subjects.filter(s => s.langID === lid);
    let html = '';
    for (const sub of subjs) {
      const ids = state.subjectVerses[String(sub.subjectID)] || [];
      const isOpen = state.expandedSubject === sub.subjectID;
      html += `
        <div class="section-header" onclick="toggleSubject(${sub.subjectID})">
          <div class="section-header-left">
            <div class="section-title">${esc(sub.subjectName)}</div>
          </div>
          <div class="progress-count">${ids.length}</div>
        </div>
      `;
      if (isOpen) {
        const matched = ids.map(id => verses.find(v => v.vSeqNo === id)).filter(Boolean);
        html += matched.map(v => renderVerseRow(v)).join('');
      }
    }
    container.innerHTML = html;
    return;
  }

  let listIds = [];
  if (state.browseTab === 'favourites') listIds = state.prefs.favs;
  else if (state.browseTab === 'reading') listIds = state.prefs.readingList;
  else if (state.browseTab === 'history') listIds = state.prefs.history;

  const matched = listIds.map(id => verses.find(v => v.vSeqNo === id)).filter(Boolean);
  if (!matched.length) {
    container.innerHTML = '<div class="empty-state">No discourses here yet.</div>';
  } else {
    container.innerHTML = matched.map(v => renderVerseRow(v)).join('');
  }
}

function renderVerseRow(v) {
  const isFav = state.prefs.favs.includes(v.vSeqNo);
  const isRead = state.prefs.readVerses.includes(v.vSeqNo);
  return `
    <div class="verse-row" onclick="openVerse(${v.vSeqNo})">
      ${isRead ? '<span class="verse-row-read-dot"></span>' : ''}
      <div class="verse-row-title">${esc(v.vsShortName)}: ${esc(v.vTitle)}</div>
      <button class="verse-row-fav vma-icon ${isFav ? 'is-fav' : ''}" onclick="event.stopPropagation(); toggleFav(${v.vSeqNo})">${isFav ? 'y' : 'p'}</button>
    </div>
  `;
}

function toggleSection(sSeqNo) {
  state.expandedSection = state.expandedSection === sSeqNo ? null : sSeqNo;
  renderBrowseList();
}

function toggleSubject(subId) {
  state.expandedSubject = state.expandedSubject === subId ? null : subId;
  renderBrowseList();
}

function toggleFav(vSeqNo) {
  const idx = state.prefs.favs.indexOf(vSeqNo);
  if (idx >= 0) state.prefs.favs.splice(idx, 1);
  else state.prefs.favs.unshift(vSeqNo);
  savePrefs();
  if (state.currentScreen === 'screen-browse') renderBrowseList();
  if (state.currentScreen === 'screen-reader') updateReaderActions();
}

async function openVerse(vSeqNo) {
  state.currentVerseSeq = vSeqNo;
  state.prefs.lastVisited = vSeqNo;
  state.prefs.history = [vSeqNo, ...state.prefs.history.filter(x => x !== vSeqNo)].slice(0, 50);
  savePrefs();

  showScreen('screen-reader');
  const verses = await ensureVerses(state.prefs.contentLangID);
  const v = verses.find(x => x.vSeqNo === vSeqNo) || verses[0];
  if (!v) return;

  document.getElementById('reader-toolbar-title').textContent = v.vsName || v.vsShortName;
  const sec = state.sections.find(s => s.sSeqNo === v.sSeqNo && s.langID === state.prefs.contentLangID);
  document.getElementById('reader-strip-section').textContent = sec ? sec.sName : 'Sections';
  document.getElementById('reader-vtitle').textContent = v.vTitle || '';

  const bodyEl = document.getElementById('reader-body');
  bodyEl.style.fontSize = state.prefs.fontSize + 'px';
  bodyEl.innerHTML = renderHighlightedParagraphs(v.vText || '', v.highlightJson);

  document.getElementById('reader-scroll').scrollTop = 0;
  document.getElementById('btn-prev-verse').disabled = v.vSeqNo <= 0;
  document.getElementById('btn-next-verse').disabled = v.vSeqNo >= 275;
  updateReaderActions();

  // If audio bar is currently visible, update track to match current discourse/language
  if (document.getElementById('audio-bar').classList.contains('visible')) {
    loadAudioForCurrentVerse(false);
  }
}

function updateReaderActions() {
  const id = state.currentVerseSeq;
  const isFav = state.prefs.favs.includes(id);
  const isRL = state.prefs.readingList.includes(id);
  const isRead = state.prefs.readVerses.includes(id);
  const isBm = state.prefs.bookmark === id;

  document.getElementById('btn-reader-fav').classList.toggle('active', isFav);
  document.getElementById('btn-reader-list').classList.toggle('active', isRL);
  document.getElementById('btn-reader-read').classList.toggle('active', isRead);
  document.getElementById('reader-strip-read').classList.toggle('is-read', isRead);
  document.getElementById('reader-bookmark-btn').style.color = isBm ? '#f5ae47' : '#ffffff';
}

function toggleFavCurrent() { toggleFav(state.currentVerseSeq); }

function toggleReadingListCurrent() {
  const id = state.currentVerseSeq;
  const idx = state.prefs.readingList.indexOf(id);
  if (idx >= 0) state.prefs.readingList.splice(idx, 1);
  else state.prefs.readingList.unshift(id);
  savePrefs();
  updateReaderActions();
}

function toggleReadCurrent() {
  const id = state.currentVerseSeq;
  const idx = state.prefs.readVerses.indexOf(id);
  if (idx >= 0) state.prefs.readVerses.splice(idx, 1);
  else state.prefs.readVerses.push(id);
  savePrefs();
  updateReaderActions();
}

function toggleBookmarkCurrent() {
  state.prefs.bookmark = state.currentVerseSeq;
  savePrefs();
  updateReaderActions();
}

function openBookmark() { openVerse(state.prefs.bookmark || 1); }
function openLastVisited() { openVerse(state.prefs.lastVisited || 1); }

function navigateVerse(delta) {
  const next = state.currentVerseSeq + delta;
  if (next >= 0 && next <= 275) openVerse(next);
}

// ================= AUDIO PLAYER =================
function getAudioUrl(vSeqNo, langID) {
  if (langID === 5) return `${HINDI_AUDIO_BASE}${vSeqNo}.mp3`;
  return `${GUJARATI_AUDIO_BASE}${vSeqNo}`;
}

async function toggleAudioPlayer() {
  const bar = document.getElementById('audio-bar');
  if (bar.classList.contains('visible')) {
    closeAudioBar();
  } else {
    bar.classList.add('visible');
    await loadAudioForCurrentVerse(true);
  }
}

async function loadAudioForCurrentVerse(autoplay) {
  const verses = await ensureVerses(state.prefs.contentLangID);
  const v = verses.find(x => x.vSeqNo === state.currentVerseSeq);
  if (!v) return;
  const audioEl = document.getElementById('html-audio');
  const titleEl = document.getElementById('audio-title');
  const badgeEl = document.getElementById('audio-lang-badge');

  if (!v.isAudioAvailable && state.currentVerseSeq === 0) {
    titleEl.textContent = 'No audio for this item';
    return;
  }

  const isHindi = state.prefs.contentLangID === 5;
  badgeEl.textContent = isHindi ? 'हिन्दी' : 'ગુજરાતી';
  titleEl.textContent = `${v.vsShortName}: ${v.vTitle}`;
  const url = getAudioUrl(v.vSeqNo, state.prefs.contentLangID);

  if (audioEl.src !== url) {
    audioEl.src = url;
    audioEl.playbackRate = state.audioSpeed;
  }
  if (autoplay) {
    audioEl.play().catch(() => {});
  }
}

function closeAudioBar() {
  const audioEl = document.getElementById('html-audio');
  audioEl.pause();
  document.getElementById('audio-bar').classList.remove('visible');
}

function togglePlayPause() {
  const audioEl = document.getElementById('html-audio');
  if (audioEl.paused) audioEl.play().catch(() => {});
  else audioEl.pause();
}

function seekAudio(pct) {
  const audioEl = document.getElementById('html-audio');
  if (audioEl.duration) audioEl.currentTime = (pct / 100) * audioEl.duration;
}

function skipAudio(sec) {
  const audioEl = document.getElementById('html-audio');
  audioEl.currentTime = Math.max(0, (audioEl.currentTime || 0) + sec);
}

function cycleAudioSpeed() {
  const speeds = [1, 1.25, 1.5, 0.75];
  const idx = (speeds.indexOf(state.audioSpeed) + 1) % speeds.length;
  state.audioSpeed = speeds[idx];
  document.getElementById('html-audio').playbackRate = state.audioSpeed;
  document.getElementById('audio-speed-btn').textContent = state.audioSpeed + 'x';
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

(function bindAudioEvents() {
  const audioEl = document.getElementById('html-audio');
  audioEl.addEventListener('play', () => document.getElementById('audio-play-btn').textContent = '❚❚');
  audioEl.addEventListener('pause', () => document.getElementById('audio-play-btn').textContent = '▶');
  audioEl.addEventListener('timeupdate', () => {
    document.getElementById('audio-cur-time').textContent = fmtTime(audioEl.currentTime);
    document.getElementById('audio-dur-time').textContent = fmtTime(audioEl.duration);
    if (audioEl.duration) {
      document.getElementById('audio-seek').value = (audioEl.currentTime / audioEl.duration) * 100;
    }
  });
})();

// ================= SEARCH =================
function goSearch() {
  showScreen('screen-search');
  document.getElementById('search-input').focus();
}

function goBackFromSearch() {
  showScreen(state.prevScreen || 'screen-browse');
}

async function runSearch(query) {
  const container = document.getElementById('search-results');
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) {
    container.innerHTML = '<div class="empty-state">Type at least 2 characters to search...</div>';
    return;
  }
  const verses = await ensureVerses(state.prefs.contentLangID);
  const matches = [];
  for (const v of verses) {
    const title = (v.vTitle || '').toLowerCase();
    const text = (v.vText || '').toLowerCase();
    const name = (v.vsName || '').toLowerCase();
    if (title.includes(q) || text.includes(q) || name.includes(q)) {
      const idx = text.indexOf(q);
      const snippet = idx >= 0 ? '...' + v.vText.slice(Math.max(0, idx - 35), idx + 85) + '...' : '';
      matches.push({ v, snippet });
      if (matches.length >= 60) break;
    }
  }
  if (!matches.length) {
    container.innerHTML = '<div class="empty-state">No results found.</div>';
    return;
  }
  container.innerHTML = matches.map(({ v, snippet }) => `
    <div class="verse-row" onclick="openVerse(${v.vSeqNo})">
      <div style="flex:1">
        <div class="verse-row-title">${esc(v.vsShortName)}: ${esc(v.vTitle)}</div>
        ${snippet ? `<div class="search-snippet">${esc(snippet)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

// ================= MODALS (QUIZ, NOTES, INFO, SETTINGS) =================
function openModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

async function openQuizModal() {
  const qmap = await ensureQuiz(state.prefs.contentLangID);
  const items = qmap[String(state.currentVerseSeq)] || [];
  if (!items.length) {
    openModal(getUiText('quiz', 'Quiz'), '<div class="empty-state">No quiz questions available for this discourse.</div>');
    return;
  }
  const verses = await ensureVerses(state.prefs.contentLangID);
  const v = verses.find(x => x.vSeqNo === state.currentVerseSeq);
  const fullText = v ? v.vText : '';
  const html = items.map(item => {
    let ansText = '';
    try {
      const pos = JSON.parse(item.a);
      const s = parseInt(pos.start_pos, 10);
      const e = parseInt(pos.end_pos, 10);
      if (!isNaN(s) && !isNaN(e)) ansText = fullText.slice(s, e);
    } catch (e) { ansText = item.a; }
    return `
      <div class="quiz-card" onclick="this.classList.toggle('open')">
        <div class="quiz-q">${esc(item.q)}</div>
        <div class="quiz-a">${esc(ansText || 'Answer highlighted in discourse.')}</div>
      </div>
    `;
  }).join('');
  openModal(getUiText('quiz', 'Quiz'), html);
}

function openNotesModal() {
  const existing = state.prefs.notes[String(state.currentVerseSeq)] || '';
  const html = `
    <textarea id="note-editor" class="note-textarea" placeholder="Write your study notes here...">${esc(existing)}</textarea>
    <button class="primary-btn" onclick="saveCurrentNote()">Save Note</button>
  `;
  openModal(getUiText('notes', 'Notes'), html);
}

function saveCurrentNote() {
  const val = document.getElementById('note-editor').value;
  if (val.trim()) state.prefs.notes[String(state.currentVerseSeq)] = val;
  else delete state.prefs.notes[String(state.currentVerseSeq)];
  savePrefs();
  closeModal();
}

async function openInfoModal() {
  const verses = await ensureVerses(state.prefs.contentLangID);
  const v = verses.find(x => x.vSeqNo === state.currentVerseSeq);
  const html = v ? `
    <p><strong>${esc(v.vsName)}</strong></p>
    <p style="margin-top:8px">${esc(v.vTitle)}</p>
    <p style="margin-top:14px; font-size:13px; color:var(--reader-muted)">
      Discourse #${v.vSeqNo} • Audio: ${state.prefs.contentLangID === 5 ? 'Hindi (CDN)' : 'Gujarati (BAPS)'}
    </p>
  ` : '';
  openModal('Info', html);
}

function openReaderSettings() { openSettingsModal(true); }
function openGlobalSettings() { openSettingsModal(false); }

function openSettingsModal(isReader) {
  const uiLangOpts = state.languages.filter(l => l.isUILang === 1).map(l =>
    `<option value="${l.langID}" ${l.langID === state.prefs.uiLangID ? 'selected' : ''}>${esc(l.langName)}</option>`
  ).join('');
  const contentLangOpts = state.languages.filter(l => l.isContentLang === 1).map(l =>
    `<option value="${l.langID}" ${l.langID === state.prefs.contentLangID ? 'selected' : ''}>${esc(l.langName)}</option>`
  ).join('');

  const html = `
    <div class="setting-group">
      <div class="setting-label">Application Language</div>
      <select class="setting-select" onchange="changeUiLang(this.value)">${uiLangOpts}</select>
    </div>
    <div class="setting-group">
      <div class="setting-label">Reading & Audio Language</div>
      <select class="setting-select" onchange="changeContentLang(this.value)">${contentLangOpts}</select>
    </div>
    <div class="setting-group">
      <div class="setting-label">Font Size (${state.prefs.fontSize}px)</div>
      <input type="range" min="14" max="28" value="${state.prefs.fontSize}" style="width:100%" oninput="changeFontSize(this.value)">
    </div>
    <div class="setting-group">
      <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:15px;">
        <input type="checkbox" ${state.prefs.nightMode ? 'checked' : ''} onchange="toggleNightMode(this.checked)">
        Night Reading Mode
      </label>
    </div>
  `;
  openModal(getUiText('settings', 'Settings'), html);
}

function changeUiLang(id) {
  state.prefs.uiLangID = parseInt(id, 10);
  savePrefs();
  applyUiStrings();
}

async function changeContentLang(id) {
  state.prefs.contentLangID = parseInt(id, 10);
  savePrefs();
  await ensureVerses(state.prefs.contentLangID);
  if (state.currentScreen === 'screen-browse') renderBrowseList();
  if (state.currentScreen === 'screen-reader') openVerse(state.currentVerseSeq);
}

function changeFontSize(px) {
  state.prefs.fontSize = parseInt(px, 10);
  savePrefs();
  applyTheme();
}

function toggleNightMode(on) {
  state.prefs.nightMode = !!on;
  savePrefs();
  applyTheme();
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHighlightedParagraphs(rawText, highlightJson) {
  // Normalize literal escaped newlines to actual \r\n (2 chars) / \n (1 char)
  // so highlightJson character offsets align 100% accurately across all paragraphs
  rawText = String(rawText || '').replace(/\\r\\n/g, '\r\n').replace(/\\n/g, '\n');

  let highlights = [];
  if (highlightJson) {
    try {
      const parsed = typeof highlightJson === 'string' ? JSON.parse(highlightJson) : highlightJson;
      if (Array.isArray(parsed)) {
        highlights = parsed.filter(h => h && h.q === 's' && typeof h.p === 'number' && typeof h.e === 'number' && h.e > h.p && h.i);
      }
    } catch (e) {}
  }

  // Split into paragraphs while tracking exact character offsets in rawText
  const sepRegex = /\r?\n/g;
  const paras = [];
  let lastIdx = 0;
  let m;
  while ((m = sepRegex.exec(rawText)) !== null) {
    if (m.index > lastIdx) {
      paras.push({ start: lastIdx, end: m.index });
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < rawText.length) {
    paras.push({ start: lastIdx, end: rawText.length });
  }

  return paras.map(({ start, end }) => {
    const segText = rawText.slice(start, end);
    if (!segText.trim()) return '';
    if (!highlights.length) return `<p>${esc(segText)}</p>`;

    const localHls = highlights.filter(h => h.e > start && h.p < end);
    if (!localHls.length) return `<p>${esc(segText)}</p>`;

    const ptsSet = new Set([start, end]);
    for (const h of localHls) {
      ptsSet.add(Math.max(start, h.p));
      ptsSet.add(Math.min(end, h.e));
    }
    const pts = Array.from(ptsSet).sort((a, b) => a - b);

    let out = '';
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      if (b <= a) continue;
      const slice = rawText.slice(a, b);
      const covering = localHls.filter(h => h.p <= a && h.e >= b);
      if (covering.length) {
        const ids = Array.from(new Set(covering.map(h => h.i))).join(',');
        out += `<span class="vma-hl" onclick="openHighlightInfo('${ids}', this.textContent)">${esc(slice)}</span>`;
      } else {
        out += esc(slice);
      }
    }
    return `<p>${out}</p>`;
  }).join('');
}

function formatInfoText(raw) {
  let txt = String(raw || '').replace(/\\n/g, '\n');
  // Split into lines/tokens and format [[def]], {header}, @img.jpg@
  const parts = txt.split(/(\[\[[\s\S]*?\]\]|\{[^}]+\}|@[^@\s]+\.(?:jpg|jpeg|png|webp)@)/gi);
  return parts.map(part => {
    if (!part) return '';
    if (part.startsWith('[[') && part.endsWith(']]')) {
      return `<div class="info-def-box">${esc(part.slice(2, -2)).replace(/\n/g, '<br>')}</div>`;
    }
    if (part.startsWith('{') && part.endsWith('}')) {
      return `<div><span class="info-sec-heading">${esc(part.slice(1, -1))}</span></div>`;
    }
    if (part.startsWith('@') && part.endsWith('@')) {
      const imgName = part.slice(1, -1).trim();
      return `<img class="info-img" src="./img/info/${esc(imgName)}" alt="${esc(imgName)}" loading="lazy">`;
    }
    return `<span>${esc(part).replace(/\n/g, '<br>')}</span>`;
  }).join('');
}

async function openHighlightInfo(idsCsv, clickedWord) {
  const ids = idsCsv.split(',').filter(Boolean);
  const imap = await ensureInfo(state.prefs.contentLangID);
  const blocks = ids.map(id => imap[id]).filter(Boolean);
  if (!blocks.length) {
    openModal(clickedWord || 'Info', '<div class="empty-state">No additional explanation found.</div>');
    return;
  }
  const html = blocks.map(b => `<div class="info-entry"><div class="info-text-body">${formatInfoText(b.t)}</div></div>`).join('');
  openModal(clickedWord || 'Explanation', html);
}

// Swipe & Keyboard navigation in Reader
let touchStartX = 0, touchStartY = 0;
document.addEventListener('touchstart', (e) => {
  if (state.currentScreen !== 'screen-reader') return;
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (state.currentScreen !== 'screen-reader') return;
  const dx = e.changedTouches[0].screenX - touchStartX;
  const dy = e.changedTouches[0].screenY - touchStartY;
  if (Math.abs(dx) > 75 && Math.abs(dy) < 55) {
    navigateVerse(dx < 0 ? 1 : -1);
  }
}, { passive: true });

document.addEventListener('keydown', (e) => {
  if (state.currentScreen !== 'screen-reader') return;
  if (e.key === 'ArrowRight') navigateVerse(1);
  if (e.key === 'ArrowLeft') navigateVerse(-1);
});

initApp();
