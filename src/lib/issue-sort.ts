import type { OrderByOption, OrderDirection } from "@/lib/display-options";
import { PRIORITY_ORDER } from "@/lib/issue-config";

/**
 * Minimum shape `sortIssues` needs. Both `IssueListData` and `IssueCardData`
 * satisfy this when `_creationTime` and `updatedAt` are threaded through —
 * for sorts that don't rely on those fields, missing values fall back to
 * `sortOrder` so the function never produces nonsense ordering.
 */
export type SortableIssue = {
	status: string;
	priority: string;
	sortOrder: number;
	dueDate?: number;
	_creationTime?: number;
	updatedAt?: number;
};

/**
 * Single source of truth for issue sort. Used by both the list view (sorts
 * a flat array before grouping) and the kanban board (sorts within each
 * column). Keeping one implementation guarantees that picking "Created"
 * from Display options behaves identically on both layouts.
 *
 * Direction semantics — kept consistent across all sort modes for the
 * arrow-up/arrow-down toggle:
 *   - `asc`  (ArrowUp)   = smallest → largest, oldest → newest, urgent → low
 *   - `desc` (ArrowDown) = inverse
 *
 * `manual` always sorts by `sortOrder` (drag-drop position). Direction does
 * apply but is rarely useful — most callers should disable the toggle when
 * `manual` is selected.
 */
export function sortIssues<T extends SortableIssue>(
	issues: T[],
	orderBy: OrderByOption,
	statusOrder: Record<string, number>,
	direction: OrderDirection = "asc",
): T[] {
	const sorted = [...issues];
	const dir = direction === "desc" ? -1 : 1;
	switch (orderBy) {
		case "status":
			sorted.sort(
				(a, b) =>
					dir * ((statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)),
			);
			break;
		case "priority":
			sorted.sort(
				(a, b) =>
					dir *
					((PRIORITY_ORDER[a.priority] ?? 99) -
						(PRIORITY_ORDER[b.priority] ?? 99)),
			);
			break;
		case "created":
			// Same convention as `dueDate`: asc = oldest first. Earlier code
			// inverted this for created/updated; it's normalized here so the
			// arrow toggle behaves consistently across all date-like sorts.
			sorted.sort((a, b) => {
				const at = a._creationTime ?? a.sortOrder;
				const bt = b._creationTime ?? b.sortOrder;
				return dir * (at - bt);
			});
			break;
		case "updated":
			sorted.sort((a, b) => {
				const at = a.updatedAt ?? a._creationTime ?? a.sortOrder;
				const bt = b.updatedAt ?? b._creationTime ?? b.sortOrder;
				return dir * (at - bt);
			});
			break;
		case "dueDate":
			sorted.sort((a, b) => {
				// Issues without a due date sink to the bottom regardless of
				// direction — they have no temporal position to compare.
				if (!a.dueDate && !b.dueDate) return 0;
				if (!a.dueDate) return 1;
				if (!b.dueDate) return -1;
				return dir * (a.dueDate - b.dueDate);
			});
			break;
		case "manual":
			sorted.sort((a, b) => dir * (a.sortOrder - b.sortOrder));
			break;
	}
	return sorted;
}
