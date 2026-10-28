import { describe, expect, it } from "vitest";
import { dayName, message, timeIn, whatsappLink } from "./whatsapp";

describe("WhatsApp links", () => {
  it("opens a chat with the number and the message ready", () => {
    const link = whatsappLink("+91 98200 12345", "Hi Rohit, see you Thursday & thanks!");
    expect(link).toBe("https://wa.me/919820012345?text=Hi%20Rohit%2C%20see%20you%20Thursday%20%26%20thanks!");
  });

  it("treats a bare 10-digit number as Indian, and skips what can't be messaged", () => {
    expect(whatsappLink("9820012345", "x")).toMatch(/^https:\/\/wa\.me\/919820012345\?/);
    expect(whatsappLink("12345", "x")).toBeNull();
    expect(whatsappLink(null, "x")).toBeNull();
    expect(whatsappLink(undefined, "x")).toBeNull();
  });
});

describe("meeting times read from what was said", () => {
  it("finds the time in the usual phrasings", () => {
    expect(timeIn("Thu 29 Oct, 11 am (video)")).toBe("11 am");
    expect(timeIn("Sunday 25 Oct 2026, 4:30 pm")).toBe("4:30 pm");
    expect(timeIn("2026-10-21 18:00")).toBe("6 pm");
    expect(timeIn("2026-10-21 09:15")).toBe("9:15 am");
    expect(timeIn("after Diwali")).toBeNull();
    expect(timeIn(null)).toBeNull();
  });

  it("names the day", () => {
    expect(dayName("2026-10-29")).toBe("Thursday 29 Oct");
    expect(dayName("2026-11-01")).toBe("Sunday 1 Nov");
  });
});

describe("the ready messages", () => {
  it("confirm a meeting with the day and time", () => {
    const text = message.meeting("Rohit Kapoor", "2026-10-29", "Thu 29 Oct, 11 am");
    expect(text).toContain("Hi Rohit, confirming your meeting with our lead consultant on Thursday 29 Oct at 11 am.");
    expect(text).toContain("– DNY Hospitality");
  });

  it("fall back to what was said when the date isn't clear", () => {
    expect(message.meeting("Rohit", null, "after Diwali")).toContain("lead consultant (after Diwali).");
  });

  it("greet by first name only when there is a real one", () => {
    // A missed call's name is the phone's saved label, so it isn't used.
    expect(message.missedCall()).toMatch(/^Hi, this is DNY Hospitality/);
    expect(message.bookMeeting(null)).toMatch(/^Hi, thank you for speaking with DNY Hospitality/);
    expect(message.callBack("Mohit", "tomorrow after 4 pm")).toBe(
      "Hi Mohit, this is DNY Hospitality. As promised, we'll call you back tomorrow after 4 pm. Does that still suit you? – DNY Hospitality",
    );
  });
});
