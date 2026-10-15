/*
  NUHS-style app kit: the behaviour that goes with app.css. Optional, no dependencies, safe to load twice.
  <script src="../nuhsdesign/app.js" defer></script>

  window.aSheet.open(dialogEl) / aSheet.close(dialogEl): bottom sheet that slides up; drag the grabber or the header
    down, tap the dim backdrop or press Escape to close. A button with value="cancel" inside closes it too.
  window.aToast(text, { action, onAction, ms }): short message above the tab bar, with an optional action (Undo).
  window.aGo(fn, { back }): run fn (which changes the screen) inside a slide transition, back = slide the other way.
  Automatic: the bar's small title appears once the large title (.a-title) scrolls under it; .is-scrolled on the bar
  adds its hairline; --a-kb holds the keyboard's height so sheets stay above it; <html> gets .a-standalone when the
  app is installed.
*/
(() => {
  if (window.aSheet) return;
  const root = document.documentElement;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // installed as an app (home-screen icon) rather than in a browser tab
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  root.classList.toggle('a-standalone', standalone);

  // ---------- app bar: hairline once content scrolls under it; small title once the large one has gone ----------
  function watchBar() {
    const bar = document.querySelector('.a-bar');
    if (!bar) return;
    const onScroll = () => bar.classList.toggle('is-scrolled', scrollY > 2);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    let io;
    const large = () => {
      io?.disconnect();
      // the first large title that is actually showing (screens are often switched with hidden)
      const t = [...document.querySelectorAll('.a-main .a-title')].find(el => el.getClientRects().length);
      // a screen change: snap the small title to its new state instead of fading (no flicker)
      bar.classList.add('no-fade');
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('no-fade')));
      if (!t || !('IntersectionObserver' in window)) { delete bar.dataset.large; return; }
      bar.dataset.large = '';
      io = new IntersectionObserver(([e]) => bar.classList.toggle('is-scrolled', !e.isIntersecting || scrollY > 2),
        { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` });
      io.observe(t);
    };
    large();
    window.aRefreshBar = large;   // call after rendering a new screen
  }

  // ---------- keyboard: keep sheets above it (iOS doesn't resize the page when the keyboard opens) ----------
  if (window.visualViewport) {
    const vv = visualViewport;
    const kb = () => root.style.setProperty('--a-kb', Math.max(0, innerHeight - vv.height - vv.offsetTop) + 'px');
    vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb); kb();
  }

  // ---------- bottom sheets ----------
  const sheet = {
    open(el) {
      if (!el || el.open) return;
      el.classList.remove('is-closing');
      el.showModal();
      if (!el._aWired) wire(el);
    },
    close(el, value) {
      if (!el?.open) return;
      if (reduced() || !el.classList.contains('a-sheet')) { el.close(value); return; }
      el.classList.add('is-closing');
      const done = () => { el.classList.remove('is-closing'); el.style.transform = ''; el.close(value); };
      el.addEventListener('animationend', done, { once: true });
      setTimeout(() => el.open && el.classList.contains('is-closing') && done(), 400);
    },
  };
  function wire(el) {
    el._aWired = true;
    // Escape and the back gesture: animate out instead of vanishing
    el.addEventListener('cancel', e => { e.preventDefault(); sheet.close(el, 'cancel'); });
    // tap on the dim backdrop (the click lands on the dialog itself, outside its box)
    el.addEventListener('click', e => {
      if (e.target !== el) return;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) sheet.close(el, 'cancel');
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('button[value="cancel"]');
      if (b && el.contains(b)) { e.preventDefault(); sheet.close(el, 'cancel'); }
    });
    if (!el.classList.contains('a-sheet')) return;
    // drag down from the grabber or header to dismiss
    let y0 = null, dy = 0, t0 = 0;
    el.addEventListener('pointerdown', e => {
      const r = el.getBoundingClientRect();
      const inHead = e.clientY - r.top < 56 || e.target.closest('.a-sheet-head');
      if (!inHead || e.target.closest('button, a, input, select, textarea') || el.scrollTop > 0) return;
      y0 = e.clientY; dy = 0; t0 = performance.now(); el.style.transition = 'none';
    });
    el.addEventListener('pointermove', e => {
      if (y0 == null) return;
      dy = Math.max(0, e.clientY - y0);
      el.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (y0 == null) return;
      const fast = dy / Math.max(1, performance.now() - t0) > .6;
      y0 = null; el.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
      if (dy > el.offsetHeight * .3 || (fast && dy > 30)) { el.style.transform = ''; el.style.transition = ''; sheet.close(el, 'cancel'); }
      else { el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 260); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  window.aSheet = sheet;

  // ---------- toast ----------
  let toastEl, toastTimer;
  window.aToast = (text, { action, onAction, ms = 3200 } = {}) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'a-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.append(toastEl);
    }
    toastEl.replaceChildren(Object.assign(document.createElement('span'), { textContent: text }));
    if (action) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: action });
      b.onclick = () => { hide(); onAction?.(); };
      toastEl.append(b);
    }
    const hide = () => toastEl.classList.remove('is-shown');
    requestAnimationFrame(() => toastEl.classList.add('is-shown'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hide, action ? Math.max(ms, 5000) : ms);
  };

  // ---------- screen changes: slide like a native navigation stack ----------
  window.aGo = (fn, { back = false } = {}) => {
    const after = () => { window.aRefreshBar?.(); };
    if (!document.startViewTransition || reduced()) { fn(); after(); return; }
    const cls = back ? 'a-nav-pop' : 'a-nav-push';
    root.classList.add(cls);
    const t = document.startViewTransition(() => { fn(); scrollTo(0, 0); });
    t.finished.finally(() => { root.classList.remove(cls); after(); });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchBar);
  else watchBar();
})();
