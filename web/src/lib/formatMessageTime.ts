type LocalDateTimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function localDateTimeParts(iso: string, timeZone?: string): LocalDateTimeParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  if (timeZone) options.timeZone = timeZone;
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', options)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: values.year ?? '',
    month: values.month ?? '',
    day: values.day ?? '',
    hour: values.hour ?? '',
    minute: values.minute ?? '',
  };
}

/** Full timestamp rendered in the user's local time zone by default. */
export function formatLocalDateTime(iso: string, timeZone?: string): string {
  const parts = localDateTimeParts(iso, timeZone);
  return parts
    ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
    : iso;
}

/** Calendar date rendered in the user's local time zone by default. */
export function formatLocalDate(iso: string, timeZone?: string): string {
  const parts = localDateTimeParts(iso, timeZone);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : iso;
}

/** Clock time rendered in the user's local time zone by default. */
export function formatLocalTime(iso: string, timeZone?: string): string {
  const parts = localDateTimeParts(iso, timeZone);
  return parts ? `${parts.hour}:${parts.minute}` : iso;
}

// Format an ISO timestamp for display beneath a user message bubble.
// - Today:        14:32
// - Yesterday:    昨天 14:32
// - This year:    06-15 14:32
// - Older years:  2025-06-15 14:32
// Invalid input falls back to the original string.
export function formatMessageTime(iso: string, yesterdayLabel = '昨天'): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;

    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    const sameYear = d.getFullYear() === now.getFullYear();
    const sameMonth = d.getMonth() === now.getMonth();
    const sameDate = d.getDate() === now.getDate();

    if (sameYear && sameMonth && sameDate) {
      return timeStr;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate()
    ) {
      return `${yesterdayLabel} ${timeStr}`;
    }

    if (sameYear) {
      return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${timeStr}`;
    }

    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${timeStr}`;
  } catch {
    return iso;
  }
}
