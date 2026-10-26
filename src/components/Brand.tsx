import Link from "next/link";
import { firmConfig } from "@firm/config";

/** Firm wordmark/logo, driven entirely by firm.config.ts. */
export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const logo = firmConfig.branding.logo;
  if (logo.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo.src} alt={logo.alt} className={size === "lg" ? "h-16" : size === "sm" ? "h-8" : "h-11"} />;
  }
  const primary = size === "lg" ? "text-5xl" : size === "sm" ? "text-xl" : "text-3xl";
  const secondary = size === "lg" ? "text-lg" : size === "sm" ? "text-[11px]" : "text-sm";
  return (
    <span className="inline-flex flex-col leading-none">
      <span className={`${primary} font-black tracking-tight`}>{logo.primary}</span>
      <span className={`${secondary} mt-1 border-t border-current pt-1 font-medium`}>{logo.secondary}</span>
    </span>
  );
}

export function PublicHeader() {
  return (
    <header className="bg-white border-b-4 border-accent">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label={firmConfig.firm.name}>
          <BrandMark size="sm" />
        </Link>
        <a href={`tel:${firmConfig.firm.phone.replace(/\D/g, "")}`} className="text-sm font-semibold underline">
          {firmConfig.firm.phone}
        </a>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const f = firmConfig.firm;
  return (
    <footer className="mt-auto bg-brand text-brand-text">
      <div className="mx-auto max-w-2xl px-4 py-6 text-sm leading-6">
        <p className="font-semibold">{f.name}</p>
        {f.addressLines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <p>
          Tel: {f.phone}
          {f.cell ? ` · Cell: ${f.cell}` : ""}
        </p>
        <p>Email: {f.email}</p>
        <p className="mt-2 opacity-80">{f.hours.join(" · ")}</p>
        <p className="mt-2 font-semibold text-highlight">{f.preferredContact}</p>
      </div>
    </footer>
  );
}
