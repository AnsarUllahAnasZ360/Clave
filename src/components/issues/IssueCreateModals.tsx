"use client";

import dynamic from "next/dynamic";
import { useIssueCreate } from "./IssueCreateContext";

const IssueFullCreateModal = dynamic(
	() =>
		import("./IssueFullCreateModal").then((mod) => mod.IssueFullCreateModal),
	{ ssr: false },
);

const IssueQuickCreateModal = dynamic(
	() =>
		import("./IssueQuickCreateModal").then((mod) => mod.IssueQuickCreateModal),
	{ ssr: false },
);

/**
 * Renders the quick and full-screen issue creation modals.
 * Must be placed inside an IssueCreateProvider.
 * Both modals share form state via the IssueCreateContext.
 */
export function IssueCreateModals() {
	const { activeModal, closeCreate } = useIssueCreate();

	return (
		<>
			<IssueQuickCreateModal
				open={activeModal === "quick"}
				onClose={closeCreate}
			/>
			<IssueFullCreateModal
				open={activeModal === "full"}
				onClose={closeCreate}
			/>
		</>
	);
}
