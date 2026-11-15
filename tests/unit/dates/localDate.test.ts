import { afterEach, describe, expect, it } from 'vitest';
import {
  formatWornDate,
  isCurrentDateSomewhere,
  isLocalDate,
  todayLocalDate,
  utcCalendarDate,
} from '@/lib/dates/localDate';

// Assigning undefined would store the string "undefined", so an unset TZ is deleted again.
function restoreTimeZone(original: string | undefined) {
  if (original === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = original;
  }
}

describe('todayLocalDate (US10: the user\'s own calendar date)', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    restoreTimeZone(originalTz);
  });

  function inTimeZone(tz: string) {
    process.env.TZ = tz;
  }

  it('uses the local date late in the evening west of UTC, where the UTC date is already tomorrow', () => {
    inTimeZone('America/Los_Angeles');
    // 23:30 on 11 November in Los Angeles is 07:30 UTC on 12 November.
    const lateEvening = new Date('2026-11-12T07:30:00.000Z');

    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-11-12');
    expect(todayLocalDate(lateEvening)).toBe('2026-11-11');
  });

  it('uses the local date just after midnight east of UTC, where the UTC date is still yesterday', () => {
    inTimeZone('Asia/Tokyo');
    // 00:15 on 12 November in Tokyo is 15:15 UTC on 11 November.
    const justAfterMidnight = new Date('2026-11-11T15:15:00.000Z');

    expect(todayLocalDate(justAfterMidnight)).toBe('2026-11-12');
  });

  it('changes date exactly at local midnight', () => {
    inTimeZone('America/Los_Angeles');

    expect(todayLocalDate(new Date('2026-11-12T07:59:59.999Z'))).toBe('2026-11-11');
    expect(todayLocalDate(new Date('2026-11-12T08:00:00.000Z'))).toBe('2026-11-12');
  });

  it('pads months and days to two digits, and passes the server check for that moment', () => {
    inTimeZone('Pacific/Kiritimati');
    const now = new Date('2026-01-04T12:00:00.000Z');

    expect(todayLocalDate(now)).toBe('2026-01-05');
    expect(isCurrentDateSomewhere(todayLocalDate(now), now)).toBe(true);
  });

  it('uses the current time when none is given', () => {
    expect(isLocalDate(todayLocalDate())).toBe(true);
  });
});

describe('formatWornDate', () => {
  it('writes the stored date out in full, without a time zone shift', () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(formatWornDate('2026-11-11')).toBe('Wednesday, November 11, 2026');
      expect(formatWornDate('2026-01-01')).toBe('Thursday, January 1, 2026');
    } finally {
      restoreTimeZone(originalTz);
    }
  });
});

describe('isLocalDate', () => {
  it.each(['2026-11-11', '2028-02-29', '2026-12-31', '2026-01-01'])('accepts %s', (value) => {
    expect(isLocalDate(value)).toBe(true);
  });

  it.each([
    ['an impossible day', '2026-02-30'],
    ['a non-leap 29 February', '2027-02-29'],
    ['month 13', '2026-13-01'],
    ['day 0', '2026-11-00'],
    ['a missing zero', '2026-11-1'],
    ['a time', '2026-11-11T00:00:00Z'],
    ['surrounding spaces', ' 2026-11-11 '],
    ['slashes', '2026/11/11'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(isLocalDate(value)).toBe(false);
  });

  it.each([null, undefined, 20261111, new Date('2026-11-11')])('rejects the non-string %s', (value) => {
    expect(isLocalDate(value)).toBe(false);
  });
});

describe('utcCalendarDate', () => {
  it('formats the UTC date, not the machine time zone', () => {
    expect(utcCalendarDate(new Date('2026-11-11T23:59:59.999Z'))).toBe('2026-11-11');
    expect(utcCalendarDate(new Date('2026-11-12T00:00:00.000Z'))).toBe('2026-11-12');
  });
});

describe('isCurrentDateSomewhere', () => {
  // 18:00 UTC: UTC−12 is at 06:00 the same day, and UTC+14 is at 08:00 the next day.
  const evening = new Date('2026-11-11T18:00:00.000Z');
  // 06:00 UTC: UTC−12 is still at 18:00 the previous day.
  const morning = new Date('2026-11-11T06:00:00.000Z');

  it('accepts the UTC date', () => {
    expect(isCurrentDateSomewhere('2026-11-11', evening)).toBe(true);
  });

  it('accepts tomorrow while it is already tomorrow east of UTC', () => {
    expect(isCurrentDateSomewhere('2026-11-12', evening)).toBe(true);
  });

  it('accepts yesterday while it is still yesterday west of UTC', () => {
    expect(isCurrentDateSomewhere('2026-11-10', morning)).toBe(true);
  });

  it('rejects yesterday once no time zone is still on it', () => {
    expect(isCurrentDateSomewhere('2026-11-10', evening)).toBe(false);
  });

  it('rejects tomorrow before any time zone has reached it', () => {
    // 09:59 UTC is 23:59 in UTC+14.
    expect(isCurrentDateSomewhere('2026-11-12', new Date('2026-11-11T09:59:00.000Z'))).toBe(false);
    expect(isCurrentDateSomewhere('2026-11-12', new Date('2026-11-11T10:00:00.000Z'))).toBe(true);
  });

  it('rejects older and later dates', () => {
    expect(isCurrentDateSomewhere('2026-11-01', evening)).toBe(false);
    expect(isCurrentDateSomewhere('2026-11-13', evening)).toBe(false);
    expect(isCurrentDateSomewhere('2025-11-11', evening)).toBe(false);
  });

  it('rejects a value that is not a calendar date', () => {
    expect(isCurrentDateSomewhere('2026-11-11x', evening)).toBe(false);
  });
});
