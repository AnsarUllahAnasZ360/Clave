import { internalMutation } from "./_generated/server";

// ── Date helpers ────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): number {
	return Date.now() - days * DAY;
}

function daysFromNow(days: number): number {
	return Date.now() + days * DAY;
}

// ── Seed ────────────────────────────────────────────────────────────────────

export const seed = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();

		async function ensureClaveE2EArtifacts() {
			const workspace = await ctx.db
				.query("workspaces")
				.withIndex("by_slug", (q) => q.eq("slug", "clave-hq"))
				.unique();
			if (!workspace) {
				return {
					workspaceFound: false,
					projectFound: false,
					documentInserted: false,
					whiteboardInserted: false,
				};
			}

			const platformProject = await ctx.db
				.query("projects")
				.withIndex("by_workspace_slug", (q) =>
					q.eq("workspaceId", workspace._id).eq("slug", "clave-platform-v1"),
				)
				.unique();
			if (!platformProject) {
				return {
					workspaceFound: true,
					projectFound: false,
					documentInserted: false,
					whiteboardInserted: false,
				};
			}

			const existingDocs = await ctx.db
				.query("documents")
				.withIndex("by_project", (q) => q.eq("projectId", platformProject._id))
				.collect();
			const hasTestDocument = existingDocs.some(
				(doc) =>
					doc.workspaceId === workspace._id &&
					doc.title === "Test Document" &&
					!doc.deletedAt,
			);

			let documentInserted = false;
			if (!hasTestDocument) {
				await ctx.db.insert("documents", {
					workspaceId: workspace._id,
					projectId: platformProject._id,
					title: "Test Document",
					sortOrder: daysAgo(11),
					createdBy: workspace.ownerId,
					lastEditedBy: workspace.ownerId,
					updatedAt: daysAgo(11),
					syncVersion: "v2",
				});
				documentInserted = true;
			}

			const existingWhiteboards = await ctx.db
				.query("whiteboards")
				.withIndex("by_project", (q) => q.eq("projectId", platformProject._id))
				.collect();
			const hasUntitledWhiteboard = existingWhiteboards.some(
				(whiteboard) =>
					whiteboard.workspaceId === workspace._id &&
					whiteboard.title.includes("Untitled") &&
					!whiteboard.deletedAt,
			);

			let whiteboardInserted = false;
			if (!hasUntitledWhiteboard) {
				await ctx.db.insert("whiteboards", {
					workspaceId: workspace._id,
					projectId: platformProject._id,
					title: "Untitled",
					sceneData: "[]",
					appState: "{}",
					sortOrder: daysAgo(10),
					createdBy: workspace.ownerId,
					lastEditedBy: workspace.ownerId,
					updatedAt: daysAgo(10),
				});
				whiteboardInserted = true;
			}

			return {
				workspaceFound: true,
				projectFound: true,
				documentInserted,
				whiteboardInserted,
			};
		}

		// ── Idempotency check ─────────────────────────────────────────────
		const existingWorkspace = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", "clave-hq"))
			.unique();

		const existingZ360 = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (q) => q.eq("slug", "z360"))
			.unique();

		if (existingWorkspace && existingZ360) {
			const ensuredArtifacts = await ensureClaveE2EArtifacts();
			if (ensuredArtifacts.workspaceFound && ensuredArtifacts.projectFound) {
				console.log(
					`[devSeed] Ensured Clave e2e fixtures: Test Document ${ensuredArtifacts.documentInserted ? "inserted" : "already present"}, Untitled whiteboard ${ensuredArtifacts.whiteboardInserted ? "inserted" : "already present"}.`,
				);
			} else {
				console.log(
					"[devSeed] Could not ensure Clave e2e fixtures (missing clave-hq workspace or clave-platform-v1 project).",
				);
			}
			console.log(
				"[devSeed] Seed data already exists (clave-hq + z360), skipping.",
			);
			return;
		}

		console.log("[devSeed] Starting seed data creation...");

		// ── Users (shared across all orgs) ────────────────────────────────
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

		// ── Organization: Clave ───────────────────────────────────────────
		if (!existingWorkspace) {
			console.log("[devSeed] Creating organization...");

			const existingOrg = await ctx.db
				.query("organizations")
				.withIndex("by_slug", (q) => q.eq("slug", "clave"))
				.unique();

			const organizationId =
				existingOrg?._id ??
				(await ctx.db.insert("organizations", {
					name: "Clave",
					slug: "clave",
					ownerId: kulId,
					plan: "free",
					createdAt: now,
					updatedAt: now,
				}));

			// Organization members
			for (const { userId, role } of [
				{ userId: kulId, role: "owner" as const },
				{ userId: alexId, role: "admin" as const },
				{ userId: jordanId, role: "member" as const },
			]) {
				const existingMember = await ctx.db
					.query("organizationMembers")
					.withIndex("by_org_user", (q) =>
						q.eq("organizationId", organizationId).eq("userId", userId),
					)
					.unique();
				if (!existingMember) {
					await ctx.db.insert("organizationMembers", {
						organizationId,
						userId,
						role,
						joinedAt: now,
					});
				}
			}

			console.log("[devSeed] Created organization 'Clave' with 3 members");

			// ── Workspace ─────────────────────────────────────────────────────
			console.log("[devSeed] Creating workspace...");

			const workspaceId = await ctx.db.insert("workspaces", {
				name: "Clave HQ",
				slug: "clave-hq",
				ownerId: kulId,
				organizationId,
			});

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
				nextIssueNumber: 142,
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
				description:
					"Landing page and marketing content for goclave.app launch.",
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

			// ── Analytics fixture pack (issue-heavy, 90-day spread) ────────────
			console.log("[devSeed] Creating analytics fixture issues...");

			const issue130Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectPlatformId,
				milestoneId: milestoneAlphaId,
				identifier: "CLV-130",
				title: "Reduce issue list render cost with row memoization",
				description:
					"Memoize issue rows and avoid unnecessary prop churn to improve scrolling performance on large datasets.",
				status: "done",
				priority: "high",
				type: "bug",
				assigneeId: alexId,
				labelIds: [labelBugId],
				startDate: daysAgo(8),
				dueDate: daysAgo(2),
				sortOrder: 31.0,
				estimate: 5,
				createdBy: alexId,
				completedAt: daysAgo(2),
			});

			const issue131Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectMobileId,
				identifier: "CLV-131",
				title: "Improve mobile issue detail information density",
				description:
					"Condense metadata panels and adjust hierarchy so key context is visible above the fold.",
				status: "done",
				priority: "medium",
				type: "improvement",
				assigneeId: jordanId,
				startDate: daysAgo(18),
				dueDate: daysAgo(7),
				sortOrder: 32.0,
				estimate: 3,
				createdBy: jordanId,
				completedAt: daysAgo(6),
			});

			const issue132Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectPlatformId,
				milestoneId: milestoneBetaId,
				identifier: "CLV-132",
				title: "Introduce workspace analytics caching layer",
				description:
					"Add a cache for expensive analytics aggregates and invalidate by issue/status mutations.",
				status: "in_progress",
				priority: "urgent",
				type: "feature",
				assigneeId: kulId,
				startDate: daysAgo(6),
				dueDate: daysAgo(1),
				sortOrder: 33.0,
				estimate: 8,
				createdBy: kulId,
			});

			const issue133Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectPlatformId,
				milestoneId: milestoneBetaId,
				identifier: "CLV-133",
				title: "Publish analytics card loading states",
				description:
					"Add deterministic loading and no-data states for each KPI module to prevent visual jumps.",
				status: "in_review",
				priority: "medium",
				type: "issue",
				assigneeId: alexId,
				startDate: daysAgo(4),
				dueDate: daysFromNow(1),
				sortOrder: 34.0,
				estimate: 3,
				createdBy: kulId,
			});

			const issue134Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectMobileId,
				identifier: "CLV-134",
				title: "Fix stale project counters after drag-drop",
				description:
					"Counters are not recomputed after moving issues between status columns in mobile board mode.",
				status: "todo",
				priority: "high",
				type: "issue",
				assigneeId: alexId,
				startDate: daysAgo(7),
				dueDate: daysAgo(3),
				sortOrder: 35.0,
				estimate: 2,
				createdBy: alexId,
			});

			const issue135Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectMarketingId,
				identifier: "CLV-135",
				title: "Ship launch benchmark page updates",
				description:
					"Finalize benchmark copy and visual polish for launch readiness review.",
				status: "done",
				priority: "low",
				type: "feature",
				assigneeId: jordanId,
				startDate: daysAgo(22),
				dueDate: daysAgo(10),
				sortOrder: 36.0,
				estimate: 2,
				createdBy: jordanId,
				completedAt: daysAgo(12),
			});

			const issue136Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectPlatformId,
				milestoneId: milestoneLaunchId,
				identifier: "CLV-136",
				title: "Triage flaky dashboard snapshot test",
				description:
					"Stabilize snapshot assertions and isolate time-dependent labels in the analytics view.",
				status: "triage",
				priority: "medium",
				type: "bug",
				assigneeId: alexId,
				startDate: daysAgo(2),
				dueDate: daysFromNow(4),
				sortOrder: 37.0,
				estimate: 2,
				createdBy: alexId,
			});

			const issue137Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectPlatformId,
				milestoneId: milestoneLaunchId,
				identifier: "CLV-137",
				title: "Cancel legacy chart migration spike",
				description:
					"Spike showed no meaningful performance gain over existing chart primitives; cancelling to reduce scope.",
				status: "cancelled",
				priority: "low",
				type: "improvement",
				assigneeId: kulId,
				startDate: daysAgo(9),
				sortOrder: 38.0,
				estimate: 3,
				createdBy: kulId,
				completedAt: daysAgo(3),
			});

			const issue138Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectPlatformId,
				milestoneId: milestoneBetaId,
				parentId: issue132Id,
				identifier: "CLV-138",
				title: "Add cache invalidation hooks for status changes",
				description:
					"Wire issue status mutation events into analytics cache invalidation paths.",
				status: "done",
				priority: "high",
				type: "issue",
				assigneeId: kulId,
				startDate: daysAgo(5),
				dueDate: daysAgo(1),
				sortOrder: 39.0,
				estimate: 3,
				createdBy: kulId,
				completedAt: daysAgo(1),
			});

			const issue139Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectPlatformId,
				milestoneId: milestoneBetaId,
				parentId: issue132Id,
				identifier: "CLV-139",
				title: "Instrument analytics query timings in logs",
				description:
					"Capture query execution timing and payload size to monitor regression risk.",
				status: "in_progress",
				priority: "medium",
				type: "issue",
				assigneeId: alexId,
				startDate: daysAgo(3),
				dueDate: daysFromNow(2),
				sortOrder: 40.0,
				estimate: 3,
				createdBy: kulId,
			});

			const issue140Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectMobileId,
				identifier: "CLV-140",
				title: "Implement mobile release checklist screen",
				description:
					"Create a release checklist view to track pre-launch quality and deployment readiness.",
				status: "done",
				priority: "medium",
				type: "feature",
				assigneeId: alexId,
				startDate: daysAgo(35),
				dueDate: daysAgo(18),
				sortOrder: 41.0,
				estimate: 5,
				createdBy: alexId,
				completedAt: daysAgo(20),
			});

			const issue141Id = await ctx.db.insert("issues", {
				workspaceId,
				projectId: projectMarketingId,
				identifier: "CLV-141",
				title: "Backlog launch case-study edits",
				description:
					"Collect and stage case-study edits for post-launch documentation pass.",
				status: "backlog",
				priority: "low",
				type: "issue",
				assigneeId: jordanId,
				startDate: daysAgo(11),
				sortOrder: 42.0,
				estimate: 2,
				createdBy: jordanId,
			});

			// Additional blockers to make blocked-open analytics visible
			await ctx.db.insert("issueRelations", {
				issueId: issue133Id,
				relatedIssueId: issue132Id,
				type: "blocked_by",
				createdBy: kulId,
				createdAt: daysAgo(3),
			});
			await ctx.db.insert("issueRelations", {
				issueId: issue132Id,
				relatedIssueId: issue133Id,
				type: "blocks",
				createdBy: kulId,
				createdAt: daysAgo(3),
			});

			await ctx.db.insert("issueRelations", {
				issueId: issue134Id,
				relatedIssueId: issue136Id,
				type: "blocked_by",
				createdBy: alexId,
				createdAt: daysAgo(2),
			});
			await ctx.db.insert("issueRelations", {
				issueId: issue136Id,
				relatedIssueId: issue134Id,
				type: "blocks",
				createdBy: alexId,
				createdAt: daysAgo(2),
			});

			await ctx.db.insert("issueRelations", {
				issueId: issue139Id,
				relatedIssueId: issue133Id,
				type: "blocked_by",
				createdBy: alexId,
				createdAt: daysAgo(1),
			});
			await ctx.db.insert("issueRelations", {
				issueId: issue133Id,
				relatedIssueId: issue139Id,
				type: "blocks",
				createdBy: alexId,
				createdAt: daysAgo(1),
			});

			console.log(
				`[devSeed] Added analytics fixtures: ${
					[
						issue130Id,
						issue131Id,
						issue132Id,
						issue133Id,
						issue134Id,
						issue135Id,
						issue136Id,
						issue137Id,
						issue138Id,
						issue139Id,
						issue140Id,
						issue141Id,
					].length
				} extra issues + 6 relations`,
			);

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

			console.log("[devSeed] Clave seed complete! Created:");
			console.log("[devSeed]   - 3 users");
			console.log("[devSeed]   - 1 workspace with settings");
			console.log("[devSeed]   - 5 labels");
			console.log("[devSeed]   - 3 projects with members");
			console.log("[devSeed]   - 3 milestones");
			console.log(
				"[devSeed]   - 42 issues (CLV-100 to CLV-141) with 8 sub-issues",
			);
			console.log("[devSeed]   - 11 issue relations");
			console.log("[devSeed]   - 2 clients with contacts");
			console.log("[devSeed]   - 7 comments");
			console.log("[devSeed]   - 6 notifications");
		} // end Clave seed guard

		// ── Additional Organizations ─────────────────────────────────────────────
		if (!existingZ360) {
			console.log("[devSeed] Creating additional organizations...");

			// ── Org 2: Z360 ──────────────────────────────────────────────────
			const z360OrgId = await ctx.db.insert("organizations", {
				name: "Z360",
				slug: "z360",
				ownerId: kulId,
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});

			for (const { userId, role } of [
				{ userId: kulId, role: "owner" as const },
				{ userId: alexId, role: "admin" as const },
			]) {
				await ctx.db.insert("organizationMembers", {
					organizationId: z360OrgId,
					userId,
					role,
					joinedAt: now,
				});
			}

			// Z360 - Production workspace
			const z360ProdWsId = await ctx.db.insert("workspaces", {
				name: "Production",
				slug: "z360-production",
				ownerId: kulId,
				organizationId: z360OrgId,
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId: z360ProdWsId,
				issuePrefix: "Z3",
				nextIssueNumber: 1,
				storyPrefix: "Z3",
				nextStoryNumber: 1,
				taskPrefix: "TSK",
				nextTaskNumber: 1,
			});

			for (const { userId, role } of [
				{ userId: kulId, role: "admin" as const },
				{ userId: alexId, role: "admin" as const },
			]) {
				await ctx.db.insert("workspaceMembers", {
					workspaceId: z360ProdWsId,
					userId,
					role,
					joinedAt: daysAgo(10),
				});
			}

			// Z360 Production labels
			const z3BugLabelId = await ctx.db.insert("labels", {
				workspaceId: z360ProdWsId,
				name: "bug",
				color: "red",
				sortOrder: 1.0,
				createdBy: kulId,
				createdAt: now,
			});
			const z3FeatureLabelId = await ctx.db.insert("labels", {
				workspaceId: z360ProdWsId,
				name: "feature",
				color: "blue",
				sortOrder: 2.0,
				createdBy: kulId,
				createdAt: now,
			});
			const z3ImprovementLabelId = await ctx.db.insert("labels", {
				workspaceId: z360ProdWsId,
				name: "improvement",
				color: "green",
				sortOrder: 3.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: z360ProdWsId,
				name: "urgent",
				color: "orange",
				sortOrder: 4.0,
				createdBy: kulId,
				createdAt: now,
			});

			// Z360 Production projects
			const z3ApiProjectId = await ctx.db.insert("projects", {
				workspaceId: z360ProdWsId,
				name: "API Gateway",
				slug: "api-gateway",
				description: "Core API gateway service for all Z360 microservices.",
				status: "active",
				priority: "high",
				leadId: kulId,
				startDate: daysAgo(20),
				endDate: daysFromNow(40),
				intent: "delivery",
				structure: "sprints",
				sortOrder: 1.0,
				createdBy: kulId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: z3ApiProjectId,
				userId: kulId,
				role: "owner",
				addedAt: daysAgo(20),
			});
			await ctx.db.insert("projectMembers", {
				projectId: z3ApiProjectId,
				userId: alexId,
				role: "contributor",
				addedAt: daysAgo(18),
			});

			const z3ApiMilestoneId = await ctx.db.insert("milestones", {
				projectId: z3ApiProjectId,
				name: "v1.0 GA",
				description:
					"General availability of the API Gateway with rate limiting and auth.",
				targetDate: daysFromNow(30),
				sortOrder: 1.0,
				status: "active",
				createdBy: kulId,
			});

			const z3DataProjectId = await ctx.db.insert("projects", {
				workspaceId: z360ProdWsId,
				name: "Data Pipeline",
				slug: "data-pipeline",
				description: "ETL and streaming data pipeline for analytics ingestion.",
				status: "planned",
				priority: "medium",
				leadId: alexId,
				startDate: daysFromNow(10),
				endDate: daysFromNow(80),
				intent: "delivery",
				structure: "kanban",
				sortOrder: 2.0,
				createdBy: alexId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: z3DataProjectId,
				userId: alexId,
				role: "owner",
				addedAt: daysAgo(5),
			});

			await ctx.db.insert("milestones", {
				projectId: z3DataProjectId,
				name: "Pipeline MVP",
				description: "Basic ETL from source to warehouse with monitoring.",
				targetDate: daysFromNow(60),
				sortOrder: 1.0,
				status: "active",
				createdBy: alexId,
			});

			// Z360 Production issues
			const z3Issue1Id = await ctx.db.insert("issues", {
				workspaceId: z360ProdWsId,
				projectId: z3ApiProjectId,
				milestoneId: z3ApiMilestoneId,
				identifier: "Z3-1",
				title: "Implement rate limiting middleware",
				description:
					"Add configurable rate limiting per API key with sliding window algorithm.",
				status: "in_progress",
				priority: "high",
				type: "feature",
				assigneeId: kulId,
				labelIds: [z3FeatureLabelId],
				startDate: daysAgo(3),
				dueDate: daysFromNow(5),
				sortOrder: 1.0,
				estimate: 8,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: z360ProdWsId,
				projectId: z3ApiProjectId,
				milestoneId: z3ApiMilestoneId,
				identifier: "Z3-2",
				title: "Add JWT validation for service-to-service auth",
				description:
					"Validate JWT tokens from upstream services with key rotation support.",
				status: "todo",
				priority: "high",
				type: "feature",
				assigneeId: alexId,
				labelIds: [z3FeatureLabelId],
				dueDate: daysFromNow(10),
				sortOrder: 2.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: z360ProdWsId,
				projectId: z3ApiProjectId,
				identifier: "Z3-3",
				title: "Fix timeout on large payload forwarding",
				description:
					"Requests with payloads over 5MB timeout at the gateway. Needs chunked transfer support.",
				status: "in_review",
				priority: "urgent",
				type: "bug",
				assigneeId: alexId,
				labelIds: [z3BugLabelId],
				startDate: daysAgo(2),
				sortOrder: 3.0,
				estimate: 3,
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: z360ProdWsId,
				projectId: z3ApiProjectId,
				identifier: "Z3-4",
				title: "Add request/response logging to gateway",
				description:
					"Structured logging for all gateway traffic with configurable verbosity levels.",
				status: "done",
				priority: "medium",
				type: "improvement",
				assigneeId: kulId,
				labelIds: [z3ImprovementLabelId],
				startDate: daysAgo(8),
				sortOrder: 4.0,
				estimate: 3,
				createdBy: kulId,
				completedAt: daysAgo(2),
			});

			await ctx.db.insert("issues", {
				workspaceId: z360ProdWsId,
				projectId: z3DataProjectId,
				identifier: "Z3-5",
				title: "Design data pipeline architecture",
				description:
					"Document the ETL architecture including source connectors, transformation layer, and sink destinations.",
				status: "backlog",
				priority: "medium",
				type: "feature",
				assigneeId: alexId,
				labelIds: [z3FeatureLabelId],
				sortOrder: 5.0,
				estimate: 5,
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: z360ProdWsId,
				projectId: z3DataProjectId,
				identifier: "Z3-6",
				title: "Set up Kafka topic partitioning strategy",
				description:
					"Define partition keys and replication factor for streaming topics.",
				status: "triage",
				priority: "low",
				type: "issue",
				sortOrder: 6.0,
				estimate: 3,
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: z360ProdWsId,
				projectId: z3ApiProjectId,
				identifier: "Z3-7",
				title: "Add health check endpoints",
				description:
					"Expose /health and /ready endpoints for load balancer probes.",
				status: "done",
				priority: "medium",
				type: "feature",
				assigneeId: kulId,
				labelIds: [z3FeatureLabelId],
				startDate: daysAgo(12),
				sortOrder: 7.0,
				estimate: 2,
				createdBy: kulId,
				completedAt: daysAgo(9),
			});

			// Z360 Production comments
			await ctx.db.insert("comments", {
				issueId: z3Issue1Id,
				body: "Should we use a Redis-backed sliding window or an in-memory token bucket? Redis gives us distributed rate limiting across instances.",
				authorId: alexId,
			});

			await ctx.db.insert("comments", {
				issueId: z3Issue1Id,
				body: "Let's go with Redis. We need the distributed behavior since we're running multiple gateway replicas.",
				authorId: kulId,
			});

			console.log("[devSeed] Z360 Production: 7 issues, 2 comments");

			// Z360 - Sandbox workspace
			const z360SandboxWsId = await ctx.db.insert("workspaces", {
				name: "Sandbox",
				slug: "z360-sandbox",
				ownerId: kulId,
				organizationId: z360OrgId,
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId: z360SandboxWsId,
				issuePrefix: "SB",
				nextIssueNumber: 1,
				storyPrefix: "SB",
				nextStoryNumber: 1,
				taskPrefix: "TSK",
				nextTaskNumber: 1,
			});

			await ctx.db.insert("workspaceMembers", {
				workspaceId: z360SandboxWsId,
				userId: kulId,
				role: "admin",
				joinedAt: daysAgo(10),
			});
			await ctx.db.insert("workspaceMembers", {
				workspaceId: z360SandboxWsId,
				userId: alexId,
				role: "member",
				joinedAt: daysAgo(8),
			});

			await ctx.db.insert("labels", {
				workspaceId: z360SandboxWsId,
				name: "experiment",
				color: "purple",
				sortOrder: 1.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: z360SandboxWsId,
				name: "spike",
				color: "blue",
				sortOrder: 2.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: z360SandboxWsId,
				name: "broken",
				color: "red",
				sortOrder: 3.0,
				createdBy: kulId,
				createdAt: now,
			});

			const z3SandboxProjectId = await ctx.db.insert("projects", {
				workspaceId: z360SandboxWsId,
				name: "Experiments",
				slug: "experiments",
				description: "Sandbox for proof-of-concept work and technical spikes.",
				status: "active",
				priority: "low",
				leadId: alexId,
				startDate: daysAgo(10),
				endDate: daysFromNow(90),
				intent: "discovery",
				structure: "kanban",
				sortOrder: 1.0,
				createdBy: alexId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: z3SandboxProjectId,
				userId: alexId,
				role: "owner",
				addedAt: daysAgo(10),
			});

			await ctx.db.insert("milestones", {
				projectId: z3SandboxProjectId,
				name: "Q1 Experiments",
				description: "Batch of Q1 proof-of-concept spikes.",
				targetDate: daysFromNow(30),
				sortOrder: 1.0,
				status: "active",
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: z360SandboxWsId,
				projectId: z3SandboxProjectId,
				identifier: "SB-1",
				title: "Spike: WebSocket vs SSE for real-time feeds",
				description:
					"Compare WebSocket and Server-Sent Events for real-time notification delivery.",
				status: "in_progress",
				priority: "medium",
				type: "issue",
				assigneeId: alexId,
				startDate: daysAgo(2),
				sortOrder: 1.0,
				estimate: 3,
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: z360SandboxWsId,
				projectId: z3SandboxProjectId,
				identifier: "SB-2",
				title: "Prototype: edge function cold start benchmarks",
				description:
					"Benchmark cold start times across Vercel, Cloudflare Workers, and Deno Deploy.",
				status: "todo",
				priority: "low",
				type: "issue",
				assigneeId: alexId,
				sortOrder: 2.0,
				estimate: 5,
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: z360SandboxWsId,
				projectId: z3SandboxProjectId,
				identifier: "SB-3",
				title: "Evaluate vector DB options for semantic search",
				description:
					"Compare Pinecone, Weaviate, and pgvector for embedding-based search.",
				status: "backlog",
				priority: "low",
				type: "issue",
				sortOrder: 3.0,
				estimate: 5,
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: z360SandboxWsId,
				projectId: z3SandboxProjectId,
				identifier: "SB-4",
				title: "Test GraphQL federation gateway",
				description:
					"Stand up Apollo Federation gateway with two subgraphs and measure overhead.",
				status: "done",
				priority: "medium",
				type: "feature",
				assigneeId: kulId,
				startDate: daysAgo(7),
				sortOrder: 4.0,
				estimate: 3,
				createdBy: kulId,
				completedAt: daysAgo(3),
			});

			await ctx.db.insert("issues", {
				workspaceId: z360SandboxWsId,
				projectId: z3SandboxProjectId,
				identifier: "SB-5",
				title: "Prototype AI code review bot",
				description:
					"Build a minimal PR review bot using OpenAI API that comments on diffs.",
				status: "triage",
				priority: "medium",
				type: "feature",
				sortOrder: 5.0,
				estimate: 8,
				createdBy: alexId,
			});

			console.log("[devSeed] Z360 Sandbox: 5 issues");

			// ── Org 3: Nexus Corp ────────────────────────────────────────────
			const nexusOrgId = await ctx.db.insert("organizations", {
				name: "Nexus Corp",
				slug: "nexus-corp",
				ownerId: kulId,
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});

			for (const { userId, role } of [
				{ userId: kulId, role: "owner" as const },
				{ userId: alexId, role: "admin" as const },
				{ userId: jordanId, role: "member" as const },
			]) {
				await ctx.db.insert("organizationMembers", {
					organizationId: nexusOrgId,
					userId,
					role,
					joinedAt: now,
				});
			}

			// Nexus Corp - Engineering workspace
			const nexusEngWsId = await ctx.db.insert("workspaces", {
				name: "Engineering",
				slug: "nexus-engineering",
				ownerId: kulId,
				organizationId: nexusOrgId,
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId: nexusEngWsId,
				issuePrefix: "NX",
				nextIssueNumber: 1,
				storyPrefix: "NX",
				nextStoryNumber: 1,
				taskPrefix: "TSK",
				nextTaskNumber: 1,
			});

			for (const { userId, role } of [
				{ userId: kulId, role: "admin" as const },
				{ userId: alexId, role: "admin" as const },
			]) {
				await ctx.db.insert("workspaceMembers", {
					workspaceId: nexusEngWsId,
					userId,
					role,
					joinedAt: daysAgo(7),
				});
			}

			// Nexus Engineering labels
			const nxBugLabelId = await ctx.db.insert("labels", {
				workspaceId: nexusEngWsId,
				name: "bug",
				color: "red",
				sortOrder: 1.0,
				createdBy: kulId,
				createdAt: now,
			});
			const nxFeatureLabelId = await ctx.db.insert("labels", {
				workspaceId: nexusEngWsId,
				name: "feature",
				color: "blue",
				sortOrder: 2.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: nexusEngWsId,
				name: "improvement",
				color: "green",
				sortOrder: 3.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: nexusEngWsId,
				name: "documentation",
				color: "purple",
				sortOrder: 4.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: nexusEngWsId,
				name: "urgent",
				color: "orange",
				sortOrder: 5.0,
				createdBy: kulId,
				createdAt: now,
			});

			// Nexus Engineering project
			const nxPlatformProjectId = await ctx.db.insert("projects", {
				workspaceId: nexusEngWsId,
				name: "Nexus Platform",
				slug: "nexus-platform",
				description:
					"Core enterprise platform with multi-tenant architecture and SSO.",
				status: "active",
				priority: "high",
				leadId: kulId,
				startDate: daysAgo(30),
				endDate: daysFromNow(60),
				intent: "delivery",
				structure: "sprints",
				sortOrder: 1.0,
				createdBy: kulId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: nxPlatformProjectId,
				userId: kulId,
				role: "owner",
				addedAt: daysAgo(30),
			});
			await ctx.db.insert("projectMembers", {
				projectId: nxPlatformProjectId,
				userId: alexId,
				role: "contributor",
				addedAt: daysAgo(28),
			});

			const nxMilestoneId = await ctx.db.insert("milestones", {
				projectId: nxPlatformProjectId,
				name: "Multi-tenant MVP",
				description: "Tenant isolation, SSO integration, and admin console.",
				targetDate: daysFromNow(30),
				sortOrder: 1.0,
				status: "active",
				createdBy: kulId,
			});

			const nxInfraProjectId = await ctx.db.insert("projects", {
				workspaceId: nexusEngWsId,
				name: "Infrastructure",
				slug: "infrastructure",
				description: "Cloud infrastructure, CI/CD, and DevOps tooling.",
				status: "active",
				priority: "medium",
				leadId: alexId,
				startDate: daysAgo(15),
				endDate: daysFromNow(90),
				intent: "delivery",
				structure: "kanban",
				sortOrder: 2.0,
				createdBy: alexId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: nxInfraProjectId,
				userId: alexId,
				role: "owner",
				addedAt: daysAgo(15),
			});

			await ctx.db.insert("milestones", {
				projectId: nxInfraProjectId,
				name: "IaC Migration",
				description: "Migrate all infrastructure to Terraform modules.",
				targetDate: daysFromNow(45),
				sortOrder: 1.0,
				status: "active",
				createdBy: alexId,
			});

			// Nexus Engineering issues
			const nxIssue1Id = await ctx.db.insert("issues", {
				workspaceId: nexusEngWsId,
				projectId: nxPlatformProjectId,
				milestoneId: nxMilestoneId,
				identifier: "NX-1",
				title: "Implement tenant isolation in database layer",
				description:
					"Add row-level security and tenant ID propagation through all queries.",
				status: "in_progress",
				priority: "urgent",
				type: "feature",
				assigneeId: kulId,
				labelIds: [nxFeatureLabelId],
				startDate: daysAgo(5),
				dueDate: daysFromNow(3),
				sortOrder: 1.0,
				estimate: 13,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusEngWsId,
				projectId: nxPlatformProjectId,
				milestoneId: nxMilestoneId,
				identifier: "NX-2",
				title: "Build SSO integration with SAML 2.0",
				description:
					"Support enterprise SSO via SAML with IdP metadata discovery.",
				status: "todo",
				priority: "high",
				type: "feature",
				assigneeId: alexId,
				labelIds: [nxFeatureLabelId],
				dueDate: daysFromNow(15),
				sortOrder: 2.0,
				estimate: 8,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusEngWsId,
				projectId: nxPlatformProjectId,
				identifier: "NX-3",
				title: "Fix cross-tenant data leak in search results",
				description:
					"Search API returns results from other tenants when using wildcard queries.",
				status: "in_progress",
				priority: "urgent",
				type: "bug",
				assigneeId: alexId,
				labelIds: [nxBugLabelId],
				startDate: daysAgo(1),
				sortOrder: 3.0,
				estimate: 5,
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusEngWsId,
				projectId: nxPlatformProjectId,
				identifier: "NX-4",
				title: "Add admin console for tenant management",
				description:
					"Build admin UI for creating, suspending, and configuring tenants.",
				status: "backlog",
				priority: "medium",
				type: "feature",
				labelIds: [nxFeatureLabelId],
				sortOrder: 4.0,
				estimate: 8,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusEngWsId,
				projectId: nxInfraProjectId,
				identifier: "NX-5",
				title: "Migrate staging environment to Terraform",
				description:
					"Convert existing manual staging setup to Terraform modules.",
				status: "done",
				priority: "high",
				type: "issue",
				assigneeId: alexId,
				startDate: daysAgo(10),
				sortOrder: 5.0,
				estimate: 5,
				createdBy: alexId,
				completedAt: daysAgo(3),
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusEngWsId,
				projectId: nxInfraProjectId,
				identifier: "NX-6",
				title: "Set up GitHub Actions CI for monorepo",
				description:
					"Configure path-filtered CI triggers for each package in the monorepo.",
				status: "in_review",
				priority: "medium",
				type: "issue",
				assigneeId: alexId,
				startDate: daysAgo(4),
				sortOrder: 6.0,
				estimate: 3,
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusEngWsId,
				projectId: nxInfraProjectId,
				identifier: "NX-7",
				title: "Add Datadog APM instrumentation",
				description:
					"Instrument all services with Datadog APM traces and custom metrics.",
				status: "todo",
				priority: "medium",
				type: "improvement",
				assigneeId: kulId,
				sortOrder: 7.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusEngWsId,
				projectId: nxPlatformProjectId,
				identifier: "NX-8",
				title: "Write tenant onboarding documentation",
				description:
					"Document the full tenant provisioning and configuration workflow.",
				status: "backlog",
				priority: "low",
				type: "issue",
				sortOrder: 8.0,
				estimate: 3,
				createdBy: kulId,
			});

			// Nexus Engineering comments
			await ctx.db.insert("comments", {
				issueId: nxIssue1Id,
				body: "Using Postgres RLS policies with a tenant_id column on every table. The session variable approach lets us avoid passing tenant ID through every function.",
				authorId: kulId,
			});

			await ctx.db.insert("comments", {
				issueId: nxIssue1Id,
				body: "Make sure we add integration tests that verify cross-tenant queries return empty results.",
				authorId: alexId,
			});

			console.log("[devSeed] Nexus Engineering: 8 issues, 2 comments");

			// Nexus Corp - Design workspace
			const nexusDesignWsId = await ctx.db.insert("workspaces", {
				name: "Design",
				slug: "nexus-design",
				ownerId: kulId,
				organizationId: nexusOrgId,
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId: nexusDesignWsId,
				issuePrefix: "ND",
				nextIssueNumber: 1,
				storyPrefix: "ND",
				nextStoryNumber: 1,
				taskPrefix: "TSK",
				nextTaskNumber: 1,
			});

			await ctx.db.insert("workspaceMembers", {
				workspaceId: nexusDesignWsId,
				userId: kulId,
				role: "admin",
				joinedAt: daysAgo(7),
			});
			await ctx.db.insert("workspaceMembers", {
				workspaceId: nexusDesignWsId,
				userId: jordanId,
				role: "admin",
				joinedAt: daysAgo(7),
			});

			await ctx.db.insert("labels", {
				workspaceId: nexusDesignWsId,
				name: "ui",
				color: "blue",
				sortOrder: 1.0,
				createdBy: jordanId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: nexusDesignWsId,
				name: "ux-research",
				color: "green",
				sortOrder: 2.0,
				createdBy: jordanId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: nexusDesignWsId,
				name: "revision",
				color: "orange",
				sortOrder: 3.0,
				createdBy: jordanId,
				createdAt: now,
			});

			const ndDesignSystemProjectId = await ctx.db.insert("projects", {
				workspaceId: nexusDesignWsId,
				name: "Design System",
				slug: "design-system",
				description:
					"Shared component library and design tokens for the Nexus platform.",
				status: "active",
				priority: "high",
				leadId: jordanId,
				startDate: daysAgo(14),
				endDate: daysFromNow(45),
				intent: "delivery",
				structure: "kanban",
				sortOrder: 1.0,
				createdBy: jordanId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: ndDesignSystemProjectId,
				userId: jordanId,
				role: "owner",
				addedAt: daysAgo(14),
			});

			await ctx.db.insert("milestones", {
				projectId: ndDesignSystemProjectId,
				name: "Core Components",
				description: "Buttons, inputs, modals, and typography tokens.",
				targetDate: daysFromNow(20),
				sortOrder: 1.0,
				status: "active",
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusDesignWsId,
				projectId: ndDesignSystemProjectId,
				identifier: "ND-1",
				title: "Define color token system",
				description:
					"Create semantic color tokens (primary, secondary, destructive, muted) with dark/light variants.",
				status: "done",
				priority: "high",
				type: "feature",
				assigneeId: jordanId,
				startDate: daysAgo(10),
				sortOrder: 1.0,
				estimate: 3,
				createdBy: jordanId,
				completedAt: daysAgo(5),
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusDesignWsId,
				projectId: ndDesignSystemProjectId,
				identifier: "ND-2",
				title: "Build button component variants",
				description:
					"Primary, secondary, ghost, destructive, and outline button variants with size options.",
				status: "in_progress",
				priority: "high",
				type: "feature",
				assigneeId: jordanId,
				startDate: daysAgo(3),
				sortOrder: 2.0,
				estimate: 5,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusDesignWsId,
				projectId: ndDesignSystemProjectId,
				identifier: "ND-3",
				title: "Create input field components",
				description:
					"Text input, textarea, select, and checkbox components with validation states.",
				status: "todo",
				priority: "medium",
				type: "feature",
				assigneeId: jordanId,
				sortOrder: 3.0,
				estimate: 5,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusDesignWsId,
				projectId: ndDesignSystemProjectId,
				identifier: "ND-4",
				title: "Design modal and dialog patterns",
				description:
					"Standardize modal sizes, overlay behavior, and focus trapping.",
				status: "backlog",
				priority: "medium",
				type: "feature",
				sortOrder: 4.0,
				estimate: 5,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusDesignWsId,
				projectId: ndDesignSystemProjectId,
				identifier: "ND-5",
				title: "Document typography scale and usage",
				description:
					"Define heading levels, body text sizes, and usage guidelines.",
				status: "backlog",
				priority: "low",
				type: "issue",
				sortOrder: 5.0,
				estimate: 2,
				createdBy: jordanId,
			});

			console.log("[devSeed] Nexus Design: 5 issues");

			// Nexus Corp - Marketing workspace
			const nexusMktWsId = await ctx.db.insert("workspaces", {
				name: "Marketing",
				slug: "nexus-marketing",
				ownerId: kulId,
				organizationId: nexusOrgId,
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId: nexusMktWsId,
				issuePrefix: "NM",
				nextIssueNumber: 1,
				storyPrefix: "NM",
				nextStoryNumber: 1,
				taskPrefix: "TSK",
				nextTaskNumber: 1,
			});

			await ctx.db.insert("workspaceMembers", {
				workspaceId: nexusMktWsId,
				userId: kulId,
				role: "admin",
				joinedAt: daysAgo(7),
			});
			await ctx.db.insert("workspaceMembers", {
				workspaceId: nexusMktWsId,
				userId: jordanId,
				role: "member",
				joinedAt: daysAgo(5),
			});

			await ctx.db.insert("labels", {
				workspaceId: nexusMktWsId,
				name: "content",
				color: "blue",
				sortOrder: 1.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: nexusMktWsId,
				name: "campaign",
				color: "green",
				sortOrder: 2.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: nexusMktWsId,
				name: "social",
				color: "purple",
				sortOrder: 3.0,
				createdBy: kulId,
				createdAt: now,
			});

			const nmLaunchProjectId = await ctx.db.insert("projects", {
				workspaceId: nexusMktWsId,
				name: "Product Launch",
				slug: "product-launch",
				description:
					"Go-to-market strategy and launch campaign for Nexus Platform.",
				status: "active",
				priority: "high",
				leadId: kulId,
				startDate: daysAgo(7),
				endDate: daysFromNow(30),
				intent: "delivery",
				structure: "linear",
				sortOrder: 1.0,
				createdBy: kulId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: nmLaunchProjectId,
				userId: kulId,
				role: "owner",
				addedAt: daysAgo(7),
			});
			await ctx.db.insert("projectMembers", {
				projectId: nmLaunchProjectId,
				userId: jordanId,
				role: "contributor",
				addedAt: daysAgo(5),
			});

			await ctx.db.insert("milestones", {
				projectId: nmLaunchProjectId,
				name: "Launch Day",
				description: "All launch assets ready and campaign live.",
				targetDate: daysFromNow(21),
				sortOrder: 1.0,
				status: "active",
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusMktWsId,
				projectId: nmLaunchProjectId,
				identifier: "NM-1",
				title: "Write launch blog post",
				description:
					"Draft and review the official launch announcement blog post.",
				status: "in_progress",
				priority: "high",
				type: "issue",
				assigneeId: kulId,
				startDate: daysAgo(3),
				sortOrder: 1.0,
				estimate: 3,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusMktWsId,
				projectId: nmLaunchProjectId,
				identifier: "NM-2",
				title: "Create social media campaign assets",
				description:
					"Design Twitter, LinkedIn, and Product Hunt launch graphics.",
				status: "todo",
				priority: "high",
				type: "issue",
				assigneeId: jordanId,
				sortOrder: 2.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusMktWsId,
				projectId: nmLaunchProjectId,
				identifier: "NM-3",
				title: "Set up email drip campaign",
				description: "Configure 5-email nurture sequence for launch signups.",
				status: "backlog",
				priority: "medium",
				type: "feature",
				sortOrder: 3.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusMktWsId,
				projectId: nmLaunchProjectId,
				identifier: "NM-4",
				title: "Prepare Product Hunt launch",
				description:
					"Create maker comment, gallery images, and first-day strategy.",
				status: "todo",
				priority: "medium",
				type: "issue",
				assigneeId: kulId,
				sortOrder: 4.0,
				estimate: 3,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: nexusMktWsId,
				projectId: nmLaunchProjectId,
				identifier: "NM-5",
				title: "Record product demo video",
				description:
					"Create a 2-minute product walkthrough video for the landing page.",
				status: "backlog",
				priority: "medium",
				type: "issue",
				assigneeId: jordanId,
				sortOrder: 5.0,
				estimate: 8,
				createdBy: jordanId,
			});

			console.log("[devSeed] Nexus Marketing: 5 issues");

			// ── Org 4: Indie Studio ──────────────────────────────────────────
			const indieOrgId = await ctx.db.insert("organizations", {
				name: "Indie Studio",
				slug: "indie-studio",
				ownerId: kulId,
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});

			for (const { userId, role } of [
				{ userId: kulId, role: "owner" as const },
				{ userId: jordanId, role: "admin" as const },
			]) {
				await ctx.db.insert("organizationMembers", {
					organizationId: indieOrgId,
					userId,
					role,
					joinedAt: now,
				});
			}

			// Indie Studio - Alpha workspace
			const indieAlphaWsId = await ctx.db.insert("workspaces", {
				name: "Alpha",
				slug: "indie-alpha",
				ownerId: kulId,
				organizationId: indieOrgId,
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId: indieAlphaWsId,
				issuePrefix: "IS",
				nextIssueNumber: 1,
				storyPrefix: "IS",
				nextStoryNumber: 1,
				taskPrefix: "TSK",
				nextTaskNumber: 1,
			});

			for (const { userId, role } of [
				{ userId: kulId, role: "admin" as const },
				{ userId: jordanId, role: "admin" as const },
			]) {
				await ctx.db.insert("workspaceMembers", {
					workspaceId: indieAlphaWsId,
					userId,
					role,
					joinedAt: daysAgo(5),
				});
			}

			const isGameBugLabelId = await ctx.db.insert("labels", {
				workspaceId: indieAlphaWsId,
				name: "bug",
				color: "red",
				sortOrder: 1.0,
				createdBy: kulId,
				createdAt: now,
			});
			const isGameFeatureLabelId = await ctx.db.insert("labels", {
				workspaceId: indieAlphaWsId,
				name: "feature",
				color: "blue",
				sortOrder: 2.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: indieAlphaWsId,
				name: "art",
				color: "purple",
				sortOrder: 3.0,
				createdBy: jordanId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: indieAlphaWsId,
				name: "gameplay",
				color: "green",
				sortOrder: 4.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: indieAlphaWsId,
				name: "blocker",
				color: "orange",
				sortOrder: 5.0,
				createdBy: kulId,
				createdAt: now,
			});

			const isGameProjectId = await ctx.db.insert("projects", {
				workspaceId: indieAlphaWsId,
				name: "Starfall",
				slug: "starfall",
				description: "2D roguelike with procedurally generated star systems.",
				status: "active",
				priority: "high",
				leadId: kulId,
				startDate: daysAgo(21),
				endDate: daysFromNow(90),
				intent: "delivery",
				structure: "sprints",
				sortOrder: 1.0,
				createdBy: kulId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: isGameProjectId,
				userId: kulId,
				role: "owner",
				addedAt: daysAgo(21),
			});
			await ctx.db.insert("projectMembers", {
				projectId: isGameProjectId,
				userId: jordanId,
				role: "contributor",
				addedAt: daysAgo(20),
			});

			const isGameMilestoneId = await ctx.db.insert("milestones", {
				projectId: isGameProjectId,
				name: "Playable Demo",
				description:
					"First playable demo with core loop: explore, fight, loot.",
				targetDate: daysFromNow(30),
				sortOrder: 1.0,
				status: "active",
				createdBy: kulId,
			});

			const isToolsProjectId = await ctx.db.insert("projects", {
				workspaceId: indieAlphaWsId,
				name: "Dev Tools",
				slug: "dev-tools",
				description:
					"Internal tooling: level editor, asset pipeline, debug console.",
				status: "active",
				priority: "medium",
				leadId: jordanId,
				startDate: daysAgo(14),
				endDate: daysFromNow(60),
				intent: "delivery",
				structure: "kanban",
				sortOrder: 2.0,
				createdBy: jordanId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: isToolsProjectId,
				userId: jordanId,
				role: "owner",
				addedAt: daysAgo(14),
			});

			await ctx.db.insert("milestones", {
				projectId: isToolsProjectId,
				name: "Level Editor v1",
				description:
					"Basic level editor with tile placement and entity spawning.",
				targetDate: daysFromNow(21),
				sortOrder: 1.0,
				status: "active",
				createdBy: jordanId,
			});

			// Indie Alpha issues
			const isIssue1Id = await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isGameProjectId,
				milestoneId: isGameMilestoneId,
				identifier: "IS-1",
				title: "Implement procedural star system generator",
				description:
					"Generate star systems with planets, moons, and asteroid fields using seeded RNG.",
				status: "in_progress",
				priority: "high",
				type: "feature",
				assigneeId: kulId,
				labelIds: [isGameFeatureLabelId],
				startDate: daysAgo(5),
				dueDate: daysFromNow(7),
				sortOrder: 1.0,
				estimate: 13,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isGameProjectId,
				milestoneId: isGameMilestoneId,
				identifier: "IS-2",
				title: "Build combat system prototype",
				description:
					"Real-time combat with ranged and melee weapons, dodge mechanics, and hit detection.",
				status: "todo",
				priority: "high",
				type: "feature",
				assigneeId: kulId,
				labelIds: [isGameFeatureLabelId],
				dueDate: daysFromNow(14),
				sortOrder: 2.0,
				estimate: 13,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isGameProjectId,
				identifier: "IS-3",
				title: "Fix sprite rendering order in parallax layers",
				description:
					"Sprites occasionally render behind background parallax layers during fast scrolling.",
				status: "in_review",
				priority: "medium",
				type: "bug",
				assigneeId: kulId,
				labelIds: [isGameBugLabelId],
				startDate: daysAgo(2),
				sortOrder: 3.0,
				estimate: 3,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isGameProjectId,
				identifier: "IS-4",
				title: "Design loot table and item rarity system",
				description:
					"Define drop rates, rarity tiers (common to legendary), and loot pool per enemy type.",
				status: "backlog",
				priority: "medium",
				type: "feature",
				assigneeId: jordanId,
				sortOrder: 4.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isGameProjectId,
				identifier: "IS-5",
				title: "Create pixel art tileset for space stations",
				description:
					"16x16 tileset with walls, floors, doors, and decorative props for space station interiors.",
				status: "in_progress",
				priority: "medium",
				type: "issue",
				assigneeId: jordanId,
				startDate: daysAgo(4),
				sortOrder: 5.0,
				estimate: 8,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isToolsProjectId,
				identifier: "IS-6",
				title: "Build tile placement mode in level editor",
				description:
					"Click-and-drag tile painting with brush sizes and tile picker panel.",
				status: "todo",
				priority: "high",
				type: "feature",
				assigneeId: jordanId,
				sortOrder: 6.0,
				estimate: 8,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isToolsProjectId,
				identifier: "IS-7",
				title: "Add undo/redo to level editor",
				description:
					"Command pattern implementation for undo/redo with 50-step history.",
				status: "backlog",
				priority: "medium",
				type: "feature",
				sortOrder: 7.0,
				estimate: 5,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isGameProjectId,
				identifier: "IS-8",
				title: "Implement save/load game state",
				description:
					"Serialize game state to JSON and support multiple save slots.",
				status: "triage",
				priority: "medium",
				type: "feature",
				sortOrder: 8.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isGameProjectId,
				identifier: "IS-9",
				title: "Add gamepad controller support",
				description:
					"Map gamepad inputs for movement, combat, and menus. Support Xbox and PlayStation layouts.",
				status: "backlog",
				priority: "low",
				type: "feature",
				sortOrder: 9.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieAlphaWsId,
				projectId: isGameProjectId,
				identifier: "IS-10",
				title: "Optimize collision detection for large entity counts",
				description:
					"Switch from brute-force O(n^2) to spatial hash grid for collision checks.",
				status: "done",
				priority: "high",
				type: "bug",
				assigneeId: kulId,
				labelIds: [isGameBugLabelId],
				startDate: daysAgo(8),
				sortOrder: 10.0,
				estimate: 5,
				createdBy: kulId,
				completedAt: daysAgo(4),
			});

			// Indie Alpha comments
			await ctx.db.insert("comments", {
				issueId: isIssue1Id,
				body: "Using Simplex noise with octave layering for planet distribution. Each star system gets a unique seed derived from galaxy coordinates.",
				authorId: kulId,
			});

			await ctx.db.insert("comments", {
				issueId: isIssue1Id,
				body: "Nice! Can we add a preview mode in the level editor so designers can see the generated systems before committing?",
				authorId: jordanId,
			});

			console.log("[devSeed] Indie Alpha: 10 issues, 2 comments");

			// Indie Studio - Beta Testing workspace
			const indieBetaWsId = await ctx.db.insert("workspaces", {
				name: "Beta Testing",
				slug: "indie-beta",
				ownerId: kulId,
				organizationId: indieOrgId,
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId: indieBetaWsId,
				issuePrefix: "BT",
				nextIssueNumber: 1,
				storyPrefix: "BT",
				nextStoryNumber: 1,
				taskPrefix: "TSK",
				nextTaskNumber: 1,
			});

			await ctx.db.insert("workspaceMembers", {
				workspaceId: indieBetaWsId,
				userId: kulId,
				role: "admin",
				joinedAt: daysAgo(3),
			});
			await ctx.db.insert("workspaceMembers", {
				workspaceId: indieBetaWsId,
				userId: jordanId,
				role: "member",
				joinedAt: daysAgo(3),
			});

			await ctx.db.insert("labels", {
				workspaceId: indieBetaWsId,
				name: "crash",
				color: "red",
				sortOrder: 1.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: indieBetaWsId,
				name: "feedback",
				color: "blue",
				sortOrder: 2.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: indieBetaWsId,
				name: "polish",
				color: "green",
				sortOrder: 3.0,
				createdBy: kulId,
				createdAt: now,
			});

			const btTestingProjectId = await ctx.db.insert("projects", {
				workspaceId: indieBetaWsId,
				name: "Beta Feedback",
				slug: "beta-feedback",
				description: "Tracking beta tester feedback and bug reports.",
				status: "active",
				priority: "high",
				leadId: kulId,
				startDate: daysAgo(3),
				endDate: daysFromNow(30),
				intent: "delivery",
				structure: "kanban",
				sortOrder: 1.0,
				createdBy: kulId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: btTestingProjectId,
				userId: kulId,
				role: "owner",
				addedAt: daysAgo(3),
			});
			await ctx.db.insert("projectMembers", {
				projectId: btTestingProjectId,
				userId: jordanId,
				role: "contributor",
				addedAt: daysAgo(3),
			});

			await ctx.db.insert("milestones", {
				projectId: btTestingProjectId,
				name: "Beta Round 1",
				description: "First round of beta testing with 20 testers.",
				targetDate: daysFromNow(14),
				sortOrder: 1.0,
				status: "active",
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieBetaWsId,
				projectId: btTestingProjectId,
				identifier: "BT-1",
				title: "Game crashes when entering asteroid field",
				description:
					"Reproducible crash when player ship enters dense asteroid field in system Alpha-7.",
				status: "in_progress",
				priority: "urgent",
				type: "bug",
				assigneeId: kulId,
				startDate: daysAgo(1),
				sortOrder: 1.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieBetaWsId,
				projectId: btTestingProjectId,
				identifier: "BT-2",
				title: "Tester requests: difficulty slider in settings",
				description:
					"Multiple testers requested adjustable difficulty. Consider easy/normal/hard presets.",
				status: "triage",
				priority: "medium",
				type: "feature",
				sortOrder: 2.0,
				estimate: 5,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieBetaWsId,
				projectId: btTestingProjectId,
				identifier: "BT-3",
				title: "Frame rate drops below 30fps on Intel Macs",
				description:
					"Performance issues on Intel-based Macs during combat with 20+ enemies.",
				status: "todo",
				priority: "high",
				type: "bug",
				assigneeId: kulId,
				sortOrder: 3.0,
				estimate: 8,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieBetaWsId,
				projectId: btTestingProjectId,
				identifier: "BT-4",
				title: "Tutorial text overlaps UI on ultrawide monitors",
				description:
					"Tutorial popup extends beyond screen bounds on 21:9 aspect ratio displays.",
				status: "backlog",
				priority: "low",
				type: "bug",
				assigneeId: jordanId,
				sortOrder: 4.0,
				estimate: 2,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: indieBetaWsId,
				projectId: btTestingProjectId,
				identifier: "BT-5",
				title: "Positive feedback: combat feel and responsiveness",
				description:
					"Aggregate positive feedback about combat mechanics for marketing materials.",
				status: "done",
				priority: "low",
				type: "issue",
				assigneeId: jordanId,
				startDate: daysAgo(2),
				sortOrder: 5.0,
				estimate: 1,
				createdBy: jordanId,
				completedAt: daysAgo(1),
			});

			console.log("[devSeed] Indie Beta: 5 issues");

			// ── Org 5: OpenSource Collective ─────────────────────────────────
			const ossOrgId = await ctx.db.insert("organizations", {
				name: "OpenSource Collective",
				slug: "oss-collective",
				ownerId: kulId,
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});

			for (const { userId, role } of [
				{ userId: kulId, role: "owner" as const },
				{ userId: alexId, role: "admin" as const },
				{ userId: jordanId, role: "member" as const },
			]) {
				await ctx.db.insert("organizationMembers", {
					organizationId: ossOrgId,
					userId,
					role,
					joinedAt: now,
				});
			}

			// OSS - Community workspace
			const ossCommunityWsId = await ctx.db.insert("workspaces", {
				name: "Community",
				slug: "oss-community",
				ownerId: kulId,
				organizationId: ossOrgId,
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId: ossCommunityWsId,
				issuePrefix: "OS",
				nextIssueNumber: 1,
				storyPrefix: "OS",
				nextStoryNumber: 1,
				taskPrefix: "TSK",
				nextTaskNumber: 1,
			});

			for (const { userId, role } of [
				{ userId: kulId, role: "admin" as const },
				{ userId: alexId, role: "admin" as const },
				{ userId: jordanId, role: "member" as const },
			]) {
				await ctx.db.insert("workspaceMembers", {
					workspaceId: ossCommunityWsId,
					userId,
					role,
					joinedAt: daysAgo(14),
				});
			}

			const ossBugLabelId = await ctx.db.insert("labels", {
				workspaceId: ossCommunityWsId,
				name: "bug",
				color: "red",
				sortOrder: 1.0,
				createdBy: kulId,
				createdAt: now,
			});
			const ossFeatureLabelId = await ctx.db.insert("labels", {
				workspaceId: ossCommunityWsId,
				name: "feature",
				color: "blue",
				sortOrder: 2.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: ossCommunityWsId,
				name: "good-first-issue",
				color: "green",
				sortOrder: 3.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: ossCommunityWsId,
				name: "documentation",
				color: "purple",
				sortOrder: 4.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: ossCommunityWsId,
				name: "help-wanted",
				color: "orange",
				sortOrder: 5.0,
				createdBy: kulId,
				createdAt: now,
			});

			const ossLibProjectId = await ctx.db.insert("projects", {
				workspaceId: ossCommunityWsId,
				name: "OpenUI Library",
				slug: "openui-library",
				description: "Open-source accessible UI component library for React.",
				status: "active",
				priority: "high",
				leadId: kulId,
				startDate: daysAgo(30),
				endDate: daysFromNow(120),
				intent: "delivery",
				structure: "kanban",
				sortOrder: 1.0,
				createdBy: kulId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: ossLibProjectId,
				userId: kulId,
				role: "owner",
				addedAt: daysAgo(30),
			});
			await ctx.db.insert("projectMembers", {
				projectId: ossLibProjectId,
				userId: alexId,
				role: "contributor",
				addedAt: daysAgo(28),
			});
			await ctx.db.insert("projectMembers", {
				projectId: ossLibProjectId,
				userId: jordanId,
				role: "contributor",
				addedAt: daysAgo(25),
			});

			await ctx.db.insert("milestones", {
				projectId: ossLibProjectId,
				name: "v1.0 Release",
				description:
					"Stable release with core components, docs site, and a11y audit.",
				targetDate: daysFromNow(45),
				sortOrder: 1.0,
				status: "active",
				createdBy: kulId,
			});

			const ossDocsProjectId = await ctx.db.insert("projects", {
				workspaceId: ossCommunityWsId,
				name: "Documentation Site",
				slug: "docs-site",
				description:
					"Docs site with component demos, API reference, and guides.",
				status: "active",
				priority: "medium",
				leadId: jordanId,
				startDate: daysAgo(14),
				endDate: daysFromNow(60),
				intent: "delivery",
				structure: "linear",
				sortOrder: 2.0,
				createdBy: jordanId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: ossDocsProjectId,
				userId: jordanId,
				role: "owner",
				addedAt: daysAgo(14),
			});

			await ctx.db.insert("milestones", {
				projectId: ossDocsProjectId,
				name: "Docs MVP",
				description:
					"Getting started guide, component API pages, and live examples.",
				targetDate: daysFromNow(30),
				sortOrder: 1.0,
				status: "active",
				createdBy: jordanId,
			});

			// OSS Community issues
			const ossIssue1Id = await ctx.db.insert("issues", {
				workspaceId: ossCommunityWsId,
				projectId: ossLibProjectId,
				identifier: "OS-1",
				title: "Add ARIA attributes to Dropdown component",
				description:
					"Ensure dropdown trigger, menu, and items have correct ARIA roles and keyboard navigation.",
				status: "in_progress",
				priority: "high",
				type: "feature",
				assigneeId: alexId,
				labelIds: [ossFeatureLabelId],
				startDate: daysAgo(3),
				dueDate: daysFromNow(5),
				sortOrder: 1.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCommunityWsId,
				projectId: ossLibProjectId,
				identifier: "OS-2",
				title: "Fix focus trap not working in Modal",
				description:
					"Tab key escapes the modal when shift-tabbing from the first focusable element.",
				status: "in_review",
				priority: "high",
				type: "bug",
				assigneeId: alexId,
				labelIds: [ossBugLabelId],
				startDate: daysAgo(2),
				sortOrder: 2.0,
				estimate: 3,
				createdBy: alexId,
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCommunityWsId,
				projectId: ossLibProjectId,
				identifier: "OS-3",
				title: "Create Tooltip component",
				description:
					"Accessible tooltip with configurable placement, delay, and keyboard dismiss.",
				status: "todo",
				priority: "medium",
				type: "feature",
				assigneeId: jordanId,
				labelIds: [ossFeatureLabelId],
				sortOrder: 3.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCommunityWsId,
				projectId: ossLibProjectId,
				identifier: "OS-4",
				title: "Build Toast notification system",
				description:
					"Stackable toast notifications with auto-dismiss, action buttons, and screen reader announcements.",
				status: "backlog",
				priority: "medium",
				type: "feature",
				labelIds: [ossFeatureLabelId],
				sortOrder: 4.0,
				estimate: 8,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCommunityWsId,
				projectId: ossLibProjectId,
				identifier: "OS-5",
				title: "Add dark mode support to all components",
				description:
					"Use CSS custom properties for theme tokens and add prefers-color-scheme support.",
				status: "done",
				priority: "high",
				type: "feature",
				assigneeId: jordanId,
				labelIds: [ossFeatureLabelId],
				startDate: daysAgo(10),
				sortOrder: 5.0,
				estimate: 8,
				createdBy: jordanId,
				completedAt: daysAgo(3),
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCommunityWsId,
				projectId: ossDocsProjectId,
				identifier: "OS-6",
				title: "Write getting started guide",
				description: "Installation, basic usage, and first component tutorial.",
				status: "in_progress",
				priority: "high",
				type: "issue",
				assigneeId: jordanId,
				startDate: daysAgo(4),
				sortOrder: 6.0,
				estimate: 5,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCommunityWsId,
				projectId: ossDocsProjectId,
				identifier: "OS-7",
				title: "Build live component playground",
				description:
					"Interactive code editor with live preview for each component page.",
				status: "todo",
				priority: "medium",
				type: "feature",
				assigneeId: alexId,
				sortOrder: 7.0,
				estimate: 8,
				createdBy: jordanId,
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCommunityWsId,
				projectId: ossLibProjectId,
				identifier: "OS-8",
				title: "Run accessibility audit with axe-core",
				description:
					"Automated a11y testing for all components with axe-core integration in CI.",
				status: "todo",
				priority: "high",
				type: "issue",
				assigneeId: alexId,
				sortOrder: 8.0,
				estimate: 5,
				createdBy: kulId,
			});

			// OSS Community comments
			await ctx.db.insert("comments", {
				issueId: ossIssue1Id,
				body: "I'm following the WAI-ARIA authoring practices for menu buttons. The combobox pattern might be better for searchable dropdowns though.",
				authorId: alexId,
			});

			await ctx.db.insert("comments", {
				issueId: ossIssue1Id,
				body: "Good call. Let's keep this issue for basic dropdown and create a separate one for combobox/searchable variant.",
				authorId: kulId,
			});

			await ctx.db.insert("comments", {
				issueId: ossIssue1Id,
				body: "I can handle the visual design for both variants once the ARIA structure is settled.",
				authorId: jordanId,
			});

			console.log("[devSeed] OSS Community: 8 issues, 3 comments");

			// OSS - Core Team workspace
			const ossCoreWsId = await ctx.db.insert("workspaces", {
				name: "Core Team",
				slug: "oss-core",
				ownerId: kulId,
				organizationId: ossOrgId,
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId: ossCoreWsId,
				issuePrefix: "CT",
				nextIssueNumber: 1,
				storyPrefix: "CT",
				nextStoryNumber: 1,
				taskPrefix: "TSK",
				nextTaskNumber: 1,
			});

			await ctx.db.insert("workspaceMembers", {
				workspaceId: ossCoreWsId,
				userId: kulId,
				role: "admin",
				joinedAt: daysAgo(14),
			});
			await ctx.db.insert("workspaceMembers", {
				workspaceId: ossCoreWsId,
				userId: alexId,
				role: "admin",
				joinedAt: daysAgo(14),
			});

			await ctx.db.insert("labels", {
				workspaceId: ossCoreWsId,
				name: "infra",
				color: "red",
				sortOrder: 1.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: ossCoreWsId,
				name: "release",
				color: "blue",
				sortOrder: 2.0,
				createdBy: kulId,
				createdAt: now,
			});
			await ctx.db.insert("labels", {
				workspaceId: ossCoreWsId,
				name: "governance",
				color: "purple",
				sortOrder: 3.0,
				createdBy: kulId,
				createdAt: now,
			});

			const ctReleasesProjectId = await ctx.db.insert("projects", {
				workspaceId: ossCoreWsId,
				name: "Release Management",
				slug: "release-management",
				description: "Versioning, changelogs, and release coordination.",
				status: "active",
				priority: "high",
				leadId: kulId,
				startDate: daysAgo(7),
				endDate: daysFromNow(90),
				intent: "delivery",
				structure: "linear",
				sortOrder: 1.0,
				createdBy: kulId,
			});
			await ctx.db.insert("projectMembers", {
				projectId: ctReleasesProjectId,
				userId: kulId,
				role: "owner",
				addedAt: daysAgo(7),
			});
			await ctx.db.insert("projectMembers", {
				projectId: ctReleasesProjectId,
				userId: alexId,
				role: "contributor",
				addedAt: daysAgo(7),
			});

			await ctx.db.insert("milestones", {
				projectId: ctReleasesProjectId,
				name: "Release Pipeline",
				description:
					"Automated release pipeline with changesets and npm publish.",
				targetDate: daysFromNow(14),
				sortOrder: 1.0,
				status: "active",
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCoreWsId,
				projectId: ctReleasesProjectId,
				identifier: "CT-1",
				title: "Set up changeset-based versioning",
				description:
					"Configure @changesets/cli for semantic versioning and changelog generation.",
				status: "done",
				priority: "high",
				type: "feature",
				assigneeId: kulId,
				startDate: daysAgo(5),
				sortOrder: 1.0,
				estimate: 3,
				createdBy: kulId,
				completedAt: daysAgo(2),
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCoreWsId,
				projectId: ctReleasesProjectId,
				identifier: "CT-2",
				title: "Automate npm publish in CI",
				description:
					"GitHub Action to publish to npm on merge to main when changesets are present.",
				status: "in_progress",
				priority: "high",
				type: "feature",
				assigneeId: alexId,
				startDate: daysAgo(2),
				sortOrder: 2.0,
				estimate: 5,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCoreWsId,
				projectId: ctReleasesProjectId,
				identifier: "CT-3",
				title: "Draft CONTRIBUTING.md guidelines",
				description:
					"Write contribution guide covering PR process, code style, and testing requirements.",
				status: "todo",
				priority: "medium",
				type: "issue",
				assigneeId: kulId,
				sortOrder: 3.0,
				estimate: 3,
				createdBy: kulId,
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCoreWsId,
				projectId: ctReleasesProjectId,
				identifier: "CT-4",
				title: "Add code of conduct",
				description:
					"Adopt Contributor Covenant and add enforcement guidelines.",
				status: "done",
				priority: "medium",
				type: "issue",
				assigneeId: kulId,
				startDate: daysAgo(6),
				sortOrder: 4.0,
				estimate: 1,
				createdBy: kulId,
				completedAt: daysAgo(5),
			});

			await ctx.db.insert("issues", {
				workspaceId: ossCoreWsId,
				projectId: ctReleasesProjectId,
				identifier: "CT-5",
				title: "Set up issue and PR templates",
				description:
					"Create GitHub issue templates for bug reports, feature requests, and PR template.",
				status: "todo",
				priority: "low",
				type: "issue",
				sortOrder: 5.0,
				estimate: 2,
				createdBy: kulId,
			});

			console.log("[devSeed] OSS Core: 5 issues");
		} // end new orgs guard

		const ensuredArtifacts = await ensureClaveE2EArtifacts();
		if (ensuredArtifacts.workspaceFound && ensuredArtifacts.projectFound) {
			console.log(
				`[devSeed] Ensured Clave e2e fixtures: Test Document ${ensuredArtifacts.documentInserted ? "inserted" : "already present"}, Untitled whiteboard ${ensuredArtifacts.whiteboardInserted ? "inserted" : "already present"}.`,
			);
		} else {
			console.log(
				"[devSeed] Could not ensure Clave e2e fixtures (missing clave-hq workspace or clave-platform-v1 project).",
			);
		}

		console.log(
			"[devSeed] Full seed complete! 5 organizations, 10 workspaces.",
		);
	},
});

// ── Clear Seed ──────────────────────────────────────────────────────────────

export const clearSeed = internalMutation({
	args: {},
	handler: async (ctx) => {
		// ── Helper: clear all data for a workspace ────────────────────────
		async function clearWorkspace(wsSlug: string) {
			const workspace = await ctx.db
				.query("workspaces")
				.withIndex("by_slug", (q) => q.eq("slug", wsSlug))
				.unique();

			if (!workspace) return;

			const workspaceId = workspace._id;
			console.log(`[devSeed] Clearing workspace '${wsSlug}'...`);

			// Collect workspace member user IDs
			const members = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
				.collect();
			const memberUserIds = members.map((m) => m.userId);

			// Delete notifications
			for (const userId of memberUserIds) {
				const userNotifs = await ctx.db
					.query("notifications")
					.withIndex("by_user_workspace", (q) =>
						q.eq("userId", userId).eq("workspaceId", workspaceId),
					)
					.collect();
				for (const n of userNotifs) {
					await ctx.db.delete(n._id);
				}
			}

			// Delete comments and relations on issues
			const issues = await ctx.db
				.query("issues")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
				.collect();

			for (const issue of issues) {
				const comments = await ctx.db
					.query("comments")
					.withIndex("by_issue", (q) => q.eq("issueId", issue._id))
					.collect();
				for (const c of comments) {
					await ctx.db.delete(c._id);
				}
				const rels = await ctx.db
					.query("issueRelations")
					.withIndex("by_issue", (q) => q.eq("issueId", issue._id))
					.collect();
				for (const r of rels) {
					await ctx.db.delete(r._id);
				}
			}

			// Delete issues
			for (const issue of issues) {
				await ctx.db.delete(issue._id);
			}

			// Delete milestones, project members, sprints, projects
			const projects = await ctx.db
				.query("projects")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
				.collect();

			for (const project of projects) {
				const milestones = await ctx.db
					.query("milestones")
					.withIndex("by_project", (q) => q.eq("projectId", project._id))
					.collect();
				for (const m of milestones) {
					await ctx.db.delete(m._id);
				}
				const projectMembers = await ctx.db
					.query("projectMembers")
					.withIndex("by_project", (q) => q.eq("projectId", project._id))
					.collect();
				for (const pm of projectMembers) {
					await ctx.db.delete(pm._id);
				}
				const sprints = await ctx.db
					.query("sprints")
					.withIndex("by_project", (q) => q.eq("projectId", project._id))
					.collect();
				for (const sprint of sprints) {
					await ctx.db.delete(sprint._id);
				}
			}

			for (const p of projects) {
				await ctx.db.delete(p._id);
			}

			// Delete legacy stories and tasks (backward compat)
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
			for (const s of stories) {
				await ctx.db.delete(s._id);
			}

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
			for (const t of tasks) {
				await ctx.db.delete(t._id);
			}

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

			// Delete labels
			const labels = await ctx.db
				.query("labels")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
				.collect();
			for (const l of labels) {
				await ctx.db.delete(l._id);
			}

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
			console.log(`[devSeed] Deleted workspace '${wsSlug}'`);
		}

		// ── Helper: clear an organization and its workspaces ──────────────
		async function clearOrganization(orgSlug: string) {
			const org = await ctx.db
				.query("organizations")
				.withIndex("by_slug", (q) => q.eq("slug", orgSlug))
				.unique();

			if (!org) return;

			// Find all workspaces belonging to this org
			const orgWorkspaces = await ctx.db
				.query("workspaces")
				.withIndex("by_organization", (q) => q.eq("organizationId", org._id))
				.collect();

			// Clear each workspace
			for (const ws of orgWorkspaces) {
				await clearWorkspace(ws.slug);
			}

			// Delete org members
			const orgMembers = await ctx.db
				.query("organizationMembers")
				.withIndex("by_org", (q) => q.eq("organizationId", org._id))
				.collect();
			for (const om of orgMembers) {
				await ctx.db.delete(om._id);
			}

			// Delete invite codes
			const inviteCodes = await ctx.db
				.query("organizationInviteCodes")
				.withIndex("by_org", (q) => q.eq("organizationId", org._id))
				.collect();
			for (const ic of inviteCodes) {
				await ctx.db.delete(ic._id);
			}

			await ctx.db.delete(org._id);
			console.log(`[devSeed] Deleted organization '${orgSlug}'`);
		}

		// ── Clear all 5 organizations ────────────────────────────────────
		const orgSlugs = [
			"clave",
			"z360",
			"nexus-corp",
			"indie-studio",
			"oss-collective",
		];

		let anyFound = false;
		for (const slug of orgSlugs) {
			const org = await ctx.db
				.query("organizations")
				.withIndex("by_slug", (q) => q.eq("slug", slug))
				.unique();
			if (org) {
				anyFound = true;
			}
		}

		if (!anyFound) {
			console.log("[devSeed] No seed organizations found, nothing to clear.");
			return;
		}

		console.log("[devSeed] Clearing all seed data...");

		for (const slug of orgSlugs) {
			await clearOrganization(slug);
		}

		// Clear auth tables to prevent stale credential/session state between runs.
		// This mutation is dev-only and intended for deterministic local/E2E reset.
		const authVerificationCodes = await ctx.db
			.query("authVerificationCodes")
			.collect();
		for (const code of authVerificationCodes) {
			await ctx.db.delete(code._id);
		}

		const authRefreshTokens = await ctx.db.query("authRefreshTokens").collect();
		for (const token of authRefreshTokens) {
			await ctx.db.delete(token._id);
		}

		const authSessions = await ctx.db.query("authSessions").collect();
		for (const session of authSessions) {
			await ctx.db.delete(session._id);
		}

		const authVerifiers = await ctx.db.query("authVerifiers").collect();
		for (const verifier of authVerifiers) {
			await ctx.db.delete(verifier._id);
		}

		const authRateLimits = await ctx.db.query("authRateLimits").collect();
		for (const rateLimit of authRateLimits) {
			await ctx.db.delete(rateLimit._id);
		}

		const authAccounts = await ctx.db.query("authAccounts").collect();
		for (const account of authAccounts) {
			await ctx.db.delete(account._id);
		}

		console.log(
			`[devSeed] Cleared auth tables: ${authAccounts.length} accounts, ${authSessions.length} sessions, ${authRefreshTokens.length} refresh tokens, ${authVerificationCodes.length} verification codes, ${authVerifiers.length} verifiers, ${authRateLimits.length} rate limits.`,
		);

		// Collect all seed user emails and delete users now that auth accounts are gone.
		const seedEmails = [
			"kul@goclave.app",
			"alex@goclave.app",
			"jordan@goclave.app",
		];
		let deletedUsers = 0;
		for (const email of seedEmails) {
			const users = await ctx.db
				.query("users")
				.withIndex("by_email", (q) => q.eq("email", email))
				.collect();
			for (const user of users) {
				await ctx.db.delete(user._id);
				deletedUsers++;
			}
		}
		console.log(
			`[devSeed] Deleted ${deletedUsers} seed users (searched ${seedEmails.length} seed emails).`,
		);

		console.log("[devSeed] Clear complete!");
	},
});
