import App from "@/components/app-shell";
import { getAppData } from "@/lib/queries";

// Always read fresh from Postgres on load (mutations persist via server actions).
export const dynamic = "force-dynamic";

export default async function Page() {
  const initialData = await getAppData();
  return <App initialData={initialData} />;
}
