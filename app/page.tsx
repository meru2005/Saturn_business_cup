"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveQuiz } from "@/lib/store";

const QUESTIONS = [
  { id: "work", q: "How do you get paid extra?", options: ["Overtime", "Tips", "Both", "Neither"] },
  { id: "refund", q: "What happened at tax time this year?", options: ["Big refund ($1,500+)", "Small refund", "I owed money", "Not sure"] },
  { id: "freq", q: "How often are you paid?", options: ["Every week", "Every 2 weeks", "Twice a month", "Monthly"] },
];

function verdict(a: Record<string, string>) {
  const extra = a.work && a.work !== "Neither";
  const big = a.refund?.startsWith("Big");
  if (a.refund === "I owed money") return "You may be under-withholding. Let's check your paystub so April doesn't surprise you again.";
  if (extra && big) return "Workers like you usually overpay $60–$120 every paycheck. Let's find your exact number.";
  if (extra) return "The new overtime and tips deductions don't reach your paycheck automatically. Let's see what you're missing.";
  if (big) return "A big refund means you lent the IRS your money for free. Let's move it back into your paychecks.";
  return "Let's check whether your withholding is right. It takes about a minute.";
}

export default function Home() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const done = QUESTIONS.every((q) => answers[q.id]);
  const progress = (Object.keys(answers).length / QUESTIONS.length) * 100;

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">For nurses, servers, warehouse &amp; overtime workers</span>
          <h1>Your tax refund, in every paycheck.</h1>
          <p className="lead">
            The new law made overtime and tips partly tax-free, but your paycheck won&apos;t change unless you file a new W-4.
            Saturn reads your paystub and shows exactly how much you&apos;re overpaying, then gives you the numbers to fix it.
          </p>

          <div className="card quiz" style={{ marginTop: 22 }}>
            <strong>Answer 3 questions</strong>
            <div className="progress"><div style={{ width: `${progress}%` }} /></div>
            {QUESTIONS.map((q) => (
              <div key={q.id}>
                <div className="quiz-q">{q.q}</div>
                <div className="choices">
                  {q.options.map((o) => (
                    <button key={o} className={`choice ${answers[q.id] === o ? "on" : ""}`} onClick={() => setAnswers({ ...answers, [q.id]: o })}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {done && (
              <div style={{ marginTop: 18 }}>
                <p style={{ fontWeight: 650 }}>{verdict(answers)}</p>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  onClick={() => {
                    saveQuiz(answers);
                    router.push("/check");
                  }}
                >
                  Check my paystub (free)
                </button>
              </div>
            )}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            No sign-up. Or <Link href="/check">skip straight to the paystub check →</Link>
          </p>
        </div>

        <div className="preview card">
          <div className="hint">Example: Maria, ER nurse, Houston</div>
          <div className="big">+$79</div>
          <div className="hint" style={{ marginBottom: 10 }}>more in every paycheck · $2,063 a year</div>
          <div className="preview-row"><span>Overtime this year</span><span>$17,784</span></div>
          <div className="preview-row"><span>Deductible part (the &quot;half&quot; only)</span><span>$5,928</span></div>
          <div className="preview-row"><span>Tax saved by the new deduction</span><span>$1,304</span></div>
          <div className="preview-row"><span>Already over-withheld before that</span><span>$1,059</span></div>
          <div className="preview-row"><span>Safety buffer we keep</span><span>−$300</span></div>
          <div className="hint" style={{ marginTop: 8 }}>Her W-4 fix: enter $5,928 in Step 4(b).</div>
        </div>
      </section>

      <section className="section" id="how">
        <h2>How it works</h2>
        <div className="grid-3">
          <div className="card">
            <div className="step-num">1</div>
            <h3>Snap your paystub</h3>
            <p>AI reads your pay, overtime, tips and the tax already withheld. You check the numbers. Nothing is stored.</p>
          </div>
          <div className="card">
            <div className="step-num">2</div>
            <h3>Exact 2026 tax math</h3>
            <p>Brackets, standard deduction, child credit, and the overtime and tips deductions with their caps, counting only the premium &quot;half&quot; of overtime.</p>
          </div>
          <div className="card">
            <div className="step-num">3</div>
            <h3>Fix your W-4, keep it right</h3>
            <p>Download the official W-4 already filled in, send it to HR, and add payday reminders. Every payday check keeps you from owing in April.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card" style={{ borderColor: "var(--green)" }}>
          <h2>Your privacy, by design</h2>
          <div className="grid-3" style={{ marginTop: 10 }}>
            <div>
              <h3>We only need 8 numbers</h3>
              <p className="hint">Pay, overtime, tips and tax withheld. Never your SSN, bank login or address.</p>
            </div>
            <div>
              <h3>Black out anything private</h3>
              <p className="hint">Before we read your paystub, cover your SSN or account numbers. Only the covered image leaves your device.</p>
            </div>
            <div>
              <h3>Nothing stored, no cards touched</h3>
              <p className="hint">Images are read in memory and discarded. Payments happen on Stripe&apos;s secure page. Delete your results anytime.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Why not just wait for the refund?</h2>
        <div className="compare">
          <div className="card">
            <h3>Refund in April</h3>
            <p className="hint">The average refund was about $3,400 this year: your own money, held for months, with no interest.</p>
          </div>
          <div className="card">
            <h3>Paycheck advance apps</h3>
            <p className="hint">Get a few days early access to your own pay, often for fees every time. You pay to borrow your own money.</p>
          </div>
          <div className="card" style={{ borderColor: "var(--green)" }}>
            <h3>Saturn</h3>
            <p className="hint">Fix withholding once. Keep more of every paycheck, permanently, with a safety buffer so April stays calm.</p>
          </div>
        </div>
      </section>
    </>
  );
}
