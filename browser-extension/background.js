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
