import { CONFIG } from "./constants";

(() => {
  const reserved = new Map<string, boolean>();
  let processed = new WeakMap<HTMLScriptElement, string>();
  const nativeReserved = new Set<string>();
  let currentUrl = location.href;
  const details = new Map<string, { value: boolean | undefined; expires: number }>();
  const pending = new Set<string>();
  const observed = new WeakSet<Element>();
  const queue: Array<{ id: string; url: string; card: HTMLElement }> = [];
  let inFlight = 0;
  let paused = false;
  function cardInfo(card: HTMLElement): { id: string | undefined; url: string | undefined } {
    const link = card.querySelector<HTMLAnchorElement>(CONFIG.LINK_SELECTOR);
    return { id: card.dataset.itemId || link?.pathname.match(/_(\d+)$/)?.[1], url: link?.href };
  }
  function distance(card: HTMLElement): number {
    const rect = card.getBoundingClientRect();
    return Math.max(0, rect.top - innerHeight, -rect.bottom);
  }
  function pump(): void {
    while (!paused && inFlight < CONFIG.MAX_REQUESTS && queue.length) {
      // Re-evaluate priority when a slot opens: scrolling may have changed visibility.
      queue.sort((a, b) => distance(a.card) - distance(b.card));
      const task = queue.shift()!;
      // Ignore results that became known while waiting in the queue.
      if (reserved.has(task.id)) { pending.delete(task.id); continue; }
      inFlight++;
      void checkDetail(task).finally(() => {
        pending.delete(task.id);
        // Space subsequent requests out to avoid bursts while scrolling.
        setTimeout(() => { inFlight--; pump(); }, CONFIG.REQUEST_DELAY_MS);
      });
    }
  }
  async function checkDetail(task: { id: string; url: string }): Promise<void> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(task.url, { signal: abort.signal, credentials: 'same-origin' });
      if (!response.ok) { if (response.status === 403 || response.status === 429) paused = true; return; }
      const returned = new URL(response.url);
      if (returned.origin !== location.origin || !returned.pathname.endsWith('_' + task.id)) return;
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let value: boolean | undefined;
      // Detail pages expose the flag in deliveryInfo, unlike home recommendations.
      // Read only script state, never seller descriptions, and never execute scripts.
      for (const script of doc.scripts) {
        const text = (script.textContent || '').replace(/\\"/g, '"');
        const match = text.match(/"deliveryInfo"\s*:\s*\{[^{}]*?"isReserved"\s*:\s*(true|false)/);
        if (match) { value = match[1] === 'true'; break; }
      }
      details.set(task.id, { value, expires: Date.now() + (value === undefined ? CONFIG.UNKNOWN_TTL_MS : CONFIG.STATUS_TTL_MS) });
      if (value === undefined) { paused = true; return; } // Stop on verification/unknown page format.
      scheduleUpdate();
    } catch { /* Network errors do not imply an unreserved item. */ }
    finally { clearTimeout(timeout); }
  }
  const viewport = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const { id, url } = cardInfo(entry.target as HTMLElement);
      if (!id || !url || reserved.has(id) || nativeReserved.has(id) || pending.has(id)) continue;
      const cached = details.get(id);
      if (cached && cached.expires > Date.now()) continue;
      if (new URL(url).origin !== location.origin) continue;
      pending.add(id);
      queue.push({ id, url, card: entry.target as HTMLElement });
    }
    pump();
  }, { rootMargin: CONFIG.PREFETCH_MARGIN });
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if (obj.id != null && typeof obj.isReserved === 'boolean') {
      reserved.set(String(obj.id), obj.isReserved);
    }
    for (const child of Object.values(obj)) collect(child);
  }
  function readState(): void {
    for (const script of document.querySelectorAll<HTMLScriptElement>('script')) {
      const text = script.textContent || '';
      if (!text.includes('isReserved') || processed.get(script) === text) continue;
      processed.set(script, text);
      try { collect(JSON.parse(text)); } catch { /* Script can contain an assignment. */ }
      // Parse embedded JSON strings without executing page JavaScript.
      for (const match of text.matchAll(/'(\{(?:\\.|[^'\\])*\})'/gs)) {
        try {
          const json = match[1].replace(/\\'/g, "'");
          collect(JSON.parse(json));
        } catch { /* Unrelated scripts are ignored. */ }
      }
    }
  }
  function update(): void {
    if (location.href !== currentUrl) {
      reserved.clear();
      nativeReserved.clear();
      processed = new WeakMap<HTMLScriptElement, string>();
      currentUrl = location.href;
    }
    readState();
    for (const card of document.querySelectorAll<HTMLElement>(CONFIG.CARD_SELECTOR)) {
      const link = card.querySelector<HTMLAnchorElement>(CONFIG.LINK_SELECTOR);
      const id = card.dataset.itemId || link?.pathname.match(/_(\d+)$/)?.[1];
      const cached = id ? details.get(id) : undefined;
      const known = id ? (reserved.get(id) ?? (cached && cached.expires > Date.now() ? cached.value : undefined)) : undefined;
      if (card.matches(CONFIG.HOME_SELECTOR) && known === undefined && !observed.has(card)) {
        observed.add(card);
        viewport?.observe(card);
      }
      const nativeLabel = [...card.querySelectorAll('span')].some(el =>
        !el.closest('.arm-badge') && el.textContent?.trim() === CONFIG.BADGE_TEXT);
      // Avito may hide its reservation text while the photo gallery is hovered.
      // Keep that evidence for this listing ID, but explicit JSON false wins.
      if (id && known === false) nativeReserved.delete(id);
      else if (id && nativeLabel) nativeReserved.add(id);
      const active = known === true || (known === undefined &&
        (nativeLabel || (id !== undefined && nativeReserved.has(id))));
      card.toggleAttribute('data-arm-reserved', active);
      card.classList.toggle('arm-reserved', active);
      // A normal outline is painted below positioned gallery children.
      // Give the border its own top layer without intercepting mouse events.
      const frame = card.querySelector(':scope > .arm-frame');
      if (active && !frame) {
        const overlay = document.createElement('div');
        overlay.className = 'arm-frame';
        overlay.setAttribute('aria-hidden', 'true');
        card.append(overlay);
      } else if (!active) frame?.remove();
      let badge = card.querySelector<HTMLElement>('.arm-badge');
      if (active) {
        const home = card.matches(CONFIG.HOME_SELECTOR);
        const host = home ? card :
          card.querySelector<HTMLElement>('[class*="sellerInfo-"]') ??
          card.querySelector<HTMLElement>('[class*="asideContent-"]') ?? card;
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'arm-badge';
          badge.textContent = CONFIG.BADGE_TEXT;
          badge.title = CONFIG.BADGE_TITLE;
        }
        // Keep the label outside the gallery and relocate it after React updates.
        if (badge.parentElement !== host || host.lastElementChild !== badge) host.append(badge);
      } else badge?.remove();
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  function scheduleUpdate(): void {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      observer.disconnect();
      update();
      watch();
    }, CONFIG.UPDATE_DELAY_MS);
  }
  const observer = new MutationObserver(scheduleUpdate);
  function watch(): void {
    observer.observe(document.documentElement, {childList:true, subtree:true, characterData:true,
      attributes:true, attributeFilter:['data-item-id','href','class','data-arm-reserved']});
  }
  update();
  watch();
})();
