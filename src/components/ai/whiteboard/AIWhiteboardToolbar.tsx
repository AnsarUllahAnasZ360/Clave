"use client";

import {
	LayoutGridIcon,
	MessageSquareTextIcon,
	PencilLineIcon,
	SparklesIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { AICleanUpLayout } from "./AICleanUpLayout";
import { AIExplainDiagram } from "./AIExplainDiagram";
import { AIGenerateDiagram } from "./AIGenerateDiagram";
import type { ExcalidrawElementLike } from "./excalidraw-ai-utils";

type ActivePanel = "generate" | "explain" | "cleanup" | null;

interface AIWhiteboardToolbarProps {
	workspaceId: string;
	whiteboardId: string;
	/** Insert elements into the Excalidraw canvas. */
	onInsertElements: (elements: ExcalidrawElementLike[]) => void;
	/** Insert generated elements progressively in batches. */
	onInsertElementsProgressive?: (
		elements: ExcalidrawElementLike[],
		options: {
			signal: AbortSignal;
			onBatch?: (inserted: number, total: number) => void;
		},
	) => Promise<void>;
	/** Get current canvas elements for positioning. */
	getExistingElements: () => Array<{
		x: number;
		y: number;
		width: number;
		height: number;
		isDeleted?: boolean;
	}>;
	/** Get full scene elements (including type, text, bindings) for AI operations. */
	getSceneElements: () => ExcalidrawElementLike[];
	/** Get selected scene elements for selection-scoped AI actions. */
	getSelectedElements: () => ExcalidrawElementLike[];
	/** Reposition elements on the canvas by ID. */
	onRepositionElements: (
		updates: Array<{ id: string; x: number; y: number }>,
	) => void;
}

export function AIWhiteboardToolbar({
	workspaceId,
	whiteboardId,
	onInsertElements,
	onInsertElementsProgressive,
	getExistingElements,
	getSceneElements,
	getSelectedElements,
	onRepositionElements,
}: AIWhiteboardToolbarProps) {
	const [activePanel, setActivePanel] = useState<ActivePanel>(null);
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const handleClose = useCallback(() => {
		setActivePanel(null);
	}, []);

	return (
		<div className="flex items-center gap-1 rounded-md border border-border/70 bg-background/85 p-1 shadow-sm backdrop-blur-sm">
			{/* Main AI button + dropdown */}
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									className="text-sienna-500 hover:bg-sienna-500/10 hover:text-sienna-600 dark:text-sienna-400 dark:hover:bg-sienna-400/10 dark:hover:text-sienna-300"
									aria-label="AI Whiteboard Tools"
								>
									<SparklesIcon className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="bottom">AI Tools</TooltipContent>
					</Tooltip>
				</TooltipProvider>
				<DropdownMenuContent align="start" className="w-48">
					<DropdownMenuItem
						onSelect={(event) => {
							event.preventDefault();
							setDropdownOpen(false);
							setActivePanel("generate");
						}}
					>
						<PencilLineIcon className="h-4 w-4 mr-2 text-sienna-500 dark:text-sienna-400" />
						Generate Diagram
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={(event) => {
							event.preventDefault();
							setDropdownOpen(false);
							setActivePanel("explain");
						}}
					>
						<MessageSquareTextIcon className="h-4 w-4 mr-2 text-sienna-500 dark:text-sienna-400" />
						Explain Diagram
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={(event) => {
							event.preventDefault();
							setDropdownOpen(false);
							setActivePanel("cleanup");
						}}
					>
						<LayoutGridIcon className="h-4 w-4 mr-2 text-sienna-500 dark:text-sienna-400" />
						Clean Up Layout
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog
				open={!!activePanel}
				onOpenChange={(open) => {
					if (!open) setActivePanel(null);
				}}
			>
				<DialogContent
					className="max-w-[calc(100vw-2rem)] sm:max-w-lg p-0 overflow-hidden"
					showCloseButton={false}
				>
					{activePanel === "generate" && (
						<AIGenerateDiagram
							workspaceId={workspaceId}
							whiteboardId={whiteboardId}
							onInsertElements={onInsertElements}
							onInsertElementsProgressive={onInsertElementsProgressive}
							getExistingElements={getExistingElements}
							getSceneElements={getSceneElements}
							getSelectedElements={getSelectedElements}
							onClose={handleClose}
						/>
					)}
					{activePanel === "explain" && (
						<AIExplainDiagram
							workspaceId={workspaceId}
							whiteboardId={whiteboardId}
							getSceneElements={getSceneElements}
							getSelectedElements={getSelectedElements}
							onClose={handleClose}
						/>
					)}
					{activePanel === "cleanup" && (
						<AICleanUpLayout
							workspaceId={workspaceId}
							whiteboardId={whiteboardId}
							getSceneElements={getSceneElements}
							getSelectedElements={getSelectedElements}
							onRepositionElements={onRepositionElements}
							onClose={handleClose}
						/>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
