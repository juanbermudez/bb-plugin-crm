import { useState } from "react";

import { cn } from "../../lib/utils.js";

const SIZE_CLASS = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
} as const;

export interface PersonAvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const value = name?.trim() || email?.trim() || "?";
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

/** A BB-tokenized portrait with deterministic initials fallback. */
export function PersonAvatar({
  src,
  name,
  email,
  size = "md",
  className,
}: PersonAvatarProps) {
  const url = src?.trim() || null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const showImage = url !== null && failedUrl !== url;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-medium text-muted-foreground",
        SIZE_CLASS[size],
        className,
      )}
      role="img"
      aria-label={name?.trim() || email?.trim() || "Person"}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span aria-hidden="true">{initials(name, email)}</span>
      )}
    </span>
  );
}
