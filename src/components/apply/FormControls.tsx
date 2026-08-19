import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
};

export function Field({ id, label, hint, error, optional, children }: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-3 text-[11px] font-semibold tracking-[0.1em] text-ink uppercase"
      >
        <span>{label}</span>
        {optional ? (
          <span className="font-medium tracking-[0.08em] text-muted normal-case">
            Optional
          </span>
        ) : null}
      </label>
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-2 text-[13px] leading-5 text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-[13px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlClassName =
  "w-full border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export function TextInput({ error, className, ...props }: TextInputProps) {
  return (
    <input
      {...props}
      aria-invalid={error ? true : undefined}
      aria-describedby={error && props.id ? `${props.id}-error` : undefined}
      className={cn(controlClassName, "h-11", className)}
    />
  );
}

type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement> & {
  error?: string;
};

export function SelectInput({ error, className, children, ...props }: SelectInputProps) {
  return (
    <select
      {...props}
      aria-invalid={error ? true : undefined}
      aria-describedby={error && props.id ? `${props.id}-error` : undefined}
      className={cn(controlClassName, "h-11", className)}
    >
      {children}
    </select>
  );
}

type TextAreaInputProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string;
};

export function TextAreaInput({ error, className, ...props }: TextAreaInputProps) {
  return (
    <textarea
      {...props}
      aria-invalid={error ? true : undefined}
      aria-describedby={error && props.id ? `${props.id}-error` : undefined}
      className={cn(controlClassName, "min-h-28 py-3", className)}
    />
  );
}
