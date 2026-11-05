import { describe, expect, it } from "vitest";
import { faDigits, formatJalaliNumeric, isLeapJalaliYear, jalaliMonthLength, jalaliWeekday, toGregorian, toJalali } from "./jalali";

describe("toJalali", () => {
  it("puts Nowruz on the first of Farvardin", () => {
    expect(toJalali(new Date(2024, 2, 20))).toEqual({ jy: 1403, jm: 1, jd: 1 });
    expect(toJalali(new Date(2025, 2, 21))).toEqual({ jy: 1404, jm: 1, jd: 1 });
  });

  it("handles the last day of a leap Esfand", () => {
    expect(toJalali(new Date(2025, 2, 20))).toEqual({ jy: 1403, jm: 12, jd: 30 });
  });

  it("converts a date in the second half of the year", () => {
    // 1 Dey 1403 was the 21st of December 2024.
    expect(toJalali(new Date(2024, 11, 21))).toEqual({ jy: 1403, jm: 10, jd: 1 });
  });
});

describe("toGregorian", () => {
  it("round-trips with toJalali across a whole year", () => {
    for (let day = 0; day < 366; day++) {
      const date = new Date(2024, 0, 1 + day);
      const { jy, jm, jd } = toJalali(date);
      expect(toGregorian(jy, jm, jd).getTime()).toBe(date.getTime());
    }
  });
});

describe("leap years and month lengths", () => {
  it("knows which years are leap", () => {
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(isLeapJalaliYear(1404)).toBe(false);
  });

  it("gives the first six months 31 days, the next five 30, and Esfand 29 or 30", () => {
    expect(jalaliMonthLength(1404, 1)).toBe(31);
    expect(jalaliMonthLength(1404, 6)).toBe(31);
    expect(jalaliMonthLength(1404, 7)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
  });
});

describe("formatting", () => {
  it("writes Persian digits", () => {
    expect(faDigits(1404)).toBe("۱۴۰۴");
    expect(formatJalaliNumeric(new Date(2025, 2, 21))).toBe("۱۴۰۴/۰۱/۰۱");
  });

  it("starts the week on Saturday", () => {
    // The 21st of March 2025 was a Friday.
    expect(jalaliWeekday(new Date(2025, 2, 21))).toBe(6);
    expect(jalaliWeekday(new Date(2025, 2, 22))).toBe(0);
  });
});
