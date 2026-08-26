import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import type {
  AgentAttachment,
  AgentAttachmentUploadInput,
} from "../../../contracts/agents.js";
import {
  AGENT_ATTACHMENT_MAX_BYTES,
  AGENT_ATTACHMENT_MAX_COUNT,
} from "../../../contracts/agents.js";
import type { AgentsRpcClient } from "./rpc.js";

export interface AgentAttachmentPickerProps {
  agentId: string;
  versionId?: string | null;
  rpc: AgentsRpcClient;
  value: readonly AgentAttachment[];
  onChange: (attachments: AgentAttachment[]) => void;
  disabled?: boolean;
}

function fileToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function fileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  // Older embedded WebViews (and the jsdom test runtime) expose FileReader
  // without File.arrayBuffer. The fallback still reads bytes from the File
  // object supplied by the browser; it never accepts a caller path.
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("The selected file could not be read."));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The selected file could not be read."));
    reader.readAsArrayBuffer(file);
  });
}

function messageForUploadError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Small-file picker for builder/run workflows. The file bytes go directly to
 * the server's BB project attachment RPC; this component never sends a local
 * path and never asks the host to read one.
 */
export function AgentAttachmentPicker({
  agentId,
  versionId,
  rpc,
  value,
  onChange,
  disabled = false,
}: AgentAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setError(null);
    if (value.length + files.length > AGENT_ATTACHMENT_MAX_COUNT) {
      setError(`Attach at most ${AGENT_ATTACHMENT_MAX_COUNT} files.`);
      return;
    }
    const oversized = files.find((file) => file.size < 1 || file.size > AGENT_ATTACHMENT_MAX_BYTES);
    if (oversized) {
      setError(`${oversized.name} must be between 1 byte and ${AGENT_ATTACHMENT_MAX_BYTES.toLocaleString()} bytes.`);
      return;
    }

    setBusy(true);
    try {
      const uploaded: AgentAttachment[] = [];
      for (const file of files) {
        const bytes = await fileBytes(file);
        const input: AgentAttachmentUploadInput = {
          agentId,
          ...(versionId ? { versionId } : {}),
          name: file.name,
          ...(file.type ? { mimeType: file.type } : {}),
          sizeBytes: file.size,
          contentBase64: fileToBase64(bytes),
        };
        uploaded.push(await rpc.call("agents_attachments_upload", input));
      }
      onChange([...value, ...uploaded]);
    } catch (cause) {
      setError(messageForUploadError(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = (path: string) => {
    onChange(value.filter((attachment) => attachment.path !== path));
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold">Attachments</h3>
          <p className="text-[11px] text-muted-foreground">
            Up to {AGENT_ATTACHMENT_MAX_COUNT} files, {AGENT_ATTACHMENT_MAX_BYTES.toLocaleString()} bytes each. Files stay in the resolved BB project.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy || value.length >= AGENT_ATTACHMENT_MAX_COUNT}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="Paperclip" aria-hidden="true" />
          {busy ? "Uploading…" : "Attach files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose attachment files"
          onChange={(event) => void uploadFiles(event)}
        />
      </div>
      {value.length > 0 ? (
        <ul className="divide-y divide-border rounded border border-border" aria-label="Attached files">
          {value.map((attachment) => (
            <li key={attachment.path} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
              <span className="min-w-0 truncate" title={attachment.name}>
                {attachment.name} <span className="text-muted-foreground">({attachment.sizeBytes.toLocaleString()} bytes)</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground"
                disabled={disabled || busy}
                aria-label={`Remove ${attachment.name}`}
                onClick={() => remove(attachment.path)}
              >
                <Icon name="X" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
