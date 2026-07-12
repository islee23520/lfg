/**
 * Grok models are exposed by a single first-party provider (xai) and need no
 * provider-specific id rewrite. Both functions are identity, so the
 * model-resolution pipeline can compose `provider/model` ids without transforming
 * the model segment.
 */
export function transformModelForProvider(provider: string, model: string): string {
	return model
}

export function transformModelForProviderDisplay(
	provider: string,
	model: string,
): string {
	return model
}
