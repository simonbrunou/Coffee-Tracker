import { config } from "dotenv";

// Per-worker setup file (NOT globalSetup): runs inside each worker before the test
// module is evaluated, so DATABASE_URL reaches `describe.skipIf(...)`. No-op if the
// file is absent (CI sets DATABASE_URL at the job level).
config({ path: ".env.test" });
