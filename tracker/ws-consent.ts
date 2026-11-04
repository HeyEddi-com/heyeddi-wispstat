/**
 * Consent-mode tracker — first-party cid in localStorage when operator calls consent(true).
 * Default ws.js has no storage. This build is only for sites with consent_mode ON.
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
  const fileExt = (script.getAttribute('data-file-types') || 'pdf,zip,doc,docx,xls,xlsx,ppt,pptx,csv,dmg,apk')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const HEAT_GRID = 12;
  let lastHeatAt = 0;
  let heatCount = 0;
  const scrollFired = new Set<number>();
  const storageKey = `ws_cid_${siteId || ''}`;

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

  let consented = false;
  let cid: string | null = null;
  let lastPath = '';
  let sentReferrer = false;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw && /^[0-9a-f]{32}$/i.test(raw)) {
      cid = raw;
      consented = true;
    }
  } catch {
    /* ignore */
  }

  function newCid(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function track(kind: 'pv' | 'ev', name?: string, opts?: { value?: number; props?: Record<string, string> }) {
    try {
      const path = location.pathname + (hashMode ? location.hash : '');
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
      if (kind === 'ev' && opts?.props) payload.props = opts.props;
      if (consented && cid) payload.cid = cid;

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

      const json = JSON.stringify(payload);
      const blob = new Blob([json], { type: 'text/plain' });
      if (navigator.sendBeacon) navigator.sendBeacon(apiUrl, blob);
      else fetch(apiUrl, { method: 'POST', body: blob, keepalive: true }).catch(() => {});
    } catch {
      /* swallow */
    }
  }

  function api(...args: unknown[]) {
    const cmd = args[0];
    if (cmd === 'pageview') track('pv');
    else if (cmd === 'event') track('ev', args[1] as string, args[2] as { value?: number; props?: Record<string, string> });
    else if (cmd === 'consent') {
      const on = !!args[1];
      if (!on) {
        const previous = cid;
        consented = false;
        cid = null;
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
        if (previous) {
          fetch(apiUrl.replace(/\/e$/, '/c/forget'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ s: siteId, cid: previous }),
            keepalive: true,
          }).catch(() => {});
        }
        return;
      }
      consented = true;
      if (!cid) {
        cid = newCid();
        try {
          localStorage.setItem(storageKey, cid);
        } catch {
          /* ignore */
        }
      }
      track('pv');
    } else if (cmd === 'token') {
      return fetch(apiUrl.replace(/\/e$/, '/t'), {
        method: 'POST',
        body: JSON.stringify({ s: siteId, p: location.pathname }),
        headers: { 'content-type': 'application/json' },
        credentials: 'omit',
        keepalive: true,
      }).then((r) => r.json());
    }
  }

  const global = (window as unknown as Record<string, { q?: unknown[][] }>)[GLOBAL_NAME];
  if (global?.q) global.q.forEach((a) => api(...a));
  (window as unknown as Record<string, unknown>)[GLOBAL_NAME] = api;

  if (autoMode) track('pv');

  if (spaMode === 'auto') {
    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);
    history.pushState = (...args) => {
      pushState(...args);
      setTimeout(() => track('pv'), 50);
    };
    history.replaceState = (...args) => {
      replaceState(...args);
      setTimeout(() => track('pv'), 50);
    };
    window.addEventListener('popstate', () => setTimeout(() => track('pv'), 50));
  }

  function sanitizePart(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 48);
  }

  function closestAnchor(el: EventTarget | null): HTMLAnchorElement | null {
    let node = el as Node | null;
    while (node && node !== document) {
      if (node.nodeName === 'A') return node as HTMLAnchorElement;
      node = node.parentNode;
    }
    return null;
  }

  if (autoEvents) {
    document.addEventListener(
      'click',
      (ev) => {
        if (heatmapOn && ev.button === 0 && heatCount < 30) {
          const now = Date.now();
          if (now - lastHeatAt >= 800) {
            const w = window.innerWidth || 1;
            const h = window.innerHeight || 1;
            const gx = Math.min(HEAT_GRID - 1, Math.max(0, Math.floor((ev.clientX / w) * HEAT_GRID)));
            const gy = Math.min(HEAT_GRID - 1, Math.max(0, Math.floor((ev.clientY / h) * HEAT_GRID)));
            lastHeatAt = now;
            heatCount += 1;
            track('ev', `hm.${gx}.${gy}`);
          }
        }
        const a = closestAnchor(ev.target);
        if (!a?.href) return;
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
          track('ev', `outbound:${sanitizePart(url.hostname) || 'external'}`);
        } else if (ext && fileExt.includes(ext)) {
          track('ev', `file_download:${sanitizePart(file) || sanitizePart(ext) || 'file'}`);
        }
      },
      true
    );
    document.addEventListener(
      'submit',
      (ev) => {
        if ((ev.target as HTMLElement | null)?.nodeName === 'FORM') track('ev', 'form_submit');
      },
      true
    );
  }

  if (heatmapOn) {
    window.addEventListener(
      'scroll',
      () => {
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        const pct = total <= 0 ? 100 : Math.round((window.scrollY / total) * 100);
        for (const mark of [25, 50, 75, 100]) {
          if (pct >= mark && !scrollFired.has(mark)) {
            scrollFired.add(mark);
            track('ev', `scroll.${mark}`);
          }
        }
      },
      { passive: true }
    );
  }
})();
