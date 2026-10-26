import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { firmConfig } from "@firm/config";

// Runs before /staff, /portal and staff API routes:
//  * refreshes the Supabase session cookie (httpOnly, secure)
//  * enforces the staff idle timeout: no activity for N minutes => signed out
// The absolute session limit and 2FA are enforced in requireStaff().

const IDLE_COOKIE = "staff_seen";
const PUBLIC_STAFF_PATHS = ["/staff/login", "/staff/forgot", "/staff/auth/confirm"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const secure = process.env.NODE_ENV === "production" && process.env.INSECURE_LOCAL_TESTING !== "1";
  const cookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...cookieOptions }));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isStaffArea = path.startsWith("/staff") || path.startsWith("/api/staff");
  if (isStaffArea && user && !PUBLIC_STAFF_PATHS.some((p) => path.startsWith(p))) {
    const idleMs = firmConfig.security.staffIdleTimeoutMinutes * 60_000;
    const seen = Number(request.cookies.get(IDLE_COOKIE)?.value ?? 0);
    if (seen && Date.now() - seen > idleMs) {
      await supabase.auth.signOut({ scope: "local" });
      const target = path.startsWith("/api/")
        ? NextResponse.json({ error: "Session expired" }, { status: 401 })
        : NextResponse.redirect(new URL("/staff/login?reason=idle", request.url));
      response.cookies.getAll().forEach((c) => target.cookies.set(c));
      target.cookies.delete(IDLE_COOKIE);
      return target;
    }
    response.cookies.set(IDLE_COOKIE, String(Date.now()), cookieOptions);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/staff/:path*", "/portal/:path*", "/api/staff/:path*", "/api/portal/:path*"],
};
