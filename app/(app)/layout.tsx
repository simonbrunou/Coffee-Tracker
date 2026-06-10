import { AppProvider } from "@/components/app-provider";
import { getAppData } from "@/lib/queries";

// Read fresh from Postgres on each full load; the AppProvider's client state
// then persists across client-side route navigation. This nested layout is the
// ONLY place getAppData() runs — the root layout stays DB-independent so the
// (legal) group survives a DB outage.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialData = await getAppData();
  return <AppProvider initialData={initialData}>{children}</AppProvider>;
}
