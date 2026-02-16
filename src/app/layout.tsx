import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JEDAI Space Pong",
  description: "The ultimate retro arcade Pong experience — where video games all started. Built with Next.js.",
  keywords: ["pong", "arcade", "retro", "game", "jedai"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
