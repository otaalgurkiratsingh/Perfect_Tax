import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { sessionClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (!tokenHash || request.nextUrl.searchParams.get("type") !== "magiclink") {
    return NextResponse.redirect(new URL("/portal/login", env.siteUrl));
  }
  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error || !data.user) return NextResponse.redirect(new URL("/portal/login?reason=link_expired", env.siteUrl));
  await audit({ actorType: "client", actorId: data.user.id, actorEmail: data.user.email, action: "client_portal_login", details: { step: "signed_in" } });
  return NextResponse.redirect(new URL("/portal", env.siteUrl));
}
