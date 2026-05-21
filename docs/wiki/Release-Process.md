# Release Process

Use this page as the authoritative checklist before merging or tagging `islee23520/lfg`.

## Mandatory Gates (must all pass)

- [ ] Local smoke passes with `runtime-smoke-coverage=100%`
- [ ] Aggregated local release-readiness passes with `release-readiness-local=ok`
- [ ] Real Grok install smoke passes with `grok-install-smoke=ok skills=<discovered-count> key_skills_present`
- [ ] Installed `lfg` symlink surface smoke passes
- [ ] Team preflight + provider matrix smoke passes
- [ ] Team tmux lifecycle smoke passes with `team-tmux-lifecycle=ok`
- [ ] MCP stdio isolation smoke passes with `mcp-stdio-isolation=ok`
- [ ] State schema versioning smoke passes
- [ ] Marketplace source & release notes smoke passes
- [ ] Grok hook discovery & replay smoke passes
- [ ] Remote GitHub Actions smoke passes with `remote-smoke=ok`
- [ ] Full aggregate passes with `release-readiness-all=ok`

## Commands

```sh
bun plugins/lfg/bin/self-test.ts
bun plugins/lfg/bin/self-test.ts
bun plugins/lfg/bin/self-test.ts plus marketplace remote smoke p1 lfg-v0.3.0-p1
```

See the full list in `docs/RELEASE_CHECKLIST.md`.

## Stop Condition

**Do not merge or tag** unless every gate above passes and the latest GitHub Actions `lfg smoke` workflow shows `completed` with conclusion `success`.

---

**See also**: [Verification](./Verification.md)
