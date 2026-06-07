import { getCurrentUserId } from "@/lib/auth";
import { getRoasterBeansPage } from "@/lib/queries";
import { RoasterClient } from "./roaster-client";

// Server component: fetch the roaster's first page of beans (keyset); the roaster
// identity itself comes from the bounded provider (D.roaster) in the client.
export default async function RoasterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getCurrentUserId();
  const initialBeans = await getRoasterBeansPage(uid, id, {});
  return <RoasterClient roasterId={id} initialBeans={initialBeans} />;
}
