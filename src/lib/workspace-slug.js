export const WORKSPACE_SLUG_MIN_LENGTH = 2;
export const WORKSPACE_SLUG_MAX_LENGTH = 63;
export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeWorkspaceSlug(value) {
  if (typeof value !== 'string') return '';

  let candidate = value.trim().toLowerCase();
  candidate = candidate.replace(/^https?:\/\//, '');
  candidate = candidate.replace(/^app\.coldingrod\.com\//, '');

  if (candidate.includes('.')) {
    const host = candidate.split('/')[0].replace(/^(?:www|app)\./, '');
    const labels = host.split('.').filter(Boolean);
    if (labels.length >= 2) {
      candidate = labels.slice(0, -1).join('-');
    }
  }

  return candidate
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, WORKSPACE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}

export function isValidWorkspaceSlug(value) {
  return (
    typeof value === 'string' &&
    value.length >= WORKSPACE_SLUG_MIN_LENGTH &&
    value.length <= WORKSPACE_SLUG_MAX_LENGTH &&
    WORKSPACE_SLUG_PATTERN.test(value)
  );
}
