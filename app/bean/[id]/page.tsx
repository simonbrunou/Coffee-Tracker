import { getCurrentUserId } from "@/lib/auth";
import { getBean, getBeanReviewsPage } from "@/lib/queries";
import { BeanClient } from "./bean-client";

// Server component: fetch the bean + its first page of reviews (scoped/paginated),
// then hand off to a client wrapper that wires the shell handlers.
export default async function BeanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getCurrentUserId();
  const [bean, initialReviews] = await Promise.all([getBean(uid, id), getBeanReviewsPage(uid, id, {})]);
  return <BeanClient beanId={id} bean={bean} initialReviews={initialReviews} />;
}
