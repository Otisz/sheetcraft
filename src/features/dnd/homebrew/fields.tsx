import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/features/dnd/creation/field-error";
import { cn } from "@/lib/utils";

/**
 * The form controls the homebrew forms are built from. Thumb-height
 * throughout, matching the creation form — these are the same inputs on the
 * same phone, and a homebrew form that looked different would look broken.
 */

const CONTROL =
  "h-12 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown under the label, for a field whose meaning is not its name. */
  hint?: string;
  error?: string;
  /** `decimal` gets a numeric keypad without rejecting a pasted value. */
  inputMode?: "text" | "decimal";
};

export function TextField({ label, value, onChange, placeholder, hint, error, inputMode }: TextFieldProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL}
      />
      <FieldError message={error} />
    </div>
  );
}

export type TextAreaFieldProps = Omit<TextFieldProps, "inputMode"> & {
  rows?: number;
};

export function TextAreaField({ label, value, onChange, placeholder, hint, error, rows = 4 }: TextAreaFieldProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(CONTROL, "h-auto py-3 leading-relaxed")}
      />
      <FieldError message={error} />
    </div>
  );
}

export function SwitchField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <label htmlFor={id} className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * A titled block of fields. Present because these forms are long enough that
 * an unbroken column of inputs stops being scannable at about eight of them.
 */
export function FieldSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}
