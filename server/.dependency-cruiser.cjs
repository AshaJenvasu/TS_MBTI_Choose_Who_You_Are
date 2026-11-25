// Import rules from the DDD Context Map (docs/adr/001-architecture-style.md).
// Run: `bun run lint:deps` (from server/).
//
// Only the bounded-context folders below are restricted. Shared code outside them
// (src/app.ts, src/dev.ts, src/errors.ts, src/db/**) is exempt and may be imported by anyone.
//
//   Identity  (upstream)  ──supplies──▶  Assessment (downstream)   assessment → identity: allowed
//   Assessment            ──ACL only──▶  Sharing                   sharing → assessment: only via ACL
//   Identity  ✕  Sharing  (no relationship)
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "identity-not-to-assessment",
      comment:
        "Identity is upstream (Customer-Supplier). Upstream must not depend on downstream Assessment.",
      severity: "error",
      from: { path: "^src/identity/" },
      to: { path: "^src/assessment/" },
    },
    {
      name: "sharing-to-assessment-only-via-acl",
      comment:
        "Sharing may reach Assessment only through an ACL: its own src/sharing/acl/** module, " +
        "or Assessment's published src/assessment/public/** API. No direct imports of Assessment internals.",
      severity: "error",
      from: { path: "^src/sharing/", pathNot: "^src/sharing/acl/" },
      to: { path: "^src/assessment/", pathNot: "^src/assessment/public/" },
    },
    {
      name: "identity-not-to-sharing",
      comment: "Identity and Sharing have no relationship in the Context Map.",
      severity: "error",
      from: { path: "^src/identity/" },
      to: { path: "^src/sharing/" },
    },
    {
      name: "sharing-not-to-identity",
      comment: "Identity and Sharing have no relationship in the Context Map.",
      severity: "error",
      from: { path: "^src/sharing/" },
      to: { path: "^src/identity/" },
    },
  ],
  options: {
    // typescript@7.0 has no JS compiler API that dependency-cruiser can use, so parse with swc.
    // Revisit when the project moves to typescript >=7.1 (supported again).
    parser: "swc",
    doNotFollow: { path: "node_modules" },
    // Count `import type` too: a type-only import is still a dependency between contexts.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
