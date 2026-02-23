import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AIWhiteboardToolbar } from "@/components/ai/whiteboard/AIWhiteboardToolbar";
import type { ExcalidrawElementLike } from "@/components/ai/whiteboard/excalidraw-ai-utils";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

vi.mock("@/components/ai/whiteboard/AIGenerateDiagram", () => ({
	AIGenerateDiagram: () => (
		<div data-testid="generate-panel">
			<DialogHeader>
				<DialogTitle>Generate Diagram Panel</DialogTitle>
				<DialogDescription>Generate dialog mock content</DialogDescription>
			</DialogHeader>
		</div>
	),
}));

vi.mock("@/components/ai/whiteboard/AIExplainDiagram", () => ({
	AIExplainDiagram: () => (
		<div data-testid="explain-panel">
			<DialogHeader>
				<DialogTitle>Explain Diagram Panel</DialogTitle>
				<DialogDescription>Explain dialog mock content</DialogDescription>
			</DialogHeader>
		</div>
	),
}));

vi.mock("@/components/ai/whiteboard/AICleanUpLayout", () => ({
	AICleanUpLayout: () => (
		<div data-testid="cleanup-panel">
			<DialogHeader>
				<DialogTitle>Clean Up Layout Panel</DialogTitle>
				<DialogDescription>Cleanup dialog mock content</DialogDescription>
			</DialogHeader>
		</div>
	),
}));

const elementList: ExcalidrawElementLike[] = [];

describe("AIWhiteboardToolbar", () => {
	it("opens each panel from the dropdown menu", async () => {
		render(
			<AIWhiteboardToolbar
				workspaceId="ws_123"
				whiteboardId="wb_123"
				onInsertElements={vi.fn()}
				getExistingElements={() => []}
				getSceneElements={() => elementList}
				getSelectedElements={() => elementList}
				onRepositionElements={vi.fn()}
			/>,
		);

		const trigger = screen.getByLabelText("AI Whiteboard Tools");
		fireEvent.pointerDown(trigger, { button: 0 });
		fireEvent.click(screen.getByText("Generate Diagram"));
		expect(screen.getByTestId("generate-panel")).toBeInTheDocument();

		fireEvent.keyDown(document, { key: "Escape" });

		fireEvent.pointerDown(trigger, { button: 0 });
		fireEvent.click(screen.getByText("Explain Diagram"));
		expect(screen.getByTestId("explain-panel")).toBeInTheDocument();

		fireEvent.keyDown(document, { key: "Escape" });

		fireEvent.pointerDown(trigger, { button: 0 });
		fireEvent.click(screen.getByText("Clean Up Layout"));
		expect(screen.getByTestId("cleanup-panel")).toBeInTheDocument();
	}, 15_000);
});
