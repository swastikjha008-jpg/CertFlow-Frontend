import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AsciiProvider } from "@/components/effects/ascii-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CertFlow — Every Certificate. Automatically.",
  description:
    "Upload a template and a participant list, preview personalised certificates, generate PDFs and download them all as a ZIP.",
};

export const viewport: Viewport = { themeColor: "#050816", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans text-cf-fg antialiased">
        <AsciiProvider>{children}</AsciiProvider>
      </body>
    </html>
  );
}
