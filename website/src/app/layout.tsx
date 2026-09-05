import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VersionGate — self-hosted blue/green Docker deploy engine",
  description:
    "VersionGate: single-container deploy engine for your VPS. Fastify, PostgreSQL, Nginx, GitHub webhooks, warm-swap rollback.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "VersionGate",
    description:
      "Self-hosted zero-downtime Docker deploys on your own server. Blue-green slots, GitHub integration, environment promotion.",
    url: "https://versiongate.tech",
    siteName: "VersionGate",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="light" data-theme="light">
      <body
        className={`${sans.variable} ${mono.variable} font-sans antialiased bg-background text-foreground`}
        style={{ "--font-display": "var(--font-mono)" } as React.CSSProperties}
      >
        {children}
      </body>
    </html>
  );
}
