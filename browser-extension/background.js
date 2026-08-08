async function configureCompanion() {
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true,
  });
  await chrome.storage.local.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
}

chrome.runtime.onInstalled.addListener(() => {
  configureCompanion().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  configureCompanion().catch(() => {});
});

configureCompanion().catch(() => {});

const APP_ORIGINS = new Set([
  'https://coldingrod.vercel.app',
  'http://localhost:3000',
]);
const PAIRING_KEY_PATTERN = /^cgr_[A-Za-z0-9_-]{43}$/;

function trustedAppTab(sender) {
  try {
    return APP_ORIGINS.has(new URL(sender?.tab?.url || '').origin);
  } catch {
    return false;
  }
}

function validDestination(platform, value) {
  const destination = String(value || '');
  if (platform === 'email') return /^mailto:[^?]+/i.test(destination);
  if (platform === 'sms') return /^sms:[^?]+/i.test(destination);
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:') return false;
    if (platform === 'whatsapp') return url.hostname === 'wa.me';
    if (platform === 'linkedin') {
      return url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com');
    }
    if (platform === 'instagram') {
      return url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com');
    }
  } catch {
    return false;
  }
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'COLDINGROD_APP_BRIDGE' || !trustedAppTab(sender)) {
    return false;
  }

  (async () => {
    if (message.action === 'status') {
      const saved = await chrome.storage.local.get(['pairingKey']);
      return {
        paired: PAIRING_KEY_PATTERN.test(String(saved.pairingKey || '')),
        version: chrome.runtime.getManifest().version,
      };
    }

    if (message.action === 'open_delivery') {
      const platform = String(message.payload?.platform || '');
      const destination = String(message.payload?.destination || '');
      if (!validDestination(platform, destination)) {
        throw new Error('The delivery destination was rejected.');
      }
      const tab = await chrome.tabs.create({ url: destination, active: false });
      return { opened: true, tabId: tab.id ?? null };
    }

    throw new Error('Unsupported companion request.');
  })()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({
      ok: false,
      error: error?.message || 'Companion request failed.',
    }));

  return true;
});
