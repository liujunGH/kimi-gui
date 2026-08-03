import { describe, expect, it } from 'vitest';
import {
  formatLocalDate,
  formatLocalDateTime,
  formatLocalTime,
} from '../src/lib/formatMessageTime';

describe('local timestamp formatting', () => {
  it('converts UTC daemon timestamps into the requested user time zone', () => {
    const timestamp = '2026-08-03T01:30:00.000Z';

    expect(formatLocalDateTime(timestamp, 'Asia/Shanghai')).toBe('2026-08-03 09:30');
    expect(formatLocalDate(timestamp, 'Asia/Shanghai')).toBe('2026-08-03');
    expect(formatLocalTime(timestamp, 'Asia/Shanghai')).toBe('09:30');
  });

  it('handles a local date rollover instead of slicing the UTC source text', () => {
    const timestamp = '2026-08-03T20:30:00.000Z';

    expect(formatLocalDateTime(timestamp, 'Asia/Shanghai')).toBe('2026-08-04 04:30');
  });

  it('preserves invalid source values for diagnostics', () => {
    expect(formatLocalDateTime('unknown')).toBe('unknown');
  });
});
