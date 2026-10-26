import { describe, expect, it } from "vitest";
import { mergeTurns, wordsToTurns } from "./turns";

const w = (text: string, startSec: number, endSec: number, speaker = "0") => ({ text, startSec, endSec, speaker });

describe("speaker turns", () => {
  it("groups words by speaker", () => {
    expect(wordsToTurns([w("Hello", 0.5, 0.9), w("ji", 1, 1.2), w("Haan", 1.5, 1.8, "1"), w("boliye", 1.9, 2.3, "1"), w("Main", 2.6, 2.8)])).toEqual([
      { speaker: "0", startSec: 0.5, endSec: 1.2, text: "Hello ji" },
      { speaker: "1", startSec: 1.5, endSec: 2.3, text: "Haan boliye" },
      { speaker: "0", startSec: 2.6, endSec: 2.8, text: "Main" },
    ]);
  });

  it("starts a new turn after a long pause, so silences stay visible", () => {
    const turns = wordsToTurns([w("Ek", 0, 0.4), w("minute", 0.5, 0.9), w("haan", 10.2, 10.5)]);
    expect(turns.map((t) => [t.startSec, t.endSec])).toEqual([
      [0, 0.9],
      [10.2, 10.5],
    ]);
  });

  it("drops empty words and rounds to hundredths", () => {
    expect(wordsToTurns([w(" ", 0, 0.1), w("Theek", 0.123, 0.456)])).toEqual([{ speaker: "0", startSec: 0.12, endSec: 0.46, text: "Theek" }]);
  });

  it("merges back-to-back sentences by the same speaker", () => {
    expect(
      mergeTurns([
        { speaker: "A", startSec: 0, endSec: 2, text: "Namaste." },
        { speaker: "A", startSec: 2.3, endSec: 4, text: "DNY Hospitality se bol raha hoon." },
        { speaker: "B", startSec: 4.2, endSec: 5, text: "Haan." },
        { speaker: "B", startSec: 5.1, endSec: 5.2, text: "" },
      ]),
    ).toEqual([
      { speaker: "A", startSec: 0, endSec: 4, text: "Namaste. DNY Hospitality se bol raha hoon." },
      { speaker: "B", startSec: 4.2, endSec: 5, text: "Haan." },
    ]);
  });
});
