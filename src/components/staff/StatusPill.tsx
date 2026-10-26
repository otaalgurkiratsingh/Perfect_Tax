const STYLES: Record<string, string> = {
  draft: "bg-gray-200 text-gray-800",
  new: "bg-blue-100 text-blue-900",
  in_review: "bg-amber-100 text-amber-900",
  docs_missing: "bg-red-100 text-red-900",
  ready: "bg-green-100 text-green-900",
  client_created: "bg-gray-800 text-white",
  not_sent: "bg-gray-200 text-gray-800",
  requested: "bg-blue-100 text-blue-900",
  partial: "bg-amber-100 text-amber-900",
  complete: "bg-green-100 text-green-900",
  processed: "bg-gray-800 text-white",
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${STYLES[status] ?? "bg-gray-100"}`}>{label}</span>;
}
