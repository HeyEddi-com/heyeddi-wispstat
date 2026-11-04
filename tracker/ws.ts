/**
 * HeyEddi Wispstat - Privacy-first analytics tracker
 *
 * Cookie-free, no dependencies. Branding: GLOBAL_NAME from branding.config.
 */

(function () {
  'use strict';

  const GLOBAL_NAME = 'wispstat';

  const script = document.currentScript as HTMLScriptElement;
  const siteId = script.getAttribute('data-site');
  const apiUrl = script.getAttribute('data-api') || (script.src ? new URL(script.src).origin + '/e' : '');
  const spaMode = script.getAttribute('data-spa') || 'auto';
  const hashMode = script.hasAttribute('data-hash-mode');
  const autoMode = script.getAttribute('data-auto') !== 'false';
  const autoEvents = script.getAttribute('data-auto-events') !== 'false';
  const heatmapOn = script.getAttribute('data-heatmap') !== 'false';
  const respectDnt = script.hasAttribute('data-respect-dnt');
  const exclude = (script.getAttribute('data-exclude') || '').split(',').filter(Boolean);
  const masks = (script.getAttribute('data-mask') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const fileExt = (script.getAttribute('data-file-types') || 'pdf,zip,doc,docx,xls,xlsx,ppt,pptx,csv,dmg,apk')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const HEAT_GRID = 12;
  const HEAT_GAP_MS = 800;
  const HEAT_MAX = 30;

  if (!siteId || !apiUrl) return;

  if (respectDnt) {
    const nav = navigator as Navigator & { doNotTrack?: string; globalPrivacyControl?: boolean };
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return;
  }

  if (
    document.visibilityState === 'prerender' ||
    (navigator as Navigator & { webdriver?: boolean }).webdriver ||
    location.hostname === 'localhost' ||
    location.protocol === 'file:'
  ) {
    return;
  }

  let lastPath = '';
  let sentReferrer = false;
  let lastHeatAt = 0;
  let heatCount = 0;
  const scrollFired = new Set<number>();

  function maskPath(path: string): string {
    for (const pattern of masks) {
      const star = pattern.indexOf('*');
      const prefix = star === -1 ? pattern : pattern.slice(0, star);
      if (star === -1) {
        if (path === prefix) return prefix;
      } else if (path.startsWith(prefix)) {
        return prefix.replace(/\/$/, '') + '/:x';
      }
    }
    return path;
  }

  function sanitizePart(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 48);
  }

  function track(
    kind: 'pv' | 'ev',
    name?: string,
    opts?: { value?: number; props?: Record<string, string> }
  ) {
    try {
      const path = maskPath(location.pathname + (hashMode ? location.hash : ''));
      if (exclude.some((p) => path.startsWith(p))) return;

      if (kind === 'pv' && path === lastPath) return;
      const firstPageview = kind === 'pv' && !sentReferrer;
      if (kind === 'pv') lastPath = path;

      const payload: Record<string, unknown> = { s: siteId, k: kind, p: path };

      if (kind === 'ev' && name) payload.n = name;

      if (kind === 'ev' && opts?.value !== undefined) {
        const v = opts.value;
        if (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1e9) {
          payload.v = Math.round(v * 100) / 100;
        }
      }

      if (kind === 'ev' && opts?.props && typeof opts.props === 'object') {
        payload.props = opts.props;
      }

      if (firstPageview && document.referrer) {
        sentReferrer = true;
        try {
          const refUrl = new URL(document.referrer);
          if (refUrl.hostname !== location.hostname) payload.r = document.referrer;
        } catch {
          /* ignore */
        }
      } else if (firstPageview) {
        sentReferrer = true;
      }

      const lang = navigator.language?.split('-')[0];
      if (lang && /^[a-z]{2,3}$/.test(lang)) payload.l = lang;

      const params = new URLSearchParams(location.search);
      const us = params.get('utm_source') || params.get('ref') || params.get('via');
      if (us) payload.us = us;
      const um = params.get('utm_medium');
      if (um) payload.um = um;
      const uc = params.get('utm_campaign');
      if (uc) payload.uc = uc;
      const ut = params.get('utm_term');
      if (ut) payload.ut = ut;
      const ux = params.get('utm_content');
      if (ux) payload.ux = ux;

      send(payload);
    } catch {
      /* swallow */
    }
  }

  function send(payload: Record<string, unknown>) {
    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'text/plain' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(apiUrl, blob);
    } else {
      fetch(apiUrl, { method: 'POST', body: blob, keepalive: true }).catch(() => {});
    }
  }

  function closestAnchor(el: EventTarget | null): HTMLAnchorElement | null {
    let node = el as Node | null;
    while (node && node !== document) {
      if (node.nodeName === 'A') return node as HTMLAnchorElement;
      node = node.parentNode;
    }
    return null;
  }

  function recordHeat(ev: MouseEvent) {
    if (!heatmapOn || heatCount >= HEAT_MAX) return;
    if (ev.button !== 0) return;
    const now = Date.now();
    if (now - lastHeatAt < HEAT_GAP_MS) return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    // Viewport-relative grid only — never store raw coordinates or screen size.
    const gx = Math.min(HEAT_GRID - 1, Math.max(0, Math.floor((ev.clientX / w) * HEAT_GRID)));
    const gy = Math.min(HEAT_GRID - 1, Math.max(0, Math.floor((ev.clientY / h) * HEAT_GRID)));
    lastHeatAt = now;
    heatCount += 1;
    track('ev', `hm.${gx}.${gy}`);
  }

  function onClick(ev: MouseEvent) {
    recordHeat(ev);

    const a = closestAnchor(ev.target);
    if (!a || !a.href) return;
    let url: URL;
    try {
      url = new URL(a.href, location.href);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    const sameHost = url.hostname === location.hostname;
    const file = url.pathname.split('/').pop() || '';
    const ext = file.includes('.') ? file.split('.').pop()!.toLowerCase() : '';

    if (!sameHost) {
      const host = sanitizePart(url.hostname) || 'external';
      track('ev', `outbound:${host}`);
      return;
    }
    if (ext && fileExt.includes(ext)) {
      const safe = sanitizePart(file) || sanitizePart(ext) || 'file';
      track('ev', `file_download:${safe}`);
    }
  }

  function onSubmit(ev: Event) {
    const form = ev.target as HTMLFormElement | null;
    if (!form || form.nodeName !== 'FORM') return;
    // Never read field values — only that a submit happened on this page.
    track('ev', 'form_submit');
  }

  function onScroll() {
    if (!heatmapOn) return;
    const doc = document.documentElement;
    const total = doc.scrollHeight - window.innerHeight;
    if (total <= 0) {
      if (!scrollFired.has(100)) {
        scrollFired.add(100);
        track('ev', 'scroll.100');
      }
      return;
    }
    const pct = Math.round((window.scrollY / total) * 100);
    for (const mark of [25, 50, 75, 100]) {
      if (pct >= mark && !scrollFired.has(mark)) {
        scrollFired.add(mark);
        track('ev', `scroll.${mark}`);
      }
    }
  }

  function api(...args: unknown[]) {
    const cmd = args[0];
    if (cmd === 'pageview') {
      track('pv');
    } else if (cmd === 'event') {
      track('ev', args[1] as string, args[2] as { value?: number; props?: Record<string, string> });
    } else if (cmd === 'attribution') {
      const path = maskPath(location.pathname + (hashMode ? location.hash : ''));
      return fetch(apiUrl.replace(/\/e$/, '/a'), {
        method: 'POST',
        body: JSON.stringify({ s: siteId, p: path }),
        headers: { 'content-type': 'application/json' },
        credentials: 'omit',
        keepalive: true,
      }).then((response) => response.json());
    } else if (cmd === 'token') {
      const path = maskPath(location.pathname + (hashMode ? location.hash : ''));
      return fetch(apiUrl.replace(/\/e$/, '/t'), {
        method: 'POST',
        body: JSON.stringify({ s: siteId, p: path }),
        headers: { 'content-type': 'application/json' },
        credentials: 'omit',
        keepalive: true,
      }).then((response) => response.json());
    }
  }

  const global = (window as unknown as Record<string, { q?: unknown[][] }>)[GLOBAL_NAME];
  if (global && global.q) {
    global.q.forEach((queued) => api(...queued));
  }
  (window as unknown as Record<string, unknown>)[GLOBAL_NAME] = api;

  function onNavigate() {
    heatCount = 0;
    scrollFired.clear();
    setTimeout(() => track('pv'), 50);
    if (heatmapOn) setTimeout(onScroll, 120);
  }

  if (autoMode) track('pv');

  if (spaMode === 'auto') {
    const pushState = history.pushState;
    const replaceState = history.replaceState;
    history.pushState = function (...args) {
      pushState.apply(history, args);
      onNavigate();
    };
    history.replaceState = function (...args) {
      replaceState.apply(history, args);
      onNavigate();
    };
    window.addEventListener('popstate', onNavigate);
  }

  if (autoEvents) {
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
  }
  if (heatmapOn) {
    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(onScroll, 200);
  }
})();
