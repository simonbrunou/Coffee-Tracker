"use client";
import { SettingsScreen } from "@/components/settings";

export function SettingsClient({
  discoverable,
  authMethods,
}: {
  discoverable: boolean;
  authMethods: { hasPassword: boolean; providers: string[] };
}) {
  return <SettingsScreen discoverable={discoverable} authMethods={authMethods} />;
}
