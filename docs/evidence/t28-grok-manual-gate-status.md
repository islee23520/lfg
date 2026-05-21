# T28 Grok Manual Gate Status (Historical / Manual Gate)

Retained evidence note.

Current contract remains:
- native Grok spawning requires real host evidence before release claims
- dependency-free runtime paths keep deterministic fallback envelopes for smoke tests

## Latest local gate attempt — 2026-05-21

Result: `grok-native-spawn-manual=ok`.

The T28 prompt was re-run through the local `grok` binary after LFG added Grok-discoverable plugin agent wrappers under `plugins/lfg/agents/*.md`. The run asked the host to spawn two read-only child agents in parallel using real native child-agent calls, not simulated outputs:

- researcher: `lfg:explore`
- critic: `lfg:oracle`

The latest coherent pass returned collectible child IDs and outputs:

```text
Researcher child ID: 019e4984-4666-77f1-86a0-3e29289e81ef
Researcher type: lfg:explore
Researcher output: This child confirms native Grok child spawning evidence is collectible for LFG when the parent reports this child ID and output.

Critic child ID: 019e4984-4666-77f1-86a0-3e3fe9ae7f97
Critic type: lfg:oracle
Critic output: The remaining risk is environment dependence, so LFG should cite this as manual Grok host evidence rather than dependency-free native execution.
```

The parent synthesis reported:

```text
Real parallel native Grok child agents (lfg:explore + lfg:oracle, both read-only) were spawned successfully with the exact mandated prompts and produced the precise one-sentence facts, providing collectible evidence of LFG-native spawning while the noted environment-dependence risk correctly limits claims of fully dependency-free execution.
```

The stream still emitted unrelated host worker initialization warnings (`unexpected content type: None`) before the successful child-spawn flow, so provider/MCP noise should continue to be monitored. It did not prevent this T28 pass because the required evidence — two named child spawns, two independent child outputs, and parent synthesis — was collected.

## Earlier local gate attempt — 2026-05-21

Result: `MANUAL_GATE_FAILED`.

The documented `docs/SMOKE.md` T28 native sub-agent gate was executed through the local `grok` binary. The host produced child IDs for `researcher` and `critic`, and the critic returned a sentence, but the researcher child exceeded `max_turns` before producing the required one-sentence output. Because the pass condition requires two named child spawns, two independent child outputs, and parent synthesis, this attempt is recorded as skip evidence rather than `grok-native-spawn-manual=ok`.

Observed failing prerequisite: researcher child output was not collectible after `max_turns exceeded`.

## Follow-up local gate attempt — 2026-05-21

Result: `MANUAL_GATE_FAILED`.

The T28 prompt was re-run through the local `grok` binary with `--output-format streaming-json`, `--max-turns 30`, and explicit instructions to spawn named `researcher` and `critic` children, collect one sentence from each, and synthesize a parent sentence.

The run emitted repeated host worker initialization failures before completion:

```text
ERROR unexpected content type: None
ERROR worker quit with fatal: Unexpected content type: None, when send initialized notification
```

The stream then ended with:

```text
Internal error: "max_turns exceeded: limit is 30, but got 33 messages"
```

Because the run did not produce collectible evidence for two named child outputs plus parent synthesis, this remains skip/failure evidence rather than `grok-native-spawn-manual=ok`.

Observed failing prerequisite: native Grok child-spawn evidence was not collectible because the host worker failed initialization and the parent run exceeded `max_turns` before producing the required child-output/synthesis artifact.
