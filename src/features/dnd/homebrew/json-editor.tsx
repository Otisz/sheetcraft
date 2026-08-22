import { useId } from "react";
import type { ValidationIssue } from "@/features/dnd/homebrew/validate";

/**
 * The escape hatch that makes "homebrew uses the same schema as catalog"
 * honest: every type can be authored here, including the two whose forms are
 * not buildable.
 *
 * A plain `<textarea>`, not a code editor. A syntax-highlighting editor is a
 * large dependency for a surface most people will paste into once, and the
 * error list below is what actually makes the editing possible.
 */

export function JsonEditor({
  value,
  onChange,
  issues,
}: {
  value: string;
  onChange: (value: string) => void;
  issues: ValidationIssue[];
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Entry JSON
      </label>
      <p className="text-xs text-muted-foreground">
        The same shape the SRD uses. <code>index</code> is set from the name when you save, so you can leave it out.
      </p>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={18}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={issues.length > 0 ? true : undefined}
        className="w-full rounded-lg border border-border bg-background p-3 font-mono text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
      />
      <IssueList issues={issues} />
    </div>
  );
}

/**
 * Every failure, each against the path that caused it — which is the whole
 * point of the surface. A single "invalid entry" on 190 leaves is not an error
 * message, it is a guessing game.
 */
export function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-destructive">
        {issues.length === 1 ? "1 problem" : `${issues.length} problems`}
      </p>
      <ul className="flex flex-col gap-1">
        {issues.map((issue) => (
          <li key={`${issue.path}:${issue.message}`} className="text-sm">
            <code className="font-mono text-xs text-destructive">{issue.path}</code>{" "}
            <span className="text-muted-foreground">{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
