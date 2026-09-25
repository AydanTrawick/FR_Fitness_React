import "./exercises.css";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FirstRep — Build your everyday",
  description: "Your training, nutrition, and progress. Together in one place.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
