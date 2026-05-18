// Background event page. Content-script fetch() in Firefox is governed by the
// host page's Content-Security-Policy (connect-src), so strict sites like
// WhatsApp Web or GitHub block lookups with "NetworkError when attempting to
// fetch resource". Requests made here are not subject to any page CSP — only
// the extension's own host_permissions — so they work everywhere.

const ext = (typeof browser !== "undefined" ? browser : chrome);

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "cd-fetch") return;
  fetchJson(msg.url, msg.init).then(sendResponse);
  return true; // keep the message channel open for the async response
});

async function fetchJson(url, init) {
  try {
    const res = await fetch(url, init);
    let body = null;
    if (res.ok) {
      try { body = await res.json(); } catch { body = null; }
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    // fetch throws TypeError for transport-level failures (DNS, offline,
    // dropped connection); HTTP error statuses do not throw.
    return {
      error: (e && e.message) ? e.message : String(e),
      network: e instanceof TypeError
    };
  }
}
