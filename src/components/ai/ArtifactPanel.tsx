"use client";

import { Code, FileText, GitBranch, Table, X } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { ArtifactRenderer } from "@/components/ai/ArtifactRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ArtifactData, ArtifactType } from "@/types/artifacts";

// ── Artifact Panel Context ──────────────────────────────────────────────

type ArtifactPanelContextType = {
	artifact: ArtifactData | null;
	isOpen: boolean;
	openArtifact: (artifact: ArtifactData) => void;
	closeArtifact: () => void;
};

const ArtifactPanelContext = createContext<ArtifactPanelContextType>({
	artifact: null,
	isOpen: false,
	openArtifact: () => {},
	closeArtifact: () => {},
});

export function ArtifactPanelProvider({ children }: { children: ReactNode }) {
	const [artifact, setArtifact] = useState<ArtifactData | null>(null);
	const openArtifact = useCallback((a: ArtifactData) => setArtifact(a), []);
	const closeArtifact = useCallback(() => setArtifact(null), []);

	const contextValue = useMemo(
		() => ({
			artifact,
			isOpen: artifact !== null,
			openArtifact,
			closeArtifact,
		}),
		[artifact, openArtifact, closeArtifact],
	);

	return (
		<ArtifactPanelContext.Provider value={contextValue}>
			{children}
		</ArtifactPanelContext.Provider>
	);
}

export function useArtifactPanel() {
	return useContext(ArtifactPanelContext);
}

// ── Type metadata ───────────────────────────────────────────────────────

const TYPE_ICONS: Record<ArtifactType, typeof Code> = {
	code: Code,
	markdown: FileText,
	diagram: GitBranch,
	table: Table,
};

const TYPE_LABELS: Record<ArtifactType, string> = {
	code: "Code",
	markdown: "Document",
	diagram: "Diagram",
	table: "Table",
};

// ── Shared header content ───────────────────────────────────────────────

function ArtifactPanelHeader({
	artifact,
	onClose,
}: {
	artifact: ArtifactData;
	onClose: () => void;
}) {
	const Icon = TYPE_ICONS[artifact.type];
	const label = TYPE_LABELS[artifact.type];

	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 px-3">
			<div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10">
				<Icon className="size-3.5 text-primary" />
			</div>
			<p className="min-w-0 flex-1 truncate text-sm font-medium">
				{artifact.title}
			</p>
			<Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
				{label}
			</Badge>
			{artifact.language && (
				<Badge
					variant="outline"
					className="shrink-0 px-1.5 py-0 text-[10px] capitalize"
				>
					{artifact.language}
				</Badge>
			)}
			<Button
				variant="ghost"
				size="icon"
				className="size-7 shrink-0"
				onClick={onClose}
				aria-label="Close artifact panel"
			>
				<X className="size-4" />
			</Button>
		</div>
	);
}

// ── ArtifactPanel Component ─────────────────────────────────────────────
// On desktop: side panel rendered by ChatLayoutInner.
// On mobile: full-screen Dialog overlay.

export function ArtifactPanel() {
	const { artifact, closeArtifact } = useArtifactPanel();
	const isMobile = useIsMobile();

	// Close on Escape key (desktop side panel only; Dialog handles it natively)
	useEffect(() => {
		if (!artifact || isMobile) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				closeArtifact();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [artifact, isMobile, closeArtifact]);

	// Mobile: full-screen Dialog overlay
	if (isMobile) {
		return (
			<Dialog
				open={artifact !== null}
				onOpenChange={(open) => {
					if (!open) closeArtifact();
				}}
			>
				<DialogContent
					className="flex h-[95dvh] max-h-[95dvh] w-full max-w-full flex-col gap-0 rounded-none p-0 sm:rounded-lg"
					showCloseButton={false}
				>
					<DialogTitle className="sr-only">
						{artifact?.title ?? "Artifact"}
					</DialogTitle>
					{artifact && (
						<>
							<ArtifactPanelHeader
								artifact={artifact}
								onClose={closeArtifact}
							/>
							<div className="flex-1 overflow-hidden">
								<ArtifactRenderer artifact={artifact} />
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
		);
	}

	// Desktop: side panel (rendered inside ChatLayoutInner's w-[420px] wrapper)
	if (!artifact) return null;

	return (
		<div className="flex h-full flex-col border-l border-border/40 bg-background">
			<ArtifactPanelHeader artifact={artifact} onClose={closeArtifact} />
			{/* Content area — routes to the correct artifact type renderer */}
			<div className="flex-1 overflow-hidden">
				<ArtifactRenderer artifact={artifact} />
			</div>
		</div>
	);
}
