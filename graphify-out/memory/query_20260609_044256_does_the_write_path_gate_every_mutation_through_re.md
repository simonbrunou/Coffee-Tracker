---
type: "query"
date: "2026-06-09T04:42:56.562550+00:00"
question: "Does the write-path gate every mutation through requireVerifiedUserId()?"
contributor: "graphify"
source_nodes: ["requireVerifiedUserId()", "requireUserId()", "getCurrentUserId", "logBrew()", "addComment()", "isWriteAllowed()", "resolveUserOrThrow()"]
---

# Q: Does the write-path gate every mutation through requireVerifiedUserId()?

## Answer

YES, and it is machine-enforced. All 14 content-write server actions in app/actions.ts (logBrew, addBag, updateBrew, deleteBrew, updateBag, deleteBag, toggleLike, toggleFollowUser, toggleFollowRoaster, toggleSaveTasting, toggleWishlistBean, addComment, updateComment, deleteComment) call requireVerifiedUserId() - verified by reading source. test/write-gate-coverage.test.ts statically asserts each of those 14 matches /requireVerifiedUserId()/, so CI fails if a new content-write skips the gate. requireVerifiedUserId (lib/auth.ts:38) is not a JWT-flag check: it calls query() for a LIVE DB read via resolveUserOrThrow()+isWriteAllowed()+getSessionState (read/write-path revocation per M4 specs). Two-tier model is deliberate: content writes -> requireVerifiedUserId; account/identity ops (deleteAccount, signOutAllDevices, link/unlink, setPassword, setDiscoverable, resendVerification) -> requireUserId (verified would deadlock e.g. resendVerification); scoped reads (loadMore*) -> getCurrentUserId; pre-auth (registerUser, signOutAction) and public fetchComments -> ungated. The graph's 14 INFERRED edges were all confirmed correct.

## Source Nodes

- requireVerifiedUserId()
- requireUserId()
- getCurrentUserId
- logBrew()
- addComment()
- isWriteAllowed()
- resolveUserOrThrow()