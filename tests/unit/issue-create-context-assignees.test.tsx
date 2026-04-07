import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	IssueCreateProvider,
	useIssueCreate,
} from "@/components/issues/IssueCreateContext";

describe("IssueCreateContext assignees", () => {
	it("maps preset assigneeId into formState.assigneeIds", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<IssueCreateProvider>{children}</IssueCreateProvider>
		);
		const { result } = renderHook(() => useIssueCreate(), { wrapper });

		act(() => {
			result.current.openQuickCreate({ assigneeId: "user_a" });
		});

		expect(result.current.formState.assigneeIds).toEqual(["user_a"]);
	});

	it("uses preset assigneeIds when provided", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<IssueCreateProvider>{children}</IssueCreateProvider>
		);
		const { result } = renderHook(() => useIssueCreate(), { wrapper });

		act(() => {
			result.current.openQuickCreate({ assigneeIds: ["user_a", "user_b"] });
		});

		expect(result.current.formState.assigneeIds).toEqual(["user_a", "user_b"]);
	});
});
