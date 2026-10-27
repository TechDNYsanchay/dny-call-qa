import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("csv", () => {
  it("starts with a byte-order mark and separates rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a,b\r\n1,x\r\n");
  });

  it("quotes commas, quotes and line breaks, and leaves Hindi as it is", () => {
    expect(toCsv(["v"], [["a, b"], ['say "hi"'], ["line\nbreak"], ["कल 4 बजे"]])).toBe('﻿v\r\n"a, b"\r\n"say ""hi"""\r\nline\nbreak\r\nकल 4 बजे\r\n'.replace("line\nbreak", '"line\nbreak"'));
  });

  it("stops spreadsheet formulas but keeps negative numbers", () => {
    expect(toCsv(["v"], [["=HYPERLINK(1)"], ["-5"], [null]])).toBe("﻿v\r\n'=HYPERLINK(1)\r\n-5\r\n\r\n");
  });
});
