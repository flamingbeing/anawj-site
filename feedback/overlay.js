// Feedback button: comment on any page where it lives, including PR previews and the subdomain apps, without the
// page editor's frame. The Worker (worker/sites.js) adds this script to HTML pages on PR previews (always) and on the
// subdomains when that browser has turned it on with ?feedback=1 (?feedback=0 turns it off). Rules for applying page edits: owner-tools page-edits.md.
// It only reads the page; it never saves app data. Comments stay in this browser until sent (a PR comment or a
// "Page edits:" issue, the same format as the page editor).
(() => {
  if (window.__anawjFeedback || window.top !== window) return; // once, and never inside a frame (e.g. the editor's)
  window.__anawjFeedback = true;
  const host = location.hostname;
  const PREVIEW = /\.workers\.dev$/.test(host);
  // The apps on their live addresses hold real data: there, the overlay never copies the page's text into a comment.
  const LIVE_APP = (/^(apmes|prewarmstudy|nuhroster)\.anawj\.com$/.test(host) || (host === 'hand.anawj.com' && location.pathname.startsWith('/handlog/')))
    && !new URLSearchParams(location.search).has('demo');
  // the Worker only adds the script when it's on, but an app's offline copy may keep it: check again
  if (!PREVIEW && !/(?:^|;\s*)anawj-feedback=1(?:;|$)/.test(document.cookie)) return;

  const REPO = 'flamingbeing/anawj-site';
  const KEY = 'anawj-feedback-v1', WHO = 'anawj-editor-name', SIDE = 'anawj-feedback-side';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  };
  let items = [], saveFailed = false;
  // the list as stored now (another tab of the same site may have changed it)
  const load = () => { try { const v = JSON.parse(store.get(KEY, '[]')); items = Array.isArray(v) ? v : []; } catch (e) { items = []; } };
  load();
  const save = () => { saveFailed = !store.set(KEY, JSON.stringify(items)); render(); };
  // every change: re-read, change, save
  const change = fn => { load(); fn(); save(); };

  // ---- what happened recently, for "Something's wrong": errors and the screens and things tapped (by kind and
  // position on the page, never their text), kept only in memory, last 30
  const recent = [], t0 = Date.now();
  const note = what => { recent.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${what}`); if (recent.length > 30) recent.shift(); };
  const errors = [];
  const err = what => { errors.push(what.slice(0, 300)); if (errors.length > 10) errors.shift(); note('error'); };
  addEventListener('error', e => { if (e.message) err(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno || '?'})`); });
  addEventListener('unhandledrejection', e => err('unhandled: ' + (e.reason?.message || String(e.reason))));
  const origError = console.error;
  // on a live app only error messages and codes, never other things logged (they can be records)
  const said = x => x?.message ? (x.code ? x.code + ': ' : '') + x.message : typeof x === 'string' ? (LIVE_APP ? '' : x) : LIVE_APP ? '' : JSON.stringify(x);
  console.error = function (...a) { try { const t = a.map(said).filter(Boolean).join(' '); if (t) err('console: ' + t); } catch (e) {} return origError.apply(this, a); };
  // only the screen's name (the first part of #…): later parts can be record ids
  const screen = () => (location.hash.split(/[\/?&=]/)[0] || '(start)');
  addEventListener('hashchange', () => note('screen ' + screen()));
  addEventListener('offline', () => note('went offline')); addEventListener('online', () => note('back online'));

  // ---- the overlay's own UI lives in a shadow root, so the page's styles and ours never mix
  const hostEl = document.createElement('anawj-feedback');
  hostEl.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647';
  hostEl.setAttribute('data-anawj-feedback', '');
  const root = hostEl.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    /* the host is reset (all:initial) so the page's styles can't reach in; the font is set on each piece */
    .fab,.sheet,.banner{font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#222;text-align:left}
    *{box-sizing:border-box}
    button,textarea,input{font:inherit;color:inherit}
    button{min-height:44px;padding:0 14px;border:1px solid #7a8592;background:#fff;cursor:pointer;font-weight:500;border-radius:0}
    button.primary{background:#002f6c;border-color:#002f6c;color:#fff}
    button:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid #002f6c;outline-offset:2px}
    .fab{position:fixed;z-index:2147483647;bottom:16px;width:48px;height:48px;padding:0;border-radius:50%;background:#002f6c;border:2px solid #fff;color:#fff;font-size:20px;box-shadow:0 2px 10px rgba(0,0,0,.3)}
    .fab.left{left:12px}.fab.right{right:12px}
    .fab b{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#e4002b;color:#fff;font:600 12px/20px system-ui,sans-serif;padding:0 5px}
    .sheet{position:fixed;z-index:2147483647;left:0;right:0;bottom:0;max-height:85vh;overflow:auto;background:#fff;border-top:4px solid;border-image:linear-gradient(90deg,#e57200 25%,#e4002b 25% 50%,#178fd7 50% 75%,#002f6c 75%) 1;padding:14px 16px 18px;box-shadow:0 -6px 24px rgba(0,0,0,.2)}
    .sheet h2{font:600 18px/1.25 system-ui,sans-serif;color:#002f6c;margin:0 0 8px}
    .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .row button{flex:1 1 auto}
    .row a{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border:1px solid #7a8592;color:#002f6c;font-weight:500;text-decoration:none}
    .muted{color:#555b63;font-size:14px}
    .on{background:#eef2f7;padding:8px 10px;font-size:14px;margin:0 0 8px;max-height:6em;overflow:auto;white-space:pre-wrap}
    textarea{width:100%;min-height:110px;padding:10px;border:1px solid #7a8592;font-size:16px;border-radius:0}
    #report{min-height:120px;font:13px/1.45 ui-monospace,Menlo,monospace}
    input[type=text]{width:100%;min-height:44px;padding:0 10px;border:1px solid #7a8592;font-size:16px;border-radius:0}
    label.check{display:flex;gap:8px;align-items:flex-start;margin:8px 0 0;font-size:14px}
    label.check input{width:22px;height:22px;margin:1px 0 0;flex:none}
    .warn{background:#f6e7c8;border:1px solid #b07a2a;padding:8px 10px;margin:8px 0 0;font-size:14px}
    .item{border-bottom:1px solid #d9d9d9;padding:8px 0;display:flex;gap:8px;align-items:flex-start}
    .item div{flex:1;min-width:0;font-size:14px;overflow-wrap:anywhere}
    .banner{position:fixed;z-index:2147483647;bottom:0;left:0;right:0;display:flex;gap:8px;align-items:center;background:#002f6c;color:#fff!important;padding:8px 12px}
    .banner.top{top:0;bottom:auto}
    .banner span{flex:1}
    .banner button{background:#fff;color:#002f6c;border-color:#fff}
    #speak[aria-pressed=true]{background:#e4002b;border-color:#e4002b;color:#fff}
    .tip{position:fixed;z-index:2147483647;bottom:24px;max-width:220px;font:14px/1.35 system-ui,sans-serif;background:#222;color:#fff;padding:8px 10px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
    .tip.left{left:70px}.tip.right{right:70px}
    .ver{position:fixed;z-index:2147483647;bottom:70px;font:600 13px/1 system-ui,sans-serif;background:#e57200;color:#fff;padding:6px 8px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .ver.left{left:12px}.ver.right{right:12px}
    .vers button[aria-pressed=true]{background:#002f6c;border-color:#002f6c;color:#fff}
    canvas.draw{position:fixed;z-index:2147483646;inset:0;width:100vw;height:100vh;touch-action:none;cursor:crosshair;background:rgba(0,47,108,.04)}
    [hidden]{display:none!important}
  </style>
  <button class="fab" id="fab" aria-label="Feedback">💬<b id="badge" hidden></b></button>
  <div class="ver" id="ver" hidden></div>
  <div class="tip" id="tip" hidden role="status"></div>
  <canvas class="draw" id="draw" hidden></canvas>
  <div class="banner" id="drawBar" hidden role="status"><span>Circle it, or draw an arrow to where it should go</span><button id="drawUndo">Undo</button><button id="drawDone">Done</button><button id="drawCancel">Cancel</button></div>
  <div class="banner" id="banner" hidden role="status"><span>Tap what you want to comment on</span><button id="pickFlip" aria-label="Move this bar to the other end">⇅</button><button id="pickCancel">Cancel</button></div>
  <div class="sheet" id="menu" hidden role="dialog" aria-label="Feedback">
    <h2>Feedback on this page</h2>
    <p class="muted" id="where"></p>
    <div class="row"><button class="primary" id="mPick">Comment on something</button><button id="mDraw">Draw on it</button><button id="mPage">Comment on this screen</button></div>
    <div id="verBox" hidden>
      <p class="muted" style="margin:12px 0 0">This preview has versions to choose from. Look at each, then choose one.</p>
      <div class="row vers" id="vers" role="group" aria-label="Versions"></div>
      <div class="row"><button id="choose" class="primary"></button></div>
    </div>
    <div class="row" id="cmp" hidden><a id="cmpNow" target="_blank" rel="noopener">How it is now</a><a id="cmpPr" target="_blank" rel="noopener">What this PR changes</a></div>
    <div class="row"><button id="mBug">Something’s wrong</button></div>
    <div class="row"><button id="mShare">Share this page</button></div>
    <div class="row"><button id="mList">Comments (<span id="count">0</span>)</button><button id="mSend">Send</button></div>
    <div class="row"><button id="mSide">Move button</button><button id="mOff">Turn off</button><button id="mClose">Close</button></div>
  </div>
  <div class="sheet" id="note" hidden role="dialog" aria-label="Comment">
    <h2>Comment</h2>
    <div class="on" id="onText"></div>
    <textarea id="noteText" aria-label="Your comment" placeholder="What should change?"></textarea>
    <div class="row"><button id="speak" aria-pressed="false" hidden>🎤 Speak</button></div>
    <p class="muted" id="speakHint">Or tap the microphone on your keyboard to talk instead of typing.</p>
    <label class="check"><input type="checkbox" id="optOptions"> <span>Show me 2–3 versions to choose from</span></label>
    <label class="check"><input type="checkbox" id="optEverywhere"> <span>Change this everywhere it appears</span></label>
    <div class="row"><button id="noteCancel">Cancel</button><button class="primary" id="noteSave">Save</button></div>
    <div class="row"><button id="askNow">Ask Claude now (owner only)</button></div>
  </div>
  <div class="sheet" id="share" hidden role="dialog" aria-label="Share this page">
    <h2>Share this page</h2>
    <p class="muted" id="shareHow"></p>
    <div id="qr" style="width:min(240px,70vw);margin:8px auto"></div>
    <p class="muted" id="shareLink" style="overflow-wrap:anywhere;text-align:center"></p>
    <div class="row"><button id="shareCopy">Copy link</button><button id="shareClose" class="primary">Close</button></div>
  </div>
  <div class="sheet" id="list" hidden role="dialog" aria-label="Comments">
    <h2>Comments waiting to be sent</h2>
    <div id="items"></div>
    <div class="row"><button id="listClose" class="primary">Close</button></div>
  </div>
  <div class="sheet" id="send" hidden role="dialog" aria-label="Send">
    <h2>Send your comments</h2>
    <label class="muted" for="who">Your name</label>
    <input type="text" id="who" autocomplete="name" placeholder="e.g. Dr Tan, MO">
    <p class="warn" id="privacy" hidden></p>
    <label class="check" id="privacyOk" hidden><input type="checkbox" id="privacyTick"> <span>I’ve checked: these aren’t patient details (names, NRIC, hospital numbers, dates of birth, phone numbers).</span></label>
    <p class="muted">What you send is <b>public</b>. Never put patient details in a comment.</p>
    <p class="muted" id="sendHow"></p>
    <textarea id="report" readonly aria-label="What will be sent"></textarea>
    <p class="warn" id="sendNote" hidden></p>
    <div class="row"><button id="toPr" class="primary" hidden></button><button id="toIssue">Send as a GitHub issue</button><button id="copy">Copy</button></div>
    <div class="row"><button id="sent">I’ve sent them: clear my list</button><button id="sendClose">Close</button></div>
  </div>`;
  const $ = id => root.getElementById(id);
  const sheets = ['menu', 'note', 'list', 'send', 'share'];
  const show = id => sheets.forEach(s => { $(s).hidden = s !== id; });
  (document.body || document.documentElement).appendChild(hostEl);

  const side = () => store.get(SIDE, 'left');
  function render() {
    $('fab').className = 'fab ' + side();
    $('badge').hidden = !items.length; $('badge').textContent = items.length;
    $('count').textContent = items.length;
  }
  render();

  // ---- versions to choose from (a "show me versions" comment, built on a PR preview): the page lists them in
  // <meta name="anawj-variants" content="a,b,c"> and shows the one named by ?variant= (owner-tools page-edits.md)
  const VARIANTS = (document.querySelector('meta[name="anawj-variants"]')?.content || '').split(',').map(v => v.trim()).filter(Boolean);
  const current = () => { const v = new URLSearchParams(location.search).get('variant'); return VARIANTS.includes(v) ? v : VARIANTS[0]; };
  if (VARIANTS.length > 1) {
    $('verBox').hidden = false; $('ver').hidden = false;
    $('ver').textContent = 'Version ' + current().toUpperCase();
    $('ver').className = 'ver ' + side();
    for (const v of VARIANTS) {
      const b = document.createElement('button'); b.textContent = v.toUpperCase();
      b.setAttribute('aria-pressed', String(v === current())); b.setAttribute('aria-label', 'Version ' + v.toUpperCase());
      b.onclick = () => { const u = new URL(location.href); u.searchParams.set('variant', v); location.href = u.href; };
      $('vers').appendChild(b);
    }
    $('choose').textContent = `Choose version ${current().toUpperCase()}`;
    $('choose').onclick = () => {
      // 10: a later choice for the same page replaces the earlier one
      change(() => {
        const at = here().url;
        items = items.filter(c => !(c.kind === 'choice' && c.url === at));
        items.push({ id: Date.now().toString(36), ...here(), title: document.title,
          kind: 'choice', heading: '', locator: '', before: '', text: `Choose version ${current().toUpperCase()} (of ${VARIANTS.map(v => v.toUpperCase()).join(', ')}).`, at: new Date().toISOString() });
      });
      show(null);
    };
  }
  // the first time on a site, say what the button is for (a few seconds, once)
  if (store.get('anawj-feedback-hinted', '') !== '1') {
    store.set('anawj-feedback-hinted', '1');
    $('tip').className = 'tip ' + side();
    $('tip').textContent = PREVIEW ? 'This is a preview of a change. Tap 💬 to comment on it.' : 'Tap 💬 to comment on this page.';
    $('tip').hidden = false;
    setTimeout(() => { $('tip').hidden = true; }, 8000);
  }

  $('where').textContent = (PREVIEW ? 'Preview of a proposed change. ' : '') + (LIVE_APP ? 'Live app: your comments never include the screen’s own text.' : 'Comments stay on this phone until you send them.');

  // ---- picking what to comment on (the page's own taps are held back while picking)
  const page = document;
  const mark = page.createElement('style');
  // (cursor:pointer while picking: iOS Safari only sends a tap's click on plain text when it looks tappable)
  mark.textContent = '[data-anawj-fb]{outline:3px solid #e4002b!important;outline-offset:2px!important}html.anawj-fb-picking,html.anawj-fb-picking *{cursor:pointer!important}';
  (page.head || page.documentElement).appendChild(mark);
  let picking = false, target = null;
  const BLOCK = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,td,th,caption,figcaption,blockquote,summary,label,button,a,img,svg,figure,video,canvas,pre,input,select,textarea,[role=button],[role=tab]';
  const inside = e => e.composedPath().includes(hostEl);
  function hold(e) {
    if (!picking || inside(e)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.type !== 'click') return;
    let t = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    t = (t && t.closest(BLOCK)) || t;
    if (t && t.closest('svg') && t.tagName.toLowerCase() !== 'svg') t = t.closest('svg');
    if (!t || t === page.body || t === page.documentElement) return;
    stopPick(); choose(t);
  }
  // (touches are left alone, so the page can still be scrolled while picking)
  ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'submit', 'dblclick'].forEach(ev => page.addEventListener(ev, hold, { capture: true, passive: false }));
  function startPick() { show(null); picking = true; page.documentElement.classList.add('anawj-fb-picking'); $('banner').hidden = false; $('fab').hidden = true; }
  function stopPick() { picking = false; page.documentElement.classList.remove('anawj-fb-picking'); $('banner').hidden = true; $('fab').hidden = false; }

  const clean = s => (s || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const textOf = el => clean(el.innerText || el.textContent || el.getAttribute?.('alt') || el.getAttribute?.('aria-label') || '');
  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== page.body && el !== page.documentElement) {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break; }
      let i = 1, sib = el;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) i++;
      parts.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    // on a live app an id with digits in it may be a record's id: keep only that there was one
    return LIVE_APP ? parts.join(' > ').replace(/#[^ >]*\d[^ >]*/g, '#…') : parts.join(' > ');
  }
  function heading(el) {
    let found = '';
    for (const h of page.querySelectorAll('h1,h2,h3,h4')) {
      if (h === el || h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = textOf(h); else break;
    }
    return found.slice(0, 120);
  }
  const KIND = { p: 'paragraph', li: 'list item', td: 'table cell', th: 'table heading', a: 'link', button: 'button', img: 'image', svg: 'diagram', figure: 'figure', video: 'video', canvas: 'drawing', input: 'input', select: 'choice', textarea: 'text box', label: 'label' };
  const kindOf = el => /^h[1-6]$/i.test(el.tagName) ? 'heading' : KIND[el.tagName.toLowerCase()] || 'part of the screen';

  document.addEventListener('click', e => {
    if (picking || inside(e)) return;
    const el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    const t = el && (el.closest(BLOCK) || el);
    if (t && t !== page.body) note(`tap ${kindOf(t)} ${cssPath(t)}`.slice(0, 160));
  }, { capture: true, passive: true });

  // the page's address as recorded in a comment: on a live app only the path and the screen's name (the query and the
  // rest of the # part can hold record ids); elsewhere the whole address, without ?variant (that's the version shown)
  function here() {
    const u = new URL(location.href);
    u.searchParams.delete('variant'); u.hash = '';
    return LIVE_APP ? { url: u.origin + u.pathname, view: screen() === '(start)' ? '' : screen() } : { url: u.href, view: location.hash };
  }

  let pending = null;
  function choose(el) {
    target = el; el.setAttribute('data-anawj-fb', '');
    const kind = kindOf(el);
    // on a live app, nothing the screen shows is copied: it may be a patient's details or a resident's notes
    const before = LIVE_APP ? '' : (/^(input|textarea|select)$/i.test(el.tagName) ? (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '') : textOf(el)).slice(0, 2000);
    pending = { kind, heading: LIVE_APP ? '' : heading(el), locator: cssPath(el), before };
    $('onText').textContent = 'On: ' + kind + (before ? ' “' + before.slice(0, 160) + (before.length > 160 ? '…' : '') + '”' : '');
    openNote();
  }
  function openNote() {
    $('noteText').value = ''; $('noteText').placeholder = 'What should change?'; $('optOptions').checked = $('optEverywhere').checked = false;
    show('note'); $('noteText').focus();
  }
  function closeNote() {
    stopSpeech();
    if (target) target.removeAttribute('data-anawj-fb');
    target = null; pending = null; show(null);
  }
  $('noteCancel').onclick = closeNote;
  // the owner's shortcut: this comment straight to Ask Claude (ask.anawj.com, behind his sign-in), not the list
  $('askNow').onclick = () => {
    const v = $('noteText').value.trim();
    if (!v) { $('noteText').focus(); return; }
    const h = here(), p = pending || {};
    const q = new URLSearchParams({ page: h.url + (h.view || ''), text: v, kind: p.kind || '', on: p.before || '', locator: p.locator || '' });
    if (p.marks) q.set('on', p.marks.map(m => (m.kind === 'circled' ? 'circled ' : 'arrow ') + m.what).join('; '));
    if ($('optOptions').checked) q.set('options', '1');
    if ($('optEverywhere').checked) q.set('everywhere', '1');
    window.open('https://ask.anawj.com/?' + q, '_blank', 'noopener');
    closeNote();
  };
  $('noteSave').onclick = () => {
    const v = $('noteText').value.trim();
    if (!v) { $('noteText').focus(); return; }
    const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...here(),
      title: document.title, ...pending, text: v, options: $('optOptions').checked || undefined, everywhere: $('optEverywhere').checked || undefined, at: new Date().toISOString() };
    change(() => items.push(item));
    closeNote();
    if (saveFailed) alert('This browser couldn’t keep your comment (storage full or blocked): send your comments now, before leaving the page.');
  };

  // ---- speaking (the browser's speech recognition where there is one; only the text is kept)
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function stopSpeech() { if (rec) { try { rec.abort(); } catch (e) {} rec = null; } $('speak').setAttribute('aria-pressed', 'false'); $('speak').textContent = '🎤 Speak'; }
  if (Speech) {
    $('speak').hidden = false;
    $('speakHint').textContent = 'Check the words before saving: drug names and doses get misheard.';
    $('speak').onclick = () => {
      if (rec) { stopSpeech(); return; }
      const box = $('noteText'), start = box.value ? box.value.replace(/\s*$/, ' ') : '';
      try {
        const me = rec = new Speech(); rec.lang = navigator.language || 'en-GB'; rec.interimResults = true; rec.continuous = true;
        rec.onresult = e => { if (rec !== me) return; let t = ''; for (const r of e.results) t += r[0].transcript; box.value = start + t.trim(); };
        rec.onerror = () => stopSpeech();
        rec.onend = () => { if (rec) stopSpeech(); };
        rec.start(); $('speak').setAttribute('aria-pressed', 'true'); $('speak').textContent = '■ Stop';
      } catch (e) { stopSpeech(); }
    };
  }

  // ---- drawing: circles and arrows over the screen, turned into which parts of the page they mark
  const cv = $('draw'), g = cv.getContext('2d');
  let strokes = [], cur = null;
  function paint() {
    g.clearRect(0, 0, cv.width, cv.height);
    g.lineWidth = 4 * devicePixelRatio; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#e4002b';
    for (const st of [...strokes, ...(cur ? [cur] : [])]) {
      g.beginPath(); st.forEach(([x, y], i) => i ? g.lineTo(x * devicePixelRatio, y * devicePixelRatio) : g.moveTo(x * devicePixelRatio, y * devicePixelRatio)); g.stroke();
    }
  }
  function startDraw() {
    show(null); strokes = []; cur = null;
    cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
    cv.hidden = false; $('drawBar').hidden = false; $('fab').hidden = true; paint();
  }
  function endDraw() { cv.hidden = true; $('drawBar').hidden = true; $('fab').hidden = false; }
  cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = [[e.clientX, e.clientY]]; });
  cv.addEventListener('pointermove', e => { if (cur) { cur.push([e.clientX, e.clientY]); paint(); } });
  const finish = () => { if (cur && cur.length > 2) strokes.push(cur); cur = null; paint(); };
  cv.addEventListener('pointerup', finish); cv.addEventListener('pointercancel', finish);
  $('drawUndo').onclick = () => { strokes.pop(); paint(); };
  $('drawCancel').onclick = endDraw;
  // the part of the page under a point (the drawing hidden for a moment so it isn't in the way)
  function under(x, y) {
    const el = page.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, x)), Math.max(0, Math.min(innerHeight - 1, y)));
    if (!el || el === hostEl || el === page.body || el === page.documentElement) return null;
    const t = el.closest(BLOCK) || el;
    return t.closest('svg') && t.tagName.toLowerCase() !== 'svg' ? t.closest('svg') : t;
  }
  const label = el => { if (!el) return 'empty space'; const t = LIVE_APP ? '' : textOf(el).replace(/\s+/g, ' ').slice(0, 60); return kindOf(el) + (t ? ` “${t}${t.length >= 60 ? '…' : ''}”` : ''); };
  $('drawDone').onclick = () => {
    if (!strokes.length) { endDraw(); return; }
    hostEl.style.display = 'none';
    const marks = strokes.map(st => {
      const xs = st.map(p => p[0]), ys = st.map(p => p[1]);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      const [sx, sy] = st[0], [ex, ey] = st.at(-1), gap = Math.hypot(ex - sx, ey - sy);
      // a shape that comes back near where it started is a circle round something; anything else is an arrow
      if (gap < 0.35 * Math.max(w, h, 1)) {
        const el = under(xs.reduce((a, b) => a + b) / xs.length, ys.reduce((a, b) => a + b) / ys.length);
        return { kind: 'circled', what: label(el), locator: el ? cssPath(el) : '' };
      }
      const a = under(sx, sy), b = under(ex, ey);
      return { kind: 'arrow', what: `from ${label(a)} to ${label(b)}`, locator: [a ? cssPath(a) : '', b ? cssPath(b) : ''].join(' → ') };
    });
    hostEl.style.display = '';
    endDraw();
    pending = { kind: 'drawing', heading: '', locator: '', before: '', marks, size: `${innerWidth}×${innerHeight}`, scroll: Math.round(scrollY) };
    $('onText').textContent = 'You drew: ' + marks.map(m => (m.kind === 'circled' ? 'circled ' : 'arrow ') + m.what).join('; ');
    openNote(); $('noteText').placeholder = 'What should change? e.g. “move this up here”, “too much space”';
  };

  // ---- menu
  $('fab').onclick = async () => {
    $('tip').hidden = true;
    if (!$('menu').hidden) { show(null); return; }
    show('menu');
    // on a preview: links to the same page as it is now (the copy of main) and to the PR's changes
    if (PREVIEW && host.split('.')[0] !== 'anawj-preview') {
      const now = new URL(location.href); now.host = host.replace(/^[^.]+/, 'anawj-preview'); now.searchParams.delete('variant');
      $('cmpNow').href = now.href;
      $('cmp').hidden = false; $('cmpPr').hidden = true;
      if (!pr) pr = await findPr();
      if (pr) { $('cmpPr').href = pr.html_url + '/files'; $('cmpPr').hidden = false; }
    }
  };
  $('mClose').onclick = () => show(null);
  $('mPick').onclick = startPick;
  $('mDraw').onclick = startDraw;
  $('pickCancel').onclick = stopPick;
  // the bar covers one end of the screen: flip it to reach what's underneath
  $('pickFlip').onclick = () => $('banner').classList.toggle('top');
  $('mBug').onclick = async () => {
    // which deploy this phone runs: each app's offline copy is named <app>-<version> (sw.js, stamped at deploy)
    let versions = [];
    try { versions = (await caches.keys()).filter(k => /^[a-z-]+-v?\d/.test(k)).slice(0, 4); } catch (e) {}
    pending = { kind: 'problem', heading: '', locator: '', before: '', problem: { versions,
      screen: screen(), size: `${innerWidth}×${innerHeight}`, browser: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 160),
      online: navigator.onLine, steps: recent.slice(-15), errors: errors.slice() } };
    $('onText').textContent = 'Problem report: say what you did and what went wrong. The last few screens and taps, and any errors, are added (no text from the screen).';
    openNote(); $('noteText').placeholder = 'e.g. I tapped Save and nothing happened';
  };
  $('mPage').onclick = () => { pending = { kind: 'whole screen', heading: '', locator: '', before: '' }; $('onText').textContent = 'On: this whole screen'; openNote(); };
  $('mSide').onclick = () => { store.set(SIDE, side() === 'left' ? 'right' : 'left'); render(); $('ver').className = 'ver ' + side(); };
  $('mOff').onclick = () => {
    if (PREVIEW) { hostEl.remove(); return; } // previews: gone until the page is opened again
    document.cookie = 'anawj-feedback=; Path=/; Max-Age=0; Secure; SameSite=Lax';
    hostEl.remove();
  };
  // a QR code of this page (with the button on), for colleagues to look and comment on their own phones
  $('mShare').onclick = async () => {
    const u = new URL(location.href);
    if (!PREVIEW) u.searchParams.set('feedback', '1');
    u.searchParams.delete('variant');
    const link = u.href;
    $('shareHow').textContent = PREVIEW ? 'Colleagues scan this to see this preview and comment on it with the 💬 button.' : 'Colleagues scan this to open this page with the 💬 button switched on.';
    $('shareLink').textContent = link; $('qr').textContent = '';
    show('share');
    try { const { qrSvg } = await import('/feedback/qr.js'); $('qr').appendChild(qrSvg(link, 'QR code of the link to this page')); }
    catch (e) { $('qr').textContent = 'QR code unavailable here: use Copy link.'; }
    $('shareCopy').onclick = () => { try { navigator.clipboard.writeText(link).catch(() => {}); } catch (e) {} $('shareCopy').textContent = 'Copied'; };
  };
  $('shareClose').onclick = () => show(null);
  $('mList').onclick = () => {
    load(); render();
    const box = $('items'); box.innerHTML = '';
    if (!items.length) box.innerHTML = '<p class="muted">No comments yet.</p>';
    items.forEach(c => {
      const d = document.createElement('div'); d.className = 'item';
      const t = document.createElement('div');
      t.textContent = `${new URL(c.url).pathname}${c.view || ''} · ${c.kind}${c.before ? ' “' + c.before.slice(0, 80) + '”' : ''} → ${c.text}`;
      const rm = document.createElement('button'); rm.textContent = 'Remove';
      rm.onclick = () => { change(() => { items = items.filter(x => x.id !== c.id); }); $('mList').onclick(); };
      d.append(t, rm); box.appendChild(d);
    });
    show('list');
  };
  $('listClose').onclick = () => show('menu');

  // ---- sending: a comment on the preview's PR (copied, then pasted there) or a "Page edits:" issue
  const quote = s => s.split('\n').map(l => '> ' + l).join('\n');
  const who = () => $('who').value.trim().slice(0, 80);
  function report() {
    const urls = [...new Set(items.map(c => c.url))];
    let out = `Suggested by: ${who() || '(name not given)'}\nSent from the feedback button on ${host}${PREVIEW ? ' (a PR preview)' : ''}, ${items.length} comment${items.length === 1 ? '' : 's'}.\n`;
    for (const u of urls) {
      out += `\n## Page: ${u}\n`;
      items.filter(c => c.url === u).forEach((c, i) => {
        if (c.kind === 'choice') { out += `\n### ${i + 1}. Version chosen\n${c.text} Keep that one and remove the others before merging.\n`; return; }
        if (c.marks) {
          out += `\n### ${i + 1}. Drawing (${c.size} screen, scrolled ${c.scroll}px${c.view ? ', view ' + c.view : ''})\nMarks:\n`;
          out += c.marks.map(m => `- ${m.kind === 'circled' ? 'Circled' : 'Arrow'} ${m.what}${m.locator ? ` (\`${m.locator}\`)` : ''}`).join('\n') + '\n';
          out += `Comment:\n${quote(c.text)}\n`;
          if (c.options) out += `Wants options: make 2–3 clearly different versions to choose from, each with its own preview link.\n`;
          return;
        }
        if (c.problem) {
          const p = c.problem;
          out += `\n### ${i + 1}. Something's wrong (screen ${p.screen}${c.view ? ', view ' + c.view : ''})\nWhat happened:\n${quote(c.text)}\n`;
          out += `Device: ${p.size}, ${p.online ? 'online' : 'offline'}, ${p.browser}\n`;
          if (p.versions?.length) out += `App version (offline copy): ${p.versions.join(', ')}\n`;
          out += `Recent steps (oldest first):\n${p.steps.length ? p.steps.map(x => '- ' + x).join('\n') : '- (none recorded)'}\n`;
          out += `Errors:\n${p.errors.length ? p.errors.map(x => '- ' + x).join('\n') : '- none'}\n`;
          return;
        }
        out += `\n### ${i + 1}. Comment (${c.kind}${c.heading ? ', under “' + c.heading + '”' : ''}${c.view ? ', view ' + c.view : ''})\n`;
        if (c.before) out += `On:\n${quote(c.before)}\n`;
        out += `Comment:\n${quote(c.text)}\n`;
        if (c.options) out += `Wants options: make 2–3 clearly different versions to choose from, each with its own preview link.\n`;
        if (c.everywhere) out += `Everywhere: apply this wherever it occurs on the site, and list every place changed.\n`;
        if (c.locator) out += `Locator: \`${c.locator}\`\n`;
      });
    }
    return out;
  }
  const PRIVATE = [
    [/\b[STFGM]\d{7}[A-Z]\b/i, 'an NRIC or FIN'],
    [/\b\d{7,}\b/, 'a long number (a hospital or case number?)'],
    [/\b\d{1,2}[\/.-]\d{1,2}[\/.-](19|20)?\d{2}\b/, 'a date (a date of birth?)'],
    [/(?<![\d.])[689]\d{3}[ -]?\d{4}(?![\d.])/, 'a phone number'],
    [/[\w.+-]+@[\w-]+\.[\w.]+/, 'an email address'],
    [/\b(?:[Mm]rs?|[Mm]s|[Mm]dm|[Mm]adam|[Pp]atient|[Pp]t)\.?\s+[A-Z][a-z]+/, 'what looks like a patient’s name'],
  ];
  function refresh() {
    $('report').value = report(); $('sendNote').hidden = true;
    const typed = items.map(c => c.text + (c.problem ? '\n' + c.problem.errors.join('\n') : '')).join('\n');
    const flags = PRIVATE.filter(([re]) => re.test(typed)).map(([, w]) => w);
    $('privacy').hidden = $('privacyOk').hidden = !flags.length;
    if (flags.length) $('privacy').textContent = `Check before sending: your comments contain ${flags.length > 1 ? flags.slice(0, -1).join(', ') + ' and ' + flags.at(-1) : flags[0]}. This will be public; remove anything that could identify a patient.`;
  }
  const blocked = () => {
    if (!who()) { $('sendNote').textContent = 'Add your name first.'; $('sendNote').hidden = false; $('who').focus(); return true; }
    if (!$('privacyOk').hidden && !$('privacyTick').checked) { $('privacyTick').focus(); return true; }
    return false;
  };
  $('who').value = store.get(WHO, '');
  $('who').addEventListener('input', () => { store.set(WHO, who()); refresh(); });
  function copy(s) {
    const ta = $('report'); ta.value = s;
    try { navigator.clipboard.writeText(s).catch(() => {}); } catch (e) {}
    try { ta.focus(); ta.select(); ta.setSelectionRange(0, s.length); document.execCommand('copy'); } catch (e) {}
  }
  // A preview's address starts with its branch name ("claude-x-y-anawj-preview.….workers.dev"): find that branch's
  // open PR (GitHub's public API, no sign-in) so comments can go straight on it.
  let pr = null;
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  async function findPr() {
    const label = host.split('.')[0].replace(/-anawj-preview$/, '');
    if (!PREVIEW || label === 'anawj-preview' || /^[0-9a-f]{8}$/.test(label)) return null;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=100`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) return null;
      const list = await res.json();
      // an exact match first; a prefix only when Cloudflare may have shortened a long branch name
      return list.find(p => slug(p.head.ref) === label) || (label.length >= 40 && list.find(p => slug(p.head.ref).startsWith(label))) || null;
    } catch (e) { return null; }
  }
  $('mSend').onclick = async () => {
    load(); render();
    if (!items.length) { show('menu'); $('where').textContent = 'No comments yet: use Comment on something first.'; return; }
    $('privacyTick').checked = false;
    refresh(); show('send');
    $('sendHow').textContent = 'Send as a GitHub issue opens GitHub with your comments filled in: sign in if asked, then press Create. Can’t use GitHub? Copy and paste them into a message.';
    if (PREVIEW && !pr) pr = await findPr();
    if (pr) {
      $('toPr').hidden = false; $('toPr').textContent = `Comment on PR #${pr.number}`;
      $('sendHow').textContent = `This preview belongs to PR #${pr.number} (“${pr.title}”). Comment on PR copies your comments and opens the PR: paste them into the comment box at the bottom and press Comment. The session working on it will revise the change.`;
    }
  };
  $('toPr').onclick = () => { if (blocked()) return; copy(report()); window.open(pr.html_url, '_blank', 'noopener'); };
  $('toIssue').onclick = () => {
    if (blocked()) return;
    const body = report();
    const title = ('Page edits: ' + [...new Set(items.map(c => { const u = new URL(c.url); return u.host + u.pathname; }))].join(', ')).slice(0, 140) + ' (' + who() + ')';
    const base = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=`;
    let url = base + encodeURIComponent(body);
    if (url.length > 7500) {
      copy(body); url = base + encodeURIComponent('(Paste the copied comments here.)');
      $('sendNote').textContent = 'Too long to fill in automatically: it has been copied, paste it into the issue’s description.'; $('sendNote').hidden = false;
    }
    window.open(url, '_blank', 'noopener');
  };
  $('copy').onclick = () => { if (blocked()) return; copy(report()); $('copy').textContent = 'Copied'; };
  $('sent').onclick = () => { if (confirm('Clear your list? Only do this once your comments have been sent.')) { change(() => { items = []; }); show(null); } };
  $('sendClose').onclick = () => show(null);
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (!cv.hidden) endDraw(); else if (picking) stopPick(); else if (!$('note').hidden) closeNote(); else show(null); } });
})();
