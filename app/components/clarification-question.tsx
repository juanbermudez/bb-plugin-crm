import { useEffect, useState, type FormEvent } from "react";
import type { PluginPendingInteractionProps } from "@get-bb/plugin-sdk/app";

import { Button } from "../../components/ui/button.js";
import { cn } from "../../lib/utils.js";
import {
  clarificationPayloadSchema,
  type ClarificationResponse,
  type ClarificationPayload,
} from "../../contracts/clarification.js";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Unable to submit. Check your connection and try again.";
}

function showFreeform(payload: ClarificationPayload): boolean {
  return payload.allowFreeform || payload.display === "text" || payload.options.length === 0;
}

/** Renders the CRM's one-question blocking interaction in BB's thread composer. */
export function ClarificationQuestion({
  interaction,
  submit,
  cancel,
}: PluginPendingInteractionProps) {
  const parsed = clarificationPayloadSchema.safeParse(interaction.payload);
  const payload = parsed.success ? parsed.data : null;
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [freeformText, setFreeformText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedOptionId(null);
    setFreeformText("");
    setBusy(false);
    setError(null);
  }, [interaction.id]);

  const handleOptionSelect = (optionId: string): void => {
    if (busy) return;
    setSelectedOptionId(optionId);
    setFreeformText("");
    setError(null);
  };

  const handleFreeformChange = (value: string): void => {
    if (busy) return;
    setSelectedOptionId(null);
    setFreeformText(value);
    setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy || payload === null) return;

    const text = freeformText.trim();
    const value: ClarificationResponse = selectedOptionId !== null
      ? { requestId: payload.requestId, optionId: selectedOptionId }
      : { requestId: payload.requestId, text };
    if ("text" in value && text.length === 0) return;

    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await submit(value);
      } catch (cause) {
        setError(errorMessage(cause));
        setBusy(false);
      }
    })();
  };

  const handleCancel = (): void => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await cancel();
      } catch (cause) {
        setError(errorMessage(cause));
        setBusy(false);
      }
    })();
  };

  if (payload === null) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          This clarification could not be displayed.
        </p>
        <Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    );
  }

  const canUseFreeform = showFreeform(payload);
  const canSubmit = selectedOptionId !== null || (canUseFreeform && freeformText.trim().length > 0);

  return (
    <form className="flex min-w-0 flex-col gap-3 text-sm" onSubmit={handleSubmit}>
      <div>
        <p className="font-medium text-foreground">{payload.prompt}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {canUseFreeform
            ? payload.options.length > 0
              ? "Choose an option or add another answer."
              : "Add the detail the agent needs to continue."
            : "Choose an answer to continue."}
        </p>
      </div>

      {payload.options.length > 0 ? (
        <div className="grid gap-2" role="group" aria-label="Clarification options">
          {payload.options.map((option) => {
            const selected = selectedOptionId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                disabled={busy}
                onClick={() => handleOptionSelect(option.id)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input text-foreground",
                )}
              >
                <span className="block font-medium">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {canUseFreeform ? (
        <textarea
          aria-label={payload.options.length > 0 ? "Another answer" : "Your answer"}
          placeholder={payload.options.length > 0 ? "Add another answer" : "Add the detail the agent needs"}
          value={freeformText}
          rows={3}
          disabled={busy}
          onChange={(event) => handleFreeformChange(event.target.value)}
          className="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      ) : null}

      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !canSubmit} aria-busy={busy}>
          {busy ? "Submitting" : "Submit answer"}
        </Button>
      </div>
    </form>
  );
}
