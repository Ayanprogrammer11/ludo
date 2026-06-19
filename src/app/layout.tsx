import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Ludo",
  title: {
    default: "Ludo - Bring everyone to the table",
    template: "%s | Ludo",
  },
  description: "A polished, multiplayer-ready take on the traditional board game.",
  openGraph: {
    title: "Ludo - Bring everyone to the table",
    description: "A polished, multiplayer-ready take on the traditional board game.",
    siteName: "Ludo",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Ludo - Bring everyone to the table",
    description: "A polished, multiplayer-ready take on the traditional board game.",
  },
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
