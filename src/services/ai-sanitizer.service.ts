/**
 * Sanitizes a configuration/JSON object by recursively removing sensitive keys.
 * Never send unsanitized config containing secrets to client components.
 *
 * Matching strategy: normalized key comparison against an allowlist of exact
 * and prefix patterns. Avoids false positives on words like "keyboard", "keyframe",
 * "authoritative", "credentialType" etc. while covering all secret variants.
 */

/** Normalize a key: lowercase, strip hyphens, underscores, spaces */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * Sensitive normalized key values (after stripping hyphens/underscores/spaces).
 * These are exact-match on the normalized form, preventing false positives.
 */
const SENSITIVE_NORMALIZED_EXACT = new Set([
  'key',
  'apikey',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'password',
  'authorization',
  'auth',
  'bearer',
  'privatekey',
  'clientsecret',
  'credential',
  'clientid', // Do not expose OAuth client IDs
]);

/**
 * Sensitive normalized key prefixes — the normalized key must START with these.
 * Used for variants like "apikey_v2", "passwordhash", "secretkey", etc.
 */
const SENSITIVE_NORMALIZED_PREFIXES = [
  'apikey',
  'accesstoken',
  'refreshtoken',
  'privatekey',
  'clientsecret',
  'password',
  'credential',
];

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SENSITIVE_NORMALIZED_EXACT.has(normalized)) return true;
  for (const prefix of SENSITIVE_NORMALIZED_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

export function sanitizeConfig(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion on circular structures
  if (depth > 10) return '[max depth exceeded]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeConfig(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeConfig(value, depth + 1);
    }
  }
  return result;
}

/**
 * Safely stringify JSON, handling circular references and large payloads.
 * Returns a truncated string if content exceeds maxLength.
 */
export function safeJsonStringify(value: unknown, maxLength = 2000): string {
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(
      value,
      (_, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        return val;
      },
      2
    );
    if (!json) return 'null';
    if (json.length > maxLength) {
      return json.slice(0, maxLength) + '\n... [truncated]';
    }
    return json;
  } catch {
    return '[Unable to serialize]';
  }
}

/**
 * Extract a safe, short summary from an AI payload for display in lists.
 * Returns key names only — never values that might contain sensitive data.
 */
export function extractPayloadSummary(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return 'No payload';
  const keys = Object.keys(payload);
  if (keys.length === 0) return 'Empty payload';
  return `Contains: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ` +${keys.length - 5} more` : ''}`;
}
