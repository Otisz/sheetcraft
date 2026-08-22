/**
 * One field's validation message. A component rather than a repeated
 * paragraph so the alert semantics — which are what a screen reader announces
 * on a failed submit — are declared once and cannot drift between fields.
 *
 * Renders nothing when there is no message, so callers pass the message
 * straight through without guarding it.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
