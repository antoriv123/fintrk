import { headers } from "next/headers";

/**
 * Get the authenticated user ID from the middleware-injected header.
 * Every protected API route MUST call this and use the returned ID
 * to scope all database queries.
 *
 * Throws if no user ID is present (should never happen behind middleware).
 */
export async function getUserId(): Promise<number> {
  const headerList = await headers();
  const raw = headerList.get("x-user-id");
  if (!raw) {
    throw new Error("UNAUTHORIZED: No user ID in request");
  }
  const userId = parseInt(raw, 10);
  if (isNaN(userId) || userId <= 0) {
    throw new Error("UNAUTHORIZED: Invalid user ID");
  }
  return userId;
}
