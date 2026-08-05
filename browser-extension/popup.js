const titleElement = document.querySelector('#page-title');
const urlElement = document.querySelector('#page-url');
const form = document.querySelector('#capture-form');
const appUrlInput = document.querySelector('#app-url');
const slugInput = document.querySelector('#workspace-slug');
const message = document.querySelector('#message');
const button = document.querySelector('#capture-button');

let activeTab = null;

async function initialize() {
  const saved = await chrome.storage.sync.get(['appUrl', 'workspaceSlug']);
  if (saved.appUrl) appUrlInput.value = saved.appUrl;
  if (saved.workspaceSlug) slugInput.value = saved.workspaceSlug;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  titleElement.textContent = activeTab?.title || 'Untitled page';
  urlElement.textContent = activeTab?.url || 'This page cannot be captured.';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';

  if (!activeTab?.url || !/^https?:\/\//i.test(activeTab.url)) {
    message.textContent = 'Open a normal website tab before capturing.';
    return;
  }

  let appUrl;
  try {
    appUrl = new URL(appUrlInput.value);
    if (!['https:', 'http:'].includes(appUrl.protocol)) throw new Error();
  } catch {
    message.textContent = 'Enter a valid Coldingrod app URL.';
    return;
  }

  const workspaceSlug = slugInput.value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(workspaceSlug)) {
    message.textContent = 'Enter the workspace slug shown in your dashboard URL.';
    return;
  }

  button.disabled = true;
  await chrome.storage.sync.set({
    appUrl: appUrl.origin,
    workspaceSlug,
  });

  const destination = new URL(`/dashboard/${encodeURIComponent(workspaceSlug)}/leads/discovery`, appUrl.origin);
  destination.searchParams.set('capture', 'extension');
  destination.searchParams.set('sourceUrl', activeTab.url);
  destination.searchParams.set('title', activeTab.title || 'Captured business page');
  await chrome.tabs.create({ url: destination.toString() });
  window.close();
});

initialize().catch(() => {
  titleElement.textContent = 'Unable to read this tab';
  message.textContent = 'Close and reopen the extension on a website tab.';
});