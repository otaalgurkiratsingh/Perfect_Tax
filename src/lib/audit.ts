import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "staff_login"
  | "staff_login_failed"
  | "staff_logout"
  | "staff_session_expired"
  | "staff_mfa_enrolled"
  | "view_intake"
  | "view_document"
  | "download_document"
  | "download_zip"
  | "export_csv"
  | "reveal_sin"
  | "change_status"
  | "request_documents"
  | "stop_doc_request"
  | "create_client"
  | "update_client"
  | "invite_client"
  | "delete_intake"
  | "update_settings"
  | "add_staff"
  | "update_staff"
  | "open_quarter"
  | "send_quarter_requests"
  | "nudge_client"
  | "mark_processed"
  | "reopen_item"
  | "view_client_quarter"
  | "run_extraction"
  | "download_extraction"
  | "view_audit_log"
  | "intake_submitted"
  | "client_upload"
  | "client_portal_login"
  | "unsubscribe";

export interface AuditEntry {
  actorType: "staff" | "client" | "public" | "system";
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** Never put SINs, birth dates or document contents here. */
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function audit(entry: AuditEntry): Promise<void> {
  const { error } = await adminClient().from("audit_log").insert({
    actor_type: entry.actorType,
    actor_id: entry.actorId ?? null,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    details: entry.details ?? {},
    ip: entry.ip ?? null,
    user_agent: entry.userAgent ?? null,
  });
  if (error) {
    // An access we cannot record is an access we must not allow — callers await this.
    throw new Error(`Audit log write failed: ${error.message}`);
  }
}
