const USER_SCOPE = "user";

/**
 * Every cached request belongs to the signed-in user: prefixing each key with the user id
 * lets a second sign-in in the same tab miss the cache instead of relying on clear order.
 */
export function userScopedKey(userId: string | null, ...parts: readonly unknown[]): readonly unknown[] {
  return [USER_SCOPE, userId, ...parts];
}
