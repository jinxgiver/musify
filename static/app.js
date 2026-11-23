/* Musify front end: a small single-page app in vanilla JavaScript. */
(() => {
  'use strict';

  /* ---------- tiny helpers ---------- */
  const ICONS = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
    next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
    prev: 'M6 6h2v12H6zM9.5 12l8.5 6V6z',
    shuffle: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
    repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
    heart: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
    heartFill: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    minus: 'M19 13H5v-2h14v2z',
    home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    library: 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 5h-3v5.5c0 1.38-1.12 2.5-2.5 2.5S10 13.88 10 12.5s1.12-2.5 2.5-2.5c.57 0 1.08.19 1.5.51V5h4v2zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z',
    volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z',
    install: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const grad = (a, b) => `linear-gradient(135deg, ${a}, ${b})`;

  async function api(url, opt = {}) {
    const init = opt.body ? { method: opt.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opt.body) } : opt;
    const r = await fetch(url, init);
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.status === 204 ? null : r.json();
  }

  /* ---------- state ---------- */
  const S = { queue: [], i: -1, current: null, shuffle: false, repeat: 'off', playlists: [] };
  const audio = new Audio();
  audio.preload = 'metadata';
  const cache = new Map();           // id -> song (shared objects, so a "like" updates everywhere)
  let lists = [];                    // lists rendered in the current view, referenced from the DOM by index
  let pendingSong = null;            // song waiting for a playlist choice
  let dragging = false;

  const remember = list => list.map(s => {
    const old = cache.get(s.id);
    if (old) { Object.assign(old, s); return old; }
    cache.set(s.id, s);
    return s;
  });
  const reg = list => { lists.push(list); return lists.length - 1; };

  /* ---------- small UI pieces ---------- */
  const cover = (s, cls = '') => `<div class="cover ${cls}" style="background:${grad(s.color1, s.color2)}"><span>${esc(s.title[0])}</span></div>`;

  const card = (s, ci, i) => `
    <button class="card" data-ctx="${ci}" data-i="${i}">
      ${cover(s, 'card-cover')}
      <span class="card-play">${svg('play')}</span>
      <div class="card-title">${esc(s.title)}</div>
      <div class="card-sub">${esc(s.artist)}</div>
    </button>`;

  const cards = list => { const ci = reg(list); return `<div class="cards">${list.map((s, i) => card(s, ci, i)).join('')}</div>`; };
  const section = (title, body, sub = '') => `<section class="block"><h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}${body}</section>`;

  function table(list, playlistId = null) {
    if (!list.length) return '<p class="empty">Nothing here yet.</p>';
    const ci = reg(list);
    const head = '<div class="tr th"><span>#</span><span>Title</span><span class="alb">Album</span><span class="dur">Time</span><span></span></div>';
    const rows = list.map((s, i) => `
      <div class="tr row" data-ctx="${ci}" data-i="${i}" data-id="${s.id}">
        <span class="num"><b>${i + 1}</b>${svg('play')}</span>
        <span class="title-cell">${cover(s, 'mini')}<span class="tt"><span class="t">${esc(s.title)}</span><span class="a">${esc(s.artist)}</span></span></span>
        <span class="alb">${esc(s.album)}</span>
        <span class="dur">${fmt(s.duration)}</span>
        <span class="acts">
          <button data-like="${s.id}" class="icon-btn like ${s.liked ? 'on' : ''}" title="Like">${svg(s.liked ? 'heartFill' : 'heart')}</button>
          ${playlistId != null
            ? `<button data-remove="${s.id}" data-pl="${playlistId}" class="icon-btn" title="Remove from playlist">${svg('minus')}</button>`
            : `<button data-add="${s.id}" class="icon-btn" title="Add to playlist">${svg('plus')}</button>`}
        </span>
      </div>`).join('');
    return `<div class="tbl">${head}${rows}</div>`;
  }

  function hero(title, kind, subtitle, colors, ci) {
    return `<section class="page-hero" style="--c1:${colors[0]};--c2:${colors[1]}">
      <div class="hero-art" style="background:${grad(colors[0], colors[1])}">${svg('library')}</div>
      <div><div class="kind">${esc(kind)}</div><h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div></div>
      ${ci != null ? `<button class="play-big" data-playall="${ci}" aria-label="Play all">${svg('play')}</button>` : ''}
    </section>`;
  }

  /* ---------- views ---------- */
  async function renderHome() {
    const [recs, recent, genres, all] = await Promise.all([
      api('/api/recommendations'), api('/api/recent'), api('/api/genres'), api('/api/songs')]);
    remember(all);
    const h = new Date().getHours();
    const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const quick = S.playlists.slice(0, 6).map(p => `
      <a class="quick" href="#/playlist/${p.id}">
        <div class="cover mini-lg" style="background:${grad(p.color1 || '#4c1d95', p.color2 || '#ec4899')}"><span>${esc(p.name[0])}</span></div>
        <span>${esc(p.name)}</span>
      </a>`).join('');
    const tiles = genres.map(g => `
      <a class="genre" href="#/genre/${encodeURIComponent(g.genre)}" style="background:${grad(g.color1, g.color2)}">
        <b>${esc(g.genre)}</b><small>${g.count} songs</small></a>`).join('');
    return `<h1 class="greet">${hello}</h1>
      <div class="quick-grid"><a class="quick" href="#/liked"><div class="cover mini-lg liked-cover">${svg('heartFill')}</div><span>Liked Songs</span></a>${quick}</div>
      ${section('Made for you', cards(remember(recs)), 'Ranked by how closely each song matches your likes and listening history')}
      ${recent.length ? section('Recently played', cards(remember(recent))) : ''}
      ${section('Browse genres', `<div class="genres">${tiles}</div>`)}
      ${section('All songs', table(remember(all)))}`;
  }

  async function renderSearch() {
    const q = $('#search').value.trim();
    if (!q) {
      const genres = await api('/api/genres');
      return `<h1 class="greet">Search</h1>${section('Browse all', `<div class="genres">${genres.map(g => `
        <a class="genre" href="#/genre/${encodeURIComponent(g.genre)}" style="background:${grad(g.color1, g.color2)}"><b>${esc(g.genre)}</b><small>${g.count} songs</small></a>`).join('')}</div>`)}`;
    }
    const songs = remember(await api(`/api/songs?q=${encodeURIComponent(q)}`));
    return `<h1 class="greet">Results for “${esc(q)}”</h1>${songs.length ? table(songs) : '<p class="empty">No songs match your search.</p>'}`;
  }

  async function renderLibrary() {
    await loadPlaylists();
    const liked = remember(await api('/api/likes'));
    const items = S.playlists.map(p => `
      <a class="card" href="#/playlist/${p.id}">
        <div class="cover card-cover" style="background:${grad(p.color1 || '#4c1d95', p.color2 || '#ec4899')}"><span>${esc(p.name[0])}</span></div>
        <div class="card-title">${esc(p.name)}</div><div class="card-sub">Playlist · ${p.count} songs</div></a>`).join('');
    return `<h1 class="greet">Your Library</h1>
      <div class="cards">
        <a class="card" href="#/liked"><div class="cover card-cover liked-cover">${svg('heartFill')}</div>
          <div class="card-title">Liked Songs</div><div class="card-sub">Playlist · ${liked.length} songs</div></a>
        ${items}
      </div>`;
  }

  async function renderLiked() {
    const songs = remember(await api('/api/likes'));
    const ci = reg(songs);
    return hero('Liked Songs', 'Playlist', `${songs.length} songs`, ['#7c3aed', '#ec4899'], songs.length ? ci : null) + table(songs);
  }

  async function renderPlaylist(id) {
    const pl = await api(`/api/playlists/${id}`);
    const songs = remember(pl.songs);
    const ci = reg(songs);
    const total = songs.reduce((a, s) => a + s.duration, 0);
    const colors = songs.length ? [songs[0].color1, songs[0].color2] : ['#4c1d95', '#ec4899'];
    return hero(pl.name, 'Playlist', `${songs.length} songs · ${fmt(total)}`, colors, songs.length ? ci : null) + table(songs, pl.id);
  }

  async function renderGenre(name) {
    const songs = remember(await api(`/api/songs?genre=${encodeURIComponent(name)}`));
    const ci = reg(songs);
    const colors = songs.length ? [songs[0].color1, songs[0].color2] : ['#4c1d95', '#ec4899'];
    return hero(name, 'Genre', `${songs.length} songs`, colors, songs.length ? ci : null) + table(songs);
  }

  const ROUTES = { home: renderHome, search: renderSearch, library: renderLibrary, liked: renderLiked, playlist: renderPlaylist, genre: renderGenre };

  async function route() {
    const hash = location.hash.replace(/^#\/?/, '') || 'home';
    const [name, ...rest] = hash.split('/');
    const arg = decodeURIComponent(rest.join('/'));
    $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === name));
    lists = [];
    try {
      $('#view').innerHTML = await (ROUTES[name] || renderHome)(arg);
    } catch (err) {
      $('#view').innerHTML = `<p class="empty">Could not load this page (${esc(err.message)}). You may be offline.</p>`;
    }
    $('.main').scrollTop = 0;
    markPlaying();
  }

  /* ---------- playlists ---------- */
  async function loadPlaylists() {
    try { S.playlists = await api('/api/playlists'); } catch { /* offline: keep the old list */ }
    $('#playlist-list').innerHTML =
      `<li><a href="#/liked">${svg('heartFill')}<span>Liked Songs</span></a></li>` +
      S.playlists.map(p => `<li><a href="#/playlist/${p.id}"><span class="dot" style="background:${grad(p.color1 || '#4c1d95', p.color2 || '#ec4899')}"></span><span>${esc(p.name)}</span></a></li>`).join('');
  }

  const dlg = $('#dlg');
  function openDialog(html) { dlg.innerHTML = html; dlg.showModal(); }

  function addDialog(songId) {
    pendingSong = songId;
    const s = cache.get(songId);
    openDialog(`<h3>Add “${esc(s.title)}” to a playlist</h3>
      <ul class="dlg-list">${S.playlists.map(p => `<li><button data-pick="${p.id}">${esc(p.name)} <small>${p.count} songs</small></button></li>`).join('')}</ul>
      <div class="dlg-actions"><button class="btn ghost" data-newpl>New playlist…</button><button class="btn ghost" data-cancel>Cancel</button></div>`);
  }

  function newPlaylistDialog() {
    openDialog(`<form method="dialog"><h3>New playlist</h3>
      <input name="name" maxlength="60" placeholder="Playlist name" required autofocus>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary" value="create">Create</button></div></form>`);
  }

  dlg.addEventListener('click', async e => {
    if (e.target === dlg) return dlg.close();
    if (e.target.closest('[data-cancel]')) return dlg.close();
    if (e.target.closest('[data-newpl]')) return newPlaylistDialog();
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const r = await api(`/api/playlists/${pick.dataset.pick}/songs`, { body: { song_id: pendingSong } });
      dlg.close();
      toast(r.added ? 'Added to playlist' : 'Already in that playlist');
      await loadPlaylists();
    }
  });

  dlg.addEventListener('submit', async e => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    if (!name) return;
    const pl = await api('/api/playlists', { body: { name } });
    if (pendingSong) await api(`/api/playlists/${pl.id}/songs`, { body: { song_id: pendingSong } });
    pendingSong = null;
    dlg.close();
    await loadPlaylists();
    location.hash = `#/playlist/${pl.id}`;
  });

  async function removeFromPlaylist(pid, sid) {
    await api(`/api/playlists/${pid}/songs/${sid}`, { method: 'DELETE' });
    await loadPlaylists();
    route();
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- player ---------- */
  function playQueue(list, i) { S.queue = list.slice(); play(i); }

  function play(i) {
    if (i < 0 || i >= S.queue.length) return;
    S.i = i;
    S.current = S.queue[i];
    audio.src = `/stream/${S.current.id}`;
    audio.play().catch(() => { /* autoplay blocked: the user can press play */ });
    api(`/api/songs/${S.current.id}/play`, { method: 'POST' }).catch(() => {});
    updatePlayerUI();
    setMediaSession(S.current);
    markPlaying();
  }

  function next(auto = false) {
    if (!S.queue.length) return;
    let j;
    if (S.shuffle && S.queue.length > 1) {
      do { j = Math.floor(Math.random() * S.queue.length); } while (j === S.i);
    } else {
      j = S.i + 1;
    }
    if (j >= S.queue.length) {
      if (S.repeat === 'all' || !auto) j = 0;
      else { audio.pause(); audio.currentTime = 0; return; }
    }
    play(j);
  }

  function prev() {
    if (audio.currentTime > 3 || S.i <= 0) { audio.currentTime = 0; return; }
    play(S.i - 1);
  }

  function togglePlay() {
    if (!S.current) { if (lists[0] && lists[0].length) playQueue(lists[0], 0); return; }
    audio.paused ? audio.play() : audio.pause();
  }

  function updatePlayerUI() {
    const s = S.current;
    const c = $('#np-cover');
    if (!s) return;
    c.classList.remove('empty');
    c.style.background = grad(s.color1, s.color2);
    c.innerHTML = `<span>${esc(s.title[0])}</span>`;
    $('#np-title').textContent = s.title;
    $('#np-artist').textContent = s.artist;
    syncLike(s.id);
  }

  function markPlaying() {
    $$('.row').forEach(r => r.classList.toggle('playing', !!S.current && +r.dataset.id === S.current.id && !audio.paused));
    $$('.row').forEach(r => r.classList.toggle('current', !!S.current && +r.dataset.id === S.current.id));
  }

  function syncLike(id) {
    const s = cache.get(id) || S.current;
    if (!s) return;
    $$(`[data-like="${id}"]`).forEach(b => { b.classList.toggle('on', s.liked); b.innerHTML = svg(s.liked ? 'heartFill' : 'heart'); });
    if (S.current && S.current.id === id) {
      $('#np-like').classList.toggle('on', s.liked);
      $('#np-like').innerHTML = svg(s.liked ? 'heartFill' : 'heart');
    }
  }

  async function toggleLike(id) {
    const r = await api(`/api/songs/${id}/like`, { method: 'POST' });
    const s = cache.get(id) || S.current;
    if (s) s.liked = r.liked;
    syncLike(id);
    if (location.hash === '#/liked' && !r.liked) route();
  }

  function setMediaSession(s) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: s.title, artist: s.artist, album: s.album,
      artwork: [{ src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
  if ('mediaSession' in navigator) {
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* unsupported action */ } };
    set('play', () => audio.play());
    set('pause', () => audio.pause());
    set('previoustrack', prev);
    set('nexttrack', () => next());
    set('seekto', d => { audio.currentTime = d.seekTime; });
  }

  audio.addEventListener('play', () => { $('#btn-play').innerHTML = svg('pause'); $('#btn-play').title = 'Pause'; markPlaying(); });
  audio.addEventListener('pause', () => { $('#btn-play').innerHTML = svg('play'); $('#btn-play').title = 'Play'; markPlaying(); });
  audio.addEventListener('ended', () => { if (S.repeat === 'one') { audio.currentTime = 0; audio.play(); } else next(true); });
  audio.addEventListener('loadedmetadata', () => { $('#t-dur').textContent = fmt(audio.duration); });
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration || (S.current && S.current.duration) || 0;
    $('#t-cur').textContent = fmt(audio.currentTime);
    if (!dragging && d) {
      const v = audio.currentTime / d * 1000;
      $('#seek').value = v;
      $('#seek').style.setProperty('--p', `${v / 10}%`);
    }
    if ('mediaSession' in navigator && d && isFinite(d)) {
      try { navigator.mediaSession.setPositionState({ duration: d, position: audio.currentTime, playbackRate: 1 }); } catch { /* ignore */ }
    }
  });

  const seek = $('#seek');
  seek.addEventListener('input', () => { dragging = true; seek.style.setProperty('--p', `${seek.value / 10}%`); });
  seek.addEventListener('change', () => {
    const d = audio.duration || (S.current && S.current.duration) || 0;
    audio.currentTime = seek.value / 1000 * d;
    dragging = false;
  });

  const vol = $('#vol');
  try { vol.value = localStorage.getItem('musify-vol') ?? 80; } catch { /* storage blocked */ }
  const applyVol = () => { audio.volume = vol.value / 100; vol.style.setProperty('--p', `${vol.value}%`); };
  vol.addEventListener('input', () => { applyVol(); try { localStorage.setItem('musify-vol', vol.value); } catch { /* ignore */ } });
  applyVol();

  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-next').addEventListener('click', () => next());
  $('#btn-prev').addEventListener('click', prev);
  $('#btn-shuffle').addEventListener('click', e => { S.shuffle = !S.shuffle; e.currentTarget.classList.toggle('on', S.shuffle); });
  $('#btn-repeat').addEventListener('click', e => {
    S.repeat = { off: 'all', all: 'one', one: 'off' }[S.repeat];
    e.currentTarget.dataset.mode = S.repeat;
    e.currentTarget.classList.toggle('on', S.repeat !== 'off');
  });
  $('#np-like').addEventListener('click', () => { if (S.current) toggleLike(S.current.id); });

  document.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'n') next();
    else if (e.key === 'p') prev();
  });

  /* ---------- global click handling (event delegation) ---------- */
  document.addEventListener('click', e => {
    const like = e.target.closest('[data-like]');
    if (like) return toggleLike(+like.dataset.like);
    const add = e.target.closest('[data-add]');
    if (add) return addDialog(+add.dataset.add);
    const rem = e.target.closest('[data-remove]');
    if (rem) return removeFromPlaylist(+rem.dataset.pl, +rem.dataset.remove);
    const all = e.target.closest('[data-playall]');
    if (all) return playQueue(lists[+all.dataset.playall], 0);
    const item = e.target.closest('#view [data-ctx]');
    if (item) return playQueue(lists[+item.dataset.ctx], +item.dataset.i);
  });

  $('#new-playlist').addEventListener('click', () => { pendingSong = null; newPlaylistDialog(); });

  let searchTimer;
  $('#search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { if (location.hash !== '#/search') location.hash = '#/search'; else route(); }, 180);
  });
  $('#search').addEventListener('focus', () => { if (location.hash !== '#/search') location.hash = '#/search'; });

  /* ---------- installable app + offline shell ---------- */
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; $('#install-btn').hidden = false; });
  $('#install-btn').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    $('#install-btn').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#install-btn').hidden = true; toast('Musify installed'); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  /* ---------- boot ---------- */
  $$('[data-icon]').forEach(el => { el.innerHTML = svg(el.dataset.icon); });
  window.addEventListener('hashchange', route);
  loadPlaylists().then(route);
})();
