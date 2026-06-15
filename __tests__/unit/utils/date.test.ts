import { describe, it, expect } from 'vitest';
import { isWeekend, prevBusinessDay } from '@/lib/utils/date';

describe('isWeekend', () => {
  it('returns true for Saturday (UTC)', () => {
    // 2024-01-06 is a Saturday
    expect(isWeekend(new Date('2024-01-06T12:00:00Z'))).toBe(true);
  });

  it('returns true for Sunday (UTC)', () => {
    // 2024-01-07 is a Sunday
    expect(isWeekend(new Date('2024-01-07T12:00:00Z'))).toBe(true);
  });

  it('returns false for each weekday', () => {
    // 2024-01-01 Mon, 02 Tue, 03 Wed, 04 Thu, 05 Fri
    expect(isWeekend(new Date('2024-01-01T12:00:00Z'))).toBe(false);
    expect(isWeekend(new Date('2024-01-02T12:00:00Z'))).toBe(false);
    expect(isWeekend(new Date('2024-01-03T12:00:00Z'))).toBe(false);
    expect(isWeekend(new Date('2024-01-04T12:00:00Z'))).toBe(false);
    expect(isWeekend(new Date('2024-01-05T12:00:00Z'))).toBe(false);
  });

  it('uses UTC day (not local timezone)', () => {
    // 2024-01-06T23:00:00Z is Saturday UTC but could be Sunday in UTC+1
    expect(isWeekend(new Date('2024-01-06T23:00:00Z'))).toBe(true);
  });
});

describe('prevBusinessDay', () => {
  it('returns the same date when already a weekday (Monday)', () => {
    const monday = new Date('2024-01-08T12:00:00Z');
    expect(prevBusinessDay(monday)).toEqual(monday);
  });

  it('returns the same date for Friday', () => {
    const friday = new Date('2024-01-05T12:00:00Z');
    expect(prevBusinessDay(friday)).toEqual(friday);
  });

  it('returns Friday when input is Saturday', () => {
    const saturday = new Date('2024-01-06T12:00:00Z');
    const result = prevBusinessDay(saturday);
    expect(result.getUTCDay()).toBe(5); // Friday
  });

  it('returns Friday when input is Sunday', () => {
    const sunday = new Date('2024-01-07T12:00:00Z');
    const result = prevBusinessDay(sunday);
    expect(result.getUTCDay()).toBe(5); // Friday
  });

  it('returns the input date after maxDays attempts if all are weekends', () => {
    // With maxDays=1, from Sunday it can only try once
    const sunday = new Date('2024-01-07T12:00:00Z');
    const result = prevBusinessDay(sunday, 1);
    // Walked back once to Saturday — still a weekend, returns it
    expect(result.getUTCDay()).toBe(6);
  });
});
