import { Geist, Geist_Mono } from "next/font/google";

// Shared by the root layout and the full-page error screen, which renders its own <html>.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const fontClasses = `${geistSans.variable} ${geistMono.variable}`;
