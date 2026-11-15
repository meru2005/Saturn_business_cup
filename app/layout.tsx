import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { DeleteData } from "@/components/DeleteData";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: "Saturn — your tax refund, in every paycheck",
  description:
    "Overtime and tip workers overpay federal tax all year. Saturn reads your paystub, finds what you're overpaying under the new overtime and tips deductions, and gives you the exact W-4 numbers to get it back every payday.",
  openGraph: {
    title: "Saturn: your tax refund, in every paycheck",
    description: "Work overtime or get tips? You're probably overpaying federal tax every paycheck. Check yours free in 60 seconds.",
    type: "website",
    siteName: "Saturn",
  },
  twitter: { card: "summary_large_image", title: "Saturn: your tax refund, in every paycheck", description: "Overtime or tips? Check what you're overpaying, free." },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <nav className="nav">
            <Link href="/" className="logo">
              <span className="logo-mark">S</span> Saturn
            </Link>
            <div className="nav-links">
              <Link href="/#how">How it works</Link>
              <Link href="/guard">Payday check</Link>
              <Link href="/pricing">Pricing</Link>
            </div>
          </nav>
        </div>
        <main className="container">{children}</main>
        <footer className="container footer">
          <p>
            Saturn is an educational withholding tool for W-2 employees, not tax advice. Estimates use 2026 federal rules
            (brackets, standard deduction, child tax credit, and the qualified overtime and tips deductions). State taxes are
            not included. Paystub images are read in memory and never stored. We never ask for your SSN, bank account or card
            (payments are handled by Stripe).
          </p>
          <p><DeleteData /></p>
          <p>© 2026 Saturn · Built at Zimran Business Cup</p>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
