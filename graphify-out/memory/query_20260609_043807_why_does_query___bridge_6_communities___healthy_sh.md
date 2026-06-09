---
type: "query"
date: "2026-06-09T04:38:07.973920+00:00"
question: "Why does query() bridge 6 communities - healthy shared abstraction or god-object?"
contributor: "graphify"
source_nodes: ["query()", "pool", "requireUserId()", "requireVerifiedUserId()", "getFeedPage", "logBrew()", "withTransaction", "getDataExport"]
---

# Q: Why does query() bridge 6 communities - healthy shared abstraction or god-object?

## Answer

VERDICT: healthy shared data-access primitive (the narrow waist of the data layer), NOT a god-object. query() (lib/db.ts:38) is a 5-line parameterized passthrough to pool.query with zero domain logic. Of its 60 edges, 46 are EXTRACTED; all inbound 'calls' (every read in queries.ts/data-export.ts [c1/c6], every write server action in app/actions.ts [c0], auth guards + rate-limit + verify-email [c3/c5] call INTO it), while query() itself only reaches down to pool/withTransaction in its home DB layer [c14, 'contains' edge]. A god-object would contain multi-domain logic and radiate outward; query() does neither - it is a sink. High betweenness (0.162) is the expected signature of a DB primitive at the feature<->Postgres boundary. Real watch-item: correctness/SQL-injection/per-user-scoping safety lives entirely in CALLERS, not in query(); the codebase mitigates via scoped query functions + Scoped-Query Integration Tests [c16] + projection-guard tests. The 14 INFERRED edges (updateBrew/deleteBrew/toggleLike/addComment) are unverified agent guesses - those actions more likely route through queries.ts/withTransaction than raw query().

## Source Nodes

- query()
- pool
- requireUserId()
- requireVerifiedUserId()
- getFeedPage
- logBrew()
- withTransaction
- getDataExport