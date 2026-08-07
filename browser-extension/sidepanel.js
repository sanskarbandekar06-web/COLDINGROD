const elements = {
  setupView: document.querySelector('#setup-view'),
  companionView: document.querySelector('#companion-view'),
  setupForm: document.querySelector('#setup-form'),
  appUrl: document.querySelector('#app-url'),
  pairingKey: document.querySelector('#pairing-key'),
  connectButton: document.querySelector('#connect-button'),
  openSetupLink: document.querySelector('#open-setup-link'),
  connectionBadge: document.querySelector('#connection-badge'),
  connectionLabel: document.querySelector('#connection-label'),
  liveMessage: document.querySelector('#live-message'),
  workspaceHeading: document.querySelector('#workspace-heading'),
  refreshButton: document.querySelector('#refresh-button'),
  pageTitle: document.querySelector('#page-title'),
  pageUrl: document.querySelector('#page-url'),
  captureButton: document.querySelector('#capture-button'),
  leadSelect: document.querySelector('#lead-select'),
  contactField: document.querySelector('#contact-field'),
  contactSelect: document.querySelector('#contact-select'),
  leadEmpty: document.querySelector('#lead-empty'),
  matchBadge: document.querySelector('#match-badge'),
  composeSection: document.querySelector('#compose-section'),
  composeForm: document.querySelector('#compose-form'),
  channelSelect: document.querySelector('#channel-select'),
  subjectField: document.querySelector('#subject-field'),
  subjectInput: document.querySelector('#subject-input'),
  messageInput: document.querySelector('#message-input'),
  draftButton: document.querySelector('#draft-button'),
  historySection: document.querySelector('#history-section'),
  historyCount: document.querySelector('#history-count'),
  messageList: document.querySelector('#message-list'),
  openWorkspaceLink: document.querySelector('#open-workspace-link'),
  disconnectButton: document.querySelector('#disconnect-button'),
};

const state = {
  appUrl: 'https://coldingrod.vercel.app',
  pairingKey: '',
  activeTab: null,
  context: null,
  selectedContactId: '',
  preparedMessageIds: new Set(),
};

const ALLOWED_APP_URLS = new Set([
  'https://coldingrod.vercel.app',
  'http://localhost:3000',
]);
const PAIRING_KEY_PATTERN = /^cgr_[A-Za-z0-9_-]{43}$/;
const STATUS_CLASSES = new Set([
  'draft',
  'pending_approval',
  'scheduled',
  'sent',
  'delivered',
  'failed',
  'replied',
]);

function setLiveMessage(text = '', type = '') {
  elements.liveMessage.textContent = text;
  elements.liveMessage.className = `live-message${type ? ` ${type}` : ''}`;
}

function setConnectionStatus(connected) {
  elements.connectionBadge.classList.toggle('connected', connected);
  elements.connectionBadge.title = connected
    ? 'Connected to Coldingrod'
    : 'Not connected';
  elements.connectionLabel.textContent = connected ? 'Connected' : 'Offline';
}

function showSetup() {
  elements.setupView.classList.remove('hidden');
  elements.companionView.classList.add('hidden');
  setConnectionStatus(false);
}

function showCompanion() {
  elements.setupView.classList.add('hidden');
  elements.companionView.classList.remove('hidden');
  setConnectionStatus(true);
}

function setButtonBusy(button, busy, busyLabel, readyLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : readyLabel;
}

async function companionRequest(action, payload = {}) {
  const response = await fetch(`${state.appUrl}/api/browser-extension`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.pairingKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
    cache: 'no-store',
  });

  let result;
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    const error = new Error(
      result.error || 'The Coldingrod companion request failed.',
    );
    error.code = result.code || 'REQUEST_FAILED';
    throw error;
  }
  return result.data;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    return {
      id: tab?.id ?? null,
      title: tab?.title || 'Browser page unavailable',
      url: '',
    };
  }
  return {
    id: tab.id ?? null,
    title: tab.title || 'Untitled page',
    url: tab.url,
  };
}

function updateActivePage() {
  const tab = state.activeTab;
  elements.pageTitle.textContent = tab?.title || 'Unable to read current page';
  elements.pageUrl.textContent =
    tab?.url || 'Open a normal HTTP(S) page, then click refresh.';
  elements.captureButton.disabled = !tab?.url;
}

function makeOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function contactName(contact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ');
}

function selectedContact() {
  const contacts = state.context?.selected_lead?.contacts ?? [];
  return (
    contacts.find((contact) => contact.id === state.selectedContactId) ?? null
  );
}

function reachableChannels(contact) {
  if (!contact) return [];
  const channels = [];
  if (contact.email) channels.push({ value: 'email', label: 'Email' });
  if (contact.linkedin_url) {
    channels.push({ value: 'linkedin', label: 'LinkedIn' });
  }
  if (contact.phone) {
    channels.push({ value: 'whatsapp', label: 'WhatsApp' });
    channels.push({ value: 'sms', label: 'SMS' });
  }
  if (contact.instagram_handle) {
    channels.push({ value: 'instagram', label: 'Instagram' });
  }
  return channels;
}

function renderChannels() {
  const previous = elements.channelSelect.value;
  elements.channelSelect.replaceChildren(
    makeOption('', 'Choose reachable channel…'),
  );
  for (const channel of reachableChannels(selectedContact())) {
    elements.channelSelect.append(makeOption(channel.value, channel.label));
  }
  if (
    Array.from(elements.channelSelect.options).some(
      (option) => option.value === previous,
    )
  ) {
    elements.channelSelect.value = previous;
  }
  elements.subjectField.classList.toggle(
    'hidden',
    elements.channelSelect.value !== 'email',
  );
}

function renderContacts() {
  const contacts = state.context?.selected_lead?.contacts ?? [];
  elements.contactSelect.replaceChildren(
    makeOption('', 'Choose a contact…'),
  );
  for (const contact of contacts) {
    const suffix = contact.job_title ? ` — ${contact.job_title}` : '';
    elements.contactSelect.append(
      makeOption(contact.id, `${contactName(contact)}${suffix}`),
    );
  }

  if (!contacts.some((contact) => contact.id === state.selectedContactId)) {
    state.selectedContactId =
      contacts.find((contact) => contact.is_primary)?.id ??
      contacts[0]?.id ??
      '';
  }
  elements.contactSelect.value = state.selectedContactId;
  elements.contactField.classList.toggle('hidden', contacts.length === 0);

  const canDraft =
    Boolean(state.context?.selected_lead) &&
    Boolean(state.selectedContactId) &&
    state.context?.permissions?.includes('manage_leads');
  elements.composeSection.classList.toggle('hidden', !canDraft);
  renderChannels();
}

function formatStatus(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

function createActionButton(label, variant, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${variant}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createMessageLink(messageId) {
  const link = document.createElement('a');
  link.className = 'button secondary';
  link.textContent = 'Open record';
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.href = `${state.appUrl}/dashboard/${encodeURIComponent(
    state.context.workspace.slug,
  )}/outreach/messages/${encodeURIComponent(messageId)}`;
  return link;
}

async function decideMessage(message, decision) {
  let reason = null;
  if (decision === 'rejected') {
    reason = window.prompt(
      'Why should this message be rejected? Enter at least 3 characters.',
    );
    if (reason === null) return;
    reason = reason.trim();
    if (reason.length < 3) {
      setLiveMessage(
        'A rejection reason must contain at least 3 characters.',
        'error',
      );
      return;
    }
  }

  setLiveMessage(
    decision === 'approved' ? 'Recording approval…' : 'Recording rejection…',
  );
  try {
    await companionRequest('decide_message', {
      messageId: message.id,
      decision,
      reason,
    });
    setLiveMessage(
      decision === 'approved'
        ? 'Message approved. It is now ready for human delivery.'
        : 'Message rejected and blocked from delivery.',
      'success',
    );
    await refreshContext(message.lead_id, false);
  } catch (error) {
    await handleRequestError(error);
  }
}

function deliveryUrl(message) {
  const body = encodeURIComponent(message.content || '');
  const subject = encodeURIComponent(message.subject || '');
  switch (message.platform) {
    case 'email':
      return message.email
        ? `mailto:${encodeURIComponent(message.email)}?subject=${subject}&body=${body}`
        : null;
    case 'whatsapp': {
      const phone = String(message.phone || '').replace(/\D/g, '');
      return phone ? `https://wa.me/${phone}?text=${body}` : null;
    }
    case 'linkedin':
      return message.linkedin_url || null;
    case 'instagram': {
      const handle = String(message.instagram_handle || '')
        .replace(/^@/, '')
        .trim();
      return handle
        ? `https://www.instagram.com/${encodeURIComponent(handle)}/`
        : null;
    }
    case 'sms':
      return message.phone
        ? `sms:${encodeURIComponent(message.phone)}?body=${body}`
        : null;
    default:
      return null;
  }
}

async function prepareDelivery(message, markButton) {
  const destination = deliveryUrl(message);
  if (!destination) {
    setLiveMessage(
      'The selected contact does not have a usable destination for this channel.',
      'error',
    );
    return;
  }

  try {
    await navigator.clipboard.writeText(message.content || '');
    await chrome.tabs.create({ url: destination });
    state.preparedMessageIds.add(message.id);
    markButton.disabled = false;
    setLiveMessage(
      'Approved text copied and the channel opened. Send it there, then return and confirm below.',
      'success',
    );
  } catch {
    setLiveMessage('Could not copy or open the delivery channel.', 'error');
  }
}

async function markMessageSent(message) {
  const confirmed = window.confirm(
    'Confirm only after you completed the final send in the opened channel.',
  );
  if (!confirmed) return;

  setLiveMessage('Recording verified delivery…');
  try {
    await companionRequest('mark_sent', { messageId: message.id });
    state.preparedMessageIds.delete(message.id);
    setLiveMessage(
      'Message marked sent. Lead history and follow-up timing are updated.',
      'success',
    );
    await refreshContext(message.lead_id, false);
  } catch (error) {
    await handleRequestError(error);
  }
}

function renderMessage(message) {
  const card = document.createElement('article');
  card.className = 'message-card';

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const channel = document.createElement('strong');
  channel.textContent = `${message.platform} · ${
    [message.first_name, message.last_name].filter(Boolean).join(' ') ||
    'Contact'
  }`;
  const status = document.createElement('span');
  const statusClass = STATUS_CLASSES.has(message.status)
    ? ` ${message.status}`
    : '';
  status.className = `message-status${statusClass}`;
  status.textContent = formatStatus(message.status);
  meta.append(channel, status);
  card.append(meta);

  if (message.subject) {
    const subject = document.createElement('p');
    subject.className = 'message-subject';
    subject.textContent = message.subject;
    card.append(subject);
  }

  const content = document.createElement('p');
  content.className = 'message-content';
  content.textContent = message.content || '';
  card.append(content);

  const actions = document.createElement('div');
  actions.className = 'message-actions';
  const canApprove =
    message.can_approve &&
    state.context?.permissions?.includes('manage_ai');

  if (canApprove) {
    actions.append(
      createActionButton('Approve', 'primary', () =>
        decideMessage(message, 'approved'),
      ),
      createActionButton('Reject', 'danger', () =>
        decideMessage(message, 'rejected'),
      ),
    );
  }

  if (message.can_deliver) {
    const markButton = createActionButton(
      'I sent it — mark sent',
      'secondary',
      () => markMessageSent(message),
    );
    markButton.disabled = !state.preparedMessageIds.has(message.id);
    actions.append(
      createActionButton(
        `Copy & open ${message.platform}`,
        'primary',
        () => prepareDelivery(message, markButton),
      ),
      markButton,
    );
  }

  actions.append(createMessageLink(message.id));
  card.append(actions);
  return card;
}

function renderMessages() {
  const messages = state.context?.messages ?? [];
  elements.historyCount.textContent = String(messages.length);
  elements.historySection.classList.toggle(
    'hidden',
    !state.context?.selected_lead,
  );
  elements.messageList.replaceChildren();

  if (messages.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-note';
    empty.textContent =
      'No outreach history yet. Create the first reviewed message above.';
    elements.messageList.append(empty);
    return;
  }

  for (const message of messages) {
    elements.messageList.append(renderMessage(message));
  }
}

function renderContext() {
  const context = state.context;
  if (!context) return;

  elements.workspaceHeading.textContent = context.workspace.name;
  elements.openWorkspaceLink.href = `${state.appUrl}/dashboard/${encodeURIComponent(
    context.workspace.slug,
  )}`;

  elements.leadSelect.replaceChildren(
    makeOption('', 'Choose a lead…'),
  );
  for (const lead of context.leads ?? []) {
    elements.leadSelect.append(makeOption(lead.id, lead.company_name));
  }

  const selectedLeadId = context.selected_lead?.id ?? '';
  elements.leadSelect.value = selectedLeadId;
  elements.leadEmpty.classList.toggle('hidden', Boolean(selectedLeadId));
  elements.matchBadge.classList.toggle(
    'hidden',
    !context.matched_automatically,
  );

  renderContacts();
  renderMessages();
}

async function handleRequestError(error) {
  if (error?.code === 'CONNECTION_INVALID') {
    await disconnect(false);
    setLiveMessage(
      'This connection expired or was revoked. Generate a new pairing key.',
      'error',
    );
    return;
  }
  setLiveMessage(
    error?.message || 'The companion action could not be completed.',
    'error',
  );
}

async function refreshContext(leadId = null, announce = true) {
  if (!state.pairingKey) return;
  if (announce) setLiveMessage('Refreshing page and workspace context…');

  elements.refreshButton.disabled = true;
  try {
    state.activeTab = await getActiveTab();
    updateActivePage();
    state.context = await companionRequest('context', {
      pageUrl: state.activeTab.url || null,
      pageTitle: state.activeTab.title || null,
      leadId: leadId || null,
    });
    renderContext();
    if (announce) {
      setLiveMessage(
        state.context.selected_lead
          ? `Ready with ${state.context.selected_lead.company_name}.`
          : 'Ready. Choose a lead or capture this page.',
        'success',
      );
    }
  } catch (error) {
    await handleRequestError(error);
  } finally {
    elements.refreshButton.disabled = false;
  }
}

async function connect(event) {
  event.preventDefault();
  setLiveMessage('');

  const appUrl = elements.appUrl.value;
  const pairingKey = elements.pairingKey.value.trim();
  if (!ALLOWED_APP_URLS.has(appUrl)) {
    setLiveMessage('Choose a supported Coldingrod app address.', 'error');
    return;
  }
  if (!PAIRING_KEY_PATTERN.test(pairingKey)) {
    setLiveMessage('Paste the complete pairing key from Coldingrod.', 'error');
    return;
  }

  state.appUrl = appUrl;
  state.pairingKey = pairingKey;
  setButtonBusy(
    elements.connectButton,
    true,
    'Connecting…',
    'Connect workspace',
  );

  try {
    state.activeTab = await getActiveTab();
    state.context = await companionRequest('context', {
      pageUrl: state.activeTab.url || null,
      pageTitle: state.activeTab.title || null,
      leadId: null,
    });
    await chrome.storage.local.set({
      appUrl: state.appUrl,
      pairingKey: state.pairingKey,
    });
    elements.pairingKey.value = '';
    showCompanion();
    updateActivePage();
    renderContext();
    setLiveMessage('Browser connected securely.', 'success');
  } catch (error) {
    state.pairingKey = '';
    await handleRequestError(error);
  } finally {
    setButtonBusy(
      elements.connectButton,
      false,
      'Connecting…',
      'Connect workspace',
    );
  }
}

async function createDraft(event) {
  event.preventDefault();
  const lead = state.context?.selected_lead;
  const contact = selectedContact();
  const platform = elements.channelSelect.value;
  const content = elements.messageInput.value.trim();
  const subject =
    platform === 'email' ? elements.subjectInput.value.trim() : '';

  if (!lead || !contact || !platform || !content) {
    setLiveMessage(
      'Choose a lead, contact, channel, and enter a message.',
      'error',
    );
    return;
  }

  setButtonBusy(
    elements.draftButton,
    true,
    'Submitting…',
    'Submit for approval',
  );
  setLiveMessage('Saving versioned draft and creating approval request…');
  try {
    await companionRequest('create_draft', {
      draft: {
        lead_id: lead.id,
        contact_id: contact.id,
        platform,
        subject: subject || null,
        content,
        page_url: state.activeTab?.url || null,
        page_title: state.activeTab?.title || null,
      },
    });
    elements.subjectInput.value = '';
    elements.messageInput.value = '';
    setLiveMessage(
      'Draft submitted. A human approval is required before delivery.',
      'success',
    );
    await refreshContext(lead.id, false);
  } catch (error) {
    await handleRequestError(error);
  } finally {
    setButtonBusy(
      elements.draftButton,
      false,
      'Submitting…',
      'Submit for approval',
    );
  }
}

async function captureCurrentPage() {
  if (!state.activeTab?.url || !state.context?.workspace?.slug) {
    setLiveMessage('Open a normal website before capturing.', 'error');
    return;
  }
  const destination = new URL(
    `/dashboard/${encodeURIComponent(
      state.context.workspace.slug,
    )}/leads/discovery`,
    state.appUrl,
  );
  destination.searchParams.set('capture', 'extension');
  destination.searchParams.set('sourceUrl', state.activeTab.url);
  destination.searchParams.set(
    'title',
    state.activeTab.title || 'Captured business page',
  );
  await chrome.tabs.create({ url: destination.toString() });
}

async function disconnect(showMessage = true) {
  await chrome.storage.local.remove(['appUrl', 'pairingKey']);
  state.appUrl = 'https://coldingrod.vercel.app';
  state.pairingKey = '';
  state.context = null;
  state.selectedContactId = '';
  state.preparedMessageIds.clear();
  elements.appUrl.value = state.appUrl;
  showSetup();
  if (showMessage) {
    setLiveMessage(
      'This browser is disconnected. Revoke its key in Coldingrod if the device is no longer trusted.',
      'success',
    );
  }
}

elements.setupForm.addEventListener('submit', connect);
elements.composeForm.addEventListener('submit', createDraft);
elements.refreshButton.addEventListener('click', () => refreshContext());
elements.captureButton.addEventListener('click', captureCurrentPage);
elements.disconnectButton.addEventListener('click', () => disconnect(true));
elements.appUrl.addEventListener('change', () => {
  elements.openSetupLink.href = `${elements.appUrl.value}/dashboard`;
});
elements.leadSelect.addEventListener('change', () => {
  state.selectedContactId = '';
  refreshContext(elements.leadSelect.value || null);
});
elements.contactSelect.addEventListener('change', () => {
  state.selectedContactId = elements.contactSelect.value;
  renderContacts();
});
elements.channelSelect.addEventListener('change', () => {
  elements.subjectField.classList.toggle(
    'hidden',
    elements.channelSelect.value !== 'email',
  );
});

async function initialize() {
  const saved = await chrome.storage.local.get(['appUrl', 'pairingKey']);
  if (
    ALLOWED_APP_URLS.has(saved.appUrl) &&
    PAIRING_KEY_PATTERN.test(saved.pairingKey || '')
  ) {
    state.appUrl = saved.appUrl;
    state.pairingKey = saved.pairingKey;
    elements.appUrl.value = state.appUrl;
    showCompanion();
    await refreshContext();
    return;
  }

  showSetup();
  elements.appUrl.value = state.appUrl;
  elements.openSetupLink.href = `${state.appUrl}/dashboard`;
}

initialize().catch((error) => {
  showSetup();
  setLiveMessage(
    error?.message || 'The browser companion could not start.',
    'error',
  );
});
