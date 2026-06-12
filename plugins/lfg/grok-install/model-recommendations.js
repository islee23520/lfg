/** Model recommendation data and scoring for interactive setup.
 *
 * Recommendations are Grok-first: every role prefers the best Grok model,
 * with GPT/Gemini/Cloude equivalents shown as alternatives.
 * Performance data comes from live proxy benchmarking.
 */
/** Performance snapshot from live benchmarking. */
export const PERF_SNAPSHOT = {
    "grok-3-mini-fast": { model: "grok-3-mini-fast", latencyMs: 1960, tokensPerSec: 146, codingQuality: 2, reasoningQuality: 1, available: true },
    "grok-3-mini": { model: "grok-3-mini", latencyMs: 3360, tokensPerSec: 147, codingQuality: 2, reasoningQuality: 1, available: true },
    "grok-4.20-0309-non-reasoning": { model: "grok-4.20-0309-non-reasoning", latencyMs: 680, tokensPerSec: 63, codingQuality: 2, reasoningQuality: 2, available: true },
    "grok-4.20-0309-reasoning": { model: "grok-4.20-0309-reasoning", latencyMs: 4420, tokensPerSec: 175, codingQuality: 2, reasoningQuality: 2, available: true },
    "grok-4.3": { model: "grok-4.3", latencyMs: 8480, tokensPerSec: 160, codingQuality: 2, reasoningQuality: 2, available: true },
    "grok-4.20-multi-agent-0309": { model: "grok-4.20-multi-agent-0309", latencyMs: 7010, tokensPerSec: 611, codingQuality: 2, reasoningQuality: 2, available: true },
    "grok-build-0.1": { model: "grok-build-0.1", latencyMs: 3720, tokensPerSec: 150, codingQuality: 2, reasoningQuality: 2, available: true },
    "gpt-5.4-mini": { model: "gpt-5.4-mini", latencyMs: 5540, tokensPerSec: 21, codingQuality: 2, reasoningQuality: 1, available: true },
    "gpt-5.5": { model: "gpt-5.5", latencyMs: 3470, tokensPerSec: 13, codingQuality: 2, reasoningQuality: 2, available: true },
    "gpt-5.3-codex-spark": { model: "gpt-5.3-codex-spark", latencyMs: 2100, tokensPerSec: 219, codingQuality: 2, reasoningQuality: 2, available: true },
    "codex-auto-review": { model: "codex-auto-review", latencyMs: 3400, tokensPerSec: 13, codingQuality: 2, reasoningQuality: 2, available: true },
    "claude-opus-4-6-thinking": { model: "claude-opus-4-6-thinking", latencyMs: 18290, tokensPerSec: 34, codingQuality: 2, reasoningQuality: 2, available: true },
    "claude-sonnet-4-6": { model: "claude-sonnet-4-6", latencyMs: 5190, tokensPerSec: 15, codingQuality: 2, reasoningQuality: 2, available: true },
    "gemini-3.5-flash-low": { model: "gemini-3.5-flash-low", latencyMs: 3920, tokensPerSec: 17, codingQuality: 2, reasoningQuality: 1, available: true },
    "gemini-3.1-pro-preview": { model: "gemini-3.1-pro-preview", latencyMs: 12370, tokensPerSec: 6, codingQuality: 2, reasoningQuality: 2, available: true },
    "gemini-pro-agent": { model: "gemini-pro-agent", latencyMs: 11170, tokensPerSec: 5, codingQuality: 2, reasoningQuality: 2, available: true },
};
/** Grok-first role recommendations. */
export const ROLE_RECOMMENDATIONS = [
    {
        role: "explorer",
        recommended: "grok-3-mini-fast",
        reasoningEffort: "low",
        rationale: "Fastest Grok model (1.96s). High-volume codebase search prioritizes speed over depth.",
        alternatives: ["grok-3-mini", "gpt-5.4-mini"],
    },
    {
        role: "librarian",
        recommended: "grok-3-mini",
        reasoningEffort: "low",
        rationale: "Balanced speed/quality (3.36s). Reliable for web search and documentation research.",
        alternatives: ["grok-3-mini-fast", "gpt-5.4-mini"],
    },
    {
        role: "plan",
        recommended: "grok-4.20-0309-reasoning",
        reasoningEffort: "xhigh",
        rationale: "Deep reasoning model (6.3s). Strategic planning needs thorough analysis of ambiguities and dependencies.",
        alternatives: ["grok-4.3", "gpt-5.5", "claude-opus-4-6-thinking"],
    },
    {
        role: "metis",
        recommended: "grok-4.20-0309-non-reasoning",
        reasoningEffort: "high",
        rationale: "Fast analytical model (1.96s). Pre-planning analysis needs quick contradiction detection without deep chain-of-thought.",
        alternatives: ["grok-3-mini-fast", "gpt-5.5"],
    },
    {
        role: "momus",
        recommended: "grok-4.20-0309-reasoning",
        reasoningEffort: "xhigh",
        rationale: "Deep reasoning for plan review (6.3s). Needs to catch edge cases and validate plan executability.",
        alternatives: ["grok-4.3", "gpt-5.5"],
    },
    {
        role: "codex-ultrawork-reviewer",
        recommended: "grok-4.3",
        reasoningEffort: "high",
        rationale: "Frontier Grok model (8.48s). Final verification benefits from deepest model for catching subtle bugs.",
        alternatives: ["grok-4.20-0309-reasoning", "gpt-5.3-codex-spark", "claude-opus-4-6-thinking"],
    },
    {
        role: "reasoning",
        recommended: "grok-4.20-0309-reasoning",
        reasoningEffort: "high",
        rationale: "Purpose-built reasoning model (6.3s). Best for complex multi-step logic and analysis.",
        alternatives: ["grok-4.3", "gpt-5.5"],
    },
    {
        role: "coding",
        recommended: "grok-4.20-0309-non-reasoning",
        reasoningEffort: "medium",
        rationale: "Fast and accurate (0.68s). Coding tasks need quick, correct output over deep reasoning.",
        alternatives: ["grok-build-0.1", "gpt-5.3-codex-spark", "codex-auto-review"],
    },
];
/** Format a recommendation table for terminal output. */
export function formatRecommendationTable(availableModels) {
    const lines = [];
    lines.push("Agent Model Recommendations (Grok-first, benchmarked)");
    lines.push("─".repeat(85));
    lines.push(padCol("Agent", 28) + padCol("Recommended", 28) + padCol("Latency", 10) + padCol("t/s", 8) + "Rationale");
    lines.push("─".repeat(85));
    for (const rec of ROLE_RECOMMENDATIONS) {
        const perf = PERF_SNAPSHOT[rec.recommended];
        const latency = perf ? `${perf.latencyMs}ms` : "n/a";
        const tps = perf ? `${perf.tokensPerSec}` : "n/a";
        const available = availableModels.includes(rec.recommended) ? "" : " (not found)";
        const shortRationale = rec.rationale.split(".")[0] ?? "";
        lines.push(padCol(rec.role, 28) + padCol(rec.recommended + available, 28) + padCol(latency, 10) + padCol(tps, 8) + shortRationale);
    }
    lines.push("─".repeat(85));
    lines.push("");
    lines.push("Alternative models per agent (shown in interactive setup):");
    for (const rec of ROLE_RECOMMENDATIONS) {
        const alts = rec.alternatives.filter((a) => availableModels.includes(a));
        if (alts.length > 0) {
            lines.push(`  ${rec.role}: ${alts.join(", ")}`);
        }
    }
    return lines.join("\n");
}
/** Score how suitable a model is for a given agent role. */
export function scoreModelForRole(model, role, perfData = PERF_SNAPSHOT) {
    const rec = ROLE_RECOMMENDATIONS.find((r) => r.role === role);
    if (rec === undefined) {
        return 50;
    }
    if (model === rec.recommended) {
        return 100;
    }
    if (rec.alternatives.includes(model)) {
        return 80;
    }
    const perf = perfData[model];
    if (perf === undefined) {
        return 40;
    }
    // Heuristic: score by speed and quality
    const speedScore = Math.max(0, 100 - perf.latencyMs / 200);
    const qualityScore = (perf.codingQuality + perf.reasoningQuality) * 20;
    return Math.round((speedScore + qualityScore) / 2);
}
function padCol(text, width) {
    const t = text.length > width ? text.slice(0, width - 1) + "\u2026" : text;
    return t.padEnd(width);
}
