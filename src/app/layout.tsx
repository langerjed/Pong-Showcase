import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JEDAI Space Tennis",
  description: "The ultimate retro space tennis experience — where video games all started. Built with Next.js.",
  keywords: ["pong", "tennis", "arcade", "retro", "game", "jedai", "space"],
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
