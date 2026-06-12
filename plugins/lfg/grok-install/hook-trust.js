const GROK_HOOK_EVENTS = new Set([
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionDenied",
    "Stop",
    "StopFailure",
    "Notification",
    "SubagentStart",
    "SubagentStop",
    "SubagentEnd",
    "PreCompact",
    "PostCompact",
    "SessionEnd",
]);
/** True when hooks.json uses Grok lifecycle event keys (not legacy metadata catalog). */
export function isGrokEventHooksJson(raw) {
    if (typeof raw !== "object" || raw === null) {
        return false;
    }
    const record = raw;
    const hooks = record.hooks;
    if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
        return false;
    }
    const events = Object.keys(hooks);
    if (events.length === 0) {
        return false;
    }
    return events.some((name) => GROK_HOOK_EVENTS.has(name));
}
function isLegacyMetadataHooksJson(raw) {
    if (typeof raw !== "object" || raw === null) {
        return false;
    }
    const record = raw;
    if (!Array.isArray(record.hooks)) {
        return false;
    }
    const entries = record.hooks;
    if (entries.length === 0) {
        return false;
    }
    return entries.every((entry) => typeof entry === "object" && entry !== null && typeof entry.name === "string");
}
/** Validate Grok plugin hooks.json (event map) for install/doctor trust. */
export function validateGrokHooksJson(raw) {
    if (isLegacyMetadataHooksJson(raw)) {
        return {
            ok: false,
            hookNames: [],
            error: "hooks.json uses legacy metadata list; expected Grok event map (hooks.SessionStart, etc.)",
        };
    }
    if (!isGrokEventHooksJson(raw)) {
        return { ok: false, hookNames: [], error: "hooks.json must be an object with hooks.<Event> arrays" };
    }
    const record = raw;
    const hookNames = [];
    for (const [eventName, groups] of Object.entries(record.hooks)) {
        if (!GROK_HOOK_EVENTS.has(eventName)) {
            continue;
        }
        if (!Array.isArray(groups)) {
            return { ok: false, hookNames: [], error: `hooks.${eventName} must be an array` };
        }
        for (const group of groups) {
            if (typeof group !== "object" || group === null) {
                return { ok: false, hookNames: [], error: `hooks.${eventName} entry must be an object` };
            }
            const inner = group.hooks;
            if (inner !== undefined && !Array.isArray(inner)) {
                return { ok: false, hookNames: [], error: `hooks.${eventName} handler list must be an array` };
            }
            if (Array.isArray(inner)) {
                for (const handler of inner) {
                    if (typeof handler !== "object" || handler === null) {
                        return { ok: false, hookNames: [], error: "hook handler must be an object" };
                    }
                    const type = handler.type;
                    if (type === "command") {
                        const command = handler.command;
                        if (typeof command !== "string" || command.length === 0) {
                            return { ok: false, hookNames: [], error: "command hook requires non-empty command" };
                        }
                    }
                }
            }
        }
        hookNames.push(eventName);
    }
    hookNames.sort((a, b) => a.localeCompare(b));
    if (hookNames.length === 0) {
        return { ok: false, hookNames: [], error: "no recognized Grok hook events" };
    }
    return { ok: true, hookNames, error: null };
}
