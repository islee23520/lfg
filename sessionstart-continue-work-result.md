STATUS: PASS

SUMMARY:

- SessionStart now always injects `<lfg-sessionstart-continue-work>` and atomically writes `.omo/orchestrator/sessionstart-continue-work-receipt.json`.
- A resumable prior ledger thread launches `codex exec resume <session-id> <prompt>` and records the exact argv, thread, session, result path, action, and guidance in the receipt.
- Stale/live metadata produces `guidance: "soft_stale_live"` only; it does not suppress the Codex resume.
- An empty inbox still injects continuation state and writes an `action: "no_prior_work"` receipt.

EVIDENCE:

- `npx vitest run src/grok/hooks/native-orchestrator-inbox-hook.test.ts` — PASS, 9 tests.
- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- Built-payload manual QA — PASS: `SessionStart`, continuation tag present, receipt action `codex_exec_resume`, guidance `soft_stale_live`, executed argv prefix `exec resume qa-session-123`.
