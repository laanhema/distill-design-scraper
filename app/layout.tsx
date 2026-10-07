import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Distill - Design System Scraper",
  description:
    "Point it at a URL or drop in an image → a Markdown design system.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-full bg-bg text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
