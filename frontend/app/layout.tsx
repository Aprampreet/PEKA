import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "P.E.K.A — Rescue Intelligence | Team PIPER",
  description: "P.E.K.A Disaster-Response Robotics Operations & Multi-Sensor Fusion Platform by Team PIPER",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F3F2ED] text-[#242820] selection:bg-[#285B49]/20 selection:text-[#285B49]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
