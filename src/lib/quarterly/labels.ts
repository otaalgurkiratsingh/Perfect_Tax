export const CQ_STATUS_LABELS: Record<string, string> = {
  not_sent: "Not Sent",
  requested: "Requested",
  partial: "Partial",
  complete: "Complete",
  processed: "Processed",
};
export const CQ_STATUSES = ["not_sent", "requested", "partial", "complete", "processed"] as const;
