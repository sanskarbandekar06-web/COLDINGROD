const REQUEST_EVENT = 'coldingrod:companion-request';
const RESPONSE_EVENT = 'coldingrod:companion-response';
const ACTIONS = new Set(['status', 'open_delivery']);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const detail = event?.data;
  if (
    !detail ||
    detail.type !== REQUEST_EVENT ||
    typeof detail.requestId !== 'string' ||
    detail.requestId.length > 100 ||
    !ACTIONS.has(detail.action)
  ) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: 'COLDINGROD_APP_BRIDGE',
      action: detail.action,
      payload: detail.payload && typeof detail.payload === 'object'
        ? detail.payload
        : {},
    },
    (response) => {
      const runtimeError = chrome.runtime.lastError;
      window.postMessage(
        {
          type: RESPONSE_EVENT,
          requestId: detail.requestId,
          ok: !runtimeError && Boolean(response?.ok),
          data: response?.data || null,
          error: runtimeError?.message || response?.error || null,
        },
        window.location.origin,
      );
    },
  );
});
