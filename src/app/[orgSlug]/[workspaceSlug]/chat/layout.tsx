"use client";

import type { ReactNode } from "react";
import {
	ArtifactPanel,
	ArtifactPanelProvider,
	useArtifactPanel,
} from "@/components/ai/ArtifactPanel";
import { useIsMobile } from "@/hooks/use-mobile";

function ChatLayoutInner({ children }: { children: ReactNode }) {
	const { isOpen } = useArtifactPanel();
	const isMobile = useIsMobile();

	return (
		<div className="flex h-full flex-1">
			<div className="min-w-0 flex-1">{children}</div>
			{/* Mobile: ArtifactPanel renders itself as a full-screen Dialog overlay */}
			{isMobile && <ArtifactPanel />}
			{/* Desktop: side panel — only rendered when an artifact is open */}
			{isOpen && !isMobile && (
				<div className="w-[420px] shrink-0">
					<ArtifactPanel />
				</div>
			)}
		</div>
	);
}

export default function ChatLayout({ children }: { children: ReactNode }) {
	return (
		<ArtifactPanelProvider>
			<ChatLayoutInner>{children}</ChatLayoutInner>
		</ArtifactPanelProvider>
	);
}
