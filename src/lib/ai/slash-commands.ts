import type { LucideIcon } from "lucide-react";
import {
	ClipboardCheck,
	Command,
	Eye,
	HelpCircle,
	ListTodo,
	Mic,
	PlusCircle,
	Search,
	TerminalSquare,
	UserPlus,
} from "lucide-react";
import {
	buildSummarizePrompt,
	buildSummarizeSystemSuffix,
} from "./summarize-prompts";

// ── Types ────────────────────────────────────────────────────────────────

export type SlashCommandCategory =
	| "info"
	| "actions"
	| "workspace"
	| "personal"
	| "shortcuts";

export interface SlashCommandArg {
	name: string;
	description: string;
	required: boolean;
}

export interface SlashCommand {
	/** Command name without leading "/" (e.g. "help") */
	name: string;
	/** Display name with leading "/" (e.g. "/help") */
	displayName: string;
	/** Short description shown in autocomplete */
	description: string;
	/** Grouping category */
	category: SlashCommandCategory;
	/** Lucide icon component */
	icon: LucideIcon;
	/** Optional argument definitions */
	args?: SlashCommandArg[];
	/**
	 * Build the prompt string to send to the agent.
	 * @param args - text after the command (e.g. "open bugs" for "/search open bugs")
	 * @param context - optional workspace context
	 */
	buildPrompt: (args?: string, context?: WorkspaceContext) => string;
	/** Optional client-side action for commands that should not call the LLM. */
	clientAction?: "toggle_dictation";
	/**
	 * Optional: build a system prompt suffix for this command.
	 * Appended to the agent's system prompt for the specific message.
	 * Used by /summarize, and designed for STORY-021 and STORY-022 to extend.
	 */
	buildSystemSuffix?: (args?: string, context?: WorkspaceContext) => string;
}

export interface WorkspaceContext {
	workspaceId: string;
	workspaceName?: string;
	pageType?: string;
	entityId?: string;
	entityName?: string;
}

export interface StoredSlashCommand {
	id: string;
	command: string;
	title: string;
	description: string;
	/** Serialized Plate.js value JSON string. */
	content: string;
	isShortcut: boolean;
	createdAt: number;
	updatedAt: number;
	createdBy?: string;
}

export type SlashCommandScope = "workspace" | "personal";

// ── Category Labels ──────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<SlashCommandCategory, string> = {
	info: "Info",
	actions: "Actions",
	workspace: "Workspace",
	personal: "My commands",
	shortcuts: "Shortcuts",
};

// ── Command Registry ─────────────────────────────────────────────────────

export const BUILT_IN_SLASH_COMMANDS: SlashCommand[] = [
	{
		name: "help",
		displayName: "/help",
		description: "List all available commands and AI capabilities",
		category: "info",
		icon: HelpCircle,
		buildPrompt: () =>
			"List all available slash commands with their descriptions in a markdown table. Include the command name, description, and any required arguments. Format it clearly so users can quickly discover what the AI assistant can do.",
	},
	{
		name: "summarize",
		displayName: "/summarize",
		description: "Summarize the current page or context",
		category: "actions",
		icon: ClipboardCheck,
		args: [
			{
				name: "target",
				description: "What to summarize (defaults to current context)",
				required: false,
			},
		],
		buildPrompt: (args?: string, context?: WorkspaceContext) =>
			buildSummarizePrompt(context, args),
		buildSystemSuffix: (_args?: string, context?: WorkspaceContext) =>
			buildSummarizeSystemSuffix(context),
	},
	{
		name: "dictate",
		displayName: "/dictate",
		description: "Start or stop voice dictation",
		category: "actions",
		icon: Mic,
		clientAction: "toggle_dictation",
		buildPrompt: () => "",
	},
	{
		name: "search",
		displayName: "/search",
		description: "Search the workspace for issues, documents, and more",
		category: "actions",
		icon: Search,
		args: [
			{
				name: "query",
				description:
					"Search query. Use --issues, --docs, or --projects to filter by type.",
				required: true,
			},
		],
		buildPrompt: (args?: string) => {
			if (!args?.trim()) {
				return "What would you like to search for? Please provide a search query.";
			}

			const flags = {
				issues: args.includes("--issues"),
				docs: args.includes("--docs"),
				projects: args.includes("--projects"),
			};
			const query = args.replace(/--issues|--docs|--projects/g, "").trim();

			if (!query) {
				return "What would you like to search for? Please provide a search query after the flag.";
			}

			const typeFilter = flags.issues
				? "Focus on issue results only."
				: flags.docs
					? "Focus on document results only."
					: flags.projects
						? "Focus on project results only."
						: "Search all content types.";

			return `Search the workspace for "${query}". Use the globalSearch tool with query "${query}". ${typeFilter} Present results as a numbered list with entity type, title, and status. If no results, say so clearly and suggest refinements.`;
		},
		buildSystemSuffix: () =>
			[
				"--- SEARCH ---",
				"You are performing a workspace search. After calling globalSearch:",
				"- Provide a brief 1-sentence summary of what was found.",
				"- Do NOT list every result in text — the UI renders results as rich cards automatically.",
				"- If no results, suggest alternative search terms or broader queries.",
				"- If the user used a type filter (--issues, --docs, --projects), mention that the results are filtered.",
				"--- END SEARCH ---",
			].join("\n"),
	},
	{
		name: "create-issue",
		displayName: "/create-issue",
		description: "Create a new issue with guided prompts",
		category: "actions",
		icon: PlusCircle,
		args: [
			{
				name: "title",
				description: "Issue title (optional — will prompt if missing)",
				required: false,
			},
		],
		buildPrompt: (args?: string) => {
			const inlineTitle = args?.trim();
			const titleClause = inlineTitle
				? `The user wants to create an issue titled "${inlineTitle}". Skip the title step and start from project selection.`
				: "Ask the user for the issue title first.";

			return `${titleClause} Guide them through creating a new issue step by step:

1. **Title** (pre-filled if provided above)
2. **Project** — use the listProjects tool to show available options, then validate their choice against the results. If their input doesn't match, suggest the closest match.
3. **Priority** — offer: low, medium, high, urgent. Default to medium if they skip.
4. **Assignee** (optional) — if they provide a name, use listWorkspaceMembers to validate. If no exact match, suggest the closest name.
5. **Description** (optional) — keep it concise.
6. **Labels** (optional) — use listLabels to show available labels if they ask.

Be conversational but efficient — one question per turn. If the user provides multiple fields at once, accept them all. If they want to skip a field, allow it.

After collecting all fields, show a formatted preview using this markdown layout:

---
**Issue Preview**
- **Title:** [title]
- **Project:** [project name]
- **Priority:** [emoji] [priority]
- **Assignee:** [name or "Unassigned"]
- **Description:** [description or "None"]
- **Labels:** [labels or "None"]
---
Type "create" to create this issue, or tell me what to change.

When the user confirms with "create", "yes", "confirm", or similar, call the createIssue tool with the collected fields. An approval card will appear for final confirmation.`;
		},
		buildSystemSuffix: () =>
			[
				"--- CREATE_ISSUE ---",
				"You are guiding the user through issue creation. Follow these rules:",
				"- Ask ONE question per turn. Do not dump all questions at once.",
				"- Use listProjects to validate project names. If the user types a name that doesn't match, show the closest options.",
				"- Use listWorkspaceMembers to validate assignee names. Match partial names (e.g., 'sarah' → 'Sarah Johnson').",
				"- Use listLabels if the user asks about available labels.",
				"- For priority, use emoji indicators: 🔴 urgent, 🟠 high, 🟡 medium, 🟢 low.",
				"- When calling createIssue, pass projectId and assigneeId (not names). You get these IDs from the listProjects and listWorkspaceMembers tool results.",
				"- After the issue is created (approval accepted), confirm with the issue identifier and a brief success message.",
				"- If the user rejects the approval, ask what they'd like to change or if they want to cancel.",
				"--- END CREATE_ISSUE ---",
			].join("\n"),
	},
	{
		name: "status",
		displayName: "/status",
		description: "Show project or sprint status overview",
		category: "info",
		icon: ListTodo,
		args: [
			{
				name: "target",
				description: "Project or sprint to check (defaults to current)",
				required: false,
			},
		],
		buildPrompt: (args?: string, context?: WorkspaceContext) => {
			const projectName = args?.trim() || context?.entityName;
			const projectId =
				context?.pageType === "project" ? context?.entityId : undefined;

			if (projectId) {
				return [
					`Show the status overview for the project "${projectName ?? "this project"}".`,
					"",
					"Follow these steps:",
					`1. Use the getProjectDetails tool with projectId "${projectId}" to fetch the project info.`,
					`2. Use the searchIssues tool with projectId "${projectId}" to get all open issues (no status filter — we need counts by priority).`,
					`3. Use the searchIssues tool with projectId "${projectId}" and status "done" to get the count of closed issues.`,
					"4. Use the listSprints tool to check for any active sprints related to this project.",
					"",
					"Format your response as a structured status card using this exact layout:",
					"",
					"## 📊 [Project Name] — Status",
					"",
					"**Issues:** [open count] open / [closed count] closed",
					"- 🔴 Urgent: [count]",
					"- 🟠 High: [count]",
					"- 🟡 Medium: [count]",
					"- 🟢 Low: [count]",
					"",
					"**Milestone:** [sprint name] — [progress]% complete",
					"[progress bar using █ and ░ characters, ~20 chars wide]",
					"",
					"**Recent:** [X] issues closed this week",
					"",
					"If no milestone/sprint exists, omit that section. If no issues exist, say so clearly.",
				].join("\n");
			}

			if (projectName) {
				return [
					`Show the status overview for the project "${projectName}".`,
					"",
					"Follow these steps:",
					"1. Use the listProjects tool to find the project matching that name. If no exact match, suggest the closest names.",
					"2. Once you have the project ID, use getProjectDetails to get full details.",
					"3. Use searchIssues with the projectId to get open issues (counts by priority).",
					'4. Use searchIssues with the projectId and status "done" for closed issue count.',
					"5. Use listSprints to check for active sprints.",
					"",
					"Format your response as a structured status card:",
					"",
					"## 📊 [Project Name] — Status",
					"",
					"**Issues:** [open count] open / [closed count] closed",
					"- 🔴 Urgent: [count]",
					"- 🟠 High: [count]",
					"- 🟡 Medium: [count]",
					"- 🟢 Low: [count]",
					"",
					"**Milestone:** [sprint name] — [progress]% complete",
					"[progress bar using █ and ░ characters]",
					"",
					"**Recent:** [X] issues closed this week",
					"",
					"If no milestone/sprint exists, omit that section.",
				].join("\n");
			}

			// No project context — ask the user
			return [
				"The user wants to see a project status overview, but no specific project was mentioned and we're not on a project page.",
				"",
				"Use the listProjects tool to get all projects, then ask the user which project they'd like the status for.",
				"Present the available projects as a numbered list with their current status.",
				"Once they choose, follow up with the full status card (use getProjectDetails, searchIssues, and listSprints).",
			].join("\n");
		},
		buildSystemSuffix: (_args?: string, context?: WorkspaceContext) => {
			const pageType = context?.pageType ?? "unknown";
			return [
				"",
				"--- [STATUS COMMAND] ---",
				"The user has invoked the /status command. Follow these rules:",
				"1. Use read tools (getProjectDetails, searchIssues, listSprints) to fetch CURRENT data — do not guess.",
				"2. Count issues by priority from the searchIssues results. Group: urgent, high, medium, low.",
				"3. For progress bars, use █ for completed and ░ for remaining. Scale to ~20 characters.",
				"4. If a sprint exists with progress data, show it as the Milestone section.",
				"5. If no sprint or milestone exists for the project, omit the Milestone section entirely.",
				"6. Be concise — this is a snapshot, not a full report.",
				"7. If tools return errors, say what went wrong clearly.",
				`8. Current page context: ${pageType}${context?.entityName ? ` — "${context.entityName}"` : ""}.`,
				"--- [/STATUS COMMAND] ---",
			].join("\n");
		},
	},
	{
		name: "assign",
		displayName: "/assign",
		description: "Assign an issue to a team member",
		category: "actions",
		icon: UserPlus,
		args: [
			{
				name: "issue-ref person",
				description: 'Issue reference and assignee name (e.g., "CLV-42 sarah")',
				required: false,
			},
		],
		buildPrompt: (args?: string) => {
			const trimmed = args?.trim();

			if (!trimmed) {
				// No args — conversational two-step flow
				return [
					"The user wants to assign an issue to someone but didn't specify which issue or who.",
					"",
					"Step 1: Ask which issue they want to assign. Suggest they use the issue identifier (e.g., CLV-42).",
					"Step 2: Once they provide the issue, use getIssueDetails to look it up and confirm it exists. Show the issue title and current assignee.",
					"Step 3: Ask who they want to assign it to. Use listWorkspaceMembers to show available team members.",
					"Step 4: Once they choose, use updateIssue to set the assigneeId. Confirm the assignment.",
				].join("\n");
			}

			// Parse args: expect "[issue-ref] [person name]"
			// Issue refs are typically uppercase alphanumeric with a dash (e.g., CLV-42, AUTH-7)
			const issueRefMatch = trimmed.match(/^([A-Za-z]+-\d+)\s*(.*?)$/);

			if (issueRefMatch) {
				const issueRef = issueRefMatch[1].toUpperCase();
				const personName = issueRefMatch[2].trim();

				if (personName) {
					// Both issue ref and person name provided
					return [
						`Assign issue ${issueRef} to "${personName}".`,
						"",
						"Follow these steps:",
						`1. Use getIssueDetails with identifier "${issueRef}" to verify the issue exists. If not found, tell the user.`,
						`2. Use listWorkspaceMembers to find a member matching "${personName}" (fuzzy/partial match on name — case-insensitive).`,
						"3. If multiple members match, list them and ask the user to clarify.",
						"4. If exactly one match: confirm the assignment — show the issue title and the full member name.",
						"5. Use updateIssue with the issueId and assigneeId (from the member's userId) to make the assignment. Do NOT wait for approval — this is a direct user action.",
						`6. After success, confirm: "✅ Assigned ${issueRef} ([issue title]) to [Full Name]"`,
					].join("\n");
				}

				// Only issue ref, no person
				return [
					`Assign issue ${issueRef} to someone.`,
					"",
					`1. Use getIssueDetails with identifier "${issueRef}" to verify the issue exists and show its title.`,
					"2. Use listWorkspaceMembers to show available team members.",
					"3. Ask the user who they want to assign it to.",
					"4. Once they choose, use updateIssue to set the assigneeId.",
					`5. Confirm: "✅ Assigned ${issueRef} ([issue title]) to [Full Name]"`,
				].join("\n");
			}

			// Args don't match expected format — treat as free-text intent
			return [
				`The user wants to assign an issue. They said: "${trimmed}"`,
				"",
				"Try to interpret their intent. If they mentioned an issue identifier or title, use getIssueDetails or searchIssues to find it.",
				"If they mentioned a person, use listWorkspaceMembers to find the matching member.",
				"Confirm both the issue and the assignee before making the assignment with updateIssue.",
			].join("\n");
		},
		buildSystemSuffix: () =>
			[
				"",
				"--- [ASSIGN COMMAND] ---",
				"The user has invoked the /assign command. Follow these rules:",
				"1. Always verify the issue exists via getIssueDetails before attempting assignment.",
				"2. Always verify the assignee via listWorkspaceMembers. Match partial names case-insensitively.",
				"3. If the issue identifier doesn't match any issue, say so and suggest using searchIssues to find it.",
				"4. If the person name matches multiple members, list all matches and ask the user to pick one.",
				"5. Use updateIssue with the assigneeId field to make the assignment. Do NOT use createIssue.",
				"6. Assignment does NOT require approval — it executes immediately via updateIssue.",
				"7. After successful assignment, confirm with the issue identifier, title, and full assignee name.",
				"8. If any step fails, explain what went wrong and suggest next steps.",
				"--- [/ASSIGN COMMAND] ---",
			].join("\n"),
	},
	{
		name: "review",
		displayName: "/review",
		description: "Daily standup helper — recent activity and pending work",
		category: "actions",
		icon: Eye,
		args: [
			{
				name: "timeframe",
				description:
					"Lookback window (e.g., --last 3d, --since monday). Default: 7 days.",
				required: false,
			},
		],
		buildPrompt: (args?: string, context?: WorkspaceContext) => {
			// Parse optional timeframe flags
			const trimmed = args?.trim() ?? "";
			let lookbackDescription = "the last 7 days";

			const lastMatch = trimmed.match(/--last\s+(\d+)d/i);
			const sinceMatch = trimmed.match(/--since\s+(\w+)/i);

			if (lastMatch) {
				const days = Number.parseInt(lastMatch[1], 10);
				lookbackDescription = `the last ${days} day${days === 1 ? "" : "s"}`;
			} else if (sinceMatch) {
				lookbackDescription = `since ${sinceMatch[1]}`;
			}

			const projectFilter =
				context?.pageType === "project" && context?.entityId
					? `Focus on the current project "${context.entityName ?? "this project"}" (projectId: "${context.entityId}"). `
					: "Cover all projects in the workspace. ";

			return [
				`Generate a standup-style activity review for ${lookbackDescription}. ${projectFilter}`,
				"",
				"Gather data using these tools:",
				'1. Use searchIssues with status "done" to find recently completed issues.',
				'2. Use searchIssues with status "in_progress" to find work currently in progress.',
				'3. Use searchIssues with status "in_review" to find items awaiting review.',
				'4. Use searchIssues with priority "urgent" to find any urgent open issues.',
				"5. Use listSprints to check for active sprints and their progress.",
				context?.pageType === "project" && context?.entityId
					? `6. Use getProjectDetails with projectId "${context.entityId}" to get project context.`
					: "6. Use listProjects to get workspace project overview.",
				"",
				"Format your response using EXACTLY this structure:",
				"",
				"## ✅ Recently Completed",
				"- ✅ [status]: [issue title] ([identifier]) · [assignee name if available]",
				"- ✅ [status]: [issue title] ([identifier]) · [assignee name]",
				"(List up to 10 most recent completed items. If none, say 'No issues completed in this period.')",
				"",
				"## 🔄 Still Open (In Progress / In Review)",
				"- 🔄 In Progress: [issue title] ([identifier]) · [assignee name]",
				"- 🔍 In Review: [issue title] ([identifier]) · [assignee name]",
				"(List up to 10 in-progress and in-review items. If none, say 'No active work items.')",
				"",
				"## ⚠️ Needs Attention",
				"- 🔴 Urgent: [issue title] ([identifier]) — [reason it needs attention]",
				"- ⏰ Overdue sprint: [sprint name] — [X] days past target date",
				"- 📋 Unassigned urgent: [issue title] ([identifier])",
				"(Flag: urgent open issues, overdue sprints, unassigned high/urgent issues. If nothing, say 'All clear — no items need immediate attention.')",
				"",
				"Use real data from the tools. Do NOT fabricate issues, names, or identifiers.",
			].join("\n");
		},
		buildSystemSuffix: (_args?: string, context?: WorkspaceContext) => {
			const pageType = context?.pageType ?? "unknown";
			return [
				"",
				"--- [REVIEW COMMAND] ---",
				"The user has invoked the /review command (standup helper). Follow these rules:",
				"1. Use searchIssues with various status filters to gather recent activity. Make MULTIPLE tool calls — one per status filter.",
				"2. Present data in EXACTLY the three sections: Recently Completed, Still Open, Needs Attention.",
				"3. The Needs Attention section is the MOST VALUABLE part — prioritize finding: urgent issues, overdue sprints, unassigned high-priority items.",
				"4. Use real issue identifiers (e.g., CLV-42), titles, and assignee names from tool results.",
				"5. If tools return no results for a section, include the section with a clear 'none' message. Do NOT skip sections.",
				"6. Keep format consistent — this command should produce the same structure every time.",
				"7. If you cannot determine assignee names from IDs, use listWorkspaceMembers to resolve them.",
				"8. For sprint progress, calculate days remaining or overdue from target dates.",
				`9. Current page context: ${pageType}${context?.entityName ? ` — "${context.entityName}"` : ""}.`,
				"--- [/REVIEW COMMAND] ---",
			].join("\n");
		},
	},
];

/**
 * @deprecated Backward-compatible alias for legacy references.
 * Prefer BUILT_IN_SLASH_COMMANDS in all new code.
 */
export const SLASH_COMMANDS: SlashCommand[] = BUILT_IN_SLASH_COMMANDS;

// ── Helpers ──────────────────────────────────────────────────────────────

function toCommandSafeText(content: string): string {
	if (!content.trim()) return "";
	try {
		const parsed = JSON.parse(content);
		if (!Array.isArray(parsed)) return content.trim();

		const flatten = (node: unknown): string => {
			if (!node || typeof node !== "object") return "";
			if ("text" in (node as Record<string, unknown>)) {
				const value = (node as { text?: unknown }).text;
				return typeof value === "string" ? value : "";
			}
			if ("children" in (node as Record<string, unknown>)) {
				const children = (node as { children?: unknown }).children;
				if (Array.isArray(children)) {
					return children.map(flatten).join("");
				}
			}
			return "";
		};

		return parsed
			.map(flatten)
			.join("\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	} catch {
		return content.trim();
	}
}

function buildCustomPrompt(
	command: StoredSlashCommand,
	scope: SlashCommandScope,
	args?: string,
): string {
	const instructions = toCommandSafeText(command.content);
	const userArgs = args?.trim();
	const scopeLabel = scope === "workspace" ? "workspace" : "personal";

	return [
		`Run the custom ${scopeLabel} slash command "/${command.command}".`,
		command.description
			? `Command intent: ${command.description}`
			: "Command intent: Follow the provided instructions exactly.",
		`Command instructions:\n${instructions || "(No instructions provided)"}`,
		userArgs
			? `Additional user input: ${userArgs}`
			: "Additional user input: none",
		"Use workspace tools when required. If the command is ambiguous, ask one focused clarification question before executing.",
	].join("\n\n");
}

function toCommandCategory(
	command: StoredSlashCommand,
	scope: SlashCommandScope,
): SlashCommandCategory {
	if (command.isShortcut) return "shortcuts";
	return scope === "workspace" ? "workspace" : "personal";
}

function mapCustomToRuntimeCommand(
	command: StoredSlashCommand,
	scope: SlashCommandScope,
): SlashCommand {
	const category = toCommandCategory(command, scope);

	return {
		name: command.command,
		displayName: `/${command.command}`,
		description: command.description || command.title || "Custom command",
		category,
		icon: category === "shortcuts" ? Command : TerminalSquare,
		args: [
			{
				name: "input",
				description: "Optional extra input for this command",
				required: false,
			},
		],
		buildPrompt: (args?: string) => buildCustomPrompt(command, scope, args),
	};
}

export function normalizeSlashCommandName(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/^\//, "")
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-_]/g, "");
}

export function isBuiltInCommandName(name: string): boolean {
	const normalized = normalizeSlashCommandName(name);
	return BUILT_IN_SLASH_COMMANDS.some((cmd) => cmd.name === normalized);
}

export function buildSlashCommandRegistry({
	workspaceCommands = [],
	personalCommands = [],
}: {
	workspaceCommands?: StoredSlashCommand[];
	personalCommands?: StoredSlashCommand[];
}): SlashCommand[] {
	const customWorkspace = workspaceCommands.map((command) =>
		mapCustomToRuntimeCommand(command, "workspace"),
	);
	const customPersonal = personalCommands.map((command) =>
		mapCustomToRuntimeCommand(command, "personal"),
	);
	const merged = [
		...BUILT_IN_SLASH_COMMANDS,
		...customWorkspace,
		...customPersonal,
	];

	// First command wins to keep built-ins canonical if names collide.
	const seen = new Set<string>();
	return merged.filter((command) => {
		const key = command.name.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function buildHelpPrompt(commands: SlashCommand[]): string {
	const rows = commands
		.map((cmd) => {
			const argSummary =
				cmd.args && cmd.args.length > 0
					? cmd.args
							.map((arg) => `${arg.required ? "*" : ""}${arg.name}`)
							.join(", ")
					: "-";
			return `| ${cmd.displayName} | ${cmd.description} | ${argSummary} |`;
		})
		.join("\n");

	return [
		"The user requested slash command help.",
		"",
		"Use this exact command registry:",
		"",
		"| Command | Description | Arguments |",
		"| --- | --- | --- |",
		rows,
		"",
		"Provide a short guide highlighting common commands and when to use them. Do not invent commands outside this list.",
	].join("\n");
}

/**
 * Filter commands by a query string (fuzzy match on name and description).
 * Empty query returns all commands.
 */
export function filterCommands(
	query: string,
	commands: SlashCommand[] = BUILT_IN_SLASH_COMMANDS,
): SlashCommand[] {
	if (!query.trim()) return commands;
	const lower = query.toLowerCase();
	return commands.filter(
		(cmd) =>
			cmd.name.toLowerCase().includes(lower) ||
			cmd.description.toLowerCase().includes(lower),
	);
}

/**
 * Group commands by category, preserving order within each group.
 */
export function groupCommandsByCategory(
	commands: SlashCommand[],
): Map<SlashCommandCategory, SlashCommand[]> {
	const groups = new Map<SlashCommandCategory, SlashCommand[]>();
	for (const cmd of commands) {
		const existing = groups.get(cmd.category);
		if (existing) {
			existing.push(cmd);
		} else {
			groups.set(cmd.category, [cmd]);
		}
	}
	return groups;
}

/**
 * Find a command by name (exact match, case-insensitive).
 */
export function findCommand(
	name: string,
	commands: SlashCommand[] = BUILT_IN_SLASH_COMMANDS,
): SlashCommand | undefined {
	const lower = name.toLowerCase();
	return commands.find((cmd) => cmd.name.toLowerCase() === lower);
}

/**
 * Parse a slash command input string.
 * Returns the command and any trailing args text, or null if not a slash command.
 */
export function parseSlashInput(
	input: string,
	commands: SlashCommand[] = BUILT_IN_SLASH_COMMANDS,
): { command: SlashCommand; args: string } | null {
	if (!input.startsWith("/")) return null;

	const trimmed = input.slice(1);
	const spaceIndex = trimmed.indexOf(" ");

	if (spaceIndex === -1) {
		// No space — check if it's a complete command name
		const cmd = findCommand(trimmed, commands);
		return cmd ? { command: cmd, args: "" } : null;
	}

	const name = trimmed.slice(0, spaceIndex);
	const args = trimmed.slice(spaceIndex + 1);
	const cmd = findCommand(name, commands);
	return cmd ? { command: cmd, args } : null;
}
