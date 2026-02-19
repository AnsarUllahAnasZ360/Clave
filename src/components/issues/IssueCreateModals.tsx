"use client";

import { useIssueCreate } from "./IssueCreateContext";
import { IssueFullCreateModal } from "./IssueFullCreateModal";
import { IssueQuickCreateModal } from "./IssueQuickCreateModal";

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
