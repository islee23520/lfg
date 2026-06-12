/** Parse `npm view <pkg> version` stdout for doctor publishGap (#22). */
export function parseNpmRegistryVersion(stdout) {
    const trimmed = stdout.trim();
    return /^\d+\.\d+\.\d+/.test(trimmed) ? trimmed : null;
}
