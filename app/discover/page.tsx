import { getCurrentUserId } from "@/lib/auth";
import { getDiscoverBeansPage, getTrendingBeans } from "@/lib/queries";
import { DiscoverClient } from "./discover-client";

// Server component: fetch the catalog's first page + the trending rail. Text/process
// filtering is applied server-side by the client's load-more on change.
export default async function DiscoverPage() {
  const uid = await getCurrentUserId();
  const [initialBeans, trending] = await Promise.all([
    getDiscoverBeansPage(uid, {}),
    getTrendingBeans(uid),
  ]);
  return <DiscoverClient initialBeans={initialBeans} trending={trending} />;
}
