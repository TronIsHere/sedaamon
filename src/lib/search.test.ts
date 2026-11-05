import { describe, expect, it } from "vitest";
import { foldForSearch, matchesSearch } from "./search";

describe("foldForSearch", () => {
  it("turns Persian and Arabic digits into 0-9", () => {
    expect(foldForSearch("۱۲۳")).toBe("123");
    expect(foldForSearch("٤٥٦")).toBe("456");
  });

  it("maps Arabic yeh and kaf to their Persian forms", () => {
    expect(foldForSearch("علي")).toBe("علی");
    expect(foldForSearch("موسى")).toBe("موسی");
    expect(foldForSearch("كتاب")).toBe("کتاب");
  });

  it("lowercases Latin letters", () => {
    expect(foldForSearch("Sedaamon")).toBe("sedaamon");
  });

  it("keeps the length, so match positions line up with the original text", () => {
    for (const text of ["سلام ۱۲۳ Ali", "İstanbul", "علي و كريم"]) expect(foldForSearch(text)).toHaveLength(text.length);
  });
});

describe("matchesSearch", () => {
  it("matches across the folded forms", () => {
    expect(matchesSearch("جلسه ساعت ۱۰", foldForSearch("10"))).toBe(true);
    expect(matchesSearch("علی رضایی", foldForSearch("علي"))).toBe(true);
    expect(matchesSearch("Hello", foldForSearch("HEL"))).toBe(true);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesSearch("anything", "")).toBe(true);
  });

  it("does not match text that isn't there", () => {
    expect(matchesSearch("سلام", foldForSearch("خداحافظ"))).toBe(false);
  });
});
