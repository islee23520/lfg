export function buildDoctorChecks(cli, installSurfaceOk) {
    return [
        { name: "cli", ok: cli.ok, required: true },
        { name: "grok_install_surface", ok: installSurfaceOk, required: true },
    ];
}
export function doctorChecksJson(checks) {
    const failedRequired = checks.filter((c) => c.required && !c.ok).map((c) => c.name);
    return {
        checks: checks.map((c) => ({ name: c.name, ok: c.ok, required: c.required })),
        failedRequired,
    };
}
