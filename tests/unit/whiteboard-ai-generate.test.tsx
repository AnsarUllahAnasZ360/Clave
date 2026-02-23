import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIGenerateDiagram } from "@/components/ai/whiteboard/AIGenerateDiagram";
import type { ExcalidrawElementLike } from "@/components/ai/whiteboard/excalidraw-ai-utils";
import { Dialog } from "@/components/ui/dialog";

const callEmbeddedAIMock = vi.fn();

vi.mock("@/hooks/use-embedded-ai", () => ({
	useEmbeddedAI: () => ({
		callEmbeddedAI: callEmbeddedAIMock,
		isLoading: false,
	}),
}));

const emptyScene: ExcalidrawElementLike[] = [];

describe("AIGenerateDiagram", () => {
	beforeEach(() => {
		callEmbeddedAIMock.mockReset();
	});

	it("submits prompt with wireframe context and inserts generated elements", async () => {
		callEmbeddedAIMock.mockResolvedValue({
			type: "whiteboard_generate_diagram",
			text: "Generated wireframe diagram",
			data: {
				elements: [
					{
						id: "wf-card-1",
						type: "rectangle",
						x: 0,
						y: 0,
						width: 300,
						height: 180,
						label: { text: "Todo list", fontSize: 20 },
					},
				],
			},
		});

		const onInsertElements = vi.fn();
		const onClose = vi.fn();

		render(
			<Dialog open>
				<AIGenerateDiagram
					workspaceId="ws_123"
					whiteboardId="wb_123"
					onInsertElements={onInsertElements}
					getExistingElements={() => []}
					getSceneElements={() => emptyScene}
					getSelectedElements={() => emptyScene}
					onClose={onClose}
				/>
			</Dialog>,
		);

		fireEvent.change(screen.getByLabelText("Prompt"), {
			target: { value: "Create a wireframe for a todo app" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Generate" }));

		await waitFor(() => {
			expect(callEmbeddedAIMock).toHaveBeenCalledTimes(1);
		});

		const call = callEmbeddedAIMock.mock.calls[0]?.[0];
		expect(call?.type).toBe("whiteboard_generate_diagram");
		expect(call?.context).toEqual({
			workspaceId: "ws_123",
			whiteboardId: "wb_123",
		});
		expect(call?.whiteboard?.generation?.mode).toBe("wireframe");

		await waitFor(() => {
			expect(onInsertElements).toHaveBeenCalledTimes(1);
		});

		const inserted = onInsertElements.mock.calls[0]?.[0];
		expect(Array.isArray(inserted)).toBe(true);
		expect(inserted.length).toBeGreaterThan(0);
	});
});
