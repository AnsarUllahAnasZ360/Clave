import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	type IssueListData,
	IssueListRow,
} from "@/components/issues/IssueListRow";

function makeIssue(partial?: Partial<IssueListData>): IssueListData {
	return {
		_id: "issue_123" as IssueListData["_id"],
		_creationTime: Date.now(),
		identifier: "CLV-1",
		title: "Test issue",
		status: "todo",
		priority: "medium",
		sortOrder: 0,
		...partial,
	};
}

describe("IssueListRow assignees (list view)", () => {
	it("accumulates multiple assignees without requiring a re-render", () => {
		const onAssigneesChange = vi.fn();

		render(
			<IssueListRow
				issue={makeIssue({ assigneeIds: undefined, assigneeId: undefined })}
				columns={["assignee"]}
				memberOptions={[
					{ id: "user_a", name: "Ada" },
					{ id: "user_b", name: "Babbage" },
				]}
				labelOptions={[]}
				projectOptions={[]}
				milestoneOptions={[]}
				assignee={null}
				onStatusChange={vi.fn()}
				onPriorityChange={vi.fn()}
				onAssigneeChange={vi.fn()}
				onAssigneesChange={onAssigneesChange}
				onLabelToggle={vi.fn()}
				onMilestoneChange={vi.fn()}
				onEstimateChange={vi.fn()}
				onDueDateChange={vi.fn()}
				onProjectChange={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByLabelText("Edit assignees"));
		fireEvent.click(screen.getByText("Ada"));
		fireEvent.click(screen.getByText("Babbage"));

		expect(onAssigneesChange).toHaveBeenCalledTimes(2);
		expect(onAssigneesChange.mock.calls[0][1]).toEqual(["user_a"]);
		expect(onAssigneesChange.mock.calls[1][1]).toEqual(["user_a", "user_b"]);
	});

	it("sends undefined when the last assignee is removed", () => {
		const onAssigneesChange = vi.fn();

		render(
			<IssueListRow
				issue={makeIssue({ assigneeIds: ["user_a" as any] })}
				columns={["assignee"]}
				memberOptions={[{ id: "user_a", name: "Ada" }]}
				labelOptions={[]}
				projectOptions={[]}
				milestoneOptions={[]}
				assignee={null}
				onStatusChange={vi.fn()}
				onPriorityChange={vi.fn()}
				onAssigneeChange={vi.fn()}
				onAssigneesChange={onAssigneesChange}
				onLabelToggle={vi.fn()}
				onMilestoneChange={vi.fn()}
				onEstimateChange={vi.fn()}
				onDueDateChange={vi.fn()}
				onProjectChange={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByLabelText("Edit assignees"));
		fireEvent.click(screen.getByText("Ada"));

		expect(onAssigneesChange).toHaveBeenCalledTimes(1);
		expect(onAssigneesChange.mock.calls[0][1]).toBeUndefined();
	});

	it("supports clearing via the Unassigned option", () => {
		const onAssigneesChange = vi.fn();

		render(
			<IssueListRow
				issue={makeIssue({ assigneeIds: ["user_a" as any, "user_b" as any] })}
				columns={["assignee"]}
				memberOptions={[
					{ id: "user_a", name: "Ada" },
					{ id: "user_b", name: "Babbage" },
				]}
				labelOptions={[]}
				projectOptions={[]}
				milestoneOptions={[]}
				assignee={null}
				onStatusChange={vi.fn()}
				onPriorityChange={vi.fn()}
				onAssigneeChange={vi.fn()}
				onAssigneesChange={onAssigneesChange}
				onLabelToggle={vi.fn()}
				onMilestoneChange={vi.fn()}
				onEstimateChange={vi.fn()}
				onDueDateChange={vi.fn()}
				onProjectChange={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByLabelText("Edit assignees"));
		fireEvent.click(screen.getByText("Unassigned"));

		expect(onAssigneesChange).toHaveBeenCalledTimes(1);
		expect(onAssigneesChange.mock.calls[0][1]).toBeUndefined();
	});
});
