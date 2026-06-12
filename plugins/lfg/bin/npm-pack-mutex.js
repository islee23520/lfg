/** Serialize `npm pack` invocations across vitest workers/files (#22 flake). */
let chain = Promise.resolve();
export async function withNpmPackLock(run) {
    const previous = chain;
    let release;
    chain = new Promise((resolve) => {
        release = resolve;
    });
    await previous;
    try {
        return await run();
    }
    finally {
        release();
    }
}
