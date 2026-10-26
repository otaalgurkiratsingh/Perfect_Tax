import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, sessionClient } from "@/lib/supabase/server";

// One-time link from the "set your password" email.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!tokenHash || type !== "recovery") return NextResponse.redirect(new URL("/staff/login", request.url));
  const supabase = await sessionClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error) return NextResponse.redirect(new URL("/staff/login?reason=link_expired", request.url));
  const res = NextResponse.redirect(new URL("/staff/set-password", request.url));
  res.cookies.set("staff_seen", String(Date.now()), authCookieOptions);
  return res;
}
