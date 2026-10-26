"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicIntakeConfig } from "@/lib/config/public";
import { STEPS, validateStep, type FieldErrors, type IntakeAnswers } from "@/lib/intake/schema";
import { Button } from "@/components/ui";
import { ApiError, api, storageFor, takeFragmentToken, type UploadedFile } from "@/components/public/api";
import {
  StepConsents,
  StepDetails,
  StepDocuments,
  StepReview,
  StepServices,
  StepSituation,
  StepType,
  type SinState,
} from "./steps";

const TOKEN_KEY = "intake_token";
const KIOSK_KEY = "intake_kiosk";

interface DraftView {
  reference: string;
  status: string;
  currentStep: number;
  answers: IntakeAnswers;
  sin: SinState;
  spouseSin: SinState;
  documents: UploadedFile[];
}

type Phase = "loading" | "form" | "expired" | "submitted" | "done";

function setPath<T extends object>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const root: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  let cur = root;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) {
      cur[k] = value;
    } else {
      const next = cur[k] && typeof cur[k] === "object" ? { ...(cur[k] as Record<string, unknown>) } : {};
      cur[k] = next;
      cur = next;
    }
  });
  return root as T;
}

function luhnOk(sin: string) {
  const d = sin.replace(/\D/g, "");
  if (!/^\d{9}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(d[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0 && !/^[08]/.test(d);
}

export function Wizard({ cfg }: { cfg: PublicIntakeConfig }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [kiosk, setKiosk] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [docs, setDocs] = useState<UploadedFile[]>([]);
  const [sin, setSin] = useState<SinState>({ onFile: false, last3: null });
  const [spouseSin, setSpouseSin] = useState<SinState>({ onFile: false, last3: null });
  const [sinInput, setSinInput] = useState("");
  const [spouseSinInput, setSpouseSinInput] = useState("");
  const [clearSinFlags, setClearSinFlags] = useState({ primary: false, spouse: false });
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const dirty = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const serviceKeys = cfg.services.map((s) => s.key);

  // Load the draft: token from the link fragment (#resume=...) or this device.
  useEffect(() => {
    const fromLink = takeFragmentToken("resume");
    let isKiosk = false;
    try {
      isKiosk = window.sessionStorage.getItem(KIOSK_KEY) === "1";
    } catch {
      isKiosk = false;
    }
    const store = storageFor(isKiosk);
    const t = fromLink ?? store?.getItem(TOKEN_KEY) ?? null;
    if (fromLink) store?.setItem(TOKEN_KEY, fromLink);
    if (!t) {
      window.location.replace("/start");
      return;
    }
    (async () => {
      try {
        const d = await api<DraftView>("/api/intake/draft", t);
        setKiosk(isKiosk);
        setToken(t);
        if (d.status !== "draft") {
          setReference(d.reference);
          setPhase("submitted");
          return;
        }
        setAnswers(d.answers ?? {});
        setDocs(d.documents ?? []);
        setSin(d.sin);
        setSpouseSin(d.spouseSin);
        setStep(Math.min(Math.max((d.currentStep ?? 1) - 1, 0), STEPS.length - 1));
        const hasProgress = (d.currentStep ?? 1) > 1 || Object.keys(d.answers ?? {}).length > 0;
        if (fromLink && hasProgress) setBanner("Welcome back — your answers and files are restored.");
        setPhase("form");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          store?.removeItem(TOKEN_KEY);
          setPhase("expired");
        } else {
          setBanner("We couldn't load your form. Please check your connection and refresh.");
          setPhase("expired");
        }
      }
    })();
  }, []);

  const save = useCallback(
    async (targetStep: number, withSin: boolean) => {
      if (!token) return { ok: false as const };
      setSaveState("saving");
      const body: Record<string, unknown> = { step: targetStep + 1, answers };
      if (withSin) {
        if (sinInput) body.sin = sinInput;
        else if (clearSinFlags.primary) body.sin = "";
        if (spouseSinInput) body.spouseSin = spouseSinInput;
        else if (clearSinFlags.spouse) body.spouseSin = "";
      }
      try {
        const res = await api<{ saved: boolean; errors?: FieldErrors; sin?: SinState; spouseSin?: SinState }>("/api/intake/draft", token, {
          method: "PATCH",
          body,
        });
        if (res.sin) setSin(res.sin);
        if (res.spouseSin) setSpouseSin(res.spouseSin);
        if (withSin && !res.errors) {
          setSinInput("");
          setSpouseSinInput("");
          setClearSinFlags({ primary: false, spouse: false });
        }
        setSaveState("saved");
        dirty.current = false;
        return { ok: !res.errors, errors: res.errors };
      } catch (e) {
        setSaveState("error");
        if (e instanceof ApiError && e.status === 401) setPhase("expired");
        if (e instanceof ApiError && e.status === 409) setPhase("submitted");
        return { ok: false as const };
      }
    },
    [token, answers, sinInput, spouseSinInput, clearSinFlags],
  );

  // Autosave answers a moment after the client stops typing.
  useEffect(() => {
    if (phase !== "form" || !dirty.current) return;
    const t = setTimeout(() => void save(step, false), 1200);
    return () => clearTimeout(t);
  }, [answers, phase, step, save]);

  const set = useCallback((path: string, value: unknown) => {
    dirty.current = true;
    setAnswers((a) => setPath(a, path, value));
    setErrors((e) => {
      if (!e[path]) return e;
      const next = { ...e };
      delete next[path];
      return next;
    });
  }, []);

  function scrollTop() {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function focusFirstError(errs: FieldErrors) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(first) ?? document.querySelector(`[name="${first}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      }
    });
  }

  async function next() {
    const key = STEPS[step].key;
    let errs = validateStep(key, answers, serviceKeys);
    if (key === "consents") {
      for (const c of cfg.consents) if (c.required && !consents[c.key]) errs = { ...errs, [`consent-${c.key}`]: "Please tick this box to continue" };
      if (Object.keys(errs).length) {
        const mapped: FieldErrors = {};
        for (const k of Object.keys(errs)) mapped[k.replace(/^consent-/, "consents.")] = errs[k];
        setErrors(mapped);
        focusFirstError(errs);
        return;
      }
    }
    if (key === "details") {
      if (sinInput && !luhnOk(sinInput)) errs = { ...errs, "primary.sin": "That SIN doesn't look right — please check the 9 digits" };
      if (spouseSinInput && !luhnOk(spouseSinInput)) errs = { ...errs, "spouse.sin": "That SIN doesn't look right — please check the 9 digits" };
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setBusy(true);
    const res = await save(step + 1, key === "details");
    setBusy(false);
    if (res.errors && Object.keys(res.errors).length) {
      setErrors(res.errors);
      focusFirstError(res.errors);
      return;
    }
    setErrors({});
    setBanner(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    scrollTop();
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
    scrollTop();
  }

  async function submit() {
    if (!token) return;
    const errs: FieldErrors = {};
    for (const c of cfg.consents) if (c.required && !consents[c.key]) errs[`consents.${c.key}`] = "Please tick this box to continue";
    if (Object.keys(errs).length) {
      setErrors(errs);
      setStep(STEPS.findIndex((s) => s.key === "consents"));
      focusFirstError(errs);
      return;
    }
    setBusy(true);
    try {
      if (dirty.current) await save(step, false);
      const res = await api<{ reference: string }>("/api/intake/submit", token, { method: "POST", body: { consents } });
      storageFor(kiosk)?.removeItem(TOKEN_KEY);
      setReference(res.reference);
      setPhase("done");
      scrollTop();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const body = e.body as { errors?: FieldErrors; step?: string };
        const idx = STEPS.findIndex((s) => s.key === body.step);
        if (idx >= 0) setStep(idx);
        setErrors(body.errors ?? {});
        focusFirstError(body.errors ?? {});
      } else {
        setBanner(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    storageFor(kiosk)?.removeItem(TOKEN_KEY);
    window.location.assign(kiosk ? "/start?kiosk=1" : "/start");
  }

  // Kiosk (office tablet): clear and return to the start screen after finishing.
  useEffect(() => {
    if (phase !== "done" || !kiosk) return;
    // Full reload so no answers stay in memory on a shared device.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    const t = setTimeout(() => window.location.assign("/start?kiosk=1"), 60_000);
    return () => clearTimeout(t);
  }, [phase, kiosk]);

  if (phase === "loading") {
    return <p className="py-16 text-center text-lg text-gray-600">Loading your form…</p>;
  }

  if (phase === "expired") {
    return (
      <div className="space-y-4 py-8">
        <h1 className="text-2xl font-bold">This link has expired</h1>
        <p>{banner ?? "For your security, form links only work for a limited time."}</p>
        <Button onClick={startOver}>Start a new form</Button>
        <p>
          Or call us at{" "}
          <a className="font-semibold underline" href={`tel:${cfg.firmPhone.replace(/\D/g, "")}`}>
            {cfg.firmPhone}
          </a>
          .
        </p>
      </div>
    );
  }

  if (phase === "submitted" || phase === "done") {
    return (
      <div ref={topRef} className="space-y-5 py-6" data-testid="confirmation">
        <div className="rounded-2xl bg-green-700 p-5 text-white">
          <p className="text-3xl" aria-hidden>
            ✓
          </p>
          <h1 className="mt-1 text-2xl font-bold">{phase === "done" ? cfg.confirmation.heading : "This form has already been sent."}</h1>
          {reference ? <p className="mt-2 text-lg">Your reference number: <span className="font-mono font-bold">{reference}</span></p> : null}
        </div>
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">What happens next</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-lg">
            {cfg.confirmation.nextSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
        {cfg.bookingUrl ? (
          <a href={cfg.bookingUrl} target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-center rounded-xl bg-accent px-6 text-lg font-bold text-accent-text shadow">
            Book your onboarding call
          </a>
        ) : null}
        <p className="text-lg">
          Questions? Call{" "}
          <a className="font-semibold underline" href={`tel:${cfg.firmPhone.replace(/\D/g, "")}`}>
            {cfg.firmPhone}
          </a>{" "}
          or email <a className="font-semibold underline" href={`mailto:${cfg.firmEmail}`}>{cfg.firmEmail}</a>.
        </p>
        {kiosk ? (
          <div className="rounded-xl bg-highlight p-4 text-lg font-semibold">
            All done! Please hand the device back to our team. This screen will reset in one minute.
          </div>
        ) : null}
      </div>
    );
  }

  const current = STEPS[step];
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div ref={topRef} className="pb-32">
      <div className="sticky top-0 z-10 -mx-4 bg-[#f5f5f4]/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between text-[15px] text-gray-700">
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
          <span aria-live="polite" className="text-gray-500">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Not saved — check connection" : ""}
          </span>
        </div>
        <div
          className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Form progress"
        >
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {banner ? <p className="mt-3 rounded-xl bg-highlight p-3 font-medium">{banner}</p> : null}
      <h1 className="mt-4 text-3xl font-bold">{current.title}</h1>

      <div className="mt-5">
        {current.key === "type" ? <StepType cfg={cfg} a={answers} set={set} errors={errors} /> : null}
        {current.key === "details" ? (
          <StepDetails
            cfg={cfg}
            a={answers}
            set={set}
            errors={errors}
            sinInput={sinInput}
            setSinInput={setSinInput}
            spouseSinInput={spouseSinInput}
            setSpouseSinInput={setSpouseSinInput}
            sin={sin}
            spouseSin={spouseSin}
            clearSin={(which) => {
              setClearSinFlags((f) => ({ ...f, [which]: true }));
              if (which === "primary") setSin({ onFile: false, last3: null });
              else setSpouseSin({ onFile: false, last3: null });
            }}
          />
        ) : null}
        {current.key === "services" ? <StepServices cfg={cfg} a={answers} set={set} errors={errors} /> : null}
        {current.key === "situation" ? <StepSituation cfg={cfg} a={answers} set={set} errors={errors} /> : null}
        {current.key === "documents" && token ? <StepDocuments cfg={cfg} a={answers} token={token} docs={docs} setDocs={setDocs} /> : null}
        {current.key === "consents" ? (
          <StepConsents cfg={cfg} consents={consents} errors={errors} setConsent={(k, v) => {
            setConsents((c) => ({ ...c, [k]: v }));
            setErrors((e) => {
              const n = { ...e };
              delete n[`consents.${k}`];
              return n;
            });
          }} />
        ) : null}
        {current.key === "review" ? (
          <StepReview cfg={cfg} a={answers} docs={docs} sin={sin} spouseSin={spouseSin} goTo={(s) => { setStep(s); scrollTop(); }} />
        ) : null}
      </div>

      {Object.keys(errors).length > 0 ? (
        <p role="alert" className="mt-6 rounded-xl bg-red-50 p-3 font-medium text-red-800">
          Please fix the highlighted {Object.keys(errors).length === 1 ? "answer" : "answers"} above.
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3">
          {step > 0 ? (
            <Button variant="secondary" onClick={back} className="w-1/3">
              Back
            </Button>
          ) : null}
          {current.key === "review" ? (
            <Button onClick={() => void submit()} disabled={busy} className="flex-1">
              {busy ? "Sending…" : "Send to our team"}
            </Button>
          ) : (
            <Button onClick={() => void next()} disabled={busy} className="flex-1">
              {busy ? "Saving…" : current.key === "documents" ? (docs.length ? "Continue" : "Skip for now") : "Continue"}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-10 text-center text-[15px]">
        <button type="button" onClick={startOver} className="text-gray-500 underline">
          Not you? Start a new form
        </button>
      </p>
    </div>
  );
}
