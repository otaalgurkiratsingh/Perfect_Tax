import { NextResponse } from "next/server";

/**
 * Redirect to a path on whatever address the visitor used (custom domain, preview or
 * tunnel), instead of a fixed absolute URL. Cookies set during the request still apply.
 */
export function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });
}
