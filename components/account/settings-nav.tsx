"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UserRound,
  AtSign,
  Mail,
  KeyRound,
  ShieldCheck,
  Link2,
  Monitor,
  Clock3,
  Bell,
  LockKeyhole,
  CircleHelp,
} from "lucide-react";
export const sections = [
  { id: "profile", label: "Profile", Icon: UserRound },
  { id: "username", label: "Username", Icon: AtSign },
  { id: "email", label: "Email", Icon: Mail },
  { id: "password", label: "Password", Icon: KeyRound },
  { id: "security", label: "Security", Icon: ShieldCheck },
  { id: "connected-accounts", label: "Connected accounts", Icon: Link2 },
  { id: "sessions", label: "Sessions & devices", Icon: Monitor },
  { id: "activity", label: "Activity", Icon: Clock3 },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "privacy", label: "Privacy & data", Icon: LockKeyhole },
  { id: "help", label: "Help & support", Icon: CircleHelp },
];
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="settings-nav" aria-label="Account settings">
      {sections.map(({ id, label, Icon }) => (
        <Link
          key={id}
          href={"/settings/" + id}
          aria-current={pathname === "/settings/" + id ? "page" : undefined}
        >
          <Icon size={16} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
