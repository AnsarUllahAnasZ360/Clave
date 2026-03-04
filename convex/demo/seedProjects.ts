/**
 * Demo Workspace — Phase 2: Seed Projects
 *
 * Creates 20 projects with milestones, sprints, project members,
 * project updates, clients, and client contacts.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { DEMO_CLIENTS, DEMO_PROJECTS, daysAgo, daysFromNow } from "./constants";

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function pickRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

// Project update templates keyed by project index for realistic content
const PROJECT_UPDATES: Record<number, string[]> = {
	0: [
		"Sprint 2 is progressing well. The GraphQL layer is 80% complete with all core resolvers implemented. Subscription support is the remaining piece before we can close out this sprint.",
		"API v2 Beta milestone is on track. Migration guides are drafted and shared with early adopters. Two breaking changes flagged by TechStream — working on backward-compatible alternatives.",
	],
	1: [
		"Widget framework architecture finalized. Drag-and-drop is smooth in user testing. Core widgets sprint is underway — chart and table widgets done, KPI cards next.",
		"Dashboard load time reduced to 600ms with the new streaming approach. GreenField Digital gave positive feedback on the layout engine during last week's review.",
	],
	2: [
		"TestFlight beta has 15 internal testers. Core navigation and auth flow are stable. Push notifications working on real devices. Two crashes identified in offline sync — investigating.",
		"Biometric auth approved by Apple review guidelines. Deep linking implemented for all main routes. Sprint 2 progressing on schedule.",
	],
	3: [
		"Android foundation is solid. Jetpack Compose screens are rendering correctly across test devices. Material You theming applied to all core components.",
		"Offline storage layer using Room is performing well in benchmarks. Push notification setup with FCM complete. Feature parity tracking at 70% with iOS.",
	],
	4: [
		"Stripe integration is complete and tested. Webhook handling for all subscription lifecycle events working reliably. Invoice generation supports 15 currencies.",
		"Billing portal UI is 60% complete. Self-service plan changes, invoice download, and payment method management implemented. Tax calculation integration with TaxJar pending.",
	],
	5: [
		"Ingestion pipeline handles 2M events/day in load testing — well above the 1M target. Kafka consumer lag stays under 100ms. ClickHouse queries averaging 800ms for complex aggregations.",
		"Funnel analysis feature is the highlight of Sprint 2. Real-time rollups for minute and hour granularity are stable. Custom dimension support added for flexible slicing.",
	],
	6: [
		"User research complete — 12 interviews conducted. Three key personas identified. Welcome wizard wireframes approved by the team. Interactive tour prototype shared with GreenField for feedback.",
		"Template gallery has 15 starter templates. Role-based setup wizard covers 4 roles: developer, designer, PM, and executive. Checklist widget shows 78% completion rate in early testing.",
	],
	7: [
		"Sprint 1 planning complete. User management stories scoped and estimated. Impersonation feature requires additional security review — scheduled for next week.",
		"Feature flag system evaluated three options: LaunchDarkly, Unleash, custom. Recommending custom build for tighter integration. Design mockups for the admin dashboard reviewed.",
	],
	8: [
		"Jenkins migration is 90% complete — 47 of 52 jobs migrated to GitHub Actions. Matrix builds for Node 18/20/22 running in parallel. Build times reduced from 18min to 7min.",
		"Canary deployment proof of concept working. Traffic split at 5/95 with automatic rollback on error rate > 1%. Deployed to staging for the past week with zero incidents.",
	],
	9: [
		"Indexing pipeline design finalized. Content crawler covers issues, docs, and boards. Vector embeddings using OpenAI text-embedding-3-small. Estimated index size: 2GB for full workspace.",
		"Command palette search prototype built. Fuzzy matching plus semantic search provides much better results than the current exact-match search. Demo scheduled for Friday.",
	],
	10: [
		"Multi-channel delivery system live in staging. Email via Resend, push via FCM, and in-app real-time all working. Channel routing logic handles user preferences correctly.",
		"Smart batching algorithm groups related notifications into 5-minute windows. Digest email template finalized. Slack webhook integration tested with the team workspace.",
	],
	11: [
		"Data component set expanding. Charts component supports line, bar, area, and pie. DataTable handles virtual scrolling for 10K+ rows. All components pass WCAG AA contrast checks.",
		"Figma token sync pipeline established. Design changes in Figma propagate to code tokens within the CI pipeline. Storybook coverage at 85% of all components.",
	],
	12: [
		"Bundle analysis complete. Identified 3 large dependencies for replacement. Code splitting strategy reduces initial bundle from 450KB to 180KB gzipped. Lazy loading applied to all route-level components.",
		"Database query optimization yielded significant gains. Top 10 slow queries optimized with proper indexing. API p95 dropped from 340ms to 140ms. CDN caching strategy covers static assets and API responses.",
	],
	13: [
		"Vulnerability assessment complete. 3 medium, 12 low findings. Zero critical or high vulnerabilities. Dependency audit flagged 2 packages with known CVEs — patches applied same day.",
		"SOC 2 documentation 60% complete. Evidence collection automated for 70% of controls. Secret rotation script runs weekly. Penetration test scheduled for next Tuesday.",
	],
	14: [
		"API reference auto-generation pipeline working with OpenAPI spec. All 85 endpoints documented with request/response examples. Interactive playground prototype handles auth flows.",
		"Getting started guide draft complete. Authentication and webhook guides in review. Estimated time-to-first-API-call reduced from 45 minutes to 12 minutes based on user testing.",
	],
	15: [
		"Python SDK architecture defined. Pydantic v2 models for all API resources. Async client using httpx. Type stubs pass mypy strict mode.",
		"Sprint 1 kickoff. HTTP client foundation and OAuth flow implementation underway. Targeting PyPI alpha release by end of sprint.",
	],
	16: [
		"v1.0 milestone on track. All resource classes implemented. Auto-generated TypeScript types cover 100% of the API surface. Bundle size at 3.8KB gzipped — well under the 5KB target.",
		"Webhook helper utilities complete. Signature verification, event parsing, and retry handling all tested. npm package published as beta — 200+ downloads in first week.",
	],
	17: [
		"Migration toolkit v1.0 shipped and in use by 3 customers. CSV and JSON importers handle edge cases well. Average migration time for 500K records: 22 minutes.",
		"Post-completion retrospective complete. Key learnings documented. Toolkit handed off to support team for ongoing maintenance.",
	],
	18: [
		"Structured logging rollout complete across all services. Log aggregation in Grafana Loki working well. Search performance is excellent for debugging production issues.",
		"PagerDuty integration live. Alert rules cover API errors, latency spikes, and resource exhaustion. Escalation policies configured. Three runbooks published for common incidents.",
	],
	19: [
		"Accessibility audit complete using axe-core and manual testing. 47 issues identified across 12 pages. Color contrast fixes applied to all buttons and text elements.",
		"Keyboard navigation audit in progress. Tab order fixed on 8 of 12 pages. Screen reader testing scheduled with an external accessibility consultant next week.",
	],
};

// ── Main Seed Function ───────────────────────────────────────────────────────

export const seedAllProjects = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		creatorUserId: v.id("users"),
		userIds: v.array(v.id("users")),
		labelIds: v.array(v.id("labels")),
	},
	handler: async (
		ctx,
		{ workspaceId, creatorUserId, userIds, labelIds },
	) => {
		const projectIds: Id<"projects">[] = [];
		const allMilestoneIds: Id<"milestones">[] = [];
		const allSprintIds: Id<"sprints">[] = [];
		const projectMeta: {
			projectIndex: number;
			milestoneIds: Id<"milestones">[];
			sprintIds: Id<"sprints">[];
		}[] = [];

		// ── Create 20 Projects ──────────────────────────────────────────────

		for (let i = 0; i < DEMO_PROJECTS.length; i++) {
			const project = DEMO_PROJECTS[i];
			const leadId = userIds[project.leadIndex];
			const createdByUser = userIds[pickRandom(project.memberIndices)];

			const projectId = await ctx.db.insert("projects", {
				workspaceId,
				name: project.name,
				slug: slugify(project.name),
				description: project.description,
				summary: project.summary,
				icon: project.icon,
				color: project.color,
				status: project.status,
				priority: project.priority,
				structure: project.structure,
				intent: project.intent,
				scopeInItems: project.scopeInItems,
				scopeOutItems: project.scopeOutItems,
				outcomes: project.outcomes,
				tags: project.tags,
				startDate: daysAgo(project.startDaysAgo),
				endDate: daysFromNow(project.endDaysFromNow),
				leadId,
				sortOrder: i,
				createdBy: createdByUser,
			});
			projectIds.push(projectId);

			// ── Project Members ─────────────────────────────────────────────

			for (let m = 0; m < project.memberIndices.length; m++) {
				const memberUserId = userIds[project.memberIndices[m]];
				await ctx.db.insert("projectMembers", {
					projectId,
					userId: memberUserId,
					role: m === 0 ? "owner" : "contributor",
					addedAt: daysAgo(Math.floor(Math.random() * 60) + 30),
				});
			}

			// ── Milestones ──────────────────────────────────────────────────

			const projectMilestoneIds: Id<"milestones">[] = [];
			for (let m = 0; m < project.milestones.length; m++) {
				const milestone = project.milestones[m];
				const milestoneId = await ctx.db.insert("milestones", {
					projectId,
					name: milestone.name,
					description: milestone.description,
					icon: milestone.icon,
					status: milestone.status,
					startDate: daysAgo(milestone.startDaysAgo),
					targetDate: daysFromNow(milestone.targetDaysFromNow),
					sortOrder: m,
					createdBy: leadId,
				});
				projectMilestoneIds.push(milestoneId);
				allMilestoneIds.push(milestoneId);
			}

			// ── Sprints ─────────────────────────────────────────────────────

			const projectSprintIds: Id<"sprints">[] = [];
			for (let s = 0; s < project.sprints.length; s++) {
				const sprint = project.sprints[s];
				const sprintId = await ctx.db.insert("sprints", {
					projectId,
					name: sprint.name,
					description: sprint.description,
					status: sprint.status,
					goals: sprint.goals,
					startDate: daysAgo(sprint.startDaysAgo),
					targetDate: daysFromNow(sprint.targetDaysFromNow),
					endDate:
						sprint.status === "completed"
							? daysFromNow(sprint.targetDaysFromNow)
							: undefined,
					sortOrder: s,
					createdBy: leadId,
				});
				projectSprintIds.push(sprintId);
				allSprintIds.push(sprintId);
			}

			// ── Project Updates ─────────────────────────────────────────────

			const updates = PROJECT_UPDATES[i];
			if (updates && project.status !== "completed") {
				for (const body of updates) {
					const health = pickRandom(["on_track", "at_risk"] as const);
					await ctx.db.insert("projectUpdates", {
						projectId,
						health,
						body,
						createdBy: leadId,
					});
				}
			}

			projectMeta.push({
				projectIndex: i,
				milestoneIds: projectMilestoneIds,
				sprintIds: projectSprintIds,
			});
		}

		// ── Create 8 Clients ────────────────────────────────────────────────

		for (const client of DEMO_CLIENTS) {
			const clientOwner = userIds[Math.floor(Math.random() * userIds.length)];
			const clientCreator = userIds[Math.floor(Math.random() * userIds.length)];

			const clientId = await ctx.db.insert("clients", {
				workspaceId,
				name: client.name,
				status: client.status,
				industry: client.industry,
				website: client.website,
				location: client.location,
				segment: client.segment,
				notes: client.notes,
				ownerId: clientOwner,
				createdBy: clientCreator,
			});

			// Create contacts
			for (const contact of client.contacts) {
				await ctx.db.insert("clientContacts", {
					clientId,
					name: contact.name,
					email: contact.email,
					role: contact.role,
					isPrimary: contact.isPrimary,
					createdBy: clientCreator,
				});
			}

			// Link projects to this client
			for (const projectIndex of client.projectIndices) {
				if (projectIndex < projectIds.length) {
					await ctx.db.patch(projectIds[projectIndex], {
						clientId,
					});
				}
			}
		}

		// ── Schedule Phase 3: Issues ────────────────────────────────────────

		await ctx.scheduler.runAfter(0, internal.demo.seedIssues.seedIssuesBatch1, {
			workspaceId,
			creatorUserId,
			userIds,
			labelIds,
			projectIds,
			milestoneIds: allMilestoneIds,
			sprintIds: allSprintIds,
			projectMeta,
		});
	},
});
