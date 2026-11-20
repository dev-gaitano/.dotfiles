/*
 * Native Swarm Board frontend. Shows only the swarm of the conversation this
 * pane belongs to: polls /api/swarm, which re-resolves that conversation on
 * every call, and renders overview/board/members/graph/raw, or an empty state
 * when the conversation has no swarm.
 *
 * The Overview tab shows the narrator's view (view.json + view.html, written
 * by the swarm's narrator member) inside trusted chrome. The narrator's HTML
 * is untrusted: it runs only in a sandboxed srcdoc frame (scripts, no same
 * origin, no network via CSP), talks to this page only through a small
 * validated postMessage protocol, and can always be replaced by the plain
 * view, which renders the same (validated) view.json here.
 */
(() => {
  const POLL_MS = 1500;       // live refresh while a swarm is shown
  const IDLE_POLL_MS = 3000;  // re-resolve cadence while there is no swarm
  const $ = (id) => document.getElementById(id);
  const state = {
    conv: null,       // conversation the shown data was resolved for
    swarm: null,      // coordinator conversation id of the shown swarm
    view: 'loading',  // loading | board | empty
    etag: '',
    snap: null,
    me: null,  // roster name of the current conversation
    seenSeqs: new Set(),
    firstLoad: true,
    hiddenAgents: new Set(),
    // The channel the feed narrows to: '' for every channel, 'main', or a
    // channel name. Only offered once the swarm has a non-main channel.
    channel: '',
    // Killed members are hidden from the Members tab unless the user asks.
    // The Overview is the default tab; without a narrator (or before it has
    // published) the pane falls back to the Board until the user picks a tab.
    tab: 'feed',
    tabChosen: false,
    newEdgeKeys: new Set(),
    lastOk: 0,
    expanded: new Set(),
    rawKind: 'members',
    // Whether the board feed is pinned to its newest post. Starts true so the
    // board opens on the latest posts; the user scrolling away clears it and
    // scrolling back to the bottom sets it again.
    stick: true,
  };
  // The page itself decides where the feed starts (at the newest post).
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const params = new URLSearchParams(location.search);
  const initialTab = params.get('tab');
  const urlTabChosen = !!(initialTab && document.querySelector(`.tab[data-tab="${CSS.escape(initialTab)}"]`));
  const currentConv = () => window.sidecar?.conversationId || params.get('conversationId') || '';

  // GET routes bypass token auth, so plain fetch works both in the iframe and standalone.
  async function getJson(path) {
    const f = window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : fetch;
    const res = await f(path, { method: 'GET' });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  // ---------- theme ----------
  // preload.js writes the host's tokens onto :root. Mark the root light/dark
  // from --background's luminance so native controls and status hues follow.
  function syncScheme() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--background, #f7f7f8)';
    document.documentElement.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const nums = (c.match(/[\d.]+/g) || []).map(Number);
    if (nums.length < 3) return;
    // "rgb(r, g, b)" is 0-255; "color(srgb r g b)" is 0-1.
    const scale = c.startsWith('color(') ? 1 : 255;
    const [r, g, b] = nums.slice(0, 3).map((v) => v / scale);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const theme = lum < 0.5 ? 'dark' : 'light';
    if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  }
  syncScheme();
  // Theme changes are forwarded to the narrator frame too (postTheme is
  // defined below; the observer only fires after startup).
  new MutationObserver(() => {
    syncScheme();
    postTheme();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "working" means mid-turn (thinking, running a tool, or waiting on the model), so show it as "active".
  const STATUS_LABEL = { working: 'Active', waiting: 'Waiting', killed: 'Killed' };
  const statusLabel = (st) => STATUS_LABEL[st] || st || '';
  const STATUS_TIP = { working: 'Active: mid-turn (thinking, running a tool, or waiting on the model)', waiting: 'Waiting: turn ended, asleep on the board until a post wakes it', killed: 'Killed: removed from the swarm' };
  const members = () => state.snap?.members || [];
  const memberOf = (name) => members().find((m) => m.name === name);
  const memberByLower = (lower) => members().find((m) => m.name.toLowerCase() === lower);
  // Board times are "YYYY-MM-DD HH:MM:SS" in the LS host's local time, which
  // can differ from this browser's zone (e.g. a UTC remote host viewed from a
  // laptop). The server resolves them to epoch ms (m.ts) on the LS host; the raw
  // string is only parsed here as a fallback.
  const parseTime = (t) => (t ? Date.parse(t.replace(' ', 'T')) : NaN);
  const msgMs = (m) => (Number.isFinite(m?.ts) ? m.ts : parseTime(m?.time));
  const isoTime = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : '');
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  // Build the date formatters once. toLocaleString builds a new formatter on
  // every call, and the feed formats three times per post.
  const clockFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayClockFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
  // Wall-clock time in the viewer's zone, e.g. "4:32 PM"; earlier days get the
  // date too, e.g. "Oct 3, 4:32 PM".
  function fmtClock(ms) {
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    return (sameDay(d, new Date()) ? clockFormat : dayClockFormat).format(d);
  }
  // Full date and time for tooltips.
  const fmtFull = (ms) => (Number.isFinite(ms) ? fullFormat.format(ms) : '');
  function fmtDur(ms) {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600)
      return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  }
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  // Inline icons (16px grid, stroke = currentColor).
  const ICON = {
    play: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path class="fill" d="M5 3.6v8.8a.5.5 0 0 0 .76.43l7-4.4a.5.5 0 0 0 0-.86l-7-4.4A.5.5 0 0 0 5 3.6z"/></svg>',
    pause: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect class="fill" x="4" y="3.5" width="2.75" height="9" rx=".75"/><rect class="fill" x="9.25" y="3.5" width="2.75" height="9" rx=".75"/></svg>',
    arrow: '<svg class="icon arrow" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M9 4.5 12.5 8 9 11.5"/></svg>',
    open: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M7 3.5H4.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9"/><path d="M9.5 3.5h3v3M12.5 3.5 7.5 8.5"/></svg>',
    search: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3.25 3.25"/></svg>',
    inbox: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 9.5 4 4a1 1 0 0 1 1-.75h6a1 1 0 0 1 1 .75l1.5 5.5v2.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/><path d="M2.5 9.5h3l1 1.5h3l1-1.5h3"/></svg>',
  };

  // Collapse complete numbered groups (e.g. researcher-1..N when all N are
  // mentioned) into their shared prefix ("researcher") for the row header.
  function collapseRecipientGroups(names, roster = members()) {
    const set = new Set(names);
    const groups = new Map();
    for (const mem of roster) {
      const match = mem.name.match(/^(.+)-\d+$/);
      if (!match) continue;
      const prefix = match[1];
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix).push(mem.name);
    }
    const collapsed = new Set();
    const out = [];
    for (const n of names) {
      const match = n.match(/^(.+)-\d+$/);
      const prefix = match?.[1];
      const group = prefix ? groups.get(prefix) : null;
      if (group && group.length >= 2 && group.every((g) => set.has(g))) {
        if (!collapsed.has(prefix)) {
          collapsed.add(prefix);
          out.push(prefix);
        }
      } else {
        out.push(n);
      }
    }
    return out;
  }

  // Recipients of a post, as quiet "@name" text for the row header.
  function recipientsHtml(m) {
    const names = collapseRecipientGroups((m.mentions || []).filter((n) => n !== m.agent));
    const parts = names.map((n) => `<span>@${esc(n)}</span>`);
    for (const c of m.channel_mentions || []) parts.push(`<span>@#${esc(c)}</span>`);
    if (m.all) parts.push('<span>@all</span>');
    return parts.length ? `<span class="msg-to">${ICON.arrow}${parts.join('')}</span>` : '';
  }

  // Highlight @name the way board/mentions.go matches it: "@" at a word start,
  // followed by a roster name or numbered group prefix (case-insensitive) and
  // then a non-name rune. Runs on already-escaped HTML; escaping never produces
  // name runes directly before "@".
  const MENTION_RE = /(^|[^\p{L}\p{N}_-])@([\p{L}\p{N}_-]+)/gu;
  // "@#channel": highlighted when it names one of the swarm's channels (the
  // server decides whom it calls on: m.via_channel).
  const CHANNEL_MENTION_RE = /(^|[^\p{L}\p{N}_-])@#([a-z][a-z0-9-]{0,23})(?![\p{L}\p{N}_-])/giu;
  function highlightChannelMentions(html) {
    if (!hasChannels()) return html;
    return html.replace(CHANNEL_MENTION_RE, (all, pre, name) => {
      const c = swarmChannels().find((x) => x.name === name.toLowerCase());
      if (!c) return all;
      const tip = c.archived ? `#${c.name} is archived: this addresses nobody` : `Everyone in #${c.name}`;
      return `${pre}<span class="mention channel${c.archived ? ' archived' : ''}" title="${esc(tip)}">@#${name}</span>`;
    });
  }
  function highlightMentions(html) {
    html = highlightChannelMentions(html);
    return html.replace(MENTION_RE, (all, pre, name) => {
      const lower = name.toLowerCase();
      if (lower === 'all') return `${pre}<span class="mention all">@${name}</span>`;
      const m = memberByLower(lower);
      if (m) {
        return `${pre}<span class="mention" title="${esc(m.name)} · ${esc(statusLabel(m.status))}">@${name}</span>`;
      }
      const group = members().filter((mem) => {
        const match = mem.name.toLowerCase().match(/^(.+)-\d+$/);
        return match && match[1] === lower;
      });
      if (group.length) {
        const tip = group.map((mem) => mem.name).join(', ');
        return `${pre}<span class="mention" title="${esc(tip)}">@${name}</span>`;
      }
      return all;
    });
  }

  // Render #<digits> sequence references in post bodies as clickable citation
  // pills that jump to and highlight message #<seq> in the Board tab. Runs on
  // already-escaped HTML; excludes "&#39;" entities and URL/word fragments.
  const CITATION_RE = /(^|[^\p{L}\p{N}_&#/-])#([1-9]\d{0,8})(?![\p{L}\p{N}_-])/gu;
  function highlightCitations(html) {
    return html
      .replace(CITATION_RE, (all, pre, digits) => {
        const seq = Number(digits);
        if (!Number.isInteger(seq) || seq <= 0) return all;
        const target = state.snap?.messages?.find((m) => m.seq === seq);
        const tip = target ? `Go to #${seq} (${target.agent})` : `Go to #${seq}`;
        return `${pre}<button type="button" class="ref seq-ref" data-seq-ref="${seq}" data-ov-seq="${seq}" data-testid="swarm-seq-ref" title="${esc(tip)}">#${seq}</button>`;
      })
      .replace(/<code>(<button\b[^>]*\bseq-ref\b[^>]*>#[0-9]+<\/button>)<\/code>/g, '<code class="seq-ref-only">$1</code>');
  }

  // Minimal, escape-first markdown renderer (headings, lists, code, bold, italics) + mentions + #seq citations.
  function md(src) {
    const lines = String(src || '').split('\n');
    let out = '', inCode = false, code = [], inList = false;
    const inline = (t) => highlightCitations(highlightMentions(esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, '$1<em>$2</em>')));
    const closeList = () => { if (inList) { out += '</ul>'; inList = false; } };
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        if (inCode) {
          out += `<pre>${esc(code.join('\n'))}</pre>`;
          code = [];
          inCode = false;
        } else {
          closeList();
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        code.push(line);
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        closeList();
        out += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
        continue;
      }
      const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (li) {
        if (!inList) {
          out += '<ul>';
          inList = true;
        }
        out += `<li>${inline(li[1])}</li>`;
        continue;
      }
      closeList();
      if (line.trim()) out += `<p>${inline(line)}</p>`;
    }
    if (inCode) out += `<pre>${esc(code.join('\n'))}</pre>`;
    closeList();
    return out;
  }

  const canOpenConversation = () => !!window.sidecar?.ui?.toggleConversation;
  function openConversation(convId) {
    if (!convId) return;
    // A member on another machine's LS has no conversation here: every open
    // path (rows, graph, Overview actions, alerts) says where it runs instead.
    const remote = members().find((m) => m.conversation_id === convId && m.local === false);
    if (remote) {
      toast(`${remote.name} runs on ${remote.owner?.label || 'another machine'}; open it there.`);
      return;
    }
    if (window.sidecar?.ui?.toggleConversation)
      window.sidecar.ui.toggleConversation(convId);
  }

  // Who a post calls on: explicit roster mentions, plus (optionally) everyone
  // but the poster and role workers for @all.
  function targetsOf(m, expandAll, roster = members()) {
    if (isRoleWorker(m.agent, roster)) return { direct: new Set(), viaAll: new Set() };
    const direct = new Set([...(m.mentions || []), ...(m.via_channel || [])].filter((n) => n !== m.agent && !isRoleWorker(n, roster)));
    const viaAll = new Set();
    if (m.all && expandAll) {
      for (const mem of roster)
        if (mem.name !== m.agent && !direct.has(mem.name) && !isRoleWorker(mem, roster)) viaAll.add(mem.name);
    }
    return { direct, viaAll };
  }

  // ---------- data loading ----------
  // Forget everything about the shown swarm (the swarm or "you" changed).
  function resetSwarm(id) {
    state.swarm = id;
    state.etag = '';
    state.snap = null;
    state.seenSeqs.clear();
    state.hiddenAgents.clear();
    state.channel = '';
    state.expanded.clear();
    feedMarkup = '';
    state.firstLoad = true;
    state.stick = true;
    $('f-agent').value = '';
    $('f-mention').value = '';
    replayStop();
    closeGifModal();
    frameTeardown();
    frame.failed = null;
    state.tabChosen = urlTabChosen;
  }

  function showView(view) {
    if (view === state.view) return;
    state.view = view;
    $('loading').classList.toggle('hidden', view !== 'loading');
    $('board').classList.toggle('hidden', view !== 'board');
    $('empty').classList.toggle('hidden', view !== 'empty');
    // The graph lays out against its rendered width, so redo it once visible.
    if (view === 'board' && state.snap && state.tab === 'graph') renderGraph();
    if (view !== 'board') frameTeardown();
    syncWatchdog();
    if (view === 'board' && state.snap && state.tab === 'feed') {
      measureClamps();
      // The first render happened while hidden, so follow to the newest post now.
      if ($('f-autoscroll').checked && state.stick) scrollToLatest();
      updateJump();
    }
  }

  function showEmpty(conv) {
    $('empty-body').innerHTML = conv ?
        'Swarms started in this conversation appear here automatically, with their board, ' +
            'members and @mention graph. Start one with <code>/swarm</code>.' :
        'Open this pane from a conversation to see its swarm. Swarms started there ' +
            'appear here automatically; start one with <code>/swarm</code>.';
    showView('empty');
  }

  function setLive(ok) {
    const live = $('live');
    const stale = !ok;
    live.classList.toggle('stale', stale);
    const label = stale ? 'Reconnecting' : 'Live';
    if ($('live-label').textContent !== label) $('live-label').textContent = label;
    live.title = stale ? 'Lost contact with the swarm sidecar; retrying' : 'Updates automatically';
  }

  async function poll() {
    let delay = POLL_MS;
    try {
      const conv = currentConv();
      if (conv !== state.conv) {
        state.conv = conv;
        resetSwarm(null);
      }
      const q = new URLSearchParams({etag: state.etag});
      if (conv) q.set('conversationId', conv);
      const r = await getJson(`/api/swarm?${q}`);
      state.lastOk = Date.now();
      if (!r.swarm) {
        if (state.swarm) resetSwarm(null);
        state.me = null;
        showEmpty(r.conversationId || conv);
        delay = IDLE_POLL_MS;
        return;
      }
      if (r.swarm !== state.swarm) resetSwarm(r.swarm);
      state.me = r.member || null;
      if (!r.unchanged) {
        state.etag = r.etag;
        ingest(r);
      }
      showView('board');
    } catch (e) {
      console.warn(e);
    } finally {
      setLive(Date.now() - state.lastOk <= POLL_MS * 4);
      setTimeout(poll, delay);
    }
  }

  function ingest(snap) {
    const newSeqs = [];
    for (const m of snap.messages) {
      if (!state.seenSeqs.has(m.seq)) {
        newSeqs.push(m.seq);
        state.seenSeqs.add(m.seq);
      }
    }
    state.snap = snap;
    // Seqs this conversation's member does not see (channels only).
    state.unseen = Array.isArray(snap.unseen) ? new Set(snap.unseen) : null;
    const newSet = state.firstLoad ? new Set() : new Set(newSeqs);
    state.newEdgeKeys = new Set();
    if (!state.firstLoad) {
      for (const m of snap.messages) {
        if (!newSet.has(m.seq)) continue;
        const { direct, viaAll } = targetsOf(m, true);
        for (const t of [...direct, ...viaAll])
          state.newEdgeKeys.add(`${m.agent}>${t}`);
      }
    }
    renderMeta();
    renderAgents();
    renderFilters();
    renderChannels();
    renderFeed(newSet);
    renderMembers();
    renderGraph();
    renderRaw();
    renderOverview();
    autoSelectTab();
    if (newSet.size) {
      const live = $('live');
      live.classList.add('flash');
      setTimeout(() => live.classList.remove('flash'), 600);
    }
    state.firstLoad = false;
  }

  // ---------- rendering ----------
  // hive.js draws the Overview (plan, running, blocked, planned, the team) and
  // the Members cards.
  {
    window.SwarmHive.hooks = {
      members: () => selectTab('members', false, true),
      member: (name) => {
        const target = name === 'coordinator' ? (window.SwarmHive?.leadName || 'coordinator') : name;
        const m = (state.snap?.members || []).find((x) => x.name === target);
        if (m?.conversation_id && canOpenConversation()) {
          openConversation(m.conversation_id);
        } else if (m) {
          $('f-agent').value = m.name;
          $('f-agent').classList.add('set');
          selectTab('feed', false, true);
          renderFeed();
        }
      },
    };
  }

  function renderMeta() {
    const s = state.snap;
    // Role workers (narrator, monitor, ...) are observers, not part of the
    // task-worker team: they are left out of the counts (and the graph).
    const team = s.members.filter((m) => !isRoleWorker(m));
    const visibleTeam = team.filter((m) => !m.killed);
    $('swarm-title').textContent = s.title || 'Untitled swarm';
    $('swarm-title').title = `${s.title || 'Untitled swarm'}\nswarm ${s.id}\n${s.dir || ''}`;
    if ($('swarm-meta').innerHTML !== '') $('swarm-meta').innerHTML = '';
    $('tab-count-feed').textContent = s.head ? String(s.head) : '';
    $('tab-count-members').textContent = visibleTeam.length ? String(visibleTeam.length) : '';
  }

  function renderAgents() {
    $('agents').innerHTML = members().map((m) => {
      const hidden = state.hiddenAgents.has(m.name);
      const role = roleOf(m);
      const tip = `${m.name}${m.name === state.me ? ' (you)' : ''} · ${role}${m.model ? ' · ' + m.model : ''} · ${statusLabel(m.status)} · ${plural(m.posts, 'post')}` +
          `\n${hidden ? 'Hidden from the board; click to show' : 'Click to hide from the board'}`;
      return `<button type="button" class="chip ${hidden ? 'dim' : ''} ${m.killed ? 'killed' : ''}" data-agent="${esc(m.name)}" data-testid="swarm-member-chip" ` +
          `aria-pressed="${hidden ? 'false' : 'true'}" title="${esc(tip)}">` +
          `<span class="chip-name">${esc(m.name)}${m.name === state.me ? ' (you)' : ''}</span>` +
          `<span class="chip-count">${m.posts}</span></button>`;
    }).join('');
  }

  function renderFilters() {
    const names = members().map((m) => m.name);
    const posters = [...new Set([...names, ...state.snap.messages.map((m) => m.agent)])];
    const fill = (id, first, opts) => {
      const sel = $(id);
      const prev = sel.value;
      sel.innerHTML = `<option value="">${first}</option>` + opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
      sel.value = opts.some(([v]) => v === prev) ? prev : '';
      sel.classList.toggle('set', !!sel.value);
    };
    fill('f-agent', 'From anyone', posters.map((n) => [n, `From ${n}`]));
    fill('f-mention', 'To anyone', [['@none', 'To no one'], ['@all', 'To @all'], ...names.map((n) => [n, `To ${n}`])]);
  }

  // ---------- channels ----------
  // A message's channel: '' / absent is main. Control messages (create,
  // archive, subscribe, unsubscribe) carry `control` and are shown as compact
  // system lines. Channel data is present only once a swarm has created a
  // channel, so a one-channel swarm renders exactly as before.
  const chanOf = (m) => (typeof m?.channel === 'string' && m.channel ? m.channel : 'main');
  const isControl = (m) => !!(m?.control && typeof m.control === 'object');
  const swarmChannels = () => (Array.isArray(state.snap?.channels) ? state.snap.channels : []);
  const hasChannels = () => swarmChannels().length > 0;

  // Whether the feed's "New" divider may count m for me: a post I see, judged
  // by my subscriptions as of that post (the server lists the ones I don't,
  // `unseen`, once the swarm has channels). Control lines never count, as in
  // the board's unread rule.
  function seesNow(m) {
    if (isControl(m)) return false;
    return !(state.unseen && state.unseen.has(m.seq));
  }

  // The channel tab strip (shown only when a non-main channel exists) and the
  // matching select in the filter panel; both set state.channel.
  function renderChannels() {
    const chans = swarmChannels();
    const strip = $('channel-tabs');
    const wrap = $('f-channel-wrap');
    const on = chans.length > 0;
    strip.classList.toggle('hidden', !on);
    wrap.classList.toggle('hidden', !on);
    if (!on) {
      state.channel = '';
      strip.innerHTML = '';
      return;
    }
    const names = ['main', ...chans.map((c) => c.name)];
    if (state.channel && !names.includes(state.channel)) state.channel = '';
    const counts = new Map();
    for (const m of state.snap.messages) counts.set(chanOf(m), (counts.get(chanOf(m)) || 0) + 1);
    const tab = (value, label, tip, extra = '') => {
      const sel = state.channel === value;
      return `<button type="button" role="tab" class="channel-tab ${sel ? 'on' : ''} ${extra}" data-channel="${esc(value)}" ` +
          `aria-selected="${sel}" tabindex="${sel ? 0 : -1}" title="${esc(tip)}" data-testid="swarm-channel-tab">${label}</button>`;
    };
    const byName = new Map(chans.map((c) => [c.name, c]));
    const html = tab('', 'All', 'Posts in every channel') + names.map((n) => {
      const c = byName.get(n);
      const count = counts.get(n) || 0;
      const tip = n === 'main' ? 'main: the whole swarm reads it' :
        `${n}${c?.topic ? ` · ${c.topic}` : ''}${c?.created_by ? `\ncreated by ${c.created_by}` : ''}${c?.archived ? '\narchived' : ''}`;
      return tab(n, `#${esc(n)}${count ? `<span class="chip-count">${count}</span>` : ''}`, tip, c?.archived ? 'archived' : '');
    }).join('');
    if (strip.innerHTML !== html) strip.innerHTML = html;
    const sel = $('f-channel');
    const opts = `<option value="">All channels</option>` +
        names.map((n) => `<option value="${esc(n)}">#${esc(n)}${byName.get(n)?.archived ? ' (archived)' : ''}</option>`).join('');
    if (sel.innerHTML !== opts) sel.innerHTML = opts;
    sel.value = state.channel;
    sel.classList.toggle('set', !!state.channel);
  }

  function setChannel(value) {
    state.channel = value || '';
    renderChannels();
    renderFeed();
  }

  // A post's channel chip (non-main posts only).
  function channelChipHtml(m) {
    const ch = chanOf(m);
    if (ch === 'main') return '';
    return `<button type="button" class="msg-channel" data-channel="${esc(ch)}" data-testid="swarm-message-channel" ` +
        `title="Posted in #${esc(ch)}; click to show only #${esc(ch)}">#${esc(ch)}</button>`;
  }

  function filtersActive() {
    return !!($('f-agent').value || $('f-mention').value || $('f-search').value.trim() || state.hiddenAgents.size || state.channel);
  }

  // The filter panel is collapsed by default; a dot on its toggle shows that
  // a filter inside it is narrowing the feed.
  function updateFilterToggle() {
    const hidden = !!($('f-agent').value || $('f-mention').value || state.hiddenAgents.size);
    const t = $('f-toggle');
    t.classList.toggle('active', hidden);
    t.title = hidden ? 'Filters (active)' : 'Filters';
  }
  function setFiltersOpen(open) {
    $('filters').classList.toggle('hidden', !open);
    $('f-toggle').setAttribute('aria-expanded', String(open));
  }

  function visibleMessages() {
    const s = state.snap;
    const from = $('f-agent').value;
    const to = $('f-mention').value;
    const q = $('f-search').value.trim().toLowerCase();
    const ch = state.channel;
    return s.messages.filter((m) => {
      if (ch && chanOf(m) !== ch) return false;
      if (state.hiddenAgents.has(m.agent)) return false;
      if (from && m.agent !== from) return false;
      if (to === '@none' && ((m.mentions || []).length || m.all || (m.channel_mentions || []).length)) return false;
      if (to === '@all' && !m.all) return false;
      if (to && to[0] !== '@' && !(m.all || (m.mentions || []).includes(to) || (m.via_channel || []).includes(to))) return false;
      if (q && !`${m.agent}\n${m.text}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  const nearBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
  const feedShown = () => state.view === 'board' && state.tab === 'feed';
  function scrollToLatest(behavior = 'auto') {
    state.stick = true;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
  }
  // Re-pin to the newest post after the feed's height changes (late layout,
  // the pane going from hidden to visible, fonts or theme arriving), as long
  // as the user hasn't scrolled away from the bottom.
  function keepPinned() {
    if (feedShown() && state.stick && $('f-autoscroll').checked) scrollToLatest();
  }

  // A channel change (create, archive, subscribe, unsubscribe) as one quiet
  // system line: it never wakes anyone and is not part of the conversation.
  function controlHtml(m) {
    const t = msgMs(m);
    const text = String(m.text || '').replace(/^\[channel\]\s*/, '');
    return `<div class="msg msg-system" data-seq="${m.seq}" data-testid="swarm-control-message" role="note">` +
        `<span class="sys-text" title="${esc(`#${m.seq} · ${m.agent} · ${fmtFull(t)}`)}">${esc(text)}</span>` +
        `<time class="ts" datetime="${esc(isoTime(t))}">${esc(fmtClock(t))}</time></div>`;
  }

  // The row header already names the recipients, so a post's leading
  // "@a @b" is dropped from its preview.
  function stripLeadingMentions(text) {
    const t = String(text || '');
    const rest = t.replace(/^(\s*@[A-Za-z0-9_.-]+[,:]?)+\s*/, '');
    return rest || t;
  }

  function messageHtml(m, { unreadByMe = false } = {}) {
    if (isControl(m)) return controlHtml(m);
    const targets = [...(m.mentions || [])].filter((n) => n !== m.agent);
    const open = state.expanded.has(m.seq);
    const onRoster = !!memberOf(m.agent);
    const t = msgMs(m);
    const tsTitle = esc(`#${m.seq} · ${fmtFull(t)}`);
    const dt = esc(isoTime(t));
    const cls = ['msg', unreadByMe ? 'unread-by-me' : ''].filter(Boolean).join(' ');
    const color = window.SwarmHive?.colorOf ? window.SwarmHive.colorOf(m.agent) : '#8a8f98';
    const avatar = window.SwarmHive?.avatarHtml ? window.SwarmHive.avatarHtml(m.agent) :
        `<span class="msg-av" style="--av:${esc(color)}" aria-hidden="true">${esc((m.agent || '?').charAt(0).toUpperCase())}</span>`;
    const head = `<header class="msg-head">
            <span class="msg-who">
              <span class="msg-author" ${onRoster ? '' : 'title="Not on the roster"'}>@${esc(m.agent)}</span>
              ${channelChipHtml(m)}
              ${recipientsHtml(m)}
              ${!onRoster ? '<span class="msg-note">not on roster</span>' : ''}
            </span>
            <time class="ts" datetime="${dt}" title="${tsTitle}">#${m.seq} · ${esc(fmtClock(t))}</time>
          </header>`;
    return `<article class="${cls}" data-seq="${m.seq}" data-testid="swarm-message"` +
        ` aria-label="${esc(`${m.agent}${targets.length || m.all ? ' to ' + [...targets, ...(m.all ? ['all'] : [])].join(', ') : ''}, ${fmtClock(t)}`)}">
          ${avatar}${head}
          <div class="msg-body md ${open ? 'open' : ''}">${md(targets.length || m.all ? stripLeadingMentions(m.text) : m.text)}</div>
          <button type="button" class="msg-more hidden" data-testid="swarm-message-more" aria-expanded="${open}">${open ? 'Show less' : 'Show more'}</button>
      </article>`;
  }

  // Long posts collapse to a few lines with a "Show more" toggle; only posts
  // that actually overflow get one.
  // Write all classes first, then read all heights. Reading a height after a
  // write forces a new layout. Doing that per post lays out the feed once per
  // post.
  function measureClamps() {
    const bodies = [...$('feed').querySelectorAll('.msg-body')];
    const open = bodies.map((body) => body.classList.contains('open'));
    for (const body of bodies) {
      body.classList.add('clamped');
      body.classList.remove('open');
    }
    const overflows = bodies.map((body) => body.scrollHeight > body.clientHeight + 4);
    bodies.forEach((body, i) => {
      body.classList.toggle('open', open[i]);
      body.classList.toggle('clamped', overflows[i]);
      body.nextElementSibling.classList.toggle('hidden', !overflows[i]);
    });
  }

  // The last markup that renderFeed wrote to the feed. We keep a copy because
  // feed.innerHTML is not the same string. The browser normalizes it, and
  // clamping changes classes.
  let feedMarkup = '';
  function renderFeed(newSet = new Set()) {
    const feed = $('feed');
    const wasNearBottom = nearBottom();
    const myCursor = state.me ? memberOf(state.me)?.last_read_seq ?? null : null;
    const msgs = visibleMessages();
    let dividerDone = false;
    const html = msgs.map((m) => {
      const unreadByMe = myCursor !== null && m.seq > myCursor && m.agent !== state.me && seesNow(m);
      let pre = '';
      if (unreadByMe && !dividerDone) {
        dividerDone = true;
        pre = `<div class="divider" role="separator" data-testid="swarm-unread-divider">New</div>`;
      }
      return pre + messageHtml(m, { unreadByMe });
    }).join('');
    updateFilterToggle();
    const markup = html || (state.snap.messages.length ?
      `<div class="feed-empty" data-testid="swarm-feed-empty">${ICON.search}
          <div class="feed-empty-title">No posts match</div>
          <div>Try a different search or member filter.</div>
          <button type="button" class="ghost-btn" data-clear-filters data-testid="swarm-clear-filters">Clear filters</button></div>` :
      `<div class="feed-empty" data-testid="swarm-feed-empty">${ICON.inbox}
          <div class="feed-empty-title">No posts yet</div>
          <div>Posts to the swarm board will appear here as members talk.</div></div>`);
    // Rebuild only when the markup changes. A rebuild lays out all posts again.
    // Most polls change only member state.
    if (markup !== feedMarkup) {
      feedMarkup = markup;
      feed.innerHTML = markup;
      if (state.view === 'board' && state.tab === 'feed') measureClamps();
    }
    // Mark new posts after the rebuild. The markup then does not change on the
    // next poll, so that poll does not rebuild the feed again.
    for (const seq of newSet) feed.querySelector(`.msg[data-seq="${seq}"]`)?.classList.add('new');
    if ($('f-autoscroll').checked && state.tab === 'feed' &&
        (state.firstLoad || state.stick || (newSet.size && wasNearBottom))) {
      scrollToLatest();
    }
    updateJump();
  }

  function updateJump() {
    const show = state.tab === 'feed' && state.view === 'board' && !nearBottom() && document.body.scrollHeight > window.innerHeight * 1.5;
    $('jump-latest').classList.toggle('hidden', !show);
  }

  function renderMembers() {
    // Drawn by hive.js, which index.html loads before this file.
    window.SwarmHive.update(state.snap, $('members'), { view: 'cards' });
  }

  // Pill width that fits status dot + label (12px medium is ~6.8px a character).
  // A node holds the member's bee (28px with its gap) and its name.
  // The coordinator's name is never shortened, however narrow the pane.
  const pillWidth = (id, maxW) => {
    const full = Math.max(72, 54 + Math.ceil(String(id).length * 6.8));
    return id === 'coordinator' ? full : Math.min(maxW, full);
  };

  function layout(nodes, width) {
    // Up to ~16 nodes: an ellipse with the coordinator at the top, so worker-to-worker
    // edges are chords rather than running through neighbours. Bigger swarms wrap in rows.
    const nodeH = 28;
    if (nodes.length <= 16) {
      const pos = new Map();
      const n = nodes.length;
      const w = Math.min(162, Math.max(116, width / Math.max(4, Math.ceil(n / 2) + 1) - 10));
      const rx = Math.max(60, width / 2 - w / 2 - 14);
      const ry = n <= 2 ? 60 : Math.min(220, Math.max(110, n * 20));
      const cx = width / 2, cy = ry + nodeH / 2 + 20;
      nodes.forEach((node, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        pos.set(node.id, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), w: pillWidth(node.id, w), h: nodeH });
      });
      return { pos, height: cy + ry + nodeH / 2 + 20 };
    }
    // Coordinator row on top, workers below (wrapping), outsiders last.
    const rows = new Map();
    for (const n of nodes) {
      if (!rows.has(n.row)) rows.set(n.row, []);
      rows.get(n.row).push(n);
    }
    const pos = new Map();
    const minNodeW = 114, lineH = 64, rowGap = 40;
    const perLine = Math.max(1, Math.floor(width / (minNodeW + 12)));
    let y = 32;
    for (const [, list] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      for (let i = 0; i < list.length; i += perLine) {
        const line = list.slice(i, i + perLine);
        const gap = width / (line.length + 1);
        const w = Math.min(158, Math.max(minNodeW, gap - 12));
        // Stagger alternate nodes on wide lines so edges between neighbours stay visible.
        line.forEach((n, j) => pos.set(n.id, { x: gap * (j + 1), y: y + (line.length > 3 && j % 2 ? 14 : 0), w: pillWidth(n.id, Math.min(w, gap - 8)), h: nodeH }));
        y += lineH;
      }
      y += rowGap;
    }
    return { pos, height: y - rowGap + 14 };
  }

  // ---------- graph + replay ----------
  // Channel control lines are bookkeeping, not posts: the graph skips them.
  const graphMsgs = () => (state.snap?.messages || []).filter((m) => !isControl(m));
  // idx null = live (show everything). animatedSeq: the replay message whose
  // travelling dot has already been started (see renderGraph).
  const replay = { idx: null, playing: false, timer: null, animatedSeq: null };

  function edgeGeom(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, bend = 24;
    const mx = (a.x + b.x) / 2 + nx * bend, my = (a.y + b.y) / 2 + ny * bend;
    // Trim ends at the box border (plus a small gap) so arrowheads stay visible.
    const trim = (p, q) => {
      const tx = q.x - p.x, ty = q.y - p.y, l = Math.hypot(tx, ty) || 1;
      const ux = tx / l, uy = ty / l;
      const toBorder = Math.min(ux ? p.w / 2 / Math.abs(ux) : Infinity, uy ? p.h / 2 / Math.abs(uy) : Infinity);
      const t = Math.min(0.45 * l, toBorder + 4);
      return { x: p.x + ux * t, y: p.y + uy * t };
    };
    const s1 = trim(a, { x: mx, y: my }), e1 = trim(b, { x: mx, y: my });
    return { d: `M${s1.x},${s1.y} Q${mx},${my} ${e1.x},${e1.y}`, start: s1, mx, my, end: e1 };
  }

  // Incrementally accumulates graph edges and activity across prefixes of `all`
  // messages in O(N) total time. Shared between live SVG rendering and streaming
  // GIF export so both stay in sync.
  function createGraphAccumulator(s, all, { expandAll, hideInactive, width }) {
    const roster = s.members || [];
    const memberNames = new Set(roster.map((m) => m.name));
    const outsiders = [...new Set(all.map((m) => m.agent))].filter((n) => !memberNames.has(n) && !isRoleWorker(n, roster));
    // Role-worker nodes are left out, which also drops every edge to or from
    // them (edges need both ends placed).
    const allNodes = [
      ...roster.filter((m) => !isRoleWorker(m, roster)).map((m) => ({ id: m.name, row: m.role === 'coordinator' ? 0 : 1, m })),
      ...outsiders.map((n) => ({ id: n, row: 2, m: null })),
    ];
    const isKilled = (n) => Boolean(n.m?.killed || n.m?.status === 'killed');

    // While replaying, members light up the first time they post or are called on.
    const active = new Set(['coordinator']);
    const edges = new Map();        // "from>to" -> {direct, viaAll}
    const unaddressed = new Map();  // poster -> posts calling on nobody
    const broadcasts = new Map();   // poster -> @all posts (badged when not expanded)
    const bump = (k, field) => { const e = edges.get(k) || { direct: 0, viaAll: 0 }; e[field]++; edges.set(k, e); };
    let cursor = 0;

    // Cache layout by visible node key so consecutive steps with the same node
    // set skip recomputing node positions.
    let cachedLayoutKey = null;
    let cachedLayout = null;
    const layoutFor = (nodes) => {
      const key = hideInactive ? nodes.map((n) => n.id).join('\0') : '*';
      if (key !== cachedLayoutKey) {
        cachedLayoutKey = key;
        cachedLayout = layout(nodes, width);
      }
      return cachedLayout;
    };

    const advanceTo = (upto) => {
      const target = Math.max(cursor, Math.min(upto, all.length));
      for (; cursor < target; cursor++) {
        const m = all[cursor];
        if (isRoleWorker(m.agent, roster)) continue;
        active.add(m.agent);
        const { direct, viaAll } = targetsOf(m, expandAll, roster);
        if (m.all) broadcasts.set(m.agent, (broadcasts.get(m.agent) || 0) + 1);
        if (!direct.size && !viaAll.size && !m.all && !(m.mentions || []).some((n) => n !== m.agent))
          unaddressed.set(m.agent, (unaddressed.get(m.agent) || 0) + 1);
        for (const t of direct) {
          active.add(t);
          bump(`${m.agent}>${t}`, 'direct');
        }
        for (const t of viaAll) {
          if (!hideInactive) active.add(t);
          bump(`${m.agent}>${t}`, 'viaAll');
        }
      }
    };

    const snapshot = ({ replaying }) => {
      const current = replaying && cursor > 0 ? all[cursor - 1] : null;
      const currentDirect = current && !isRoleWorker(current.agent, roster)
        ? new Set([current.agent, ...targetsOf(current, false, roster).direct])
        : new Set();
      const nodes = hideInactive
        ? allNodes.filter((n) => currentDirect.has(n.id) || (active.has(n.id) && !isKilled(n)))
        : allNodes;
      const { pos, height } = layoutFor(nodes);

      const isActive = (id) => !replaying || active.has(id);
      let curTargets = new Set();
      if (current) {
        const { direct, viaAll } = targetsOf(current, expandAll, roster);
        curTargets = new Set([...direct, ...viaAll]);
      }
      const isCur = (from, to) => !!current && from === current.agent && curTargets.has(to);

      let max = 1;
      for (const [k, e] of edges) {
        const [from, to] = k.split('>');
        if (pos.has(from) && pos.has(to)) {
          const total = e.direct + e.viaAll;
          if (total > max) max = total;
        }
      }

      return {
        nodes, pos, height, edges, unaddressed, broadcasts,
        current, curTargets, max, isActive, isCur, replaying, upto: cursor,
      };
    };

    return { advanceTo, snapshot };
  }

  // Computes the graph's nodes, edges, layout and replay highlight state for a
  // prefix of `all` messages.
  function buildGraphState(s, all, { replaying, upto, expandAll, hideInactive, width }) {
    const acc = createGraphAccumulator(s, all, { expandAll, hideInactive, width });
    acc.advanceTo(upto);
    return acc.snapshot({ replaying });
  }

  function renderGraph() {
    const s = state.snap;
    if (!s) return;
    // The Graph tab has two views: the hive (hive.js: threads as cells, each
    // worker where it works) and the mention graph below. The replay bar steps both.
    // Shown before the graph is measured, so a view that was hidden gets its real width.
    const hiveOn = state.graphView !== 'mentions' && !!window.SwarmHive?.map;
    $('tab-graph').classList.toggle('hive-on', hiveOn);
    $('hive').hidden = !hiveOn;
    document.querySelectorAll('.gview-btn').forEach((b) => {
      const on = (b.dataset.gview === 'hive') === hiveOn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const all = graphMsgs();
    const replaying = replay.idx !== null;
    if (replaying && replay.idx > all.length) replay.idx = all.length;
    const upto = replaying ? replay.idx : all.length;
    if (hiveOn) {
      const cur = replaying && upto > 0 ? all[upto - 1] : null;
      window.SwarmHive.map(s, $('hive'), { seq: replaying ? (cur ? cur.seq : 0) : null });
      renderReplayBar(all, upto, cur);
      return;
    }
    const svg = $('graph');
    const width = Math.max(svg.clientWidth || 0, 320);
    const expandAll = $('g-all').checked;
    const hideInactive = $('g-hide-inactive')?.checked || false;
    const g = buildGraphState(s, all, { replaying, upto, expandAll, hideInactive, width });
    const { nodes, pos, height, edges, unaddressed, broadcasts, current, curTargets, max, isActive, isCur } = g;

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.height = `${height}px`;

    // renderGraph rebuilds the SVG on every snapshot change (member
    // transcripts change it every poll while members work), on resize and on
    // tab switches, so an animation emitted on every render replays over and
    // over. Each one plays once, for the message that caused it: the current
    // replay message's dot and pulse only the first time that message is
    // shown (stepping away and back plays them again), and live pulses for
    // new posts only in the first render after they arrive.
    const animateCur = !!current && current.seq !== replay.animatedSeq;
    replay.animatedSeq = current ? current.seq : null;
    const newEdgeKeys = state.newEdgeKeys;
    state.newEdgeKeys = new Set();

    let edgesSvg = '', countsSvg = '', dots = '', curIdx = 0;
    for (const [k, e] of edges) {
      const [from, to] = k.split('>');
      const a = pos.get(from), b = pos.get(to);
      if (!a || !b) continue;
      const n = e.direct + e.viaAll;
      const { d, mx, my, end } = edgeGeom(a, b);
      const w = 1 + (3 * n) / max;
      const cur = isCur(from, to);
      const pulse = replaying ? cur && animateCur : newEdgeKeys.has(k);
      const id = cur ? `cur-edge-${curIdx++}` : '';
      edgesSvg += `<path ${id ? `id="${id}"` : ''} class="edge ${e.direct ? '' : 'via-all'} ${pulse ? 'pulse' : ''} ${cur ? 'cur' : ''} ${replaying && !cur ? 'past' : ''}" d="${d}" ` +
        `stroke-width="${w.toFixed(2)}" marker-end="url(#arrow)"><title>${esc(from)} → ${esc(to)}: ${e.direct} direct` +
        `${e.viaAll ? `, ${e.viaAll} via @all` : ''}</title></path>`;
      if (n > 1) countsSvg += `<text class="count" x="${mx}" y="${my + 3}" text-anchor="middle">${n}</text>`;
      if (id && animateCur) {
        dots += `<circle class="msg-dot" r="4.5"><animateMotion class="dot-anim" dur="0.9s" begin="indefinite" fill="freeze"><mpath href="#${id}"/></animateMotion></circle>`;
      } else if (id) {
        // Already played: rest where the animation froze, at the arrowhead.
        dots += `<circle class="msg-dot" r="4.5" cx="${end.x}" cy="${end.y}"/>`;
      }
    }
    const defs = '<marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse">' +
        '<path class="arrowhead" d="M1,1.2 L9,5 L1,8.8 Q2.6,5 1,1.2 z"/></marker>';
    let nodesSvg = '';
    for (const n of nodes) {
      const p = pos.get(n.id);
      const status = n.m?.status || '';
      // Each member is its bee (hive.js), with the status dot at the bee's shoulder.
      const beeSrc = window.SwarmHive?.beeSrc ? window.SwarmHive.beeSrc(n.id) : '';
      const beeX = p.x - p.w / 2 + 8;
      const dotX = beeSrc ? beeX + 22 : p.x - p.w / 2 + 14;  // status dot centre x
      const dotY = beeSrc ? p.y - 7 : p.y;
      const labelX = beeSrc ? beeX + 28 : status ? dotX + 9 : p.x - p.w / 2 + 12;
      const maxChars = Math.max(4, Math.floor((p.x + p.w / 2 - 10 - labelX) / 6.8));
      const label = n.id.length > maxChars ? n.id.slice(0, maxChars - 1) + '…' : n.id;
      const hot = current && (n.id === current.agent || curTargets.has(n.id));
      const ring = unaddressed.get(n.id);
      const bcast = expandAll ? 0 : broadcasts.get(n.id) || 0;
      const bw = 30 + 6 * String(bcast).length;  // "@all N" pill at 9px semibold
      const tip = n.m
        ? `${n.id} · ${n.m.role}${n.m.model ? ' · ' + n.m.model : ''} · ${statusLabel(status)} · ${n.m.steps || 0} steps · ${n.m.posts} posts · ${n.m.unread} unread${ring ? ` · ${ring} unaddressed` : ''}${broadcasts.get(n.id) ? ` · ${broadcasts.get(n.id)} @all` : ''}${n.m.activity && status === 'working' ? `\n${n.m.activity}` : ''}${n.m.owner ? `\non ${n.m.owner.label}` : ''}${n.m.conversation_id && n.m.local !== false && canOpenConversation() ? '\nClick to open conversation' : ''}`
        : `${n.id} (not on the roster)`;
      const cls = ['node', isActive(n.id) ? '' : 'inactive', hot ? 'hot' : '', status === 'killed' ? 'killed' : '', n.m ? '' : 'outsider'].filter(Boolean).join(' ');
      nodesSvg += `<g class="${cls}" data-conv="${esc(n.m?.conversation_id || '')}">` +
        `<title>${esc(tip)}</title>` +
        (ring ? `<rect class="ring" x="${p.x - p.w / 2 - 4}" y="${p.y - p.h / 2 - 4}" width="${p.w + 8}" height="${p.h + 8}" rx="${p.h / 2 + 4}"/>` : '') +
        `<rect class="node-box" x="${p.x - p.w / 2}" y="${p.y - p.h / 2}" width="${p.w}" height="${p.h}" rx="${p.h / 2}"/>` +
        (beeSrc ? `<image class="node-bee" href="${beeSrc}" x="${beeX}" y="${p.y - 9}" width="22" height="18"/>` : '') +
        (status ? `<circle class="status-dot ${esc(status)}" cx="${dotX}" cy="${dotY}" r="${beeSrc ? 3 : 3.25}"/>` : '') +
        `<text class="node-label" x="${labelX}" y="${p.y + 4}">${esc(label)}</text>` +
        (bcast ? `<g class="bcast"><rect x="${p.x + p.w / 2 - bw + 6}" y="${p.y - p.h / 2 - 7}" width="${bw}" height="14" rx="7"/>` +
          `<text x="${p.x + p.w / 2 - bw / 2 + 6}" y="${p.y - p.h / 2 + 3}" text-anchor="middle">@all ${bcast}</text></g>` : '') +
        `</g>`;
    }
    svg.innerHTML = `<defs>${defs}</defs>${edgesSvg}${nodesSvg}${countsSvg}${dots}`;
    // SVG animations inserted via innerHTML start on the document clock (long past),
    // so trigger the travelling dots explicitly.
    svg.querySelectorAll('.dot-anim').forEach((a) => a.beginElement?.());
    renderReplayBar(all, upto, current);
  }

  function renderReplayBar(all, upto, current) {
    const slider = $('replay-slider');
    slider.max = String(all.length);
    slider.value = String(upto);
    slider.style.setProperty('--pct', `${all.length ? (100 * upto) / all.length : 100}%`);
    const play = $('replay-play');
    const playIcon = replay.playing ? 'pause' : 'play';
    if (play.dataset.icon !== playIcon) {
      play.innerHTML = ICON[playIcon];
      play.dataset.icon = playIcon;
      play.setAttribute('aria-label', replay.playing ? 'Pause replay' : 'Play replay');
    }
    const liveBtn = $('replay-live');
    liveBtn.classList.toggle('on', replay.idx === null);
    liveBtn.setAttribute('aria-pressed', String(replay.idx === null));
    $('replay-start').disabled = replay.idx === 0;
    $('replay-back').disabled = upto <= 0;
    $('replay-fwd').disabled = replay.idx === null || upto >= all.length;
    const t0 = all.length ? msgMs(all[0]) : 0;
    const label = $('replay-label');
    if (replay.idx === null) {
      label.innerHTML = `<b>${plural(all.length, 'post')}</b>` + (all.length > 1 ? ` over ${esc(fmtDur(msgMs(all[all.length - 1]) - t0))}` : '');
    } else {
      label.innerHTML = `<b>${upto}</b> of ${all.length}` + (current ? ` · #${current.seq} at ${esc(fmtClock(msgMs(current)))} (+${esc(fmtDur(msgMs(current) - t0))})` : '');
    }
    const cap = $('replay-caption');
    if (!current) {
      cap.classList.add('hidden');
      cap.innerHTML = '';
      return;
    }
    cap.classList.remove('hidden');
    cap.innerHTML = `<div class="msg-head">
          <span class="msg-who">
            <span class="msg-author">${esc(current.agent)}</span>
            ${recipientsHtml(current)}
          </span>
          <span class="ts" title="${esc(`#${current.seq} · ${fmtFull(msgMs(current))}`)}">${esc(fmtClock(msgMs(current)))}</span>
        </div>
        <div class="msg-body md open">${md(current.text)}</div>`;
    sizeReplayCaption();
  }

  // Lets the replay caption's body grow to the bottom of the pane (less the
  // caption's and .main's bottom padding) before it scrolls. Measured from the
  // top of the document, so the room does not depend on the scroll position.
  function sizeReplayCaption() {
    const cap = $('replay-caption');
    const body = cap.querySelector('.msg-body');
    if (!body) return;
    const capPad = parseFloat(getComputedStyle(cap).paddingBottom) || 0;
    const mainPad = parseFloat(getComputedStyle(document.querySelector('.main')).paddingBottom) || 0;
    const top = body.getBoundingClientRect().top + window.scrollY;
    cap.style.setProperty('--caption-room', `${Math.floor(window.innerHeight - top - capPad - mainPad)}px`);
  }

  function replayDelay(all, idx) {
    const speed = parseFloat($('replay-speed').value) || 1;
    if ($('replay-timing').value === 'even' || idx <= 0 || idx >= all.length)
      return 1400 / speed;
    // Real-time, compressed: 1 minute of wall time = 1 second at 1x, clamped.
    const gap = msgMs(all[idx]) - msgMs(all[idx - 1]);
    return Math.min(4000, Math.max(250, (gap || 0) / 60 / speed));
  }

  function replayStop() {
    replay.playing = false;
    clearTimeout(replay.timer);
    replay.timer = null;
  }

  function replayTick() {
    const all = graphMsgs();
    if (replay.idx === null || replay.idx >= all.length) {
      replayStop();
      renderGraph();
      return;
    }
    replay.idx += 1;
    renderGraph();
    if (replay.idx >= all.length) {
      replayStop();
      renderGraph();
      return;
    }
    replay.timer = setTimeout(replayTick, replayDelay(all, replay.idx));
  }

  function replaySeek(idx) {
    replayStop();
    replay.idx = Math.max(0, Math.min(idx, graphMsgs().length));
    renderGraph();
  }

  function replayToggle() {
    if (replay.playing) {
      replayStop();
      renderGraph();
      return;
    }
    const n = graphMsgs().length;
    if (!n) return;
    if (replay.idx === null || replay.idx >= n) replay.idx = 0;
    replay.playing = true;
    replay.timer = setTimeout(replayTick, 300);
    renderGraph();
  }

  function replayLive() {
    replayStop();
    replay.idx = null;
    renderGraph();
  }

  // ---------- graph GIF export ----------
  let exportingGif = false;
  let activeGifModalUrl = null;

  function isDownloadSandboxed() {
    if (window.self === window.top) return false;
    // Walk accessible same-origin ancestor frames; any cross-origin boundary or
    // sandboxed frame omitting allow-downloads blocks programmatic <a download>.
    let cur = window;
    while (cur !== cur.parent) {
      try {
        const fe = cur.frameElement;
        if (!fe) return true;
        if (fe.hasAttribute('sandbox') && !fe.sandbox?.contains('allow-downloads')) {
          return true;
        }
        cur = cur.parent;
      } catch {
        return true;
      }
    }
    return false;
  }

  function closeGifModal() {
    const modal = $('gif-modal');
    if (modal) modal.classList.add('hidden');
    const img = $('gif-modal-img');
    if (img) img.removeAttribute('src');
    const open = $('gif-modal-open');
    if (open) open.removeAttribute('href');
    if (activeGifModalUrl) {
      try { URL.revokeObjectURL(activeGifModalUrl); } catch {}
      activeGifModalUrl = null;
    }
  }

  function showGifModal(blob, filename, title, metaText) {
    closeGifModal();
    const url = URL.createObjectURL(blob);
    activeGifModalUrl = url;
    const modal = $('gif-modal');
    if (!modal) {
      URL.revokeObjectURL(url);
      activeGifModalUrl = null;
      return false;
    }
    const titleEl = $('gif-modal-title');
    if (titleEl) titleEl.textContent = filename;
    const metaEl = $('gif-modal-meta');
    if (metaEl) metaEl.textContent = metaText;
    const img = $('gif-modal-img');
    if (img) {
      img.src = url;
      img.alt = `${title} graph replay`;
    }
    const open = $('gif-modal-open');
    if (open) open.href = url;
    modal.classList.remove('hidden');
    $('gif-modal-close')?.focus();
    return true;
  }

  function resolveGraphTheme() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    document.documentElement.appendChild(probe);
    const read = (expr, fallback) => {
      probe.style.color = '';
      probe.style.color = expr;
      return getComputedStyle(probe).color || fallback;
    };
    const fallbackFont = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    probe.style.fontFamily = `var(--sw-font, ${fallbackFont})`;
    const computedFont = getComputedStyle(probe).fontFamily;
    const font = computedFont && !computedFont.includes('var(') ? computedFont : fallbackFont;
    const theme = {
      bg: read('var(--sw-bg, #f7f7f8)', '#f7f7f8'),
      fg: read('var(--sw-fg, #1d1f21)', '#1d1f21'),
      fg2: read('var(--sw-fg-2, #3d4348)', '#3d4348'),
      muted: read('var(--sw-fg-muted, #5d676f)', '#5d676f'),
      faint: read('var(--sw-fg-faint, #9da5ab)', '#9da5ab'),
      fill: read('var(--sw-fill, rgba(29,31,33,0.06))', 'rgba(29,31,33,0.06)'),
      line: read('var(--sw-line, rgba(29,31,33,0.08))', 'rgba(29,31,33,0.08)'),
      track: read('color-mix(in srgb, var(--sw-fg, #1d1f21) 12%, transparent)', 'rgba(29,31,33,0.12)'),
      success: read('var(--sw-success, #63984f)', '#63984f'),
      nodeBorder: read('color-mix(in srgb, var(--sw-fg, #1d1f21) 22%, transparent)', 'rgba(29,31,33,0.22)'),
      ringStroke: read('color-mix(in srgb, var(--sw-fg, #1d1f21) 30%, transparent)', 'rgba(29,31,33,0.30)'),
      bcastBorder: read('color-mix(in srgb, var(--sw-fg, #1d1f21) 18%, transparent)', 'rgba(29,31,33,0.18)'),
      arrow: read('color-mix(in srgb, var(--sw-fg, #1d1f21) 45%, transparent)', 'rgba(29,31,33,0.45)'),
      font,
    };
    probe.remove();
    return theme;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function fitCanvasText(ctx, text, maxW) {
    const s = String(text || '');
    if (maxW <= 0) return '';
    if (ctx.measureText(s).width <= maxW) return s;
    const ell = '…';
    const ellW = ctx.measureText(ell).width;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (ctx.measureText(s.slice(0, mid)).width + ellW <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return lo > 0 ? s.slice(0, lo) + ell : '';
  }

  function formatGifRecipients(m, roster = members()) {
    const names = collapseRecipientGroups((m.mentions || []).filter((n) => n !== m.agent), roster);
    const parts = names.map((n) => `@${n}`);
    for (const c of m.channel_mentions || []) parts.push(`@#${c}`);
    if (m.all) parts.push('@all');
    return parts.join(' ');
  }

  function snippetOfPost(m) {
    const hasTargets = ((m.mentions || []).some((n) => n !== m.agent)) || m.all;
    const raw = hasTargets ? stripLeadingMentions(m.text) : String(m.text || '');
    return raw.replace(/\s+/g, ' ').trim();
  }

  function drawGraphFrame(ctx, {
    width, height, headerH, footerH, graphOffsetY, scale,
    theme, title, g, roster, expandAll, totalPosts, memberCount, totalDurMs,
    dotT, stepLabel, isOverview,
  }) {
    ctx.save();
    ctx.scale(scale, scale);

    // Solid themed background.
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    // Header bar: swarm title + step counter.
    const padX = 16;
    ctx.font = `500 11px ${theme.font}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    const stepW = ctx.measureText(stepLabel).width;
    ctx.fillText(stepLabel, width - padX, headerH / 2);

    ctx.font = `600 13px ${theme.font}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.fg;
    const maxTitleW = Math.max(40, width - padX * 2 - stepW - 14);
    ctx.fillText(fitCanvasText(ctx, title, maxTitleW), padX, headerH / 2);

    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH - 0.5);
    ctx.lineTo(width, headerH - 0.5);
    ctx.stroke();

    // Graph area.
    ctx.save();
    ctx.translate(0, graphOffsetY);
    const { nodes, pos, edges, unaddressed, broadcasts, current, curTargets, max, isActive, isCur, replaying } = g;

    // 1. Edges + arrowheads (and collect edge counts & travelling dots).
    const countLabels = [];
    const movingDots = [];
    for (const [k, e] of edges) {
      const [from, to] = k.split('>');
      const a = pos.get(from), b = pos.get(to);
      if (!a || !b) continue;
      const n = e.direct + e.viaAll;
      const geom = edgeGeom(a, b);
      const w = 1 + (3 * n) / max;
      const cur = isCur(from, to);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(geom.start.x, geom.start.y);
      ctx.quadraticCurveTo(geom.mx, geom.my, geom.end.x, geom.end.y);
      ctx.strokeStyle = theme.fg;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      if (!e.direct) ctx.setLineDash([4, 4]);
      ctx.globalAlpha = cur ? 0.85 : (replaying ? 0.12 : (e.direct ? 0.28 : 0.18));
      ctx.stroke();
      ctx.restore();

      // Arrowhead matching <marker id="arrow">.
      const ang = Math.atan2(geom.end.y - geom.my, geom.end.x - geom.mx);
      ctx.save();
      ctx.translate(geom.end.x, geom.end.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-6, -3.04);
      ctx.lineTo(0.4, 0);
      ctx.lineTo(-6, 3.04);
      ctx.quadraticCurveTo(-4.72, 0, -6, -3.04);
      ctx.closePath();
      if (cur) {
        ctx.fillStyle = theme.fg;
        ctx.globalAlpha = 0.85;
      } else {
        ctx.fillStyle = theme.arrow;
        ctx.globalAlpha = replaying ? 0.4 : 1;
      }
      ctx.fill();
      ctx.restore();

      if (n > 1) countLabels.push({ x: geom.mx, y: geom.my, text: String(n) });
      if (cur && dotT !== null) movingDots.push(geom);
    }

    // 2. Nodes.
    for (const n of nodes) {
      const p = pos.get(n.id);
      const status = n.m?.status || '';
      const dotX = p.x - p.w / 2 + 14;
      const labelX = status ? dotX + 9 : p.x - p.w / 2 + 12;
      const maxChars = Math.max(4, Math.floor((p.x + p.w / 2 - 10 - labelX) / 6.8));
      const label = n.id.length > maxChars ? n.id.slice(0, maxChars - 1) + '…' : n.id;
      const hot = !!current && (n.id === current.agent || curTargets.has(n.id));
      const ring = unaddressed.get(n.id);
      const bcast = expandAll ? 0 : broadcasts.get(n.id) || 0;
      const killed = status === 'killed';
      const outsider = !n.m;

      ctx.save();
      if (!isActive(n.id)) ctx.globalAlpha = 0.2;

      if (ring) {
        ctx.save();
        roundRectPath(ctx, p.x - p.w / 2 - 4, p.y - p.h / 2 - 4, p.w + 8, p.h + 8, p.h / 2 + 4);
        ctx.strokeStyle = theme.ringStroke;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2.5]);
        ctx.stroke();
        ctx.restore();
      }

      roundRectPath(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, p.h / 2);
      ctx.fillStyle = theme.bg;
      ctx.fill();
      if (hot) {
        ctx.fillStyle = theme.fill;
        ctx.fill();
      }
      ctx.save();
      ctx.strokeStyle = hot ? theme.fg : theme.nodeBorder;
      ctx.lineWidth = hot ? 1.5 : 1;
      if (outsider) ctx.setLineDash([3, 2]);
      else if (killed) ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.restore();

      if (status) {
        ctx.beginPath();
        ctx.arc(dotX, p.y, 3.25, 0, Math.PI * 2);
        if (status === 'working') {
          ctx.fillStyle = theme.success;
          ctx.fill();
        } else if (status === 'waiting') {
          ctx.strokeStyle = theme.faint;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (status === 'killed') {
          ctx.fillStyle = theme.faint;
          ctx.fill();
        }
      }

      ctx.font = `500 12px ${theme.font}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = killed ? theme.muted : theme.fg;
      ctx.fillText(label, labelX, p.y + 0.5);
      if (killed) {
        const tw = ctx.measureText(label).width;
        ctx.strokeStyle = theme.muted;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(labelX, p.y + 0.5);
        ctx.lineTo(labelX + tw, p.y + 0.5);
        ctx.stroke();
      }

      if (bcast) {
        const bw = 30 + 6 * String(bcast).length;
        const bx = p.x + p.w / 2 - bw + 6;
        const by = p.y - p.h / 2 - 7;
        roundRectPath(ctx, bx, by, bw, 14, 7);
        ctx.fillStyle = theme.bg;
        ctx.fill();
        ctx.strokeStyle = theme.bcastBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = `600 9px ${theme.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = theme.muted;
        ctx.fillText(`@all ${bcast}`, bx + bw / 2, by + 7.5);
      }

      ctx.restore();
    }

    // 3. Edge counts with background halo.
    if (countLabels.length) {
      ctx.font = `500 10px ${theme.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = theme.bg;
      ctx.fillStyle = theme.muted;
      for (const c of countLabels) {
        ctx.strokeText(c.text, c.x, c.y + 0.5);
        ctx.fillText(c.text, c.x, c.y + 0.5);
      }
    }

    // 4. Travelling message dots along current edges.
    for (const geom of movingDots) {
      const t = dotT;
      const u = 1 - t;
      const dx = u * u * geom.start.x + 2 * u * t * geom.mx + t * t * geom.end.x;
      const dy = u * u * geom.start.y + 2 * u * t * geom.my + t * t * geom.end.y;
      if (t < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(dx, dy, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = theme.fg;
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = theme.fg;
      ctx.fill();
      ctx.strokeStyle = theme.bg;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    // Footer bar: progress strip + single-line post caption.
    const footY = height - footerH;
    const pct = totalPosts > 0 ? Math.min(1, g.upto / totalPosts) : (isOverview ? 1 : 0);
    ctx.fillStyle = theme.track;
    ctx.fillRect(0, footY, width, 2);
    if (pct > 0) {
      ctx.fillStyle = theme.fg2;
      ctx.fillRect(0, footY, Math.round(width * pct), 2);
    }

    const capY = footY + 2 + (footerH - 2) / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let x = padX;
    const maxRight = width - padX;
    if (current) {
      const sender = `@${current.agent}`;
      ctx.font = `600 11.5px ${theme.font}`;
      ctx.fillStyle = theme.fg;
      ctx.fillText(sender, x, capY);
      x += ctx.measureText(sender).width;

      const recips = formatGifRecipients(current, roster);
      const snippet = snippetOfPost(current);
      const rest = [recips ? ` → ${recips}` : '', snippet ? ` · ${snippet}` : ''].join('');
      if (rest && x < maxRight - 10) {
        ctx.font = `400 11.5px ${theme.font}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText(fitCanvasText(ctx, rest, maxRight - x), x, capY);
      }
    } else if (isOverview) {
      ctx.font = `400 11.5px ${theme.font}`;
      ctx.fillStyle = theme.muted;
      const summary = `${plural(totalPosts, 'post')} · ${plural(memberCount, 'member')}` +
        (totalDurMs > 0 ? ` · ${fmtDur(totalDurMs)}` : '');
      ctx.fillText(fitCanvasText(ctx, summary, maxRight - x), x, capY);
    } else {
      ctx.font = `400 11.5px ${theme.font}`;
      ctx.fillStyle = theme.muted;
      ctx.fillText(fitCanvasText(ctx, `Swarm start · ${plural(memberCount, 'member')}`, maxRight - x), x, capY);
    }

    ctx.restore();
  }

  function gifFilename(title) {
    const slug = String(title || 'swarm')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return `${slug || 'swarm'}-graph.gif`;
  }

  async function exportGraphGif() {
    if (exportingGif) return;
    const s = state.snap;
    if (!s || !window.SwarmGif?.createEncoder) return;

    const btn = $('graph-export-gif');
    const lbl = $('graph-export-gif-label');
    exportingGif = true;
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = 'Exporting…';

    let popup = null;
    try {
      const expandAll = $('g-all').checked;
      const hideInactive = $('g-hide-inactive')?.checked || false;
      const speed = parseFloat($('replay-speed').value) || 1;
      // Pin roster and messages to the starting snapshot so poll() updates
      // during async encoding yields cannot mutate Pass 2 mid-animation.
      const roster = (s.members || []).map((m) => ({ ...m }));
      const snap = { ...s, members: roster };
      const all = (s.messages || []).filter((m) => !isControl(m) && !isRoleWorker(m.agent, roster));
      const svgWidth = $('graph')?.clientWidth || 0;
      const logicalW = Math.min(720, Math.max(520, Math.round(svgWidth || 640)));
      const title = s.title || 'Untitled swarm';
      const filename = gifFilename(title);
      const theme = resolveGraphTheme();
      const graphOpts = { expandAll, hideInactive, width: logicalW };

      // Cap sampled replay steps on huge swarms so the GIF stays watchable and
      // encodes quickly while preserving the full start-to-finish arc.
      const MAX_REPLAY_STEPS = 200;
      const stepKs = [];
      if (all.length <= MAX_REPLAY_STEPS) {
        for (let k = 1; k <= all.length; k++) stepKs.push(k);
      } else {
        for (let i = 0; i < MAX_REPLAY_STEPS; i++) {
          const k = Math.max(1, Math.min(all.length, Math.round(1 + (i * (all.length - 1)) / (MAX_REPLAY_STEPS - 1))));
          if (stepKs[stepKs.length - 1] !== k) stepKs.push(k);
        }
      }

      // Adaptive dot sub-frames keep small replays silky and large swarms fast.
      const dotTs = all.length <= 25 ? [0.08, 0.30, 0.56, 0.80, 1.0] :
                    all.length <= 60 ? [0.18, 0.58, 1.0] :
                    all.length <= 150 ? [0.45, 1.0] : [1.0];

      // Single O(N) planning pass: find max canvas height across steps (Hide
      // inactive can grow the node count) and build lightweight frame descriptors.
      const planAcc = createGraphAccumulator(snap, all, graphOpts);
      const plan = [];
      let maxGraphH = 0;
      const memberCount = roster.filter((m) => !isRoleWorker(m, roster)).length;

      if (all.length === 0) {
        const overview = planAcc.snapshot({ replaying: false });
        if (overview.nodes.length === 0) {
          toast('Nothing to export yet.');
          return;
        }
        maxGraphH = overview.height;
        plan.push({ k: 0, isOverview: true, dotT: null, stepLabel: 'Overview', delayMs: 1000 });
      } else {
        const startSnap = planAcc.snapshot({ replaying: true });
        maxGraphH = startSnap.height;
        plan.push({
          k: 0,
          isOverview: false,
          dotT: null,
          stepLabel: `0 / ${all.length}`,
          delayMs: Math.round(Math.min(800, Math.max(220, 600 / speed))),
        });

        for (let idx = 0; idx < stepKs.length; idx++) {
          const k = stepKs[idx];
          planAcc.advanceTo(k);
          const g = planAcc.snapshot({ replaying: true });
          if (g.height > maxGraphH) maxGraphH = g.height;
          const cur = g.current;
          const rawDelay = replayDelay(all, k);
          const postMs = Math.round(Math.min(2200, Math.max(240, rawDelay)));
          const stepLabel = `${k} / ${all.length} · #${cur.seq}`;
          let hasCurEdge = false;
          if (dotTs.length > 1) {
            for (const [key] of g.edges) {
              const [from, to] = key.split('>');
              if (g.isCur(from, to) && g.pos.has(from) && g.pos.has(to)) {
                hasCurEdge = true;
                break;
              }
            }
          }
          if (hasCurEdge) {
            const travelTotal = Math.min(Math.round(postMs * 0.58), 520);
            const subDelay = Math.max(60, Math.round(travelTotal / (dotTs.length - 1)));
            for (let i = 0; i < dotTs.length - 1; i++) {
              plan.push({ k, isOverview: false, dotT: dotTs[i], stepLabel, delayMs: subDelay });
            }
            const holdDelay = Math.max(140, postMs - subDelay * (dotTs.length - 1));
            plan.push({ k, isOverview: false, dotT: 1.0, stepLabel, delayMs: holdDelay });
          } else {
            plan.push({ k, isOverview: false, dotT: 1.0, stepLabel, delayMs: postMs });
          }
        }

        planAcc.advanceTo(all.length);
        const overview = planAcc.snapshot({ replaying: false });
        if (overview.height > maxGraphH) maxGraphH = overview.height;
        plan.push({
          k: all.length,
          isOverview: true,
          dotT: null,
          stepLabel: 'Overview',
          delayMs: Math.round(Math.min(2000, Math.max(900, 1800 / Math.min(speed, 2)))),
        });
      }

      // Host sidecar iframes omit allow-downloads but grant allow-popups +
      // allow-popups-to-escape-sandbox. Open an unsandboxed tab synchronously
      // inside this click handler before async yields consume user activation.
      const sandboxed = isDownloadSandboxed();
      if (sandboxed) {
        try {
          popup = window.open('', '_blank');
        } catch {
          popup = null;
        }
        if (popup) {
          try {
            const doc = popup.document;
            doc.title = `Exporting ${filename}…`;
            doc.body.style.cssText =
              `margin:0;min-height:100vh;display:grid;place-items:center;` +
              `background:${theme.bg};color:${theme.fg};font:13px/1.5 ${theme.font};`;
            doc.body.textContent = `Rendering ${filename}…`;
          } catch {
            try { popup.close(); } catch {}
            popup = null;
          }
        }
      }

      const headerH = 36;
      const footerH = 34;
      const padY = 8;
      const logicalH = Math.ceil(headerH + padY * 2 + maxGraphH + footerH);
      // Cap total canvas height for very large swarms so encoding stays fast.
      const scale = logicalH > 900 ? 900 / logicalH : 1;
      const canvasW = Math.max(1, Math.round(logicalW * scale));
      const canvasH = Math.max(1, Math.round(logicalH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      const totalDurMs = all.length > 1 ? Math.max(0, (msgMs(all[all.length - 1]) || 0) - (msgMs(all[0]) || 0)) : 0;

      const renderDescriptor = (f, g) => {
        drawGraphFrame(ctx, {
          width: logicalW,
          height: logicalH,
          headerH,
          footerH,
          graphOffsetY: headerH + padY + (maxGraphH - g.height) / 2,
          scale,
          theme,
          title,
          g,
          roster,
          expandAll,
          totalPosts: all.length,
          memberCount,
          totalDurMs,
          dotT: f.dotT,
          stepLabel: f.stepLabel,
          isOverview: f.isOverview,
        });
        return ctx.getImageData(0, 0, canvasW, canvasH).data;
      };

      // Pass 1: build the global palette from at most 10 evenly spaced sample
      // frames (always including start, an active travelling-dot frame if any,
      // and the final Overview), then drop the sample buffers before streaming.
      const sampleIdxSet = new Set([0, plan.length - 1]);
      const movingIdx = plan.findIndex((f) => f.dotT !== null && f.dotT < 1);
      if (movingIdx >= 0) sampleIdxSet.add(movingIdx);
      const sampleCap = Math.min(plan.length, 10);
      for (let i = 1; i < sampleCap - 1; i++) {
        sampleIdxSet.add(Math.round((i * (plan.length - 1)) / (sampleCap - 1)));
      }
      const sampleIndices = [...sampleIdxSet].sort((a, b) => a - b);
      const sampleAcc = createGraphAccumulator(snap, all, graphOpts);
      const sampleFrames = [];
      for (const idx of sampleIndices) {
        const f = plan[idx];
        sampleAcc.advanceTo(f.k);
        const g = sampleAcc.snapshot({ replaying: !f.isOverview });
        sampleFrames.push(new Uint8Array(renderDescriptor(f, g)));
      }

      const enc = window.SwarmGif.createEncoder({
        width: canvasW,
        height: canvasH,
        sampleFrames,
        repeat: 0,
        useDelta: plan.length > 1,
      });

      let bytes;
      if (plan.length === 1) {
        enc.addFrame(sampleFrames[0], plan[0].delayMs);
        sampleFrames.length = 0;
        bytes = enc.finish();
      } else {
        sampleFrames.length = 0;
        // Pass 2: stream render + LZW encode one frame at a time (O(1) RGBA RAM)
        // and yield to the event loop every ~16ms so the UI stays responsive.
        const streamAcc = createGraphAccumulator(snap, all, graphOpts);
        let curK = -1;
        let curOverview = null;
        let curG = null;
        let lastYield = performance.now();

        for (let i = 0; i < plan.length; i++) {
          const f = plan[i];
          if (f.k !== curK || f.isOverview !== curOverview) {
            streamAcc.advanceTo(f.k);
            curG = streamAcc.snapshot({ replaying: !f.isOverview });
            curK = f.k;
            curOverview = f.isOverview;
          }
          const rgba = renderDescriptor(f, curG);
          enc.addFrame(rgba, f.delayMs);

          if (i + 1 < plan.length && performance.now() - lastYield >= 16) {
            if (lbl) lbl.textContent = `Exporting ${Math.round(((i + 1) / plan.length) * 100)}%`;
            await new Promise((r) => setTimeout(r, 0));
            lastYield = performance.now();
          }
        }
        bytes = enc.finish();
      }

      const blob = new Blob([bytes], { type: 'image/gif' });
      const metaSummary = `${plural(plan.length, 'frame')}, ${fmtBytes(bytes.length)}`;
      if (!sandboxed) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        toast(`Exported ${filename} (${metaSummary})`);
      } else {
        let deliveredInPopup = false;
        if (popup && !popup.closed) {
          try {
            const doc = popup.document;
            const urlApi = popup.URL || URL;
            const popupUrl = urlApi.createObjectURL(blob);
            doc.title = filename;
            doc.body.textContent = '';
            doc.body.style.cssText =
              `margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;` +
              `justify-content:center;gap:12px;padding:20px;box-sizing:border-box;` +
              `background:${theme.bg};color:${theme.fg};font:13px/1.5 ${theme.font};`;

            const img = doc.createElement('img');
            img.src = popupUrl;
            img.alt = `${title} graph replay`;
            img.style.cssText =
              `max-width:100%;height:auto;border-radius:8px;border:1px solid ${theme.line};display:block;`;

            const bar = doc.createElement('div');
            bar.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;';

            const link = doc.createElement('a');
            link.href = popupUrl;
            link.download = filename;
            link.textContent = `Download ${filename}`;
            link.style.cssText =
              `display:inline-flex;align-items:center;padding:6px 12px;border-radius:6px;` +
              `background:${theme.fg};color:${theme.bg};text-decoration:none;font-weight:500;font-size:12px;`;

            const meta = doc.createElement('span');
            meta.textContent = `${plural(plan.length, 'frame')} · ${fmtBytes(bytes.length)}`;
            meta.style.cssText = `color:${theme.muted};font-size:12px;`;

            bar.append(link, meta);
            doc.body.append(img, bar);
            popup.addEventListener('pagehide', () => {
              try { urlApi.revokeObjectURL(popupUrl); } catch {}
            }, { once: true });
            // Trigger from the unsandboxed popup window so Blink sees an
            // unsandboxed browsing context (rather than this iframe).
            if (typeof popup.setTimeout === 'function') {
              popup.setTimeout(() => link.click(), 0);
            } else {
              link.click();
            }
            deliveredInPopup = true;
            toast(`Exported ${filename} (${metaSummary})`);
          } catch {
            try { popup.close(); } catch {}
          }
        }
        if (!deliveredInPopup) {
          const metaText = `${plural(plan.length, 'frame')} · ${fmtBytes(bytes.length)}`;
          if (showGifModal(blob, filename, title, metaText)) {
            toast(`GIF ready (${metaSummary}) — right-click image to save.`);
          } else {
            toast('Could not download GIF from embedded pane.');
          }
        }
      }
    } catch (e) {
      if (popup && !popup.closed) {
        try { popup.close(); } catch {}
      }
      console.warn('[swarm_board] GIF export failed:', e);
      toast('Could not export GIF.');
    } finally {
      exportingGif = false;
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = 'Export GIF';
    }
  }

  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function renderRaw() {
    const s = state.snap;
    const text = s.raw?.[state.rawKind] ?? '';
    const file = { members: 'members.json', board: 'board.jsonl', view: 'view.json' }[state.rawKind] || '';
    const lines = text ? text.split('\n').filter(Boolean).length : 0;
    const dir = state.rawKind === 'view' ? s.view?.dir || s.dir : s.dir;
    const path = dir ? `${dir}/${file}` : file;
    // The path ellipsizes from the left (dir=rtl) so the file name stays visible.
    $('raw-meta').innerHTML = `<span class="path" title="${esc(path)}"><span dir="ltr">${esc(path)}</span></span>` +
        `<span class="size">· ${esc(fmtBytes(text.length))}${state.rawKind === 'board' ? ` · ${plural(lines, 'line')}` : ''}</span>`;
    const shown = text || '(empty)';
    // Avoid resetting the user's text selection when nothing changed.
    if ($('raw').textContent !== shown) $('raw').textContent = shown;
    document.querySelectorAll('.raw-btn').forEach((b) => {
      const on = b.dataset.raw === state.rawKind;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // ---------- overview (narrator) ----------
  // Must match main.mjs ROLE_WORKER_RE: role workers are recognised
  // generically by m.role (anything other than 'worker' and 'coordinator'),
  // with a name regex fallback for older boards.
  const ROLE_WORKER_RE = /^(?:narrator|monitor)(?:-\d+)?$/;
  const roleOf = (m) => {
    if (!m || typeof m !== 'object') return '';
    if (m.role && m.role !== 'worker') return m.role;
    const match = String(m.name ?? '').match(/^(narrator|monitor)(?:-\d+)?$/);
    return match ? match[1] : m.role || '';
  };
  const isRoleWorker = (m, roster = members()) => {
    if (typeof m === 'string') {
      const list = Array.isArray(roster) ? roster : members();
      m = list.find((mem) => mem.name === m) || { name: m };
    }
    if (!m || typeof m !== 'object') return false;
    return Boolean(
      m.roleWorker ||
      (m.role && m.role !== 'worker' && m.role !== 'coordinator') ||
      ROLE_WORKER_RE.test(String(m.name ?? ''))
    );
  };
  const WATCHDOG_MS = 3000;          // READY / RENDERED deadline while visible
  const FRAME_MSG_MAX = 8 * 1024;    // largest message accepted from the frame
  const ITEM_ID_RE = /^[a-z0-9-]{1,40}$/;
  const STALE_LAG = 10;              // posts behind before the view is stale
  const STALE_IDLE_MS = 60 * 1000;   // ...or idle this long with unread posts
  const WS_STATES = ['active', 'blocked', 'review', 'queued', 'done', 'failed'];
  const ATT_KINDS = ['decision', 'failure', 'review', 'stuck', 'quota', 'error', 'fyi'];
  const SEVERITIES = ['high', 'med', 'low'];
  const FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
      "img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; " +
      "form-action 'none'; base-uri 'none'";
  const FRAME_INBOUND = new Set(['READY', 'RENDERED', 'ERROR', 'NAVIGATE', 'FEEDBACK_INTENT']);
  // Host theme tokens handed to the frame, each with the local token that
  // carries its standalone fallback.
  const THEME_TOKENS = [
    ['--background', '--sw-bg'], ['--foreground', '--sw-fg'], ['--card', '--sw-card'],
    ['--card-foreground', '--sw-fg'], ['--card-border', '--sw-card-border'], ['--border', '--sw-border'],
    ['--primary', '--sw-primary'], ['--primary-foreground', '--sw-primary-fg'],
    ['--secondary', '--sw-secondary'], ['--secondary-foreground', '--sw-fg-2'],
    ['--muted', '--sw-muted'], ['--muted-foreground', '--sw-fg-muted'],
    ['--accent', '--sw-fill'], ['--accent-foreground', '--sw-fg'], ['--error', '--sw-error'],
    ['--placeholder', '--sw-fg-faint'], ['--code-foreground', '--sw-fg'], ['--ring', '--sw-ring'],
    ['--font-family', '--sw-font'], ['--editor-font-family', '--sw-mono'],
  ];
  const PLAIN_KEY = 'swarm_board.narrator_plain';
  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch {
      // Storage can be unavailable in the host's iframe; the toggle still works for this load.
    }
  }
  // The Overview drawn here is the default; the narrator's own page (view.html
  // in the sandboxed frame) is opt-in and remembered.
  const prefs = { plain: params.get('narrator') !== 'frame' && lsGet(PLAIN_KEY) !== '0' };

  // ----- view.json validation (the file is untrusted, whoever wrote it) -----
  const str = (v, max) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').slice(0, max).trim();
  const list = (v, max) => (Array.isArray(v) ? v.slice(0, max).filter((x) => x && typeof x === 'object') : []);
  const posInt = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

  // `url` actions open only https links on the hosts main.mjs lists in
  // snap.urlHosts (or their subdomains).
  function hostAllowed(host, snap) {
    const h = host.toLowerCase();
    return Array.isArray(snap.urlHosts) && snap.urlHosts.some((d) => h === d || h.endsWith(`.${d}`));
  }

  // A navigation action checked against the current snapshot, or null. Used
  // for actions listed in view.json and for NAVIGATE messages alike.
  function checkAction(a, snap) {
    if (!a || typeof a !== 'object' || !snap) return null;
    const label = str(a.label, 60);
    switch (a.type) {
      case 'open_conv': {
        const m = typeof a.target === 'string' ? snap.members.find((x) => x.name === a.target) : null;
        return m?.conversation_id ? { type: 'open_conv', target: m.name, label: label || `Open ${m.name}` } : null;
      }
      case 'board_post': {
        const seq = typeof a.target === 'string' && /^\d{1,9}$/.test(a.target) ? Number(a.target) : a.target;
        return posInt(seq) && seq <= snap.head ? { type: 'board_post', target: seq, label: label || `#${seq}` } : null;
      }
      case 'url': {
        if (typeof a.target !== 'string' || a.target.length > 2048) return null;
        let u;
        try {
          u = new URL(a.target);
        } catch {
          return null;
        }
        if (u.protocol !== 'https:' || u.username || u.password || !hostAllowed(u.hostname, snap)) return null;
        return { type: 'url', target: u.href, label: label || u.hostname };
      }
      case 'file': {
        // Only exact paths main.mjs canonicalized (under <appData>/brain/).
        const files = snap.allowedFiles || {};
        if (typeof a.target !== 'string' || !Object.hasOwn(files, a.target)) return null;
        return { type: 'file', target: a.target, label: label || a.target.split('/').pop() };
      }
      default:
        return null;
    }
  }

  function cleanRefs(refs, snap) {
    const out = [];
    for (const r of list(refs, 12)) {
      if (posInt(r.seq)) out.push({ seq: r.seq, unverified: r.seq > snap.head });
      else if (typeof r.member === 'string' && r.member) {
        const name = str(r.member, 60);
        out.push({ member: name, unverified: !snap.members.some((m) => m.name === name) });
      }
    }
    return out;
  }

  // The validated copy of view.json that both the plain view and the frame
  // get: closed enums, clamped strings and lists, actions that pass
  // checkAction, refs marked unverified (seq past the head, or not on the
  // roster) and items with no ref marked uncited. Returns {view, ids}.
  function sanitizeView(v, snap) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const ids = new Set();
    const itemId = (x) => {
      const id = typeof x === 'string' && ITEM_ID_RE.test(x) ? x : '';
      if (id) ids.add(id);
      return id;
    };
    const actions = (as) => list(as, 6).map((a) => checkAction(a, snap)).filter(Boolean);
    const base = (it) => {
      const refs = cleanRefs(it.refs, snap);
      return { id: itemId(it.id), refs, uncited: refs.length === 0, actions: actions(it.actions) };
    };
    const rank = (arr, x) => (arr.includes(x) ? arr.indexOf(x) : arr.length);
    const attention = list(v.attention, 30).map((a) => ({
      ...base(a),
      kind: ATT_KINDS.includes(a.kind) ? a.kind : 'fyi',
      severity: SEVERITIES.includes(a.severity) ? a.severity : 'low',
      title: str(a.title, 200),
      why: str(a.why, 400),
    })).filter((a) => a.title);
    // Ranked decision > failure > review > stuck > quota/error > fyi, then by severity.
    attention.sort((a, b) => rank(ATT_KINDS, a.kind) - rank(ATT_KINDS, b.kind) ||
        rank(SEVERITIES, a.severity) - rank(SEVERITIES, b.severity));
    const workstreams = list(v.workstreams, 40).map((w) => ({
      ...base(w),
      title: str(w.title, 160),
      owners: (Array.isArray(w.owners) ? w.owners.slice(0, 8) : []).map((o) => str(o, 60)).filter(Boolean),
      state: WS_STATES.includes(w.state) ? w.state : 'queued',
      note: str(w.note, 300),
    })).filter((w) => w.title);
    const textItems = (arr) => list(arr, 30).map((m) => ({ ...base(m), text: str(m.text, 300) })).filter((m) => m.text);
    const phase = v.phase && typeof v.phase === 'object' ? {
      label: str(v.phase.label, 40),
      index: posInt(v.phase.index),
      total: posInt(v.phase.total),
    } : null;
    const ack = v.feedback_ack && typeof v.feedback_ack === 'object' ? {
      through_seq: posInt(v.feedback_ack.through_seq),
      text: str(v.feedback_ack.text, 300),
    } : null;
    return {
      ids,
      view: {
        version: posInt(v.version) || 1,
        as_of_seq: posInt(v.as_of_seq),
        updated_at: str(v.updated_at, 40),
        headline: str(v.headline, 300),
        phase: phase?.label ? phase : null,
        attention,
        workstreams,
        milestones: textItems(v.milestones),
        risks: textItems(v.risks),
        feedback_ack: ack?.text ? ack : null,
      },
    };
  }

  // ----- overview state -----
  const ov = {
    model: null,       // sanitizeView() of the current view.json
    bootstrap: null,   // narrator_bootstrap.js source, once fetched
  };
  const narratorOf = () => state.snap?.narrator || null;
  const liveNarrator = () => !!narratorOf() && !['absent', 'killed'].includes(state.snap.narratorState);
  // The pane opens on the Overview where the built-in Overview is on
  // (enable-swarm-overview), else once a live narrator has published a view.json.
  const hasOverview = () => !!state.snap?.builtinOverview || (liveNarrator() && !!ov.model);
  // The Overview tab exists where the built-in Overview is on, else once the
  // narrator has written a view.json or view.html; otherwise the pane is the plain Board.
  const viewExists = () => !!state.snap?.view?.exists;
  const overviewOn = () => !!state.snap?.builtinOverview || viewExists();
  // The Graph and Raw tabs exist only where their flags are on
  // (enable-swarm-graph-tab, enable-swarm-raw-tab).
  const graphOn = () => !!state.snap?.graphTab;
  const rawOn = () => !!state.snap?.rawTab;
  const coordinatorConv = () => {
    const s = state.snap;
    return s?.members.find((m) => m.role === 'coordinator')?.conversation_id || s?.id || '';
  };

  function autoSelectTab() {
    const on = overviewOn();
    $('tabbtn-overview').classList.toggle('hidden', !on);
    $('tabbtn-graph').classList.toggle('hidden', !graphOn());
    $('tabbtn-raw').classList.toggle('hidden', !rawOn());
    $('raw-btn-view').classList.toggle('hidden', !viewExists());
    if (!viewExists() && state.rawKind === 'view') {
      state.rawKind = 'members';
      renderRaw();
    }
    if ((!on && state.tab === 'overview') || (!graphOn() && state.tab === 'graph') ||
        (!rawOn() && state.tab === 'raw')) {
      selectTab('feed');
      return;
    }
    if (state.tabChosen) return;
    const want = hasOverview() ? 'overview' : 'feed';
    if (state.tab !== want) selectTab(want);
  }

  function noticeHtml() {
    const s = state.snap;
    const n = s?.narrator;
    if (!s) return '';
    if (s.narratorState === 'absent') return 'No narrator in this swarm. Ask the coordinator to add one.';
    if (s.narratorState === 'killed') {
      return `The narrator (<b>${esc(n.name)}</b>) was stopped. Ask the coordinator to add a new one ` +
          `(<code>${esc(nextNarratorName())}</code>).`;
    }
    if (!ov.model) {
      if (s.view?.jsonError === 'too_large') return 'The narrator\'s view.json is over 64 KB, so it isn\'t shown.';
      if (s.view?.jsonError === 'invalid') return 'The narrator\'s view.json isn\'t valid JSON yet.';
      return 'The narrator hasn\'t published an overview yet.';
    }
    return '';
  }

  function nextNarratorName() {
    let max = 0;
    for (const m of members()) {
      const g = m.name.match(/^narrator(?:-(\d+))?$/);
      if (g) max = Math.max(max, g[1] ? Number(g[1]) : 1);
    }
    return `narrator-${max + 1}`;
  }

  const ago = (ms) => (Number.isFinite(ms) && ms > 0 ? `${fmtDur(Date.now() - ms)} ago` : '');
  const STATE_BADGE = {
    working: ['updating', 'The narrator is updating the overview'],
    waiting: ['watching', 'The narrator is waiting for new board posts'],
    killed: ['stopped', 'The narrator was killed; the overview no longer updates'],
  };

  // The trusted chrome around the view: narrator status, freshness, system
  // items, notices, footer. Cheap; re-run on the ticker for the clocks.
  function renderOverviewChrome() {
    const s = state.snap;
    if (!s || !overviewOn()) return;
    const n = s.narrator;
    const v = ov.model?.view;
    // Status line.
    let status = '';
    if (n) {
      const [label, tip] = s.narratorState === 'paused'
        ? [`paused: ${n.reason === 'quota' ? 'quota' : 'error'}`, `The narrator's last step failed: ${n.detail}`]
        : STATE_BADGE[s.narratorState] || ['', ''];
      const read = Math.max(v?.as_of_seq || 0, n.last_read_seq || 0);
      const lag = Math.max(0, s.head - read);
      const idle = Date.now() - (n.transcriptMtime || 0);
      const stale = !!v && s.narratorState !== 'working' &&
          (lag >= STALE_LAG || (lag > 0 && idle > STALE_IDLE_MS));
      const updated = ago(s.view?.jsonMtime);
      status = `<span class="ov-who" title="${esc(`${n.name} · ${n.conversation_id}`)}">◉ ${esc(n.name)}</span>` +
          (label ? `<span class="badge ${esc(s.narratorState)}" data-testid="swarm-overview-badge" title="${esc(tip)}">${esc(label)}</span>` : '') +
          (stale ? `<span class="badge stale" data-testid="swarm-overview-stale" title="${esc(`${plural(lag, 'post')} since the view was updated`)}">stale</span>` : '') +
          '<span class="spacer"></span>' +
          `<span class="ov-fresh" data-testid="swarm-overview-freshness" title="${esc(`Narrator read up to #${read} of ${s.head}`)}">` +
          `read #${read}${updated ? ` · updated ${esc(updated)}` : ''}</span>`;
    }
    if ($('ov-status').innerHTML !== status) $('ov-status').innerHTML = status;
    $('ov-status').classList.toggle('hidden', !status);

    // System items, from rosters and transcripts (not from the narrator).
    const sys = s.systemAttention || [];
    const canOpen = canOpenConversation();
    const sysHtml = sys.map((it) => {
      const since = it.kind === 'stuck' && it.since ? ` for ${fmtDur(Date.now() - it.since)}` : '';
      return `<div class="ov-sys ${esc(it.kind)}" role="listitem" data-testid="swarm-overview-system-item" title="${esc(it.detail || '')}">` +
          `<span class="ov-sys-icon" aria-hidden="true">⚠</span>` +
          `<span class="ov-sys-text"><b>system:</b> ${esc(it.text)}${esc(since)}</span>` +
          (canOpen && it.conversation_id ? `<button type="button" class="ghost-btn sm" data-open="${esc(it.conversation_id)}">Open</button>` : '') +
          `</div>`;
    }).join('');
    if ($('ov-system').innerHTML !== sysHtml) $('ov-system').innerHTML = sysHtml;
    $('ov-system').classList.toggle('hidden', !sysHtml);

    const notice = noticeHtml();
    const lastGood = ov.model && s.view?.jsonError ?
      'Showing the last good view.json; the current file is ' + (s.view.jsonError === 'too_large' ? 'over 64 KB.' : 'not valid JSON.') : '';
    const noticeText = notice || lastGood;
    if ($('ov-notice').innerHTML !== noticeText) $('ov-notice').innerHTML = noticeText;
    $('ov-notice').classList.toggle('hidden', !noticeText);

    // Footer: how to change the view, and the narrator's last acknowledgement.
    $('ov-footer').classList.toggle('hidden', !n && !ov.model);
    $('ov-open-coord').classList.toggle('hidden', !canOpen || !coordinatorConv());
    const ack = v?.feedback_ack;
    const ackHtml = ack ? `Last change: “${esc(ack.text)}”${ack.through_seq ? ` <button type="button" class="ref" data-ov-seq="${ack.through_seq}">#${ack.through_seq}</button>` : ''}` : '';
    if ($('ov-ack').innerHTML !== ackHtml) $('ov-ack').innerHTML = ackHtml;
    $('ov-ack').classList.toggle('hidden', !ackHtml);

    // Tab badge: only the coordinator stopping for the user needs them: its turn
    // ended on a reply with no worker still at work, or it failed or ran out of
    // quota. Workers' asks go to the coordinator.
    const coord = (s.members || []).find((m) => m.role === 'coordinator' && !m.killed);
    const msgs = s.messages || [];
    const lastMsg = msgs[msgs.length - 1];
    const swarmDone = !!coord && lastMsg?.agent === coord.name && /^\[done\]/i.test(String(lastMsg.text || '').trim());
    const coordSys = coord ? sys.filter((it) => it.member === coord.name).length : 0;
    const want = swarmDone ? 0 : coordSys + (coord?.status === 'waiting' && coord.replied && coord.replyAsk ? 1 : 0);
    $('tab-badge-overview').textContent = want ? String(want) : '';
    $('tab-badge-overview').classList.toggle('hidden', !want);
  }

  // Why the plain view is shown instead of the frame ('' = frame is fine).
  function plainReason() {
    const view = state.snap?.view;
    if (!view?.html) return view?.htmlError === 'too_large' ? 'view.html is over 64 KB' : 'no view.html yet';
    if (frame.failed && frame.failed.htmlKey === view.htmlKey) return `the narrator's view failed (${frame.failed.reason})`;
    if (!ov.bootstrap) return 'loading the narrator view';
    return '';
  }

  function renderOverview() {
    const s = state.snap;
    if (!s) return;
    ov.model = overviewOn() && s.view?.json ? sanitizeView(s.view.json, s) : null;
    renderOverviewChrome();
    const label = $('ov-label');
    if (!ov.model) {
      frameTeardown();
      label.classList.add('hidden');
      $('ov-frame').classList.add('hidden');
      // No narrator notes yet: hive.js still draws the Overview from the
      // board and roster.
      $('ov-plain').classList.remove('hidden');
      $('tab-overview').classList.add('clean');
      window.SwarmHive.update(s, $('ov-plain'), { view: 'overview' });
      return;
    }
    const reason = plainReason();
    const plain = prefs.plain || !!reason;
    label.classList.remove('hidden');
    const mode = $('ov-mode');
    // The toggle offers the frame back unless it can't be shown at all.
    const canFrame = !!s.view?.html;
    mode.textContent = plain ? (frame.failed && canFrame ? 'Retry narrator\'s page' : 'Narrator\'s page') : 'Overview';
    mode.setAttribute('aria-pressed', String(plain));
    // With the built-in Overview it is the only one offered; the toggle shows
    // only to get back from the narrator's page (?narrator=frame or an earlier
    // choice). Otherwise it offers the narrator's page whenever there is one.
    mode.classList.toggle('hidden', s.builtinOverview ? plain : plain && !canFrame);
    label.querySelector('.ov-label-text').textContent = plain ?
      `overview · from the narrator's notes${reason && !prefs.plain ? ` · ${reason}` : ''}` : 'narrator\'s page · AI-generated';
    $('ov-frame').classList.toggle('hidden', plain);
    $('ov-plain').classList.toggle('hidden', !plain);
    $('tab-overview').classList.toggle('clean', plain);
    if (plain) {
      frameTeardown();
      window.SwarmHive.update(s, $('ov-plain'), { view: 'overview' });
    } else {
      frameSync();
    }
  }

  // ----- actions (from the plain view, or validated NAVIGATE from the frame) -----
  function performAction(raw) {
    const a = checkAction(raw, state.snap);
    if (!a) {
      toast('That link isn\'t allowed here.');
      return;
    }
    if (a.type === 'open_conv') {
      const m = memberOf(a.target);
      if (m.local === false || canOpenConversation()) openConversation(m.conversation_id);
      else toast(`Opening ${a.target}'s conversation needs the app.`);
    } else if (a.type === 'board_post') {
      goToPost(a.target);
    } else if (a.type === 'url') {
      window.open(a.target, '_blank', 'noopener,noreferrer');
    } else if (a.type === 'file') {
      const uri = state.snap.allowedFiles[a.target];
      if (window.sidecar?.ui?.toggleAuxPane) window.sidecar.ui.toggleAuxPane({ tabType: 'fileView', uri });
      else toast('Opening files needs the app.');
    }
  }

  function clearFilters() {
    $('f-agent').value = '';
    $('f-mention').value = '';
    $('f-search').value = '';
    $('f-agent').classList.remove('set');
    $('f-mention').classList.remove('set');
    state.hiddenAgents.clear();
    state.channel = '';
    renderAgents();
    renderChannels();
    renderFeed();
  }

  function goToPost(seq) {
    const s = state.snap;
    if (!s || !posInt(seq)) return;
    if (!s.messages?.some((m) => m.seq === seq)) return;
    state.stick = false;
    selectTab('feed', false, true);
    let el = $('feed').querySelector(`[data-seq="${seq}"]`);
    if (!el && filtersActive()) {
      clearFilters();
      el = $('feed').querySelector(`[data-seq="${seq}"]`);
    }
    if (!el) return;
    state.stick = false;
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('target');
    void el.offsetWidth;
    el.classList.add('target');
    setTimeout(() => el.classList.remove('target'), 1800);
    updateJump();
  }

  // Feedback starts in the coordinator's chat (the coordinator relays it to
  // the narrator). Only the item id is copied; nothing from the narrator.
  async function feedbackIntent(id) {
    if (typeof id !== 'string' || !ITEM_ID_RE.test(id) || !ov.model?.ids.has(id)) return;
    const text = `user feedback on card ${id}: `;
    const copied = await copyText(text);
    const conv = coordinatorConv();
    // A coordinator on another machine can't be opened here: say where it
    // runs in this toast rather than replacing openConversation's.
    const remote = members().find((m) => m.conversation_id === conv && m.local === false);
    if (remote) {
      toast(`${copied ? `Copied “${text.trim()}”. Paste it` : `Tell it “${text.trim()} …”`} to the coordinator on ${remote.owner?.label || 'its machine'}.`);
      return;
    }
    if (canOpenConversation() && conv) openConversation(conv);
    toast(copied ? `Copied “${text.trim()}”. Paste it to the coordinator and say what you want changed.` :
      `Tell the coordinator: “${text.trim()} …”`);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through: the clipboard API may be blocked in the host's iframe.
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  // ----- NarratorFrameHost: the sandboxed frame running view.html -----
  const frame = {
    el: null,        // the iframe
    htmlKey: '',     // the view.html it was built from
    loads: 0,        // load events; a second one means it navigated itself
    ready: false,    // READY received
    sent: '',        // JSON of the data the frame has (embedded or posted)
    awaiting: '',    // 'READY' | 'RENDERED' | ''
    timer: 0,        // watchdog for `awaiting`
    failed: null,    // {htmlKey, reason}: plain view until view.html changes
    spent: false,    // a gated action already used the current user activation
  };

  function themeTokens() {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const [name, local] of THEME_TOKENS) {
      const v = (cs.getPropertyValue(name).trim() || cs.getPropertyValue(local).trim());
      // Tokens go into a <style> in the srcdoc: keep them to plain values.
      if (v && v.length <= 200 && !/[;{}<>\\]|url\(|expression/i.test(v)) out[name] = v;
    }
    return out;
  }
  const scheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  function framePayload() {
    const s = state.snap;
    return {
      view: ov.model.view,
      meta: {
        head: s.head,
        narrator: s.narrator?.name || '',
        members: s.members.filter((m) => !isRoleWorker(m)).map((m) => ({ name: m.name, role: roleOf(m), status: m.status })),
      },
    };
  }

  function buildSrcdoc(html, payload) {
    const tokens = themeTokens();
    const css = `:root{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';')};color-scheme:${scheme()}}` +
        'html,body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-family,system-ui,sans-serif)}';
    // JSON in a <script> block: no "</script", no line separators.
    const data = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const boot = ov.bootstrap.replace(/<\/(script)/gi, '<\\/$1');
    // The CSP meta comes first so it governs everything after it. view.html
    // follows our head content directly, so a full document's own <head>
    // children still land in the head.
    return `<!DOCTYPE html><html><head><meta charset="utf-8">` +
        `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<style>${css}</style>` +
        `<script type="application/json" id="narrator-data">${data}</script>` +
        `<script>${boot}</script>\n` + html;
  }

  // Builds the frame when view.html changed; otherwise sends changed data.
  function frameSync() {
    const view = state.snap.view;
    if (frame.el && frame.htmlKey === view.htmlKey) {
      postData();
      return;
    }
    frameTeardown();
    const payload = framePayload();
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.setAttribute('title', 'Narrator view (AI-generated)');
    f.setAttribute('data-testid', 'swarm-overview-iframe');
    f.className = 'ov-iframe';
    f.addEventListener('load', () => {
      if (frame.el !== f) return;
      frame.loads++;
      // The bootstrap posts READY on DOMContentLoaded, which usually beats
      // the load event; only wait for READY if it hasn't come yet.
      if (frame.loads === 1) {
        if (!frame.ready) arm('READY');
      } else {
        frameFail('it navigated away');
      }
    });
    f.srcdoc = buildSrcdoc(view.html, payload);
    frame.el = f;
    frame.htmlKey = view.htmlKey;
    frame.loads = 0;
    frame.ready = false;
    frame.sent = JSON.stringify(payload);
    $('ov-frame').replaceChildren(f);
  }

  function frameTeardown() {
    clearTimeout(frame.timer);
    frame.awaiting = '';
    if (frame.el) frame.el.remove();
    frame.el = null;
    frame.htmlKey = '';
    frame.ready = false;
    frame.sent = '';
  }

  function frameFail(reason) {
    if (!frame.el) return;
    frame.failed = { htmlKey: frame.htmlKey, reason };
    console.warn(`[swarm_board] narrator view failed: ${reason}`);
    frameTeardown();
    renderOverview();
  }

  function postToFrame(msg) {
    try {
      // The frame's origin is opaque ("null"), so '*' is the only target.
      frame.el?.contentWindow?.postMessage(msg, '*');
    } catch {
      // A torn-down frame; nothing to send to.
    }
  }

  function postData() {
    if (!frame.el || !frame.ready || !ov.model) return;
    const payload = framePayload();
    const json = JSON.stringify(payload);
    if (json === frame.sent) return;
    frame.sent = json;
    postToFrame({ type: 'DATA_UPDATE', ...payload });
    arm('RENDERED');
  }

  function postTheme() {
    if (frame.el && frame.ready) postToFrame({ type: 'THEME', tokens: themeTokens(), scheme: scheme() });
  }

  // Watchdogs run only while the frame is on screen: a hidden frame may be
  // throttled, and a slow frame nobody is looking at is no failure.
  const frameVisible = () => !!frame.el && state.view === 'board' && state.tab === 'overview' && !document.hidden;
  function arm(what) {
    frame.awaiting = what;
    syncWatchdog();
  }
  function syncWatchdog() {
    clearTimeout(frame.timer);
    if (!frame.awaiting || !frameVisible()) return;
    const what = frame.awaiting;
    frame.timer = setTimeout(() => frameFail(`no ${what} within ${WATCHDOG_MS / 1000}s`), WATCHDOG_MS);
  }
  function disarm(what) {
    if (frame.awaiting !== what) return;
    frame.awaiting = '';
    clearTimeout(frame.timer);
  }
  document.addEventListener('visibilitychange', syncWatchdog);

  // NAVIGATE and FEEDBACK_INTENT need a live user activation that came from
  // the frame, and get one action per activation: after one is taken, the
  // next must wait until that activation has expired. Activation is
  // page-wide (a click in the frame activates this page too, but so does a
  // click anywhere else here), and the frame can steal focus, so where the
  // input happened is decided by this page's own input events: input inside
  // the frame never reaches this document. If this page saw no input for
  // longer than an activation lasts (~5 s in Chrome) yet is activated, the
  // gesture was in the frame. The frame must also hold focus. Activation
  // turns on before this page's own input listeners run, so a frame posting
  // in a tight loop can see it first: the decision is therefore deferred by
  // GATE_SETTLE_MS and refused if this page saw input in the meantime. A frame
  // that posts gated messages faster than GATE_SPAM_MS apart is refused too
  // (one real click sends one message). The cost: a click in the frame within
  // ~5 s of a click in the chrome is refused once.
  const ACTIVATION_MS = 5500;
  const GATE_SETTLE_MS = 100;
  const GATE_SPAM_MS = 250;
  let parentInputAt = -Infinity;
  let lastGatedMsgAt = -Infinity;
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'keydown']) {
    document.addEventListener(type, () => { parentInputAt = performance.now(); }, { capture: true, passive: true });
  }
  // Calls onAllow() if the gated message just received may act, otherwise
  // onDeny(). Either callback runs asynchronously.
  function gate(onAllow, onDeny) {
    const receivedAt = performance.now();
    const spam = receivedAt - lastGatedMsgAt < GATE_SPAM_MS;
    lastGatedMsgAt = receivedAt;
    const ua = navigator.userActivation;
    const el = frame.el;
    if (spam || !ua?.isActive || frame.spent || !el || document.activeElement !== el ||
        receivedAt - parentInputAt <= ACTIVATION_MS) {
      setTimeout(onDeny, 0);
      return;
    }
    // Reserve this activation now so no other message can use it.
    frame.spent = true;
    const release = () => {
      if (navigator.userActivation.isActive) setTimeout(release, 200);
      else frame.spent = false;
    };
    setTimeout(() => {
      setTimeout(release, 200);
      const ok = parentInputAt < receivedAt && frame.el === el &&
          document.activeElement === el && navigator.userActivation.isActive;
      (ok ? onAllow : onDeny)();
    }, GATE_SETTLE_MS);
  }

  window.addEventListener('message', (e) => {
    if (!frame.el || e.source !== frame.el.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || !FRAME_INBOUND.has(d.type)) return;
    let size = Infinity;
    try {
      size = JSON.stringify(d).length;
    } catch {
      return;
    }
    if (size > FRAME_MSG_MAX) return;
    switch (d.type) {
      case 'READY':
        if (frame.ready) return;
        frame.ready = true;
        disarm('READY');
        // RENDERED follows from the bootstrap's first render.
        arm('RENDERED');
        postTheme();
        postData();
        return;
      case 'RENDERED': {
        disarm('RENDERED');
        const h = Number(d.height);
        if (Number.isFinite(h) && h > 0) frame.el.style.height = `${Math.min(20000, Math.max(120, Math.ceil(h)))}px`;
        return;
      }
      case 'ERROR':
        frameFail(`error: ${str(d.message, 500).split('\n')[0].slice(0, 160) || 'unknown'}`);
        return;
      case 'NAVIGATE': {
        const action = d.action;
        gate(() => performAction(action), () => toast('Click a link in the view to open it.'));
        return;
      }
      case 'FEEDBACK_INTENT': {
        const target = d.target_id;
        gate(() => feedbackIntent(target), () => {});
        return;
      }
    }
  });

  async function loadBootstrap() {
    try {
      const f = window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : fetch;
      const res = await f('/narrator_bootstrap.js', { method: 'GET' });
      if (!res.ok) throw new Error(`narrator_bootstrap.js: ${res.status}`);
      ov.bootstrap = await res.text();
      if (state.snap) renderOverview();
    } catch (e) {
      console.warn(e);
      setTimeout(loadBootstrap, IDLE_POLL_MS);
    }
  }
  loadBootstrap();

  // Chrome and plain-view clicks are direct user gestures in this page.
  $('tab-overview').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) return openConversation(open.dataset.open);
    const seq = e.target.closest('[data-ov-seq]');
    if (seq) {
      if (seq.dataset.ovSeq) goToPost(Number(seq.dataset.ovSeq));
      return;
    }
  });
  $('ov-mode').addEventListener('click', () => {
    const toFrame = prefs.plain || !!frame.failed;
    prefs.plain = !toFrame;
    frame.failed = null;
    lsSet(PLAIN_KEY, prefs.plain ? null : '0');
    renderOverview();
  });
  $('ov-open-coord').addEventListener('click', () => openConversation(coordinatorConv()));

  // ---------- events ----------
  const TABS = ['overview', 'feed', 'members', 'graph', 'raw'];
  // byUser: an explicit choice, which stops the Overview/Board auto-pick.
  function selectTab(tab, focus = false, byUser = false) {
    if (byUser) state.tabChosen = true;
    document.querySelectorAll('.tab').forEach((x) => {
      const on = x.dataset.tab === tab;
      x.classList.toggle('active', on);
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      if (on && focus) x.focus();
    });
    document.querySelectorAll('.tab-body').forEach((x) => x.classList.toggle('active', x.id === `tab-${tab}`));
    state.tab = tab;
    if (state.snap && tab === 'graph') renderGraph();
    if (state.snap && tab === 'overview') renderOverview();
    if (state.snap && tab === 'members') renderMembers();
    if (state.snap && tab === 'feed') measureClamps();
    syncWatchdog();
    updateJump();
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab, false, true)));
  document.querySelector('.tabs').addEventListener('keydown', (e) => {
    const tabs = TABS.filter((t) => !$(`tabbtn-${t}`).classList.contains('hidden'));
    const i = tabs.indexOf(state.tab);
    let next = null;
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    selectTab(next, true, true);
  });
  ['f-agent', 'f-mention', 'f-search'].forEach((id) => $(id).addEventListener('input', () => {
    if (id !== 'f-search') $(id).classList.toggle('set', !!$(id).value);
    if (state.snap) renderFeed();
  }));
  $('f-toggle').addEventListener('click', () => setFiltersOpen($('filters').classList.contains('hidden')));
  $('f-channel').addEventListener('input', () => state.snap && setChannel($('f-channel').value));
  $('channel-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-channel]');
    if (t && state.snap) setChannel(t.dataset.channel);
  });
  $('channel-tabs').addEventListener('keydown', (e) => {
    if (!state.snap || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const tabs = [...$('channel-tabs').querySelectorAll('[data-channel]')];
    const i = tabs.findIndex((t) => t.dataset.channel === state.channel);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault();
    setChannel(next.dataset.channel);
    $('channel-tabs').querySelector(`[data-channel="${CSS.escape(next.dataset.channel)}"]`)?.focus();
  });
  $('agents').addEventListener('click', (e) => {
    const c = e.target.closest('[data-agent]');
    if (!c) return;
    const name = c.dataset.agent;
    if (state.hiddenAgents.has(name)) state.hiddenAgents.delete(name); else state.hiddenAgents.add(name);
    renderAgents();
    renderFeed();
    // Keep keyboard focus on the toggled chip after the re-render.
    $('agents').querySelector(`[data-agent="${CSS.escape(name)}"]`)?.focus();
  });
  $('feed').addEventListener('click', (e) => {
    if (e.target.closest('[data-clear-filters]')) {
      clearFilters();
      return;
    }
    const chip = e.target.closest('.msg-channel[data-channel]');
    if (chip) {
      setChannel(chip.dataset.channel);
      return;
    }
    const seqRef = e.target.closest('[data-seq-ref], [data-ov-seq]');
    if (seqRef) {
      const targetSeq = Number(seqRef.dataset.seqRef || seqRef.dataset.ovSeq);
      if (targetSeq) goToPost(targetSeq);
      return;
    }
    let more = e.target.closest('.msg-more');
    // A click anywhere on a clamped Board row expands it (not on links,
    // buttons, or while selecting text).
    if (!more) {
      const row = e.target.closest('.feed .msg');
      if (!row || e.target.closest('a, button, input, [data-seq-ref]')) return;
      if (String(window.getSelection?.() || '').length) return;
      const btn = row.querySelector('.msg-more');
      if (!btn || btn.classList.contains('hidden')) return;
      more = btn;
    }
    const body = more.previousElementSibling;
    const seq = Number(more.closest('.msg').dataset.seq);
    const open = body.classList.toggle('open');
    more.textContent = open ? 'Show less' : 'Show more';
    more.setAttribute('aria-expanded', String(open));
    if (open) state.expanded.add(seq); else state.expanded.delete(seq);
    // Expanding a post grows the feed below it; don't let re-pinning to the
    // bottom scroll the post the user is reading out of view.
    if (open) state.stick = false;
  });
  $('jump-latest').addEventListener('click', () => scrollToLatest('smooth'));
  $('f-autoscroll').addEventListener('input', () => {
    if ($('f-autoscroll').checked && feedShown()) scrollToLatest();
  });
  window.addEventListener('scroll', () => {
    // Other tabs share the window's scroll position; only the feed's scrolling
    // says whether the user is following the newest post.
    if (feedShown()) state.stick = nearBottom();
    $('tab-feed').querySelector('.toolbar').classList.toggle('stuck', window.scrollY > 0);
    updateJump();
  }, { passive: true });
  // Keep --header-h (the sticky toolbar's offset) in sync with the header,
  // whose meta line can wrap, and re-pin the feed when its height changes.
  new ResizeObserver(() => {
    $('board').style.setProperty('--header-h', `${document.querySelector('.header').offsetHeight}px`);
  }).observe(document.querySelector('.header'));
  new ResizeObserver(keepPinned).observe($('feed'));
  document.querySelectorAll('.gview-btn').forEach((b) => b.addEventListener('click', () => {
    state.graphView = b.dataset.gview;
    renderGraph();
  }));
  $('graph').addEventListener('click', (e) => {
    const g = e.target.closest('.node');
    if (g?.dataset.conv) openConversation(g.dataset.conv);
  });
  $('replay-caption').addEventListener('click', (e) => {
    const seqRef = e.target.closest('[data-seq-ref], [data-ov-seq]');
    if (seqRef) {
      const targetSeq = Number(seqRef.dataset.seqRef || seqRef.dataset.ovSeq);
      if (targetSeq) goToPost(targetSeq);
    }
  });
  document.querySelectorAll('.raw-btn').forEach((b) => b.addEventListener('click', () => {
    state.rawKind = b.dataset.raw;
    if (state.snap) renderRaw();
  }));
  $('raw-copy').addEventListener('click', async () => {
    const label = $('raw-copy-label');
    try {
      await navigator.clipboard.writeText($('raw').textContent);
      label.textContent = 'Copied';
    } catch {
      label.textContent = 'Copy failed';
    }
    setTimeout(() => { label.textContent = 'Copy'; }, 1200);
  });
  $('g-all').addEventListener('input', () => state.snap && renderGraph());
  $('g-hide-inactive')?.addEventListener('input', () => state.snap && renderGraph());
  $('replay-play').addEventListener('click', () => state.snap && replayToggle());
  $('replay-start').addEventListener('click', () => state.snap && replaySeek(0));
  $('replay-back').addEventListener('click', () => state.snap && replaySeek((replay.idx ?? graphMsgs().length) - 1));
  $('replay-fwd').addEventListener('click', () => state.snap && replaySeek((replay.idx ?? graphMsgs().length) + 1));
  $('replay-live').addEventListener('click', () => state.snap && replayLive());
  $('replay-slider').addEventListener('input', (e) => state.snap && replaySeek(parseInt(e.target.value, 10)));
  $('graph-export-gif')?.addEventListener('click', () => state.snap && exportGraphGif());
  $('gif-modal-close')?.addEventListener('click', closeGifModal);
  $('gif-modal')?.addEventListener('click', (e) => {
    if (e.target === $('gif-modal')) closeGifModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('gif-modal') && !$('gif-modal').classList.contains('hidden')) {
      e.preventDefault();
      closeGifModal();
      return;
    }
    if (state.tab !== 'graph' || !state.snap || e.target.matches('input, select, textarea, button, [role="tab"]')) return;
    if (e.key === ' ') { e.preventDefault(); replayToggle(); }
    else if (e.key === 'ArrowLeft') replaySeek((replay.idx ?? graphMsgs().length) - 1);
    else if (e.key === 'ArrowRight') replaySeek((replay.idx ?? graphMsgs().length) + 1);
  });
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (!state.snap) return;
      if (state.tab === 'graph') renderGraph();
      if (state.tab === 'feed') {
        measureClamps();
        keepPinned();
      }
    });
  });

  // URL params: ?tab=overview|feed|members|graph|raw; ?replay=N;
  // ?narrator=plain; ?conversationId=X stands in for the pane's conversation
  // when the page is opened standalone.
  if (urlTabChosen) selectTab(initialTab, false, true);
  if (params.get('replay'))
    replay.idx = parseInt(params.get('replay'), 10) || 0;
  $('replay-play').innerHTML = ICON.play;
  $('replay-play').dataset.icon = 'play';
  poll();
  // Member state and the date shown on clock times change with the clock, so
  // refresh them on a ticker.
  setInterval(() => {
    if (!state.snap || state.view !== 'board') return;
    renderMeta();
    if (state.tab === 'members') renderMembers();
    if (state.tab === 'overview') renderOverviewChrome();
  }, 5000);
})();
