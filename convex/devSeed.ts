import { internalMutation } from "./_generated/server";

// ── Date helpers ────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): number {
	return Date.now() - days * DAY;
}

function daysFromNow(days: number): number {
	return Date.now() + days * DAY;
}

// ── TipTap JSON content builders ────────────────────────────────────────────

function tiptapDoc(...blocks: Array<Record<string, unknown>>): string {
	return JSON.stringify({ type: "doc", content: blocks });
}

function heading(level: number, text: string): Record<string, unknown> {
	return {
		type: "heading",
		attrs: { level },
		content: [{ type: "text", text }],
	};
}

function paragraph(text: string): Record<string, unknown> {
	return {
		type: "paragraph",
		content: [{ type: "text", text }],
	};
}

function bulletList(...items: string[]): Record<string, unknown> {
	return {
		type: "bulletList",
		content: items.map((item) => ({
			type: "listItem",
			content: [paragraph(item)],
		})),
	};
}

// ── Seed ────────────────────────────────────────────────────────────────────

export const seed = internalMutation({
	args: {},
	handler: async (ctx) => {
		// ── Idempotency check ─────────────────────────────────────────────
		const existingWorkspace = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", "clave-hq"))
			.unique();

		if (existingWorkspace) {
			console.log(
				"[devSeed] Workspace 'clave-hq' already exists, skipping seed.",
			);
			return;
		}

		console.log("[devSeed] Starting seed data creation...");

		// ── Users ─────────────────────────────────────────────────────────
		console.log("[devSeed] Creating users...");

		async function getOrCreateUser(
			email: string,
			data: {
				name: string;
				role: string;
				theme: "dark";
				notifyEmail: boolean;
				notifyPush: boolean;
				notifyInApp: boolean;
			},
		) {
			const existing = await ctx.db
				.query("users")
				.withIndex("by_email", (q) => q.eq("email", email))
				.unique();
			if (existing) {
				await ctx.db.patch(existing._id, data);
				return existing._id;
			}
			return await ctx.db.insert("users", { email, ...data });
		}

		const kulId = await getOrCreateUser("kul@goclave.app", {
			name: "Kul",
			role: "Founder & CEO",
			theme: "dark",
			notifyEmail: true,
			notifyPush: true,
			notifyInApp: true,
		});

		const alexId = await getOrCreateUser("alex@goclave.app", {
			name: "Alex Chen",
			role: "Lead Engineer",
			theme: "dark",
			notifyEmail: true,
			notifyPush: true,
			notifyInApp: true,
		});

		const jordanId = await getOrCreateUser("jordan@goclave.app", {
			name: "Jordan Rivera",
			role: "Designer",
			theme: "dark",
			notifyEmail: true,
			notifyPush: true,
			notifyInApp: true,
		});

		console.log(
			"[devSeed] Created/reused 3 users: Kul, Alex Chen, Jordan Rivera",
		);

		// ── Workspace ─────────────────────────────────────────────────────
		console.log("[devSeed] Creating workspace...");

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Clave HQ",
			slug: "clave-hq",
			ownerId: kulId,
		});

		// ── Workspace Members ─────────────────────────────────────────────
		const now = Date.now();

		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: kulId,
			role: "admin",
			joinedAt: daysAgo(14),
		});

		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: alexId,
			role: "admin",
			joinedAt: daysAgo(13),
		});

		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: jordanId,
			role: "member",
			joinedAt: daysAgo(12),
		});

		// ── Workspace Settings ────────────────────────────────────────────
		await ctx.db.insert("workspaceSettings", {
			workspaceId,
			issuePrefix: "CLV",
			nextIssueNumber: 130,
			storyPrefix: "CLV",
			nextStoryNumber: 100,
			taskPrefix: "TSK",
			nextTaskNumber: 200,
		});

		console.log("[devSeed] Created workspace 'Clave HQ' with 3 members");

		// ── Labels ────────────────────────────────────────────────────────
		console.log("[devSeed] Creating labels...");

		const labelBugId = await ctx.db.insert("labels", {
			workspaceId,
			name: "bug",
			color: "red",
			sortOrder: 1.0,
			createdBy: kulId,
			createdAt: now,
		});

		const labelFeatureId = await ctx.db.insert("labels", {
			workspaceId,
			name: "feature",
			color: "blue",
			sortOrder: 2.0,
			createdBy: kulId,
			createdAt: now,
		});

		const labelImprovementId = await ctx.db.insert("labels", {
			workspaceId,
			name: "improvement",
			color: "green",
			sortOrder: 3.0,
			createdBy: kulId,
			createdAt: now,
		});

		const labelDocsId = await ctx.db.insert("labels", {
			workspaceId,
			name: "documentation",
			color: "purple",
			sortOrder: 4.0,
			createdBy: kulId,
			createdAt: now,
		});

		await ctx.db.insert("labels", {
			workspaceId,
			name: "urgent",
			color: "orange",
			sortOrder: 5.0,
			createdBy: kulId,
			createdAt: now,
		});

		console.log("[devSeed] Created 5 labels");

		// ── Projects ──────────────────────────────────────────────────────
		console.log("[devSeed] Creating projects...");

		const projectPlatformId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Clave Platform v1",
			slug: "clave-platform-v1",
			description:
				"Core platform build: issues, projects, milestones, and real-time collaboration.",
			status: "active",
			priority: "high",
			leadId: kulId,
			startDate: daysAgo(14),
			endDate: daysFromNow(60),
			intent: "delivery",
			structure: "sprints",
			sortOrder: 1.0,
			createdBy: kulId,
		});

		const projectMobileId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Mobile App",
			slug: "mobile-app",
			description:
				"React Native mobile companion app for on-the-go project management.",
			status: "planned",
			priority: "medium",
			leadId: alexId,
			startDate: daysFromNow(30),
			endDate: daysFromNow(120),
			intent: "delivery",
			structure: "kanban",
			sortOrder: 2.0,
			createdBy: alexId,
		});

		const projectMarketingId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Marketing Site",
			slug: "marketing-site",
			description: "Landing page and marketing content for goclave.app launch.",
			status: "completed",
			priority: "low",
			leadId: jordanId,
			startDate: daysAgo(30),
			endDate: daysAgo(3),
			intent: "delivery",
			structure: "linear",
			sortOrder: 3.0,
			createdBy: jordanId,
		});

		// Add project members
		await ctx.db.insert("projectMembers", {
			projectId: projectPlatformId,
			userId: kulId,
			role: "owner",
			addedAt: daysAgo(14),
		});
		await ctx.db.insert("projectMembers", {
			projectId: projectPlatformId,
			userId: alexId,
			role: "contributor",
			addedAt: daysAgo(13),
		});
		await ctx.db.insert("projectMembers", {
			projectId: projectPlatformId,
			userId: jordanId,
			role: "contributor",
			addedAt: daysAgo(12),
		});

		await ctx.db.insert("projectMembers", {
			projectId: projectMobileId,
			userId: alexId,
			role: "owner",
			addedAt: daysAgo(10),
		});
		await ctx.db.insert("projectMembers", {
			projectId: projectMobileId,
			userId: jordanId,
			role: "stakeholder",
			addedAt: daysAgo(10),
		});

		await ctx.db.insert("projectMembers", {
			projectId: projectMarketingId,
			userId: jordanId,
			role: "owner",
			addedAt: daysAgo(30),
		});
		await ctx.db.insert("projectMembers", {
			projectId: projectMarketingId,
			userId: kulId,
			role: "stakeholder",
			addedAt: daysAgo(30),
		});

		console.log("[devSeed] Created 3 projects with members");

		// ── Milestones (Clave Platform v1) ────────────────────────────────
		console.log("[devSeed] Creating milestones...");

		const milestoneAlphaId = await ctx.db.insert("milestones", {
			projectId: projectPlatformId,
			name: "Alpha Release",
			description:
				"Core infrastructure: authentication, workspace management, project CRUD, and base UI shell.",
			targetDate: daysFromNow(20),
			sortOrder: 1.0,
			status: "active",
			createdBy: kulId,
		});

		const milestoneBetaId = await ctx.db.insert("milestones", {
			projectId: projectPlatformId,
			name: "Beta Release",
			description:
				"Advanced features: Kanban board, issue views, command palette, and project overview.",
			targetDate: daysFromNow(45),
			sortOrder: 2.0,
			status: "active",
			createdBy: kulId,
		});

		const milestoneLaunchId = await ctx.db.insert("milestones", {
			projectId: projectPlatformId,
			name: "Public Launch",
			description:
				"Polish, activity feeds, performance optimization, and public release preparation.",
			targetDate: daysFromNow(75),
			sortOrder: 3.0,
			status: "active",
			createdBy: kulId,
		});

		console.log("[devSeed] Created 3 milestones");

		// ── Issues (CLV-100 through CLV-129) ──────────────────────────────
		console.log("[devSeed] Creating issues...");

		// --- Clave Platform v1: Top-level issues ---

		const issue100Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			identifier: "CLV-100",
			title: "Set up authentication with Convex Auth",
			description:
				"Implement Google OAuth sign-in flow using Convex Auth. Include sign-in page, callback handling, and session management.",
			status: "done",
			priority: "urgent",
			type: "feature",
			assigneeId: alexId,
			labelIds: [labelFeatureId],
			startDate: daysAgo(14),
			sortOrder: 1.0,
			estimate: 5,
			createdBy: kulId,
			completedAt: daysAgo(10),
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			identifier: "CLV-101",
			title: "Build workspace creation and management",
			description:
				"Allow users to create workspaces with name, slug, and logo. Include invite code system for team onboarding.",
			status: "done",
			priority: "high",
			type: "feature",
			assigneeId: alexId,
			labelIds: [labelFeatureId],
			startDate: daysAgo(12),
			sortOrder: 2.0,
			estimate: 8,
			createdBy: kulId,
			completedAt: daysAgo(7),
		});

		const issue102Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			identifier: "CLV-102",
			title: "Implement project CRUD and detail views",
			description:
				"Create project list, detail, and settings pages. Support status transitions, lead assignment, and timeline configuration.",
			status: "in_progress",
			priority: "high",
			type: "issue",
			assigneeId: kulId,
			labelIds: [labelFeatureId],
			startDate: daysAgo(5),
			dueDate: daysFromNow(2),
			sortOrder: 3.0,
			estimate: 13,
			createdBy: kulId,
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			identifier: "CLV-103",
			title: "Fix sidebar navigation not highlighting active route",
			description:
				"The sidebar nav items do not show active state when navigating between workspace sections. Need to match current pathname to nav item routes.",
			status: "in_review",
			priority: "medium",
			type: "bug",
			assigneeId: jordanId,
			labelIds: [labelBugId],
			startDate: daysAgo(3),
			sortOrder: 4.0,
			estimate: 2,
			createdBy: jordanId,
		});

		const issue104Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneBetaId,
			identifier: "CLV-104",
			title: "Build Kanban board with drag-and-drop",
			description:
				"Implement a Kanban board view for issues using @dnd-kit. Support drag between status columns and reordering within columns.",
			status: "todo",
			priority: "high",
			type: "feature",
			assigneeId: alexId,
			labelIds: [labelFeatureId],
			dueDate: daysFromNow(30),
			sortOrder: 5.0,
			estimate: 13,
			createdBy: kulId,
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneBetaId,
			identifier: "CLV-105",
			title: "Add real-time notification system",
			description:
				"Create notification bell in header, notification panel, and mark-as-read functionality. Use Convex real-time subscriptions.",
			status: "backlog",
			priority: "medium",
			type: "issue",
			labelIds: [labelImprovementId],
			sortOrder: 6.0,
			estimate: 8,
			createdBy: kulId,
		});

		const issue106Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			identifier: "CLV-106",
			title: "Implement issue detail full-screen view",
			description:
				"Build a full-screen route for viewing and editing individual issues. Include properties sidebar with status, priority, assignee, labels, and dates.",
			status: "in_progress",
			priority: "high",
			type: "feature",
			assigneeId: kulId,
			labelIds: [labelFeatureId],
			startDate: daysAgo(2),
			dueDate: daysFromNow(5),
			sortOrder: 7.0,
			estimate: 8,
			createdBy: kulId,
		});

		const issue107Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			identifier: "CLV-107",
			title: "Design settings page layout",
			description:
				"Create wireframes and implement the workspace settings page with sections for general, members, billing, integrations, and appearance.",
			status: "in_review",
			priority: "medium",
			type: "improvement",
			assigneeId: jordanId,
			startDate: daysAgo(4),
			sortOrder: 8.0,
			estimate: 5,
			createdBy: jordanId,
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneBetaId,
			identifier: "CLV-108",
			title: "Add command palette with global search",
			description:
				"Implement Cmd+K command palette with fuzzy search across issues, projects, and navigation actions.",
			status: "todo",
			priority: "high",
			type: "feature",
			assigneeId: alexId,
			dueDate: daysFromNow(25),
			sortOrder: 9.0,
			estimate: 8,
			createdBy: kulId,
		});

		const issue109Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			identifier: "CLV-109",
			title: "Fix memory leak in dashboard chart rendering",
			description:
				"The analytics dashboard chart component creates new chart instances on every re-render without cleaning up previous ones. This causes memory to grow unbounded.",
			status: "in_progress",
			priority: "urgent",
			type: "bug",
			assigneeId: alexId,
			labelIds: [labelBugId],
			startDate: daysAgo(1),
			sortOrder: 10.0,
			estimate: 3,
			createdBy: alexId,
		});

		const issue110Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneBetaId,
			identifier: "CLV-110",
			title: "Create project overview page",
			description:
				"Build the project overview page with description, properties bar, milestone progress, recent activity, and key resources section.",
			status: "todo",
			priority: "high",
			type: "feature",
			assigneeId: kulId,
			dueDate: daysFromNow(20),
			sortOrder: 11.0,
			estimate: 8,
			createdBy: kulId,
		});

		const issue111Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			identifier: "CLV-111",
			title: "Implement workspace invite system",
			description:
				"Build invite code generation, sharing UI, and join-by-code flow. Include role assignment during invite.",
			status: "done",
			priority: "medium",
			type: "feature",
			assigneeId: alexId,
			labelIds: [labelFeatureId],
			startDate: daysAgo(9),
			sortOrder: 12.0,
			estimate: 5,
			createdBy: kulId,
			completedAt: daysAgo(5),
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneLaunchId,
			identifier: "CLV-112",
			title: "Add activity feed to projects",
			description:
				"Show a chronological feed of all actions taken within a project: issue changes, comments, member additions, and milestone updates.",
			status: "backlog",
			priority: "low",
			type: "improvement",
			labelIds: [labelImprovementId],
			sortOrder: 13.0,
			estimate: 5,
			createdBy: kulId,
		});

		const issue113Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneBetaId,
			identifier: "CLV-113",
			title: "Build milestone progress tracking UI",
			description:
				"Create milestone detail view with progress bar, issue list grouped by status, and target date indicator.",
			status: "todo",
			priority: "medium",
			type: "feature",
			assigneeId: jordanId,
			dueDate: daysFromNow(35),
			sortOrder: 14.0,
			estimate: 5,
			createdBy: kulId,
		});

		// --- Clave Platform v1: Sub-issues of CLV-102 ---

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			parentId: issue102Id,
			identifier: "CLV-114",
			title: "Set up CI/CD pipeline for project builds",
			description:
				"Configure GitHub Actions workflow with lint, typecheck, test, and build steps.",
			status: "done",
			priority: "high",
			type: "issue",
			assigneeId: alexId,
			sortOrder: 15.0,
			estimate: 3,
			createdBy: alexId,
			completedAt: daysAgo(8),
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			parentId: issue102Id,
			identifier: "CLV-115",
			title: "Design onboarding flow wireframes",
			description:
				"Create wireframes and mockups for the new user onboarding experience. Three steps: workspace creation, invite team, and first project setup.",
			status: "in_progress",
			priority: "medium",
			type: "issue",
			assigneeId: jordanId,
			startDate: daysAgo(2),
			sortOrder: 16.0,
			estimate: 3,
			createdBy: kulId,
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneAlphaId,
			parentId: issue102Id,
			identifier: "CLV-119",
			title: "Write unit tests for project CRUD operations",
			description:
				"Add Vitest tests covering project creation, update, deletion, and status transitions. Include edge cases for permissions.",
			status: "in_review",
			priority: "medium",
			type: "issue",
			assigneeId: jordanId,
			startDate: daysAgo(3),
			sortOrder: 20.0,
			estimate: 3,
			createdBy: kulId,
		});

		// --- Clave Platform v1: Sub-issues of CLV-104 ---

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneBetaId,
			parentId: issue104Id,
			identifier: "CLV-116",
			title: "Implement drag-and-drop issue cards",
			description:
				"Build sortable issue cards using @dnd-kit/sortable with smooth animations and visual feedback.",
			status: "todo",
			priority: "high",
			type: "issue",
			assigneeId: alexId,
			sortOrder: 17.0,
			estimate: 5,
			createdBy: alexId,
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneBetaId,
			parentId: issue104Id,
			identifier: "CLV-117",
			title: "Create Kanban column components",
			description:
				"Build status column containers with issue count badges, drop zones, and collapse functionality.",
			status: "todo",
			priority: "medium",
			type: "issue",
			assigneeId: alexId,
			sortOrder: 18.0,
			estimate: 3,
			createdBy: alexId,
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectPlatformId,
			milestoneId: milestoneBetaId,
			parentId: issue104Id,
			identifier: "CLV-118",
			title: "Add board view filter and sort options",
			description:
				"Implement filter chips for assignee, priority, and label. Add sort options for board columns.",
			status: "todo",
			priority: "medium",
			type: "improvement",
			assigneeId: alexId,
			sortOrder: 19.0,
			estimate: 3,
			createdBy: kulId,
		});

		// --- Mobile App issues ---

		const issue120Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMobileId,
			identifier: "CLV-120",
			title: "Design mobile navigation patterns",
			description:
				"Research and design the navigation UX for the mobile app. Consider tab bar, drawer, and stack navigation patterns.",
			status: "backlog",
			priority: "low",
			type: "issue",
			assigneeId: jordanId,
			sortOrder: 21.0,
			estimate: 5,
			createdBy: alexId,
		});

		const issue121Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMobileId,
			identifier: "CLV-121",
			title: "Research React Native navigation libraries",
			description:
				"Compare React Navigation vs Expo Router for the mobile app. Document pros, cons, and recommended choice.",
			status: "triage",
			priority: "medium",
			type: "issue",
			assigneeId: alexId,
			sortOrder: 22.0,
			estimate: 2,
			createdBy: alexId,
		});

		const issue122Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMobileId,
			identifier: "CLV-122",
			title: "Set up React Native project scaffold",
			description:
				"Initialize the React Native project with Expo, configure TypeScript, and set up the development environment.",
			status: "triage",
			priority: "high",
			type: "feature",
			sortOrder: 23.0,
			estimate: 5,
			createdBy: alexId,
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMobileId,
			identifier: "CLV-123",
			title: "Create mobile authentication flow",
			description:
				"Implement sign-in and sign-up screens for the mobile app using the same Convex Auth backend.",
			status: "backlog",
			priority: "medium",
			type: "feature",
			sortOrder: 24.0,
			estimate: 8,
			createdBy: alexId,
		});

		const issue124Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMobileId,
			identifier: "CLV-124",
			title: "Design mobile dashboard layout",
			description:
				"Create a mobile-optimized dashboard showing recent issues, project progress, and quick actions.",
			status: "cancelled",
			priority: "low",
			type: "issue",
			assigneeId: jordanId,
			sortOrder: 25.0,
			estimate: 5,
			createdBy: jordanId,
		});

		// --- Marketing Site issues ---

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMarketingId,
			identifier: "CLV-125",
			title: "Improve landing page load performance",
			description:
				"Optimize images, lazy-load below-fold sections, and add proper meta tags for SEO. Target sub-2s LCP.",
			status: "done",
			priority: "medium",
			type: "improvement",
			assigneeId: jordanId,
			labelIds: [labelImprovementId],
			startDate: daysAgo(20),
			sortOrder: 26.0,
			estimate: 3,
			createdBy: jordanId,
			completedAt: daysAgo(4),
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMarketingId,
			identifier: "CLV-126",
			title: "Optimize hero section images",
			description:
				"Convert hero images to WebP, add srcset for responsive loading, and implement blur placeholder.",
			status: "done",
			priority: "medium",
			type: "issue",
			assigneeId: jordanId,
			startDate: daysAgo(15),
			sortOrder: 27.0,
			estimate: 2,
			createdBy: jordanId,
			completedAt: daysAgo(5),
		});

		const issue127Id = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMarketingId,
			identifier: "CLV-127",
			title: "Add SEO meta tags and Open Graph data",
			description:
				"Add comprehensive meta tags, Open Graph properties, and Twitter card data to all marketing pages.",
			status: "in_review",
			priority: "low",
			type: "improvement",
			assigneeId: jordanId,
			labelIds: [labelDocsId],
			startDate: daysAgo(3),
			sortOrder: 28.0,
			estimate: 2,
			createdBy: jordanId,
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMarketingId,
			identifier: "CLV-128",
			title: "Finalize launch landing page copy",
			description:
				"Write and review all copy for the launch landing page including hero text, feature descriptions, and CTA buttons.",
			status: "in_progress",
			priority: "medium",
			type: "issue",
			assigneeId: kulId,
			startDate: daysAgo(2),
			sortOrder: 29.0,
			estimate: 3,
			createdBy: kulId,
		});

		await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectMarketingId,
			identifier: "CLV-129",
			title: "Write product documentation for launch",
			description:
				"Create getting started guide, feature overview, and FAQ section for the documentation site.",
			status: "backlog",
			priority: "low",
			type: "issue",
			labelIds: [labelDocsId],
			sortOrder: 30.0,
			estimate: 8,
			createdBy: kulId,
		});

		console.log(
			"[devSeed] Created 30 issues (CLV-100 through CLV-129) with 6 sub-issues",
		);

		// ── Issue Relations ───────────────────────────────────────────────
		console.log("[devSeed] Creating issue relations...");

		// CLV-106 blocks CLV-110 (issue detail view must exist before project overview can link to issues)
		await ctx.db.insert("issueRelations", {
			issueId: issue106Id,
			relatedIssueId: issue110Id,
			type: "blocks",
			createdBy: kulId,
			createdAt: daysAgo(2),
		});

		// CLV-110 blocked_by CLV-106 (reciprocal relation)
		await ctx.db.insert("issueRelations", {
			issueId: issue110Id,
			relatedIssueId: issue106Id,
			type: "blocked_by",
			createdBy: kulId,
			createdAt: daysAgo(2),
		});

		// CLV-100 relates_to CLV-111 (auth system relates to invite system)
		await ctx.db.insert("issueRelations", {
			issueId: issue100Id,
			relatedIssueId: issue111Id,
			type: "relates_to",
			createdBy: kulId,
			createdAt: daysAgo(10),
		});

		// CLV-121 relates_to CLV-122 (RN nav research relates to project scaffold)
		await ctx.db.insert("issueRelations", {
			issueId: issue121Id,
			relatedIssueId: issue122Id,
			type: "relates_to",
			createdBy: alexId,
			createdAt: daysAgo(1),
		});

		// CLV-124 duplicate CLV-120 (mobile dashboard overlaps with mobile nav patterns)
		await ctx.db.insert("issueRelations", {
			issueId: issue124Id,
			relatedIssueId: issue120Id,
			type: "duplicate",
			createdBy: jordanId,
			createdAt: daysAgo(1),
		});

		console.log("[devSeed] Created 5 issue relations");

		// ── Clients ───────────────────────────────────────────────────────
		console.log("[devSeed] Creating clients...");

		const clientAcmeId = await ctx.db.insert("clients", {
			workspaceId,
			name: "Acme Corp",
			status: "active",
			industry: "Technology",
			website: "https://acme.example.com",
			location: "San Francisco, CA",
			ownerId: kulId,
			notes: "Enterprise client, interested in team plan.",
			createdBy: kulId,
		});

		await ctx.db.insert("clientContacts", {
			clientId: clientAcmeId,
			name: "Sarah Johnson",
			email: "sarah@acme.example.com",
			role: "VP Engineering",
			isPrimary: true,
			createdBy: kulId,
		});

		const clientDesignId = await ctx.db.insert("clients", {
			workspaceId,
			name: "Design Studio",
			status: "prospect",
			industry: "Creative",
			website: "https://designstudio.example.com",
			location: "New York, NY",
			ownerId: jordanId,
			notes: "Small agency, looking for project management tool.",
			createdBy: jordanId,
		});

		await ctx.db.insert("clientContacts", {
			clientId: clientDesignId,
			name: "Marcus Lee",
			email: "marcus@designstudio.example.com",
			role: "Creative Director",
			isPrimary: true,
			createdBy: jordanId,
		});

		console.log("[devSeed] Created 2 clients with contacts");

		// ── Notes ─────────────────────────────────────────────────────────
		console.log("[devSeed] Creating notes...");

		await ctx.db.insert("notes", {
			workspaceId,
			projectId: projectPlatformId,
			title: "Sprint Planning Notes",
			content: tiptapDoc(
				heading(2, "Sprint 1 planning"),
				paragraph(
					"Discussed scope for the first two-week sprint. Focus on auth, workspace setup, and base UI shell.",
				),
				heading(3, "Key decisions"),
				bulletList(
					"Use Convex Auth with Google OAuth for initial auth flow",
					"Workspace slug must be globally unique",
					"Sidebar navigation follows Linear-style patterns",
					"Dark mode first, light mode support in Sprint 2",
				),
				heading(3, "Risks"),
				bulletList(
					"Convex Auth integration complexity",
					"Real-time subscription performance with large datasets",
				),
			),
			noteType: "meeting",
			createdBy: kulId,
			updatedAt: daysAgo(12),
		});

		await ctx.db.insert("notes", {
			workspaceId,
			projectId: projectPlatformId,
			title: "Architecture Decision Record",
			content: tiptapDoc(
				heading(2, "ADR: Database and real-time infrastructure"),
				paragraph(
					"After evaluating multiple options, we chose Convex as our backend for its real-time subscriptions, TypeScript-native schema, and serverless deployment.",
				),
				heading(3, "Alternatives considered"),
				bulletList(
					"Supabase -- good real-time but weaker TypeScript DX",
					"PlanetScale + tRPC -- requires more infrastructure glue",
					"Firebase -- vendor lock-in concerns",
				),
				heading(3, "Decision"),
				paragraph(
					"Convex provides the best developer experience for our use case. Real-time subscriptions, type-safe queries, and built-in auth support.",
				),
			),
			noteType: "general",
			createdBy: alexId,
			updatedAt: daysAgo(10),
		});

		await ctx.db.insert("notes", {
			workspaceId,
			title: "Design System Guidelines",
			content: tiptapDoc(
				heading(2, "Clave design system"),
				paragraph(
					"This document captures the core visual language for the Clave platform.",
				),
				heading(3, "Colors"),
				bulletList(
					"Brand accent: Sienna (#C26A3A)",
					"Background: neutral-950 (dark), white (light)",
					"Surface: neutral-900 (dark), neutral-50 (light)",
				),
				heading(3, "Typography"),
				bulletList(
					"Geist Sans for all UI text",
					"Geist Mono for code and identifiers",
					"Font sizes follow 4px grid: 12, 14, 16, 20, 24, 32",
				),
				heading(3, "Spacing"),
				paragraph(
					"Use 4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96.",
				),
			),
			noteType: "general",
			createdBy: jordanId,
			updatedAt: daysAgo(8),
		});

		console.log("[devSeed] Created 3 notes");

		// ── Comments (on issues) ──────────────────────────────────────────
		console.log("[devSeed] Creating comments...");

		// Comments on CLV-102 (project CRUD)
		const comment1Id = await ctx.db.insert("comments", {
			issueId: issue102Id,
			body: "I think we should support both list and card views for the project page. The card view is more visual and better for quick scanning.",
			authorId: jordanId,
		});

		const comment2Id = await ctx.db.insert("comments", {
			issueId: issue102Id,
			parentId: comment1Id,
			body: "Agreed. Let's start with list view as the default and add card view as a toggle. We can use the same data source for both.",
			authorId: kulId,
		});

		// Comments on CLV-109 (memory leak)
		await ctx.db.insert("comments", {
			issueId: issue109Id,
			body: "Found the root cause -- the chart library creates a new canvas instance on every re-render without disposing the previous one. We need to add a cleanup effect.",
			authorId: alexId,
		});

		await ctx.db.insert("comments", {
			issueId: issue109Id,
			body: "Can you track down which commit introduced this regression? It was working fine last week.",
			authorId: kulId,
		});

		// Comment on CLV-104 (Kanban board)
		await ctx.db.insert("comments", {
			issueId: issue104Id,
			body: "Planning to use @dnd-kit/sortable with column-based drop zones. Each status column will be a droppable container with sortable card items inside.",
			authorId: alexId,
		});

		// Comment on CLV-107 (settings page)
		await ctx.db.insert("comments", {
			issueId: issue107Id,
			body: "First draft of the settings page layout is ready for review. Five tabs: General, Members, Billing, Integrations, and Appearance. Let me know if the spacing feels right.",
			authorId: jordanId,
		});

		// Comment on CLV-127 (SEO)
		await ctx.db.insert("comments", {
			issueId: issue127Id,
			body: "Added OG images and meta descriptions for all landing pages. Twitter card previews are also looking good now.",
			authorId: jordanId,
		});

		console.log("[devSeed] Created 7 comments on issues");

		// ── Notifications ─────────────────────────────────────────────────
		console.log("[devSeed] Creating notifications...");

		// issue_assigned: Alex assigned CLV-109 to Kul
		await ctx.db.insert("notifications", {
			userId: kulId,
			workspaceId,
			type: "issue_assigned",
			title: "Issue assigned to you",
			body: "Alex Chen assigned CLV-109 'Fix memory leak in dashboard chart rendering' to you",
			issueId: issue109Id,
			projectId: projectPlatformId,
			actorId: alexId,
			isRead: false,
		});

		// issue_status_changed: Kul moved CLV-102 to in_progress
		await ctx.db.insert("notifications", {
			userId: alexId,
			workspaceId,
			type: "issue_status_changed",
			title: "Issue status changed",
			body: "Kul changed CLV-102 'Implement project CRUD and detail views' from todo to in progress",
			issueId: issue102Id,
			projectId: projectPlatformId,
			actorId: kulId,
			isRead: false,
		});

		// issue_assigned: Kul assigned CLV-113 to Jordan
		await ctx.db.insert("notifications", {
			userId: jordanId,
			workspaceId,
			type: "issue_assigned",
			title: "Issue assigned to you",
			body: "Kul assigned CLV-113 'Build milestone progress tracking UI' to you",
			issueId: issue113Id,
			projectId: projectPlatformId,
			actorId: kulId,
			isRead: false,
		});

		// comment: Kul replied on CLV-102
		await ctx.db.insert("notifications", {
			userId: jordanId,
			workspaceId,
			type: "comment",
			title: 'New comment on "Implement project CRUD and detail views"',
			body: "Kul commented: Agreed. Let's start with list view as the default and add card view as a toggle.",
			issueId: issue102Id,
			projectId: projectPlatformId,
			commentId: comment2Id,
			actorId: kulId,
			isRead: false,
		});

		// issue_mentioned: Alex mentioned Kul in CLV-109
		await ctx.db.insert("notifications", {
			userId: kulId,
			workspaceId,
			type: "issue_mentioned",
			title: "You were mentioned in an issue",
			body: "Alex Chen mentioned you in CLV-109 'Fix memory leak in dashboard chart rendering'",
			issueId: issue109Id,
			projectId: projectPlatformId,
			actorId: alexId,
			isRead: true,
			readAt: daysAgo(0),
		});

		// issue_status_changed: Alex completed CLV-100
		await ctx.db.insert("notifications", {
			userId: jordanId,
			workspaceId,
			type: "issue_status_changed",
			title: "Issue completed",
			body: "Alex Chen completed CLV-100 'Set up authentication with Convex Auth'",
			issueId: issue100Id,
			projectId: projectPlatformId,
			actorId: alexId,
			isRead: true,
			readAt: daysAgo(9),
		});

		console.log("[devSeed] Created 6 notifications");

		console.log("[devSeed] Seed complete! Created:");
		console.log("[devSeed]   - 3 users");
		console.log("[devSeed]   - 1 workspace with settings");
		console.log("[devSeed]   - 5 labels");
		console.log("[devSeed]   - 3 projects with members");
		console.log("[devSeed]   - 3 milestones");
		console.log(
			"[devSeed]   - 30 issues (CLV-100 to CLV-129) with 6 sub-issues",
		);
		console.log("[devSeed]   - 5 issue relations");
		console.log("[devSeed]   - 2 clients with contacts");
		console.log("[devSeed]   - 3 notes");
		console.log("[devSeed]   - 7 comments");
		console.log("[devSeed]   - 6 notifications");
	},
});

// ── Clear Seed ──────────────────────────────────────────────────────────────

export const clearSeed = internalMutation({
	args: {},
	handler: async (ctx) => {
		const workspace = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", "clave-hq"))
			.unique();

		if (!workspace) {
			console.log("[devSeed] No 'clave-hq' workspace found, nothing to clear.");
			return;
		}

		const workspaceId = workspace._id;
		console.log("[devSeed] Clearing seed data for workspace 'clave-hq'...");

		// Collect all workspace member user IDs to delete users later
		const members = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		const memberUserIds = members.map((m) => m.userId);

		// Delete notifications
		const allNotifications = [];
		for (const userId of memberUserIds) {
			const userNotifs = await ctx.db
				.query("notifications")
				.withIndex("by_user_workspace", (q) =>
					q.eq("userId", userId).eq("workspaceId", workspaceId),
				)
				.collect();
			allNotifications.push(...userNotifs);
		}
		for (const n of allNotifications) {
			await ctx.db.delete(n._id);
		}
		console.log(`[devSeed] Deleted ${allNotifications.length} notifications`);

		// Delete comments and relations on issues (new unified schema)
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();

		let issueCommentCount = 0;
		for (const issue of issues) {
			const comments = await ctx.db
				.query("comments")
				.withIndex("by_issue", (q) => q.eq("issueId", issue._id))
				.collect();
			for (const c of comments) {
				await ctx.db.delete(c._id);
			}
			issueCommentCount += comments.length;
		}

		let relationCount = 0;
		for (const issue of issues) {
			const rels = await ctx.db
				.query("issueRelations")
				.withIndex("by_issue", (q) => q.eq("issueId", issue._id))
				.collect();
			for (const r of rels) {
				await ctx.db.delete(r._id);
			}
			relationCount += rels.length;
		}
		console.log(
			`[devSeed] Deleted ${issueCommentCount} issue comments, ${relationCount} issue relations`,
		);

		// Delete issues
		for (const issue of issues) {
			await ctx.db.delete(issue._id);
		}
		console.log(`[devSeed] Deleted ${issues.length} issues`);

		// Delete milestones
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();

		let milestoneCount = 0;
		for (const project of projects) {
			const milestones = await ctx.db
				.query("milestones")
				.withIndex("by_project", (q) => q.eq("projectId", project._id))
				.collect();
			for (const m of milestones) {
				await ctx.db.delete(m._id);
			}
			milestoneCount += milestones.length;
		}
		console.log(`[devSeed] Deleted ${milestoneCount} milestones`);

		// Delete comments on stories (backward compat with old schema)
		const stories = await ctx.db
			.query("stories")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		for (const story of stories) {
			const comments = await ctx.db
				.query("comments")
				.withIndex("by_story", (q) => q.eq("storyId", story._id))
				.collect();
			for (const c of comments) {
				await ctx.db.delete(c._id);
			}
		}

		// Delete comments on tasks (backward compat with old schema)
		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		for (const task of tasks) {
			const comments = await ctx.db
				.query("comments")
				.withIndex("by_task", (q) => q.eq("taskId", task._id))
				.collect();
			for (const c of comments) {
				await ctx.db.delete(c._id);
			}
		}
		console.log("[devSeed] Deleted legacy comments");

		// Delete tasks (backward compat)
		for (const t of tasks) {
			await ctx.db.delete(t._id);
		}
		console.log(`[devSeed] Deleted ${tasks.length} legacy tasks`);

		// Delete stories (backward compat)
		for (const s of stories) {
			await ctx.db.delete(s._id);
		}
		console.log(`[devSeed] Deleted ${stories.length} legacy stories`);

		// Delete sprints (backward compat)
		for (const project of projects) {
			const sprints = await ctx.db
				.query("sprints")
				.withIndex("by_project", (q) => q.eq("projectId", project._id))
				.collect();
			for (const sprint of sprints) {
				await ctx.db.delete(sprint._id);
			}
		}
		console.log("[devSeed] Deleted legacy sprints");

		// Delete notes
		const notes = await ctx.db
			.query("notes")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		for (const n of notes) {
			await ctx.db.delete(n._id);
		}
		console.log(`[devSeed] Deleted ${notes.length} notes`);

		// Delete files
		const files = await ctx.db
			.query("files")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		for (const f of files) {
			await ctx.db.delete(f._id);
		}

		// Delete activity logs
		const logs = await ctx.db
			.query("activityLogs")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		for (const l of logs) {
			await ctx.db.delete(l._id);
		}
		console.log(`[devSeed] Deleted ${logs.length} activity logs`);

		// Delete favorites
		for (const userId of memberUserIds) {
			const favs = await ctx.db
				.query("favorites")
				.withIndex("by_user_workspace", (q) =>
					q.eq("userId", userId).eq("workspaceId", workspaceId),
				)
				.collect();
			for (const f of favs) {
				await ctx.db.delete(f._id);
			}
		}

		// Delete clients and contacts
		const clients = await ctx.db
			.query("clients")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		for (const client of clients) {
			const contacts = await ctx.db
				.query("clientContacts")
				.withIndex("by_client", (q) => q.eq("clientId", client._id))
				.collect();
			for (const contact of contacts) {
				await ctx.db.delete(contact._id);
			}
			await ctx.db.delete(client._id);
		}
		console.log(`[devSeed] Deleted ${clients.length} clients with contacts`);

		// Delete labels
		const labels = await ctx.db
			.query("labels")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		for (const l of labels) {
			await ctx.db.delete(l._id);
		}
		console.log(`[devSeed] Deleted ${labels.length} labels`);

		// Delete project members
		for (const project of projects) {
			const projectMembers = await ctx.db
				.query("projectMembers")
				.withIndex("by_project", (q) => q.eq("projectId", project._id))
				.collect();
			for (const pm of projectMembers) {
				await ctx.db.delete(pm._id);
			}
		}

		// Delete projects
		for (const p of projects) {
			await ctx.db.delete(p._id);
		}
		console.log(`[devSeed] Deleted ${projects.length} projects`);

		// Delete workspace settings
		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.unique();
		if (settings) {
			await ctx.db.delete(settings._id);
		}

		// Delete workspace members
		for (const m of members) {
			await ctx.db.delete(m._id);
		}

		// Delete workspace
		await ctx.db.delete(workspaceId);
		console.log("[devSeed] Deleted workspace 'clave-hq'");

		// Delete seed-only users (skip users that have auth accounts)
		let deletedUsers = 0;
		for (const userId of memberUserIds) {
			const hasAuthAccount = await ctx.db
				.query("authAccounts")
				.withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
				.first();
			if (!hasAuthAccount) {
				await ctx.db.delete(userId);
				deletedUsers++;
			}
		}
		console.log(
			`[devSeed] Deleted ${deletedUsers} seed-only users (skipped ${memberUserIds.length - deletedUsers} auth users)`,
		);

		console.log("[devSeed] Clear complete!");
	},
});
