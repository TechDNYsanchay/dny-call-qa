// One-tap WhatsApp messages: a wa.me link opens WhatsApp (the app on a phone, WhatsApp Web on a
// computer) with the text ready to edit and send from the executive's own WhatsApp. No WhatsApp
// Business account or paid service is involved.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SIGN_OFF = "– DNY Hospitality";

/** A link that opens WhatsApp with `text` for this number; null when the number can't be messaged. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  // A bare 10-digit number is Indian.
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

/** "Rohit Kapoor" -> "Hi Rohit"; a number, "(test)" or nothing -> "Hi". */
function greeting(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return /^\p{L}{2,}$/u.test(first) ? `Hi ${first}` : "Hi";
}

/** "2026-10-29" -> "Thursday 29 Oct". */
export function dayName(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]}`;
}

/** The time in a phrase like "Thu 29 Oct, 11 am" or "2026-10-21 18:00", as "11 am" / "6 pm"; null if none. */
export function timeIn(text: string | null | undefined): string | null {
  if (!text) return null;
  const twelve = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i);
  const twentyFour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const [hour, minute, half] = twelve
    ? [Number(twelve[1]), twelve[2] ?? "00", twelve[3].toLowerCase()]
    : twentyFour
      ? [Number(twentyFour[1]) % 12 || 12, twentyFour[2], Number(twentyFour[1]) >= 12 ? "pm" : "am"]
      : [null, null, null];
  if (hour === null || hour < 1 || hour > 12) return null;
  return minute === "00" ? `${hour} ${half}` : `${hour}:${minute} ${half}`;
}

export const message = {
  // No name: a missed call's name is whatever the phone has saved ("Housekeeping Job"), not what the caller is called.
  missedCall: () => `Hi, this is DNY Hospitality. Sorry we missed your call. When would be a good time to call you back? ${SIGN_OFF}`,

  callBack: (name?: string | null, when?: string | null) =>
    `${greeting(name)}, this is DNY Hospitality. As promised, we'll call you back${when ? ` ${when}` : " shortly"}. Does that still suit you? ${SIGN_OFF}`,

  meeting: (name: string | null | undefined, date: string | null, when: string | null) => {
    const time = timeIn(when);
    const slot = date ? `on ${dayName(date)}${time ? ` at ${time}` : ""}` : when ? `(${when})` : "as discussed";
    return `${greeting(name)}, confirming your meeting with our lead consultant ${slot}. We'll share the meeting link here. Looking forward to it! ${SIGN_OFF}`;
  },

  bookMeeting: (name?: string | null) =>
    `${greeting(name)}, thank you for speaking with DNY Hospitality. Our lead consultant would love to understand your plans in detail. Could we fix a 30-minute video call? Please share a day and time that suits you. ${SIGN_OFF}`,
};
