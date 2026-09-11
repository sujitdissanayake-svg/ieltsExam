function parseStableIsoDate(iso: string): Date | null {
  const trimmed = String(iso || "").trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2}))?(?::(\d{2}))?(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/
  );

  if (match) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatShortDateTime(iso: string): string {
  const d = parseStableIsoDate(iso);
  if (!d) return iso;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(d);
}

export function formatShortDate(iso: string): string {
  const d = parseStableIsoDate(iso);
  if (!d) return iso;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(d);
}
