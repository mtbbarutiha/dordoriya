/**
 * HARD BLOCK — do not publish channel/private test posts without explicit user approval.
 * Real send scripts live in .channel-mutations-DISABLED-20260902/
 */
throw new Error(
  "BLOCKED: channel/private publish scripts are disabled. Do not send media to channel or ADMIN DMs.",
);
