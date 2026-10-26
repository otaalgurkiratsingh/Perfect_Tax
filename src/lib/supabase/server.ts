import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const authCookieOptions = {
  httpOnly: true,
  // Secure everywhere except the explicit local test mode (plain http://127.0.0.1).
  secure: process.env.NODE_ENV === "production" && process.env.INSECURE_LOCAL_TESTING !== "1",
  sameSite: "lax" as const,
  path: "/",
};

// Session-aware client for staff and client-portal pages. Queries run as the
// signed-in user, so Row Level Security applies.
export async function sessionClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...authCookieOptions }),
          );
        } catch {
          // Called from a Server Component: the proxy refreshes cookies instead.
        }
      },
    },
  });
}
