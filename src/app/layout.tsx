import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pong Showcase — Simple game. Endless rally.",
  description: "A fresh take on the original arcade classic. Pick your side, find your rhythm, and send it back.",
  keywords: ["pong", "tennis", "arcade", "retro", "game", "showcase"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
