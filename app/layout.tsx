import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Distill — design-system scraper",
  description:
    "Point it at a URL or drop in an image → a Markdown design system.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-full bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
