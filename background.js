// Background event page. Content-script fetch() in Firefox is governed by the
// host page's Content-Security-Policy (connect-src), so strict sites like
// WhatsApp Web or GitHub block lookups with "NetworkError when attempting to
// fetch resource". Requests made here are not subject to any page CSP — only
// the extension's own host_permissions — so they work everywhere.

const ext = (typeof browser !== "undefined" ? browser : chrome);

// Default per-request budget. A host can go dark behind its CDN and sit on the
// connection for ~20s before answering or giving up — api.dictionaryapi.dev did
// exactly that — so every request gets a ceiling. An unbounded fetch here
// freezes the popup for as long as a third party feels like taking.
const DEFAULT_TIMEOUT_MS = 8000;

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "cd-fetch") return;
  fetchJson(msg.url, msg.init, msg.timeoutMs).then(sendResponse);
  return true; // keep the message channel open for the async response
});

async function fetchJson(url, init, timeoutMs) {
  // An AbortSignal can't survive the structured clone through sendMessage, so
  // the caller sends a plain millisecond budget and the signal is built here.
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    let body = null;
    if (res.ok) {
      try { body = await res.json(); } catch { body = null; }
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    // fetch throws TypeError for transport-level failures (DNS, offline,
    // dropped connection) and a TimeoutError DOMException when our budget
    // expires; HTTP error statuses do not throw.
    const timeout = !!e && e.name === "TimeoutError";
    return {
      error: timeout ? `Timed out after ${ms}ms` : ((e && e.message) ? e.message : String(e)),
      network: timeout || e instanceof TypeError,
      timeout
    };
  }
}
