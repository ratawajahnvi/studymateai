import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyMate AI | Spooky-Smart AI Education Platform",
  description:
    "Production AI-powered education platform with document extraction, grounded AI study tools, planner, Pomodoro focus mode, and SM-2 smart revision.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-[#ff7b29] selection:text-[#0c0617]">
        <a
          href="#main-content"
          className="visually-hidden focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[#ff7b29] focus:px-4 focus:py-2 focus:font-semibold focus:text-[#0c0617]"
        >
          Skip to main content
        </a>
        {children}
        <footer className="border-t border-[#3e236b]/80 bg-[#0c0617]/95 px-4 py-3 text-center text-xs font-medium text-[#c4b5fd]">
          <span>StudyMate AI • </span>
          <strong className="font-bold text-[#ff944d]">Design and Build by Team Tricksters</strong>
        </footer>
      </body>
    </html>
  );
}
