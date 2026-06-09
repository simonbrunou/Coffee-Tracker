---
type: "query"
date: "2026-06-09T04:42:56.621176+00:00"
question: "Why does Avatar() bridge UI components into Core Data and Server Actions?"
contributor: "graphify"
source_nodes: ["Avatar()", "cn (class merge util)", "app-provider.tsx", "cards.tsx", "detail.tsx"]
---

# Q: Why does Avatar() bridge UI components into Core Data and Server Actions?

## Answer

It does NOT reach into business logic - the bridge is a clustering artifact. Avatar() (components/ui.tsx) is a pure presentational atom: signature Avatar({user: Pick<User,'name'|'avatar'>, size}), computes initials and renders an AvatarFallback; its only outbound call is cn() (class-merge util). No data fetch, no server action, no query. The single edge crossing into community 0 (Core Data & Server Actions) is INBOUND: app-provider.tsx imports Avatar to render the shell header avatar. app-provider.tsx lives in c0 because IT is the client data-wiring + action-dispatch hub (DataProvider, useOptimistic, signOutAction, resendVerification, AppData types) - not because Avatar carries data. High betweenness (0.148) just reflects that Avatar is a widely-shared UI primitive (also imported by cards.tsx, detail.tsx) - the same benign shared-primitive pattern as cn() and query(), but at the presentation seam. Not an architectural smell.

## Source Nodes

- Avatar()
- cn (class merge util)
- app-provider.tsx
- cards.tsx
- detail.tsx