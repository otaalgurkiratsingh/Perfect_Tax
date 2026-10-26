"use client";

import type { ReactNode } from "react";

// Mobile-first form primitives: big tap targets (min 56px), large text,
// plain labels, errors announced to screen readers.

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[15px] font-medium text-red-700">
      {message}
    </p>
  );
}

const inputClass =
  "mt-1 block w-full min-h-14 rounded-xl border-2 border-gray-300 bg-white px-4 text-lg text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none aria-[invalid=true]:border-red-600";

interface BaseFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

function Label({ id, label, optional, hint }: Pick<BaseFieldProps, "id" | "label" | "optional" | "hint">) {
  return (
    <>
      <label htmlFor={id} className="block text-[17px] font-semibold text-gray-900">
        {label}
        {optional ? <span className="ml-1 font-normal text-gray-500">(optional)</span> : null}
      </label>
      {hint ? <p className="text-[15px] text-gray-600">{hint}</p> : null}
    </>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  optional,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  maxLength,
}: BaseFieldProps & {
  value: string | undefined;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "text" | "numeric" | "tel" | "email" | "decimal";
  autoComplete?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <Label id={id} label={label} optional={optional} hint={hint} />
      <input
        id={id}
        name={id}
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function TextArea({
  id,
  label,
  hint,
  error,
  optional,
  value,
  onChange,
}: BaseFieldProps & { value: string | undefined; onChange: (v: string) => void }) {
  return (
    <div>
      <Label id={id} label={label} optional={optional} hint={hint} />
      <textarea
        id={id}
        name={id}
        rows={3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={1000}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass} py-3`}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  optional,
  value,
  onChange,
  options,
  placeholder = "Choose…",
}: BaseFieldProps & {
  value: string | undefined;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
  placeholder?: string;
}) {
  return (
    <div>
      <Label id={id} label={label} optional={optional} hint={hint} />
      <select
        id={id}
        name={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Large radio-style cards. */
export function ChoiceCards<T extends string>({
  name,
  legend,
  value,
  onChange,
  options,
  error,
}: {
  name: string;
  legend?: string;
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string; description?: string }[];
  error?: string;
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      {legend ? <legend className="mb-2 text-[17px] font-semibold">{legend}</legend> : null}
      <div className="grid gap-3">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              className={`flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border-2 px-4 py-3 transition ${
                selected ? "border-brand bg-brand text-brand-text" : "border-gray-300 bg-white hover:border-gray-500"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-highlight bg-highlight" : "border-gray-400"
                }`}
              >
                {selected ? <span className="h-3 w-3 rounded-full bg-brand" /> : null}
              </span>
              <span>
                <span className="block text-lg font-semibold">{o.label}</span>
                {o.description ? (
                  <span className={`block text-[15px] ${selected ? "opacity-90" : "text-gray-600"}`}>{o.description}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}

/** Big YES/NO tick card used for services. */
export function TickCard({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border-2 px-4 py-3 transition ${
        checked ? "border-brand bg-brand text-brand-text" : "border-gray-300 bg-white hover:border-gray-500"
      }`}
    >
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 text-xl font-black ${
          checked ? "border-highlight bg-highlight text-brand" : "border-gray-400 text-transparent"
        }`}
      >
        ✓
      </span>
      <span>
        <span className="block text-lg font-semibold">{label}</span>
        {description ? <span className={`block text-[15px] ${checked ? "opacity-90" : "text-gray-600"}`}>{description}</span> : null}
      </span>
      <span className={`ml-auto shrink-0 text-sm font-bold ${checked ? "text-highlight" : "text-gray-400"}`}>{checked ? "YES" : "NO"}</span>
    </label>
  );
}

export function YesNo({
  name,
  legend,
  value,
  onChange,
  error,
}: {
  name: string;
  legend: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 text-[17px] font-semibold">{legend}</legend>
      <div className="grid grid-cols-2 gap-3">
        {[
          [true, "Yes"],
          [false, "No"],
        ].map(([v, l]) => {
          const selected = value === v;
          return (
            <label
              key={String(v)}
              className={`flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 text-lg font-bold ${
                selected ? "border-brand bg-brand text-brand-text" : "border-gray-300 bg-white"
              }`}
            >
              <input type="radio" name={name} checked={selected} onChange={() => onChange(v as boolean)} className="sr-only" />
              {l as string}
            </label>
          );
        })}
      </div>
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}

export function ConsentBox({
  id,
  checked,
  onChange,
  label,
  text,
  required,
  error,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  text: string;
  required: boolean;
  error?: string;
}) {
  return (
    <div className={`rounded-xl border-2 bg-white p-4 ${error ? "border-red-600" : "border-gray-300"}`}>
      <label htmlFor={id} className="flex cursor-pointer gap-4">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={`${id}-text ${error ? `${id}-error` : ""}`}
          className="mt-1 h-7 w-7 shrink-0 accent-[var(--brand)]"
        />
        <span>
          <span className="block text-lg font-semibold">
            {label}
            {!required ? <span className="ml-1 font-normal text-gray-500">(optional)</span> : null}
          </span>
          <span id={`${id}-text`} className="mt-1 block text-[15px] leading-6 text-gray-700">
            {text}
          </span>
        </span>
      </label>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    primary: "bg-accent text-accent-text shadow hover:brightness-95",
    secondary: "border-2 border-brand bg-white text-brand",
    ghost: "text-brand underline",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-14 rounded-xl px-6 text-lg font-bold disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export { formatBytes } from "@/lib/format";
