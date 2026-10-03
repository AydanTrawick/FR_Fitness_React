import "./exercises.css";
import type { Metadata } from "next";
import "./globals.css";
import { ConsentAnalytics } from "@/components/account/consent-analytics";
import SplashScreen from "@/components/SplashScreen";
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
      <body><SplashScreen>{children}</SplashScreen><ConsentAnalytics /></body>
    </html>
  );
}
