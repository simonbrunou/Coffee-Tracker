import type { Metadata } from "next";
import { JournalClient } from "./journal-client";

export const metadata: Metadata = { title: "My Journal — Cortado", robots: { index: false, follow: false } };

export default function JournalPage() {
  return <JournalClient />;
}
