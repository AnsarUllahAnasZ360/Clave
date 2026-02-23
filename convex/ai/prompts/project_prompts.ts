/**
 * System prompts for project AI operations.
 * Pure functions — no runtime dependencies.
 */

export function projectStatusSummaryPrompt(context: {
	projectName: string;
	projectDescription?: string;
	issueStats: {
		total: number;
		completed: number;
		inProgress: number;
		backlog: number;
	};
	recentActivity?: string;
}): string {
	const descBlock = context.projectDescription
		? `\nDescription: ${context.projectDescription}`
		: "";
	const activityBlock = context.recentActivity
		? `\nRecent activity:\n${context.recentActivity}`
		: "";

	return `You are a project management AI assistant. Generate a concise status summary for this project.

Project: ${context.projectName}${descBlock}

Issue statistics:
- Total: ${context.issueStats.total}
- Completed: ${context.issueStats.completed}
- In Progress: ${context.issueStats.inProgress}
- Backlog: ${context.issueStats.backlog}
- Completion: ${context.issueStats.total > 0 ? Math.round((context.issueStats.completed / context.issueStats.total) * 100) : 0}%${activityBlock}

Respond with a JSON object (no markdown code fences):
{
  "status": "on_track" | "at_risk" | "behind",
  "summary": "2-3 sentence overview",
  "highlights": ["key highlight 1", "key highlight 2"],
  "risks": ["risk 1"] or [],
  "recommendation": "1 sentence action item"
}`;
}

export function projectStatusReportPrompt(context: {
	projectName: string;
	projectDescription?: string;
	milestones: Array<{
		name: string;
		progress: number;
		dueDate?: string;
		status?: string;
		issueCount?: number;
		completedCount?: number;
	}>;
	issueStats: {
		total: number;
		completed: number;
		inProgress: number;
		backlog: number;
	};
}): string {
	const descBlock = context.projectDescription
		? `\nDescription: ${context.projectDescription}`
		: "";
	const milestoneList = context.milestones
		.map(
			(m) =>
				`- ${m.name} (${m.status ?? "unknown"}): ${m.progress}% complete (${m.completedCount ?? 0}/${m.issueCount ?? 0} issues)${m.dueDate ? ` — due: ${m.dueDate}` : ""}`,
		)
		.join("\n");

	const completionPct =
		context.issueStats.total > 0
			? Math.round(
					(context.issueStats.completed / context.issueStats.total) * 100,
				)
			: 0;

	return `You are a project management assistant. Generate a comprehensive, stakeholder-friendly status report for this project. Avoid technical jargon — focus on progress, impact, and next steps.

Project: ${context.projectName}${descBlock}

Milestones/Sprints:
${milestoneList || "No milestones defined."}

Issue statistics:
- Total issues: ${context.issueStats.total}
- Completed: ${context.issueStats.completed} (${completionPct}%)
- In Progress: ${context.issueStats.inProgress}
- Backlog: ${context.issueStats.backlog}

Write a professional status report in markdown with these sections:
## Executive Summary
A 2-3 sentence overview of the project's current state.

## Progress Overview
Key metrics, completion rates, and trends.

## Milestone Status
Status of each milestone/sprint with progress details. If no milestones exist, note this.

## Key Risks & Blockers
Potential risks based on the data. If backlog is large relative to completed, flag capacity concerns.

## Team Performance
Observations about throughput and workload balance.

## Next Steps
Concrete, actionable recommendations for the next period.

Use specific numbers from the data provided. Keep the tone professional but accessible.`;
}

export function projectPlanSprintPrompt(context: {
	projectName: string;
	backlogIssues: Array<{
		identifier: string;
		title: string;
		priority: string;
		type: string;
	}>;
	completedLastSprint?: number;
	avgVelocity?: number;
	completedSprints?: number;
}): string {
	const velocityBlock =
		context.avgVelocity !== undefined && context.completedSprints
			? `\nTeam velocity: ${context.avgVelocity} issues per sprint (based on ${context.completedSprints} completed sprints)`
			: "";
	const lastSprintBlock =
		context.completedLastSprint !== undefined
			? `\nLast sprint: ${context.completedLastSprint} issues completed`
			: "";
	const noHistoryNote =
		!context.completedSprints || context.completedSprints === 0
			? "\nNote: No completed sprints for velocity data — suggest a conservative initial scope."
			: "";
	const backlogList = context.backlogIssues
		.map((i) => `- ${i.identifier}: ${i.title} [${i.priority}] [${i.type}]`)
		.join("\n");

	return `You are a sprint planning assistant. Analyze the backlog and suggest which issues to include in the next sprint.

Project: ${context.projectName}${velocityBlock}${lastSprintBlock}${noHistoryNote}

Backlog issues (${context.backlogIssues.length} total):
${backlogList || "No backlog issues."}

Respond with a JSON object (no markdown code fences):
{
  "suggested": [
    { "identifier": "ISSUE-ID", "title": "issue title", "reason": "why include this" }
  ],
  "sprintGoal": "1-2 sentence sprint goal describing the theme",
  "estimatedCapacity": "X issues based on velocity or conservative estimate",
  "reasoning": "2-3 sentences explaining the sprint scope rationale"
}

Guidelines:
- Prioritize urgent and high-priority items first
- Aim for a balanced sprint with a mix of bugs and features
- If velocity data exists, suggest roughly that many issues
- If no velocity data exists, suggest 5-8 issues as a conservative starting point
- If all backlog items are low priority, flag this and suggest reviewing priorities
- If no backlog issues exist, note this and suggest creating tasks`;
}
