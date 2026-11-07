import "server-only";
import { env } from "@/lib/env";

/**
 * Signed storage links handed to browsers. With STORAGE_PROXY=1 they point at
 * /storage-proxy/... on this app (see next.config.ts), so the browser never needs to
 * reach Supabase directly — e.g. when the app is shown through a tunnel or preview.
 * Only token-signed upload/download paths are proxied, never the rest of the API.
 */
export function browserStorageUrl(signedUrl: string): string {
  if (process.env.STORAGE_PROXY !== "1") return signedUrl;
  const base = `${env.supabaseUrl.replace(/\/$/, "")}/storage/v1/`;
  return signedUrl.startsWith(base) ? `/storage-proxy/${signedUrl.slice(base.length)}` : signedUrl;
}
