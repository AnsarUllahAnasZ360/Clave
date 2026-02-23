import { describe, expect, it } from "vitest";
import {
	ARTIFACT_PANEL_DEFAULT_RATIO,
	ARTIFACT_PANEL_MAX_RATIO,
	clampArtifactWidth,
	getArtifactBounds,
} from "../../src/app/[orgSlug]/[workspaceSlug]/chat/layout";

describe("chat artifact panel layout helpers", () => {
	it("opens at 40% width on sufficiently wide containers", () => {
		const containerWidth = 1200;
		const preferred = Math.round(containerWidth * ARTIFACT_PANEL_DEFAULT_RATIO);
		const clamped = clampArtifactWidth(preferred, containerWidth);

		expect(preferred).toBe(480);
		expect(clamped).toBe(preferred);
	});

	it("clamps within min/max bounds", () => {
		const containerWidth = 1000;
		const bounds = getArtifactBounds(containerWidth);

		expect(clampArtifactWidth(1, containerWidth)).toBe(bounds.min);
		expect(clampArtifactWidth(9999, containerWidth)).toBe(bounds.max);
		expect(bounds.min).toBeLessThanOrEqual(bounds.max);
	});

	it("keeps max width within the configured ratio budget", () => {
		const containerWidth = 1600;
		const bounds = getArtifactBounds(containerWidth);
		const ratio = bounds.max / containerWidth;

		expect(ratio).toBeLessThanOrEqual(ARTIFACT_PANEL_MAX_RATIO);
	});
});
