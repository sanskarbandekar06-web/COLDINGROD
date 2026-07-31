function permissionKey(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('key' in value)) {
    return null;
  }

  return typeof value.key === 'string' ? value.key : null;
}

export function hasJoinedPermission(
  value: unknown,
  allowedKeys: readonly string[],
): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some((row) => {
    if (!row || typeof row !== 'object' || !('permissions' in row)) {
      return false;
    }

    const permissions: unknown[] = Array.isArray(row.permissions)
      ? row.permissions
      : [row.permissions];

    return permissions.some((permission) => {
      const key = permissionKey(permission);
      return key !== null && allowedKeys.includes(key);
    });
  });
}
