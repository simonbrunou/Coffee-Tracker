"use client";
import { SettingsScreen } from "@/components/settings";

export function SettingsClient({ discoverable }: { discoverable: boolean }) {
  return <SettingsScreen discoverable={discoverable} />;
}
