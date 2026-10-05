/**
 * Privacy-first analytics tracker
 * 
 * Cookie-free, ≤2KB gzipped, no dependencies
 * Branding: Uses centralized config for naming
 */

(function() {
  'use strict';
  
  const GLOBAL_NAME = 'edgemetrics'; // Will be replaced by build from branding.config
  
  // Config from script attributes
  const script = document.currentScript as HTMLScriptElement;
  const siteId = script.getAttribute('data-site');
  const apiUrl = script.getAttribute('data-api') || (script.src ? new URL(script.src).origin + '/e' : '');
  const spaMode = script.getAttribute('data-spa') || 'auto';
  const hashMode = script.hasAttribute('data-hash-mode');
  const autoMode = script.getAttribute('data-auto') !== 'false';
  const respectDnt = script.hasAttribute('data-respect-dnt');
  const exclude = (script.getAttribute('data-exclude') || '').split(',').filter(Boolean);
  
  // Skip if invalid config
  if (!siteId || !apiUrl) return;
  
  // Check DNT/GPC
  if (respectDnt) {
    const nav = navigator as any;
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) {
      return;
    }
  }
  
  // Skip if prerendering, webdriver, localhost, or file
  if (document.visibilityState === 'prerender' || 
      (navigator as any).webdriver ||
      location.hostname === 'localhost' ||
      location.protocol === 'file:') {
    return;
  }
  
  let lastPath = '';
  
  function track(kind: 'pv' | 'ev', name?: string, opts?: { value?: number }) {
    try {
      const path = location.pathname + (hashMode ? location.hash : '');
      
      // Check exclusions
      if (exclude.some(p => path.startsWith(p))) return;
      
      // Dedupe
      if (kind === 'pv' && path === lastPath) return;
      if (kind === 'pv') lastPath = path;
      
      const payload: any = {
        s: siteId,
        k: kind,
        p: path,
      };
      
      if (kind === 'ev' && name) {
        payload.n = name;
      }
      
      // Value
      if (kind === 'ev' && opts?.value !== undefined) {
        const v = opts.value;
        if (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1e9) {
          payload.v = Math.round(v * 100) / 100;
        }
      }
      
      // Referrer (only on first pageview of session)
      if (kind === 'pv' && !lastPath && document.referrer) {
        try {
          const refUrl = new URL(document.referrer);
          if (refUrl.hostname !== location.hostname) {
            payload.r = document.referrer;
          }
        } catch {}
      }
      
      // Language (base only)
      const lang = navigator.language?.split('-')[0];
      if (lang && /^[a-z]{2,3}$/.test(lang)) {
        payload.l = lang;
      }
      
      // UTM params
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
      
    } catch (err) {
      // Swallow errors
    }
  }
  
  function send(payload: any) {
    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'text/plain' });
    
    if (navigator.sendBeacon) {
      navigator.sendBeacon(apiUrl, blob);
    } else {
      fetch(apiUrl, {
        method: 'POST',
        body: blob,
        keepalive: true,
      }).catch(() => {});
    }
  }
  
  // API
  function api(...args: any[]) {
    const cmd = args[0];
    
    if (cmd === 'pageview') {
      track('pv');
    } else if (cmd === 'event') {
      track('ev', args[1], args[2]);
    }
  }
  
  // Process queue
  const global = (window as any)[GLOBAL_NAME];
  if (global && global.q) {
    global.q.forEach((args: any) => api(...args));
  }
  
  (window as any)[GLOBAL_NAME] = api;
  
  // Auto pageview
  if (autoMode) {
    track('pv');
  }
  
  // SPA support
  if (spaMode === 'auto') {
    const pushState = history.pushState;
    const replaceState = history.replaceState;
    
    history.pushState = function(...args) {
      pushState.apply(history, args);
      setTimeout(() => track('pv'), 50);
    };
    
    history.replaceState = function(...args) {
      replaceState.apply(history, args);
      setTimeout(() => track('pv'), 50);
    };
    
    window.addEventListener('popstate', () => {
      setTimeout(() => track('pv'), 50);
    });
  }
})();
