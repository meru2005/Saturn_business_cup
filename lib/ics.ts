import type { PayFrequency } from "./tax";

const DAY = 86_400_000;
const STEP: Record<PayFrequency, number> = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 };

/** Next payday on or after today, projected from the paystub's pay date (or next Friday if unknown). */
export function nextPayday(payDate: string | undefined, freq: PayFrequency, today = new Date()): Date {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const parsed = payDate && /^\d{4}-\d{2}-\d{2}$/.test(payDate) ? new Date(`${payDate}T12:00:00`) : null;
  if (freq === "semimonthly") {
    // 15th and last day of the month
    const d = t0.getDate() <= 15 ? new Date(t0.getFullYear(), t0.getMonth(), 15) : new Date(t0.getFullYear(), t0.getMonth() + 1, 0);
    return d;
  }
  if (freq === "monthly") {
    const day = parsed ? parsed.getDate() : 28;
    const d = new Date(t0.getFullYear(), t0.getMonth(), Math.min(day, 28));
    return d >= t0 ? d : new Date(t0.getFullYear(), t0.getMonth() + 1, Math.min(day, 28));
  }
  let d: Date;
  if (parsed && !isNaN(parsed.getTime())) {
    d = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    const step = STEP[freq] * DAY;
    if (d < t0) d = new Date(d.getTime() + Math.ceil((t0.getTime() - d.getTime()) / step) * step);
  } else {
    d = new Date(t0.getTime() + ((5 - t0.getDay() + 7) % 7) * DAY); // next Friday
  }
  return d;
}

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/** A recurring payday reminder as an .ics file: works in Apple, Google and Outlook calendars. No account needed. */
export function paydayIcs(opts: { payDate?: string; freq: PayFrequency; url: string; raisePerPaycheck: number }): string {
  const start = nextPayday(opts.payDate, opts.freq);
  const end = new Date(start.getTime() + DAY);
  const rrule =
    opts.freq === "weekly" ? "FREQ=WEEKLY" :
    opts.freq === "biweekly" ? "FREQ=WEEKLY;INTERVAL=2" :
    opts.freq === "semimonthly" ? "FREQ=MONTHLY;BYMONTHDAY=15,-1" :
    `FREQ=MONTHLY;BYMONTHDAY=${Math.min(start.getDate(), 28)}`;
  const desc = `Payday check: open Saturn and upload today's paystub. It takes 30 seconds and tells you if you're still on track${opts.raisePerPaycheck > 0 ? ` for your +$${opts.raisePerPaycheck} per paycheck` : ""} or heading to owe in April.\\n\\n${opts.url}`;
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Saturn//Payday check//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:saturn-payday-${ymd(start)}-${Math.random().toString(36).slice(2, 10)}@saturn`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`,
    `DTEND;VALUE=DATE:${ymd(end)}`,
    `RRULE:${rrule}`,
    "SUMMARY:Saturn payday check (30 sec)",
    `DESCRIPTION:${desc}`,
    `URL:${opts.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Saturn payday check",
    "TRIGGER:PT10H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function downloadIcs(content: string, name = "saturn-payday.ics") {
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
