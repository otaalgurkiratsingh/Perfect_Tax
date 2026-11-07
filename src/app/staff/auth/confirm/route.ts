import type { NextRequest } from "next/server";
import { redirectTo } from "@/lib/redirect";
import { authCookieOptions, sessionClient } from "@/lib/supabase/server";

// One-time link from the "set your password" email.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!tokenHash || type !== "recovery") return redirectTo("/staff/login");
  const supabase = await sessionClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error) return redirectTo("/staff/login?reason=link_expired");
  const res = redirectTo("/staff/set-password");
  res.cookies.set("staff_seen", String(Date.now()), authCookieOptions);
  return res;
}
