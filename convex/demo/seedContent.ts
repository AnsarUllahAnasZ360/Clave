/**
 * Demo Workspace — Phase 4: Seed Content
 *
 * Creates documents, whiteboards, comments, notifications, activity logs,
 * AI config, tasks, favorites, recents, and chat thread metadata.
 *
 * Three chained internalMutations:
 *   1. seedDocumentsAndBoards — 50 documents + 100 whiteboards
 *   2. seedSocialData — comments, notifications, activity logs
 *   3. seedAIAndFinalize — AI teammates, sub-agents, skills, tasks, favorites, recents, threads
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { DEMO_PROJECTS, daysAgo } from "./constants";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN<T>(arr: T[], n: number): T[] {
	const shuffled = [...arr].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, n);
}

// ── Document Content Templates ───────────────────────────────────────────────

const PRD_DOCS = [
	{
		title: "Core API v2 Requirements",
		icon: "📋",
		projectIndex: 0,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Core API v2 Requirements" }] },
			{
				type: "p",
				children: [
					{
						text: "This document outlines the requirements for the Core API v2, which will serve as the foundational layer for all Velocity Labs products. The API must support both REST and GraphQL interfaces while maintaining backward compatibility with existing v1 clients.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Goals" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Maintain 99.9% uptime with graceful degradation during incidents",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Achieve sub-100ms p95 latency for all read endpoints",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Support rate limiting per API key with configurable tiers",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Provide comprehensive OpenAPI 3.1 specification for all endpoints",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Authentication" }] },
			{
				type: "p",
				children: [
					{
						text: "The v2 API will migrate from session-based auth to JWT tokens with refresh token rotation. This enables stateless authentication at the edge and reduces database load during auth checks. All tokens will use RS256 signing with key rotation every 90 days.",
					},
				],
			},
			{ type: "h3", children: [{ text: "Token Lifecycle" }] },
			{
				type: "p",
				children: [
					{
						text: "Access tokens expire after 15 minutes. Refresh tokens are valid for 7 days with sliding window extension. Each refresh token can only be used once — reuse triggers automatic revocation of the entire token family as a security measure.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Rate Limiting" }] },
			{
				type: "p",
				children: [
					{
						text: "We will implement a sliding window rate limiter backed by Redis. Each API key belongs to a tier that determines its rate limits. The default tiers are: Free (100 req/min), Pro (1000 req/min), and Enterprise (10000 req/min). Rate limit headers will follow the IETF draft standard.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Non-Goals" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Frontend integration details — handled by SDK teams",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Mobile SDK bindings — separate project scope",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Dashboard Widget Framework PRD",
		icon: "📊",
		projectIndex: 1,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Dashboard Widget Framework PRD" }],
			},
			{
				type: "p",
				children: [
					{
						text: "The widget framework enables customers to build and customize their analytics dashboards using pre-built and custom widgets. Each widget operates independently, fetches its own data, and can be positioned freely on a responsive grid layout.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Widget Types" }] },
			{
				type: "p",
				children: [
					{
						text: "We will ship 8 core widget types at launch: Line Chart, Bar Chart, Area Chart, Pie Chart, Data Table, KPI Card, Activity Feed, and Custom HTML. Each widget supports light and dark themes, responsive sizing, and data refresh intervals configurable per widget.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Layout Engine" }] },
			{
				type: "p",
				children: [
					{
						text: "The layout uses a 12-column grid with drag-and-drop positioning. Widgets snap to grid cells and support resize handles on all edges. Layouts are persisted per-user and can be shared as templates. The engine supports breakpoints for tablet and mobile viewports with automatic reflow.",
					},
				],
			},
			{ type: "h3", children: [{ text: "Performance Requirements" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Dashboard must render within 600ms including all widget data",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Drag operations must maintain 60fps with no jank",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Support up to 20 widgets per dashboard without degradation",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Mobile Push Notifications PRD",
		icon: "🔔",
		projectIndex: 2,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Mobile Push Notifications PRD" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Push notifications are critical for user engagement in the mobile apps. This PRD defines the notification types, delivery channels, and user preference controls for both iOS and Android platforms.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Notification Categories" }] },
			{
				type: "p",
				children: [
					{
						text: "Notifications are grouped into categories: Assignments (issue assigned, task assigned), Updates (status changed, comment added, document edited), Mentions (@user in comments or docs), and System (maintenance windows, new features). Each category has independent enable/disable controls.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Delivery Strategy" }] },
			{
				type: "p",
				children: [
					{
						text: "Notifications use APNs for iOS and FCM for Android. A smart batching algorithm groups related notifications into digests when the user receives more than 5 notifications within a 10-minute window. Silent notifications update badges without interrupting the user.",
					},
				],
			},
		]),
	},
	{
		title: "Payment Integration Requirements",
		icon: "💰",
		projectIndex: 4,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Payment Integration Requirements" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Velocity Labs needs a robust billing system to support subscription-based pricing with usage-based overages. Stripe is the chosen payment processor, providing subscription management, invoicing, and webhook-driven state synchronization.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Subscription Plans" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Free: 5 users, 1 workspace, 100 AI messages/month, 1GB storage",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Pro ($15/user/month): Unlimited workspaces, 5000 AI messages, 50GB storage, priority support",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Enterprise (custom): SSO, SAML, audit logs, dedicated support, SLA guarantee",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Webhook Events" }] },
			{
				type: "p",
				children: [
					{
						text: "The system must handle all Stripe subscription lifecycle events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed. Each event triggers a Convex mutation to update the organization's billing state.",
					},
				],
			},
		]),
	},
	{
		title: "Analytics Pipeline Requirements",
		icon: "📈",
		projectIndex: 5,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Analytics Pipeline Requirements" }],
			},
			{
				type: "p",
				children: [
					{
						text: "The analytics engine must process millions of events per day with low-latency query support. Events flow from the ingestion API through Kafka into ClickHouse for storage and aggregation. Real-time rollups provide minute-level granularity for the last 24 hours.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Event Schema" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [
							{
								text: "interface AnalyticsEvent {\n  eventId: string;\n  eventType: string;\n  timestamp: number;\n  userId: string;\n  properties: Record<string, string | number | boolean>;\n  context: {\n    ip: string;\n    userAgent: string;\n    referrer?: string;\n  };\n}",
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Query Performance" }] },
			{
				type: "p",
				children: [
					{
						text: "Target query latency is under 5 seconds for any aggregation over a 30-day window. Pre-computed materialized views handle the most common queries (daily active users, event counts by type, funnel conversion rates). Custom queries use ClickHouse SQL with query cost estimation.",
					},
				],
			},
		]),
	},
	{
		title: "Onboarding Flow Requirements",
		icon: "👋",
		projectIndex: 6,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Onboarding Flow Requirements" }],
			},
			{
				type: "p",
				children: [
					{
						text: "The redesigned onboarding must reduce time-to-value to under 5 minutes. New users should see value from the platform before being asked to complete their profile. The flow adapts based on the user's role selection during signup.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Flow Steps" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Welcome screen with role selection (Developer, Designer, PM, Executive)",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Workspace creation with template gallery (blank, software team, agency, startup)",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Interactive product tour highlighting key features for selected role",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "First project creation with sample data pre-populated",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Invite team members dialog with link sharing",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Admin Console Requirements",
		icon: "🛡️",
		projectIndex: 7,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Admin Console Requirements" }],
			},
			{
				type: "p",
				children: [
					{
						text: "The internal admin console provides operations staff with tools to manage users, organizations, feature flags, and system health. Access is restricted to Velocity Labs employees with the admin role.",
					},
				],
			},
			{ type: "h2", children: [{ text: "User Management" }] },
			{
				type: "p",
				children: [
					{
						text: "Admins can search users by name, email, or organization. User detail pages show account status, recent activity, organization memberships, and billing history. Suspend and unsuspend actions require confirmation and create audit log entries. Impersonation allows admins to see the platform as a specific user without modifying any data.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Feature Flags" }] },
			{
				type: "p",
				children: [
					{
						text: "Feature flags control rollout of new features. Flags support targeting by organization, user, plan tier, and percentage rollout. Changes to flag state are logged and auditable. Emergency kill switches can disable features across all users in under 30 seconds.",
					},
				],
			},
		]),
	},
	{
		title: "Search Engine Requirements",
		icon: "🔍",
		projectIndex: 9,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Search Engine Requirements" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Full-text search across all workspace content types: issues, documents, whiteboards, chat messages, and comments. The search combines traditional keyword matching with semantic vector search for improved relevance on natural language queries.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Indexing Strategy" }] },
			{
				type: "p",
				children: [
					{
						text: "Content is indexed incrementally using change data capture. Each content type has a dedicated indexer that extracts searchable text, generates vector embeddings using text-embedding-3-small, and stores them in the vector index. The indexing pipeline processes changes within 60 seconds of the mutation.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Search API" }] },
			{
				type: "p",
				children: [
					{
						text: "The search API accepts a query string and optional filters (content type, project, date range, author). Results are ranked by a composite score combining BM25 text relevance and cosine similarity of vector embeddings. Results include highlighted snippets showing where the query matched.",
					},
				],
			},
		]),
	},
	{
		title: "Notification System v2 PRD",
		icon: "📡",
		projectIndex: 10,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Notification System v2 PRD" }],
			},
			{
				type: "p",
				children: [
					{
						text: "The notification system v2 replaces the current fire-and-forget approach with a multi-channel delivery system featuring smart batching, user preferences, and delivery guarantees. Channels include email (Resend), push (FCM/APNs), in-app real-time, and Slack webhooks.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Smart Batching" }] },
			{
				type: "p",
				children: [
					{
						text: "When a user receives multiple notifications within a configurable window (default 5 minutes), they are grouped into a digest. The digest summarizes the notifications by type and includes direct links to each item. Users can configure their batching preferences per channel.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Delivery Guarantees" }] },
			{
				type: "p",
				children: [
					{
						text: "Each notification has a delivery state machine: created -> queued -> sent -> delivered/failed. Failed deliveries are retried with exponential backoff up to 3 attempts. Permanent failures (invalid push token, bounced email) trigger cleanup of the delivery endpoint.",
					},
				],
			},
		]),
	},
	{
		title: "Design System Component Library PRD",
		icon: "🎨",
		projectIndex: 11,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Design System Component Library PRD" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Orbit UI is Velocity Labs' shared design system providing React components, design tokens, and documentation. All customer-facing products must use Orbit UI components to ensure visual consistency and accessibility compliance.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Component Categories" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Primitives: Button, Input, Select, Checkbox, Radio, Switch, Textarea",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Layout: Stack, Grid, Container, Divider, Spacer",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Feedback: Toast, Alert, Dialog, Tooltip, Progress",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Data Display: Table, DataTable, Chart, KPI Card, Badge, Avatar",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Navigation: Tabs, Sidebar, Breadcrumb, Pagination, CommandPalette",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Design Tokens" }] },
			{
				type: "p",
				children: [
					{
						text: "Design tokens are managed in Figma and synced to code via Style Dictionary. Tokens cover colors, typography, spacing, shadows, and border radii. The token pipeline generates CSS custom properties, Tailwind config, and TypeScript constants from a single source of truth.",
					},
				],
			},
		]),
	},
];

const TECH_DESIGN_DOCS = [
	{
		title: "Authentication Architecture",
		icon: "🔐",
		projectIndex: 0,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Authentication Architecture" }] },
			{
				type: "p",
				children: [
					{
						text: "This document describes the authentication architecture for API v2. The system uses asymmetric JWT tokens (RS256) for stateless authentication with refresh token rotation for session management.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Token Flow" }] },
			{
				type: "p",
				children: [
					{
						text: "The client obtains an access token via the OAuth 2.0 authorization code flow or API key exchange. Access tokens contain the user ID, organization ID, and permission scopes as JWT claims. The token is validated at the API gateway using the public key without any database queries.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Key Rotation" }] },
			{
				type: "p",
				children: [
					{
						text: "Signing keys are rotated every 90 days. The JWKS endpoint serves both current and previous keys to handle the transition period. A background job generates the new key pair 7 days before rotation and publishes it to the JWKS endpoint as an inactive key.",
					},
				],
			},
			{ type: "h3", children: [{ text: "Security Considerations" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Refresh token reuse detection triggers automatic family revocation",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Token binding to client fingerprint prevents token theft",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Rate limiting on token endpoints: 10 attempts per minute per IP",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Analytics Pipeline Design",
		icon: "📊",
		projectIndex: 5,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Analytics Pipeline Design" }] },
			{
				type: "p",
				children: [
					{
						text: "The analytics pipeline uses an event-driven architecture with Kafka as the message broker and ClickHouse as the analytical database. Events are produced by API endpoints and consumed by a fleet of workers that handle enrichment, validation, and storage.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Architecture Overview" }] },
			{
				type: "p",
				children: [
					{
						text: "Events enter through the ingestion API, which validates the schema and publishes to a Kafka topic. Consumer workers read from Kafka, enrich events with user and organization metadata, and batch-insert into ClickHouse. Materialized views in ClickHouse pre-compute common aggregations.",
					},
				],
			},
			{ type: "h2", children: [{ text: "ClickHouse Schema" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [
							{
								text: "CREATE TABLE events (\n  event_id UUID,\n  event_type LowCardinality(String),\n  user_id String,\n  timestamp DateTime64(3),\n  properties Map(String, String)\n) ENGINE = MergeTree()\nPARTITION BY toYYYYMM(timestamp)\nORDER BY (event_type, user_id, timestamp);",
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "GraphQL Schema Design",
		icon: "🔗",
		projectIndex: 0,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "GraphQL Schema Design" }] },
			{
				type: "p",
				children: [
					{
						text: "The GraphQL layer sits alongside the REST API and provides a unified query interface for the Customer Dashboard. It uses a code-first approach with TypeGraphQL, generating the schema from TypeScript classes.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Type System" }] },
			{
				type: "p",
				children: [
					{
						text: "Root types follow the Relay connection specification with cursor-based pagination. Each domain entity has a corresponding GraphQL type with computed fields and relationship resolvers. The schema enforces authorization at the field level using custom directives.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Subscriptions" }] },
			{
				type: "p",
				children: [
					{
						text: "Real-time subscriptions use WebSocket transport with graphql-ws. Supported subscription topics include: issue status changes, new comments, document edits, and dashboard data updates. Subscriptions are scoped to the user's workspace and respect their permission level.",
					},
				],
			},
		]),
	},
	{
		title: "Offline Sync Architecture — iOS",
		icon: "📱",
		projectIndex: 2,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Offline Sync Architecture — iOS" }] },
			{
				type: "p",
				children: [
					{
						text: "The iOS app uses an offline-first architecture built on SwiftData. All data is stored locally and synced with the server using a custom conflict resolution strategy based on operational transforms.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Sync Protocol" }] },
			{
				type: "p",
				children: [
					{
						text: "Changes are tracked as operations in a local log. When connectivity is restored, the sync engine replays pending operations against the server. The server returns a set of remote operations that occurred since the last sync point. Conflicts are resolved using last-write-wins for simple fields and operational merge for text content.",
					},
				],
			},
			{ type: "h2", children: [{ text: "SwiftData Models" }] },
			{
				type: "p",
				children: [
					{
						text: "Each domain entity maps to a SwiftData model with a syncState property tracking dirty/clean/conflict states. Background context handles sync operations to avoid blocking the UI. The sync engine runs on a dedicated dispatch queue with configurable polling intervals.",
					},
				],
			},
		]),
	},
	{
		title: "CI/CD Pipeline Architecture",
		icon: "🔄",
		projectIndex: 8,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "CI/CD Pipeline Architecture" }] },
			{
				type: "p",
				children: [
					{
						text: "The CI/CD pipeline migrates from Jenkins to GitHub Actions with a focus on speed, reliability, and developer experience. Matrix builds test across Node 18, 20, and 22. Preview deployments are created for every PR.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Workflow Structure" }] },
			{
				type: "p",
				children: [
					{
						text: "The main CI workflow runs on every push and PR. Steps include: checkout, dependency install with bun cache, lint, typecheck, unit tests (parallel), integration tests, and coverage report. Build artifacts are cached between runs. Total pipeline time target: under 7 minutes.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Canary Deployment" }] },
			{
				type: "p",
				children: [
					{
						text: "Production deployments use a canary strategy. Traffic is gradually shifted: 5% for 10 minutes, 25% for 10 minutes, then 100%. Error rate and latency metrics are monitored at each stage. If error rate exceeds 1% or p95 latency doubles, the canary is automatically rolled back.",
					},
				],
			},
		]),
	},
	{
		title: "Notification Delivery Architecture",
		icon: "📡",
		projectIndex: 10,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Notification Delivery Architecture" }],
			},
			{
				type: "p",
				children: [
					{
						text: "The notification delivery system processes events from a Convex mutation trigger, routes them through a channel selection layer, and delivers via the appropriate provider. Each channel has its own delivery queue with independent retry policies.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Channel Router" }] },
			{
				type: "p",
				children: [
					{
						text: "The channel router determines which channels to deliver on based on user preferences, notification type, and delivery history. The router respects quiet hours, DND mode, and channel-specific rate limits. In-app notifications are always delivered; external channels respect user preferences.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Batching Algorithm" }] },
			{
				type: "p",
				children: [
					{
						text: "The batcher aggregates notifications into digest windows. When a window closes, it groups notifications by type and generates a summary. The digest email template renders grouped items with action links. Each digest includes an unsubscribe link and preference management URL.",
					},
				],
			},
		]),
	},
	{
		title: "Design Token Pipeline",
		icon: "🎨",
		projectIndex: 11,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Design Token Pipeline" }] },
			{
				type: "p",
				children: [
					{
						text: "Design tokens are the atomic building blocks of Orbit UI. They define colors, typography, spacing, shadows, and motion values. The pipeline syncs tokens from Figma to code through an automated CI process.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Token Categories" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Color: semantic colors (primary, secondary, success, danger, warning) with light/dark variants",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Typography: font families, sizes, weights, line heights, letter spacing",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Spacing: 4px base unit scale from 0.25 to 16 (1px to 64px)",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Shadow: elevation levels 1-5 for layered surfaces" },
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Build Process" }] },
			{
				type: "p",
				children: [
					{
						text: "Style Dictionary transforms Figma-exported JSON into CSS custom properties, Tailwind theme extensions, and TypeScript constants. The pipeline runs in CI on every push to the design-tokens repository. Output artifacts are published as a versioned npm package consumed by all frontend projects.",
					},
				],
			},
		]),
	},
	{
		title: "Security Audit Framework",
		icon: "🔒",
		projectIndex: 13,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Security Audit Framework" }] },
			{
				type: "p",
				children: [
					{
						text: "This document describes the technical framework for conducting quarterly security audits. The framework covers automated scanning, manual penetration testing, dependency analysis, and compliance verification.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Automated Scanning" }] },
			{
				type: "p",
				children: [
					{
						text: "The CI pipeline runs Snyk for dependency scanning and CodeQL for static analysis on every PR. Weekly scheduled scans run Trivy against all Docker images. Results are automatically triaged: critical findings block deploys, high findings create issues, medium and low findings are batched into weekly reports.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Penetration Testing" }] },
			{
				type: "p",
				children: [
					{
						text: "External pen tests are conducted quarterly by CyberSafe Partners. The scope covers all external-facing APIs, the web application, and the mobile apps. Findings are classified using CVSS v3.1 scoring. Critical and high findings require remediation within 48 hours and 7 days respectively.",
					},
				],
			},
		]),
	},
	{
		title: "Vector Search Index Design",
		icon: "🧠",
		projectIndex: 9,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Vector Search Index Design" }] },
			{
				type: "p",
				children: [
					{
						text: "The vector search index stores embeddings generated from workspace content. Each content item is chunked, embedded using text-embedding-3-small, and stored alongside metadata for efficient hybrid search combining vector similarity with keyword filtering.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Chunking Strategy" }] },
			{
				type: "p",
				children: [
					{
						text: "Content is split into overlapping chunks of 512 tokens with 64 token overlap. Documents use paragraph boundaries as preferred split points. Issues are embedded as single chunks when under 512 tokens. Comments are grouped per thread and embedded together.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Query Pipeline" }] },
			{
				type: "p",
				children: [
					{
						text: "Search queries are embedded using the same model and compared using cosine similarity. The top 50 candidates from the vector index are re-ranked using BM25 text scores. Final results are the top 20 after re-ranking, enriched with metadata and highlighted snippets.",
					},
				],
			},
		]),
	},
	{
		title: "Monitoring Stack Architecture",
		icon: "📡",
		projectIndex: 18,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Monitoring Stack Architecture" }] },
			{
				type: "p",
				children: [
					{
						text: "The monitoring stack provides end-to-end observability across all Velocity Labs services. It combines structured logging (Grafana Loki), distributed tracing (OpenTelemetry + Tempo), metrics (Prometheus), and alerting (PagerDuty).",
					},
				],
			},
			{ type: "h2", children: [{ text: "Log Format Standard" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [
							{
								text: '{\n  "timestamp": "2025-02-15T10:30:00Z",\n  "level": "info",\n  "service": "api-gateway",\n  "traceId": "abc123",\n  "spanId": "def456",\n  "message": "Request processed",\n  "duration_ms": 45,\n  "status_code": 200\n}',
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Alert Rules" }] },
			{
				type: "p",
				children: [
					{
						text: "Alert rules are defined in code and deployed via Terraform. Each rule specifies a PromQL expression, evaluation interval, severity, and escalation policy. Critical alerts page the on-call engineer. High alerts create PagerDuty incidents with 30-minute acknowledgment SLA.",
					},
				],
			},
		]),
	},
];

const MEETING_NOTES_DOCS = [
	{
		title: "Sprint 12 Retrospective",
		icon: "🔄",
		projectIndex: 0,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Sprint 12 Retrospective" }] },
			{
				type: "p",
				children: [
					{
						text: "Date: February 10, 2026. Attendees: Alex, Marcus, Priya, James. Facilitator: Sarah.",
					},
				],
			},
			{ type: "h2", children: [{ text: "What went well" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "GraphQL resolvers shipped ahead of schedule — clean abstraction over existing data layer",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Good collaboration between API and dashboard teams on schema design",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Test coverage increased from 72% to 84% for the auth module",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "What could improve" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "PR review turnaround averaged 18 hours — target is 4 hours",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Two tasks were blocked for 3 days waiting on design decisions",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Action Items" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Alex: set up PR review rotation with 4-hour SLA" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Sarah: schedule design review sync at start of each sprint",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Architecture Review — Search",
		icon: "🏗️",
		projectIndex: 9,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Architecture Review — Search" }] },
			{
				type: "p",
				children: [
					{
						text: "Date: February 17, 2026. Attendees: Alex, Marcus, Priya, Ryan. Purpose: Review the search architecture before implementation begins.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Decisions" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Use Convex's built-in vector search instead of external Pinecone — simpler architecture, lower latency",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Embedding model: text-embedding-3-small (1536 dimensions) — best cost/quality tradeoff",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Incremental indexing via Convex scheduled functions — no external job queue needed",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Open Questions" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "How do we handle search across multiple workspaces for org-level search?",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "What's the re-indexing strategy when the embedding model is updated?",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Weekly Engineering Sync — Feb 17",
		icon: "📅",
		projectIndex: null,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Weekly Engineering Sync — Feb 17" }] },
			{
				type: "p",
				children: [
					{
						text: "All-hands engineering sync. Each team lead provides a 2-minute status update. Blockers are escalated to the group.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Team Updates" }] },
			{
				type: "p",
				children: [
					{ text: "Core API", bold: true },
					{
						text: " (Alex): Sprint 2 wrapping up. GraphQL subscriptions are the last piece. On track for Sprint 3 kickoff Monday.",
					},
				],
			},
			{
				type: "p",
				children: [
					{ text: "Dashboard", bold: true },
					{
						text: " (Sarah): KPI card widget shipping today. Activity feed widget needs design review — scheduling for Wednesday.",
					},
				],
			},
			{
				type: "p",
				children: [
					{ text: "Mobile", bold: true },
					{
						text: " (Priya): iOS TestFlight build 42 looks stable. Android push notifications working on all test devices.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Blockers" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Payment team needs Stripe test environment credentials — Marcus to provision today",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "CI runners hitting memory limits on large test suites — DevOps investigating",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Product Review — Analytics Dashboard",
		icon: "🎯",
		projectIndex: 5,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Product Review — Analytics Dashboard" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Date: February 14, 2026. Stakeholders: Product, Engineering, Design. Goal: review the analytics dashboard design before starting the UI implementation sprint.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Key Feedback" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Need clear empty states for dashboards with no data yet",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Export to CSV should be available on every widget, not just tables",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Date range picker should support relative ranges (last 7 days, last 30 days)",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Next Steps" }] },
			{
				type: "p",
				children: [
					{
						text: "Design team will update the Figma file by Wednesday. Engineering starts UI implementation in the next sprint. Beta access for Quantum Analytics by end of month.",
					},
				],
			},
		]),
	},
	{
		title: "Incident Postmortem — API Outage Feb 5",
		icon: "🚨",
		projectIndex: 0,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Incident Postmortem — API Outage Feb 5" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Duration: 23 minutes (14:07 — 14:30 UTC). Impact: 100% of API requests returned 503 for all customers. Severity: P1.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Root Cause" }] },
			{
				type: "p",
				children: [
					{
						text: "A database migration script intended for the staging environment was accidentally run against production. The script added an index to the events table, which locked the table for writes. The connection pool exhausted within 2 minutes, causing cascading failures across all API endpoints.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Timeline" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "14:07 — PagerDuty alert: API error rate > 50%" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "14:10 — On-call engineer identifies table lock" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "14:15 — Migration cancelled, lock released" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "14:30 — All services recovered, traffic normal" },
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Preventive Actions" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Separate database credentials for staging and production migration tools",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Add CONCURRENTLY flag to all CREATE INDEX migrations",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Require two-person approval for production database changes",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Design System Sync — Components Q1",
		icon: "🎨",
		projectIndex: 11,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Design System Sync — Components Q1" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Quarterly sync between design and engineering on Orbit UI component status. Review current coverage, upcoming components, and adoption metrics.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Coverage Report" }] },
			{
				type: "p",
				children: [
					{
						text: "42 of 55 planned components are shipped and documented. Storybook coverage at 85%. Three components need accessibility fixes: DatePicker, Combobox, and Modal. All primitive components pass WCAG AA contrast checks.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Upcoming Components" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "DataTable v2: virtual scrolling, column resizing, row selection",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Chart: line, bar, area, and pie with consistent theming",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "CommandPalette: global keyboard shortcut with fuzzy search",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "1:1 Notes — Alex & Sarah",
		icon: "👥",
		projectIndex: null,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "1:1 Notes — Alex & Sarah" }] },
			{
				type: "p",
				children: [
					{
						text: "Date: February 19, 2026. Regular bi-weekly sync between Engineering Lead and Senior Frontend Engineer.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Topics" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Dashboard widget performance: Sarah identified a render cycle issue in the chart widget. Fix reduces re-renders by 60%.",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Career development: Sarah interested in leading the search UI project. Agreed to give her the lead role for Sprint 1.",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Team feedback: PR review process is working better since introducing the rotation. Average time down to 6 hours.",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Security Review — Payment Integration",
		icon: "🔒",
		projectIndex: 4,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "Security Review — Payment Integration" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Date: February 12, 2026. Reviewers: James, Alex, Marcus. Focus: review the Stripe integration for security best practices before going live.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Findings" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Webhook signature verification is correctly implemented using the Stripe SDK",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "API keys are stored in environment variables, not in code — confirmed",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Recommendation: add idempotency keys to all payment mutations to prevent duplicate charges",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Recommendation: implement audit logging for all billing state changes",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Mobile Standup — Feb 20",
		icon: "📱",
		projectIndex: 2,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Mobile Standup — Feb 20" }] },
			{
				type: "p",
				children: [
					{
						text: "Daily standup for iOS and Android teams. Quick status check and blocker resolution.",
					},
				],
			},
			{ type: "h2", children: [{ text: "iOS (Priya)" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Yesterday: Fixed two offline sync crashes reported by testers",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Today: Implementing push notification grouping by project",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [{ type: "lic", children: [{ text: "Blocker: None" }] }],
					},
				],
			},
			{ type: "h2", children: [{ text: "Android (Ryan)" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Yesterday: Completed Material You dynamic color implementation",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Today: Working on issue detail screen with edit functionality",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Blocker: Need updated API types for the issue model — Alex to share by noon",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Billing Integration Sync — Feb 18",
		icon: "💳",
		projectIndex: 4,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Billing Integration Sync — Feb 18" }] },
			{
				type: "p",
				children: [
					{
						text: "Cross-team sync on billing integration progress. Attendees: Marcus, Alex, David, Emily.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Status" }] },
			{
				type: "p",
				children: [
					{
						text: "Core Stripe integration is complete and handling all webhook events correctly in staging. Invoice generation supports 15 currencies. Tax calculation via TaxJar integration is the remaining blocker before we can enable self-service plan changes.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Action Items" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Marcus: Complete TaxJar integration by Wednesday" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Emily: Finalize billing portal UI designs for customer self-service",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Alex: Review Stripe test mode data and verify edge cases",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
];

const GUIDE_DOCS = [
	{
		title: "Deployment Runbook",
		icon: "🚀",
		projectIndex: 8,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Deployment Runbook" }] },
			{
				type: "p",
				children: [
					{
						text: "Step-by-step guide for deploying Velocity Labs services to production. Covers pre-deployment checks, the deployment process, and rollback procedures.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Pre-Deployment Checklist" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "All CI checks passing on the release branch" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Database migrations reviewed and tested in staging",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Release notes drafted and reviewed by product team",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "On-call engineer confirmed and monitoring dashboards open",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Deployment Steps" }] },
			{
				type: "p",
				children: [
					{
						text: "1. Merge the release PR to main. 2. Wait for CI to complete. 3. Vercel auto-deploys to production. 4. Convex deploy runs as part of the Vercel build command. 5. Verify deployment in the Vercel dashboard. 6. Run smoke tests against production endpoints. 7. Monitor error rates and latency for 15 minutes.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Rollback Procedure" }] },
			{
				type: "p",
				children: [
					{
						text: "If issues are detected: 1. Revert the merge commit on main. 2. Push the revert — Vercel will auto-deploy the previous version. 3. If the issue is database-related, run the down migration from the migrations directory. 4. Notify the team in the incidents Slack channel.",
					},
				],
			},
		]),
	},
	{
		title: "New Developer Onboarding",
		icon: "👨‍💻",
		projectIndex: null,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "New Developer Onboarding" }] },
			{
				type: "p",
				children: [
					{
						text: "Welcome to Velocity Labs! This guide covers everything you need to get up and running as a developer on the team.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Day 1 Setup" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Request access to GitHub org, Vercel, Convex dashboard, and Figma",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Clone the repository and run bun install" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Copy .env.example to .env.local and fill in your development keys",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Run bun run dev to start the development server on port 4000",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Architecture Overview" }] },
			{
				type: "p",
				children: [
					{
						text: "Velocity is a Next.js application with Convex as the backend. The frontend uses React 19 with server components. Real-time data is handled by Convex subscriptions. AI features use the Vercel AI SDK with Claude. The editor stack includes Plate.js for documents and Excalidraw for whiteboards.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Development Workflow" }] },
			{
				type: "p",
				children: [
					{
						text: "Create a feature branch from main. Make your changes and open a PR. CI runs lint, typecheck, and tests automatically. Get at least one approval. Merge the PR — Vercel handles deployment. Add a changeset if the change is user-facing.",
					},
				],
			},
		]),
	},
	{
		title: "API Key Management Guide",
		icon: "🔑",
		projectIndex: 14,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "API Key Management Guide" }] },
			{
				type: "p",
				children: [
					{
						text: "Guide for creating, rotating, and revoking API keys in the Velocity platform. API keys are the primary authentication method for server-to-server integrations.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Creating API Keys" }] },
			{
				type: "p",
				children: [
					{
						text: "Navigate to Settings > API Keys. Click Create Key. Select the permission scopes: read-only, read-write, or admin. Set an optional expiration date. The key is displayed once — store it securely. Keys can be named for identification.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Key Rotation" }] },
			{
				type: "p",
				children: [
					{
						text: "Recommended rotation interval: 90 days. Create the new key before revoking the old one to avoid downtime. Update all services using the key. Verify the new key works in staging before revoking the old key. Old keys remain valid for 24 hours after revocation as a grace period.",
					},
				],
			},
		]),
	},
	{
		title: "Branching Strategy Guide",
		icon: "🌳",
		projectIndex: 8,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Branching Strategy Guide" }] },
			{
				type: "p",
				children: [
					{
						text: "Velocity Labs uses a trunk-based development workflow with short-lived feature branches. The main branch is always deployable. Feature branches are merged via squash merge.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Branch Naming" }] },
			{
				type: "p",
				children: [
					{
						text: "Feature branches: feat/VEL-123-short-description. Bug fixes: fix/VEL-456-bug-description. Hotfixes: hotfix/critical-issue-name. Release branches: release/v2.1.0. All branches should include the issue identifier when applicable.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Merge Rules" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Squash merge to main — keeps history clean" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [{ text: "At least one approval required" }],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "CI must pass — no override allowed except for hotfixes with CTO approval",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Python SDK Quickstart",
		icon: "🐍",
		projectIndex: 15,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Python SDK Quickstart" }] },
			{
				type: "p",
				children: [
					{
						text: "Get started with the Velocity Python SDK. This guide covers installation, authentication, and making your first API call.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Installation" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [{ text: "pip install velocity-sdk" }],
					},
				],
			},
			{ type: "h2", children: [{ text: "Authentication" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [
							{
								text: 'from velocity import VelocityClient\n\nclient = VelocityClient(api_key="your-api-key")\n\n# List projects\nprojects = await client.projects.list()\nfor project in projects:\n    print(f"{project.name}: {project.status}")',
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "JavaScript SDK Integration Guide",
		icon: "🟨",
		projectIndex: 16,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "JavaScript SDK Integration Guide" }] },
			{
				type: "p",
				children: [
					{
						text: "The official Velocity JavaScript SDK works in Node.js, Deno, and browsers. Zero dependencies. Full TypeScript support.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Installation" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [{ text: "npm install @velocity/sdk" }],
					},
				],
			},
			{ type: "h2", children: [{ text: "Basic Usage" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [
							{
								text: "import { Velocity } from '@velocity/sdk';\n\nconst client = new Velocity({ apiKey: process.env.VELOCITY_API_KEY });\n\n// Create an issue\nconst issue = await client.issues.create({\n  projectId: 'proj_abc123',\n  title: 'Fix login redirect',\n  priority: 'high',\n});",
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Webhook Integration Guide",
		icon: "🪝",
		projectIndex: 14,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Webhook Integration Guide" }] },
			{
				type: "p",
				children: [
					{
						text: "Webhooks allow you to receive real-time notifications when events occur in Velocity. This guide covers setup, event types, signature verification, and retry behavior.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Setup" }] },
			{
				type: "p",
				children: [
					{
						text: "Navigate to Settings > Webhooks. Add your endpoint URL. Select the events you want to subscribe to. Velocity will send a verification request to confirm the endpoint is reachable. Your endpoint must respond with a 200 status within 5 seconds.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Signature Verification" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [
							{
								text: "import { verifyWebhookSignature } from '@velocity/sdk';\n\nconst isValid = verifyWebhookSignature(\n  request.body,\n  request.headers['x-velocity-signature'],\n  webhookSecret\n);",
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Data Migration Procedures",
		icon: "📦",
		projectIndex: 17,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Data Migration Procedures" }] },
			{
				type: "p",
				children: [
					{
						text: "Procedures for migrating customer data from legacy systems using the Velocity Migration Toolkit. Supports CSV, JSON, and direct database connections.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Pre-Migration Steps" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Audit source data: identify field mappings, data types, and potential issues",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Create a test workspace for dry-run migration" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Validate data quality: check for duplicates, missing required fields, encoding issues",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Running the Migration" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [
							{
								text: "velocity-migrate \\\n  --source csv \\\n  --input data/export.csv \\\n  --mapping mappings/customer-fields.json \\\n  --workspace ws_abc123 \\\n  --dry-run",
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "Incident Response Runbook",
		icon: "🚨",
		projectIndex: 18,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Incident Response Runbook" }] },
			{
				type: "p",
				children: [
					{
						text: "Standard operating procedure for production incidents. Covers triage, escalation, communication, and postmortem processes.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Severity Levels" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "P1 (Critical): Complete service outage or data loss. Response: 5 min. Resolution: 1 hour.",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "P2 (High): Partial outage or significant degradation. Response: 15 min. Resolution: 4 hours.",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "P3 (Medium): Minor feature broken, workaround available. Response: 1 hour. Resolution: 24 hours.",
									},
								],
							},
						],
					},
				],
			},
			{ type: "h2", children: [{ text: "Escalation" }] },
			{
				type: "p",
				children: [
					{
						text: "P1: Page on-call via PagerDuty, notify CTO, post in #incidents. P2: Page on-call, post in #incidents. P3: Create issue, assign to on-call. All incidents require a postmortem within 48 hours.",
					},
				],
			},
		]),
	},
	{
		title: "Accessibility Testing Guide",
		icon: "♿",
		projectIndex: 19,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "Accessibility Testing Guide" }] },
			{
				type: "p",
				children: [
					{
						text: "Guide for testing WCAG 2.1 AA compliance in the Velocity platform. Covers automated scanning, manual testing, and screen reader verification.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Automated Testing" }] },
			{
				type: "p",
				children: [
					{
						text: "Run axe-core in CI for every PR. The axe plugin is configured to flag violations at the error level. Common checks include: color contrast ratios, ARIA roles, form labels, heading hierarchy, and image alt text. Configure axe-core as a Playwright fixture for E2E accessibility testing.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Manual Testing Checklist" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Tab through every interactive element on the page" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Verify focus indicators are visible on all focusable elements",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Test with VoiceOver (macOS) or NVDA (Windows)" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Zoom to 200% and verify no content is cut off" },
								],
							},
						],
					},
				],
			},
		]),
	},
];

const RFC_DOCS = [
	{
		title: "RFC: Migrate to GraphQL",
		icon: "📄",
		projectIndex: 0,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "RFC: Migrate to GraphQL" }] },
			{
				type: "p",
				children: [
					{
						text: "Author: Alex Chen. Status: Accepted. Date: January 15, 2026.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Add a GraphQL API alongside the existing REST endpoints. The GraphQL layer will share the same business logic and data access layer as REST. This allows clients to request exactly the data they need, reducing over-fetching and improving mobile app performance.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Motivation" }] },
			{
				type: "p",
				children: [
					{
						text: "The dashboard team currently makes 12 API calls to render the main view. With GraphQL, this reduces to 1 query. Mobile apps waste bandwidth downloading unused fields. The subscription feature also benefits from GraphQL's built-in subscription support.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Alternatives Considered" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "REST with sparse fieldsets — only partially solves the problem",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "tRPC — great DX but lacks the query flexibility we need",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "RFC: Event-Driven Architecture",
		icon: "📄",
		projectIndex: 5,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "RFC: Event-Driven Architecture" }] },
			{
				type: "p",
				children: [
					{
						text: "Author: Marcus Johnson. Status: Accepted. Date: December 20, 2025.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Adopt an event-driven architecture for the analytics pipeline using Kafka. Events are produced by API mutations and consumed by independent processors. This decouples the analytics system from the main application and allows independent scaling.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Benefits" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "Analytics processing does not affect API latency" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Events can be replayed for debugging or re-processing",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "New consumers can be added without modifying producers",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "RFC: Component Library Architecture",
		icon: "📄",
		projectIndex: 11,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "RFC: Component Library Architecture" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Author: Emily Zhang. Status: Accepted. Date: November 10, 2025.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Build Orbit UI as a monorepo with separate packages for core components, data components, icons, and design tokens. Components use Radix UI primitives for accessibility, styled with Tailwind CSS using design tokens.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Package Structure" }] },
			{
				type: "code_block",
				children: [
					{
						type: "code_line",
						children: [
							{
								text: "packages/\n  core/       # Button, Input, Dialog, etc.\n  data/       # Table, Chart, KPI\n  icons/      # SVG icon components\n  tokens/     # Design token definitions\n  cli/        # Scaffolding tool",
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "RFC: Offline-First Mobile Architecture",
		icon: "📄",
		projectIndex: 2,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "RFC: Offline-First Mobile Architecture" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Author: Priya Sharma. Status: Accepted. Date: January 5, 2026.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Implement an offline-first architecture for both iOS and Android apps. All data is stored locally and synced when connectivity is available. Changes are queued as operations and replayed on reconnection.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Conflict Resolution" }] },
			{
				type: "p",
				children: [
					{
						text: "For simple fields (status, priority, assignee), last-write-wins based on server timestamps. For text fields (title, description), we use operational transforms to merge concurrent edits. For collections (labels, subscribers), we use CRDTs with add-wins semantics.",
					},
				],
			},
		]),
	},
	{
		title: "RFC: Unified Notification System",
		icon: "📄",
		projectIndex: 10,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "RFC: Unified Notification System" }] },
			{
				type: "p",
				children: [
					{
						text: "Author: Priya Sharma. Status: Accepted. Date: January 25, 2026.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Replace the current notification system with a unified multi-channel delivery platform. All notification types route through a single pipeline that handles channel selection, batching, and delivery tracking.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Channel Priority" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "In-app: Always delivered (real-time via Convex subscriptions)",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Push: Delivered when user is not actively using the app",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Email: Delivered for high-importance events or digest summaries",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Slack: Delivered when workspace Slack integration is configured",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "RFC: API Versioning Strategy",
		icon: "📄",
		projectIndex: 14,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "RFC: API Versioning Strategy" }] },
			{
				type: "p",
				children: [
					{
						text: "Author: Alex Chen. Status: Draft. Date: February 10, 2026.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Adopt URL-based versioning (v1, v2) for major breaking changes. Minor non-breaking additions are shipped without version changes. Deprecated endpoints are maintained for 6 months with sunset headers. The SDK includes automatic version negotiation.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Backward Compatibility" }] },
			{
				type: "p",
				children: [
					{
						text: "New fields added to response objects are always backward compatible. Existing fields are never removed within a major version. Request validation accepts unknown fields and ignores them. Error response format is consistent across all versions.",
					},
				],
			},
		]),
	},
	{
		title: "RFC: Accessibility Automation Pipeline",
		icon: "📄",
		projectIndex: 19,
		content: JSON.stringify([
			{
				type: "h1",
				children: [{ text: "RFC: Accessibility Automation Pipeline" }],
			},
			{
				type: "p",
				children: [
					{
						text: "Author: Emily Zhang. Status: Draft. Date: February 20, 2026.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Integrate automated accessibility testing into the CI pipeline. Every PR is checked against WCAG 2.1 AA criteria using axe-core. Violations block the merge. A weekly report tracks accessibility debt across all pages.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Implementation" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "axe-core integration as a Playwright test fixture" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Custom rules for Velocity-specific patterns (data tables, kanban boards)",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Lighthouse CI for performance and accessibility scores",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "RFC: Canary Deployment Strategy",
		icon: "📄",
		projectIndex: 8,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "RFC: Canary Deployment Strategy" }] },
			{
				type: "p",
				children: [
					{
						text: "Author: David Kim. Status: Accepted. Date: January 20, 2026.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Implement canary deployments with progressive traffic shifting and automatic rollback. New deployments start with 5% traffic, increase to 25% after 10 minutes of healthy metrics, then promote to 100%. Unhealthy canaries are automatically rolled back.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Health Criteria" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Error rate must stay below 1% (compared to baseline)",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "P95 latency must not increase by more than 50%" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Memory usage must stay within 80% of the container limit",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "RFC: SDK Auto-Generation Pipeline",
		icon: "📄",
		projectIndex: 16,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "RFC: SDK Auto-Generation Pipeline" }] },
			{
				type: "p",
				children: [
					{ text: "Author: Alex Chen. Status: Draft. Date: February 5, 2026." },
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Auto-generate SDK clients from the OpenAPI specification. TypeScript types, Python Pydantic models, and API client methods are all generated from a single source. Manual code is limited to authentication, pagination iterators, and ergonomic helpers.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Benefits" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{ text: "SDKs are always in sync with the API — no drift" },
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "New endpoints are automatically available in all SDKs",
									},
								],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "Reduces maintenance burden — focus on ergonomics, not boilerplate",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
	{
		title: "RFC: Performance Budget Framework",
		icon: "📄",
		projectIndex: 12,
		content: JSON.stringify([
			{ type: "h1", children: [{ text: "RFC: Performance Budget Framework" }] },
			{
				type: "p",
				children: [
					{
						text: "Author: David Kim. Status: Accepted. Date: February 1, 2026.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Proposal" }] },
			{
				type: "p",
				children: [
					{
						text: "Define and enforce performance budgets in CI. Each route has a maximum bundle size, LCP target, and API latency budget. PRs that exceed budgets are flagged for review. Monthly performance reports track trends across all routes.",
					},
				],
			},
			{ type: "h2", children: [{ text: "Budgets" }] },
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [{ text: "Initial bundle: 200KB gzipped maximum" }],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [{ text: "LCP: 1.5 seconds on 4G connection" }],
							},
						],
					},
					{
						type: "li",
						children: [
							{
								type: "lic",
								children: [
									{
										text: "API p95 latency: 200ms for reads, 500ms for writes",
									},
								],
							},
						],
					},
				],
			},
		]),
	},
];

// All documents combined for easy iteration
const ALL_DOCUMENTS = [
	...PRD_DOCS,
	...TECH_DESIGN_DOCS,
	...MEETING_NOTES_DOCS,
	...GUIDE_DOCS,
	...RFC_DOCS,
];

// ── Whiteboard Templates ─────────────────────────────────────────────────────

function generateWhiteboardScene(type: string, index: number): string {
	const prefix = `wb-${type}-${index}`;
	const elements: object[] = [];

	switch (type) {
		case "architecture": {
			const boxes = [
				{ label: "Client App", x: 50, bg: "#dbeafe" },
				{ label: "API Gateway", x: 320, bg: "#fef3c7" },
				{ label: "Service Layer", x: 590, bg: "#d1fae5" },
				{ label: "Database", x: 860, bg: "#fce7f3" },
			];
			for (let j = 0; j < boxes.length; j++) {
				const b = boxes[j];
				elements.push(
					{
						type: "rectangle",
						id: `${prefix}-r${j}`,
						x: b.x,
						y: 120,
						width: 200,
						height: 80,
						strokeColor: "#000",
						backgroundColor: b.bg,
						fillStyle: "solid",
						strokeWidth: 1,
						roughness: 0,
						roundness: { type: 3 },
					},
					{
						type: "text",
						id: `${prefix}-t${j}`,
						x: b.x + 20,
						y: 148,
						text: b.label,
						fontSize: 16,
						fontFamily: 1,
						textAlign: "center",
						width: 160,
						height: 24,
					},
				);
				if (j < boxes.length - 1) {
					elements.push({
						type: "arrow",
						id: `${prefix}-a${j}`,
						x: b.x + 200,
						y: 160,
						width: 70,
						height: 0,
						points: [
							[0, 0],
							[70, 0],
						],
						strokeColor: "#000",
						strokeWidth: 1,
						roughness: 0,
					});
				}
			}
			break;
		}
		case "wireframe": {
			elements.push(
				{
					type: "rectangle",
					id: `${prefix}-header`,
					x: 50,
					y: 50,
					width: 400,
					height: 50,
					strokeColor: "#6b7280",
					backgroundColor: "#f3f4f6",
					fillStyle: "solid",
					strokeWidth: 1,
					roughness: 0,
					roundness: { type: 3 },
				},
				{
					type: "text",
					id: `${prefix}-ht`,
					x: 170,
					y: 63,
					text: "Header / Nav",
					fontSize: 14,
					fontFamily: 1,
					textAlign: "center",
					width: 120,
					height: 20,
				},
				{
					type: "rectangle",
					id: `${prefix}-sidebar`,
					x: 50,
					y: 120,
					width: 120,
					height: 300,
					strokeColor: "#6b7280",
					backgroundColor: "#e5e7eb",
					fillStyle: "solid",
					strokeWidth: 1,
					roughness: 0,
					roundness: { type: 3 },
				},
				{
					type: "text",
					id: `${prefix}-st`,
					x: 70,
					y: 250,
					text: "Sidebar",
					fontSize: 12,
					fontFamily: 1,
					textAlign: "center",
					width: 80,
					height: 18,
				},
				{
					type: "rectangle",
					id: `${prefix}-main`,
					x: 190,
					y: 120,
					width: 260,
					height: 300,
					strokeColor: "#6b7280",
					backgroundColor: "#ffffff",
					fillStyle: "solid",
					strokeWidth: 1,
					roughness: 0,
					roundness: { type: 3 },
				},
				{
					type: "text",
					id: `${prefix}-mt`,
					x: 270,
					y: 250,
					text: "Main Content",
					fontSize: 14,
					fontFamily: 1,
					textAlign: "center",
					width: 100,
					height: 20,
				},
			);
			break;
		}
		case "flowchart": {
			elements.push(
				{
					type: "rectangle",
					id: `${prefix}-start`,
					x: 150,
					y: 30,
					width: 160,
					height: 50,
					strokeColor: "#000",
					backgroundColor: "#dbeafe",
					fillStyle: "solid",
					strokeWidth: 1,
					roughness: 0,
					roundness: { type: 3 },
				},
				{
					type: "text",
					id: `${prefix}-st0`,
					x: 175,
					y: 43,
					text: "Start",
					fontSize: 16,
					fontFamily: 1,
					textAlign: "center",
					width: 110,
					height: 24,
				},
				{
					type: "arrow",
					id: `${prefix}-a0`,
					x: 230,
					y: 80,
					width: 0,
					height: 40,
					points: [
						[0, 0],
						[0, 40],
					],
					strokeColor: "#000",
					strokeWidth: 1,
					roughness: 0,
				},
				{
					type: "diamond",
					id: `${prefix}-d1`,
					x: 150,
					y: 120,
					width: 160,
					height: 80,
					strokeColor: "#000",
					backgroundColor: "#fef3c7",
					fillStyle: "solid",
					strokeWidth: 1,
					roughness: 0,
				},
				{
					type: "text",
					id: `${prefix}-dt`,
					x: 185,
					y: 148,
					text: "Condition?",
					fontSize: 14,
					fontFamily: 1,
					textAlign: "center",
					width: 90,
					height: 20,
				},
				{
					type: "arrow",
					id: `${prefix}-a1`,
					x: 230,
					y: 200,
					width: 0,
					height: 40,
					points: [
						[0, 0],
						[0, 40],
					],
					strokeColor: "#000",
					strokeWidth: 1,
					roughness: 0,
				},
				{
					type: "rectangle",
					id: `${prefix}-end`,
					x: 150,
					y: 240,
					width: 160,
					height: 50,
					strokeColor: "#000",
					backgroundColor: "#d1fae5",
					fillStyle: "solid",
					strokeWidth: 1,
					roughness: 0,
					roundness: { type: 3 },
				},
				{
					type: "text",
					id: `${prefix}-et`,
					x: 175,
					y: 253,
					text: "Process",
					fontSize: 16,
					fontFamily: 1,
					textAlign: "center",
					width: 110,
					height: 24,
				},
			);
			break;
		}
		case "planning": {
			const notes = ["To Do", "In Progress", "Review", "Done"];
			for (let j = 0; j < notes.length; j++) {
				const x = 50 + j * 180;
				elements.push(
					{
						type: "rectangle",
						id: `${prefix}-col${j}`,
						x,
						y: 50,
						width: 150,
						height: 40,
						strokeColor: "#6b7280",
						backgroundColor: "#f3f4f6",
						fillStyle: "solid",
						strokeWidth: 1,
						roughness: 0,
						roundness: { type: 3 },
					},
					{
						type: "text",
						id: `${prefix}-ct${j}`,
						x: x + 10,
						y: 58,
						text: notes[j],
						fontSize: 14,
						fontFamily: 1,
						textAlign: "center",
						width: 130,
						height: 20,
					},
				);
				for (let k = 0; k < 2; k++) {
					elements.push({
						type: "rectangle",
						id: `${prefix}-card${j}${k}`,
						x,
						y: 110 + k * 70,
						width: 150,
						height: 50,
						strokeColor: "#d1d5db",
						backgroundColor: "#fefce8",
						fillStyle: "solid",
						strokeWidth: 1,
						roughness: 0,
						roundness: { type: 3 },
					});
				}
			}
			break;
		}
	}

	return JSON.stringify(elements);
}

const WHITEBOARD_TITLES: Record<string, string[]> = {
	architecture: [
		"API Gateway Architecture",
		"Microservices Topology",
		"Database Schema Diagram",
		"Auth Flow Architecture",
		"Event Pipeline Architecture",
		"CDN & Caching Architecture",
		"WebSocket Architecture",
		"Message Queue Architecture",
		"CI/CD Pipeline Diagram",
		"Infrastructure Overview",
		"Service Mesh Topology",
		"Data Flow Diagram — Analytics",
		"API v2 System Context",
		"Mobile App Architecture",
		"Notification System Architecture",
		"Search Index Architecture",
		"Deployment Architecture",
		"Rate Limiter Design",
		"Token Auth Flow",
		"Webhook Delivery Architecture",
		"ClickHouse Schema Design",
		"Redis Cache Topology",
		"Load Balancer Configuration",
		"Backup & Recovery Flow",
		"Multi-Tenant Architecture",
	],
	wireframe: [
		"Dashboard Main View",
		"Issue Detail Page",
		"Project Settings Page",
		"Onboarding Welcome Screen",
		"Analytics Dashboard Layout",
		"Notification Center Layout",
		"Mobile App Home Screen",
		"Mobile Issue List View",
		"Admin User Management Page",
		"Billing Portal Layout",
		"Search Results Page",
		"Document Editor Layout",
		"Team Settings Page",
		"API Key Management Page",
		"Webhook Configuration Page",
		"Widget Editor Panel",
		"Sprint Board Layout",
		"Client Details View",
		"File Manager Layout",
		"Chat Sidebar Layout",
		"Command Palette Design",
		"Login Page Layout",
		"Signup Flow Wireframe",
		"Profile Settings Page",
		"Integration Settings Page",
	],
	flowchart: [
		"User Registration Flow",
		"Issue Triage Process",
		"Sprint Planning Workflow",
		"Code Review Process",
		"Deployment Approval Flow",
		"Bug Report Handling",
		"Feature Request Pipeline",
		"Incident Response Flow",
		"Customer Onboarding Process",
		"API Key Provisioning Flow",
		"Subscription Upgrade Flow",
		"Password Reset Flow",
		"Invite Acceptance Flow",
		"Document Approval Process",
		"Data Migration Workflow",
		"Release Checklist Flow",
		"Security Review Process",
		"Payment Processing Flow",
		"Webhook Retry Logic",
		"Notification Routing Flow",
		"OAuth Authorization Flow",
		"Token Refresh Flow",
		"Error Escalation Process",
		"Backup Verification Flow",
		"Canary Promotion Flow",
	],
	planning: [
		"Sprint 2 Board — Core API",
		"Sprint 2 Board — Dashboard",
		"Q1 OKR Planning",
		"Team Capacity Planning",
		"Feature Prioritization Matrix",
		"Technical Debt Tracker",
		"Release Planning — v2.0",
		"Dependency Mapping",
		"Risk Assessment Board",
		"Stakeholder Mapping",
		"Competitor Analysis Board",
		"User Story Mapping — Mobile",
		"Architecture Decision Board",
		"Integration Planning Board",
		"Testing Strategy Board",
		"Migration Checklist Board",
		"Launch Readiness Board",
		"Post-Launch Review Board",
		"Q2 Roadmap Planning",
		"Hiring Pipeline Board",
		"Design Sprint Board",
		"Retrospective Board — Sprint 11",
		"Customer Feedback Board",
		"Bug Bash Tracking Board",
		"SDK Feature Matrix",
	],
};

// ── Comment Templates ────────────────────────────────────────────────────────

const COMMENT_TEXTS = [
	"I've reviewed this and it looks good. The approach is clean and well-tested. One minor suggestion: consider adding a retry mechanism for the edge case where the connection drops mid-request.",
	"This needs more context. Can you add a description of the expected behavior when the user has no permissions? The current implementation silently fails which could confuse users.",
	"Good progress on this. The performance numbers look solid — 140ms p95 is well within our target. Let's make sure we add monitoring for this endpoint before marking it done.",
	"I think we should split this into two separate issues. The UI changes and the API changes can be developed in parallel. Creating the sub-issues now.",
	"Tested on iOS 17 and 18 — both working correctly. The offline sync resolves cleanly after network recovery. Approving.",
	"The Stripe webhook handler needs idempotency. If we receive the same event twice (which Stripe does sometimes), we could double-process the subscription change. Adding a deduplication check.",
	"Updated the PR with the requested changes. The error handling now returns proper HTTP status codes instead of generic 500s. Also added request validation using Zod.",
	"This is blocked by the auth migration. We need the new JWT middleware deployed before we can implement the rate limiting headers. Moving to blocked status.",
	"Just ran the load test — 5000 concurrent connections, zero dropped messages. The WebSocket implementation handles backpressure correctly. Ready for staging.",
	"Nice catch on the memory leak. The event listener was being registered on every render without cleanup. Fixed with the useEffect cleanup return. Memory usage is stable now.",
	"The dark mode implementation looks great. Tested across all pages — no contrast issues detected by axe-core. The only thing missing is the code block syntax highlighting theme.",
	"Can we get this into Sprint 3? The customer (TechStream) specifically asked for this feature in our last review call. Adding the priority label.",
	"I disagree with the approach here. Using a polling mechanism instead of WebSockets for real-time updates will increase server load significantly. Let's discuss in the architecture review.",
	"The migration script ran successfully in staging. 450K records migrated in 18 minutes with zero validation errors. Ready to schedule the production migration.",
	"Documentation updated. Added the new endpoints to the OpenAPI spec and regenerated the SDK types. The interactive playground examples are also updated.",
	"Accessibility audit passed for this component. Tab order is correct, ARIA labels are present, and color contrast meets WCAG AA. Screen reader testing with VoiceOver confirmed.",
	"The GraphQL subscription implementation is working but needs optimization. Currently creates a new DB connection per subscription. Should pool connections instead.",
	"Fixed the flaky test. The issue was a race condition in the async cleanup. Added proper await and the test suite is now green — ran it 50 times with zero failures.",
	"This PR introduces a breaking change to the webhook payload format. We need to version the webhook events and notify all integrators before deploying. Adding the breaking-change label.",
	"Performance regression detected: the dashboard load time increased from 600ms to 1.2s after this change. The issue is an N+1 query in the widget data fetcher. Investigating.",
	"The Figma designs are updated with the latest token changes. Syncing to code now. ETA for the Storybook stories: end of day.",
	"Good refactoring of the auth module. The separation of concerns between token validation and permission checking makes the code much more testable. Approved.",
	"We need to add error boundaries around each widget to prevent one failing widget from crashing the entire dashboard. This is a P1 for the beta release.",
	"The canary deployment looks healthy after 30 minutes at 25% traffic. Error rate is 0.02% vs 0.01% baseline. Latency is within normal range. Promoting to 100%.",
	"Just merged the ClickHouse schema changes. The new materialized views reduce query time for the daily active users report from 8s to 200ms. Significant improvement.",
	"The Python SDK alpha is published to PyPI. Tested with Python 3.10, 3.11, and 3.12. All resource endpoints work correctly. Async client performs well under load.",
	"Security finding: the file upload endpoint doesn't validate content type headers. An attacker could upload a .html file disguised as an image. Adding server-side content type detection.",
	"The notification batching algorithm needs tuning. Currently the 5-minute window is too long for urgent notifications. Proposing a priority-based window: urgent = immediate, normal = 5 min, low = 15 min.",
	"Customer feedback from GreenField: 'The new dashboard layout is exactly what we needed. The drag-and-drop is smooth and the widget refresh is fast.' Great work team!",
	"This issue has been open for 3 weeks without progress. The original assignee is on the mobile team now. Reassigning to Ryan for the next sprint.",
];

// ── Notification Templates ───────────────────────────────────────────────────

interface NotificationTemplate {
	type: string;
	title: string;
	body: string;
}

const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
	// issue_assigned (20)
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-042: Fix token refresh loop in OAuth flow",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-087: Implement dark mode for code blocks",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-103: Add rate limit headers to API responses",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-156: Fix WebSocket reconnection on mobile",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-201: Optimize dashboard widget rendering",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-234: Add ARIA labels to navigation",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-267: Implement Stripe webhook idempotency",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-289: Fix N+1 query in project list",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-312: Add search suggestions dropdown",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-345: Implement push notification grouping",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-378: Fix memory leak in chart widget",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-401: Add export to CSV for data tables",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-423: Implement custom webhook events",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-456: Fix timezone handling in scheduler",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-478: Add MFA support for admin accounts",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-501: Optimize image loading with lazy load",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-523: Fix scroll position restore on back",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-545: Add keyboard shortcuts to command palette",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-567: Implement batch notification digest",
	},
	{
		type: "issue_assigned",
		title: "Issue assigned to you",
		body: "VEL-589: Fix drag-and-drop on touch devices",
	},
	// issue_status_changed (15)
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-042 moved to In Review by Alex Chen",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-087 moved to Done by Sarah Kim",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-103 moved to In Progress by Marcus Johnson",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-156 moved to Testing by Priya Sharma",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-201 moved to Blocked by David Kim",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-234 moved to Done by Emily Zhang",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-267 moved to In Review by Marcus Johnson",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-289 moved to Done by Alex Chen",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-312 moved to In Progress by Sarah Kim",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-345 moved to Testing by Priya Sharma",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-378 moved to Done by David Kim",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-401 moved to In Review by Emily Zhang",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-423 moved to Blocked by James Lee",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-456 moved to Done by Marcus Johnson",
	},
	{
		type: "issue_status_changed",
		title: "Issue status changed",
		body: "VEL-478 moved to In Progress by James Lee",
	},
	// comment (15)
	{
		type: "comment",
		title: "New comment on VEL-042",
		body: "Alex Chen: The JWT refresh logic needs a mutex to prevent race conditions",
	},
	{
		type: "comment",
		title: "New comment on VEL-087",
		body: "Sarah Kim: Dark mode theme variables are now consistent across all editors",
	},
	{
		type: "comment",
		title: "New comment on VEL-103",
		body: "Marcus Johnson: Rate limit headers follow the IETF draft standard",
	},
	{
		type: "comment",
		title: "New comment on VEL-156",
		body: "Priya Sharma: WebSocket reconnection tested on iPhone 14 and Pixel 8",
	},
	{
		type: "comment",
		title: "New comment on VEL-201",
		body: "David Kim: Widget rendering optimized — re-renders reduced by 60%",
	},
	{
		type: "comment",
		title: "New comment on VEL-234",
		body: "Emily Zhang: All ARIA labels verified with VoiceOver on macOS",
	},
	{
		type: "comment",
		title: "New comment on VEL-267",
		body: "Marcus Johnson: Idempotency key now stored in the webhook events table",
	},
	{
		type: "comment",
		title: "New comment on VEL-289",
		body: "Alex Chen: Query optimization reduced response time from 340ms to 140ms",
	},
	{
		type: "comment",
		title: "New comment on VEL-312",
		body: "Sarah Kim: Search suggestions use debounced input with 300ms delay",
	},
	{
		type: "comment",
		title: "New comment on VEL-345",
		body: "Priya Sharma: Push grouping implemented for both iOS and Android",
	},
	{
		type: "comment",
		title: "New comment on VEL-378",
		body: "David Kim: Memory leak was caused by uncleared event listeners in useEffect",
	},
	{
		type: "comment",
		title: "New comment on VEL-401",
		body: "Emily Zhang: CSV export handles Unicode characters correctly",
	},
	{
		type: "comment",
		title: "New comment on VEL-423",
		body: "James Lee: Custom webhook events use the same signature verification",
	},
	{
		type: "comment",
		title: "New comment on VEL-456",
		body: "Marcus Johnson: All dates now stored as UTC with timezone conversion at render",
	},
	{
		type: "comment",
		title: "New comment on VEL-478",
		body: "James Lee: TOTP-based MFA with backup codes implemented",
	},
	// project_update (10)
	{
		type: "project_update",
		title: "Project update: Core API Platform",
		body: "Sprint 2 wrapping up. GraphQL subscriptions are the last item.",
	},
	{
		type: "project_update",
		title: "Project update: Customer Dashboard v2",
		body: "KPI card widget shipping today. Activity feed needs design review.",
	},
	{
		type: "project_update",
		title: "Project update: Mobile App (iOS)",
		body: "TestFlight build 42 is stable. Targeting beta release next week.",
	},
	{
		type: "project_update",
		title: "Project update: Payment Gateway",
		body: "Stripe integration complete. Billing portal UI at 60% completion.",
	},
	{
		type: "project_update",
		title: "Project update: Analytics Engine",
		body: "Ingestion pipeline handles 2M events/day. Query engine sprint starting.",
	},
	{
		type: "project_update",
		title: "Project update: Search & Discovery",
		body: "Vector index design finalized. Embedding model selected.",
	},
	{
		type: "project_update",
		title: "Project update: Notification System v2",
		body: "Multi-channel delivery live in staging. Smart batching next.",
	},
	{
		type: "project_update",
		title: "Project update: Design System",
		body: "42 of 55 components shipped. Data components sprint starting.",
	},
	{
		type: "project_update",
		title: "Project update: CI/CD Pipeline",
		body: "47 of 52 Jenkins jobs migrated. Canary deployment POC working.",
	},
	{
		type: "project_update",
		title: "Project update: Security Audit Q1",
		body: "Vulnerability assessment complete. Zero critical findings.",
	},
	// document_update (10)
	{
		type: "document_update",
		title: "Document updated",
		body: "Alex Chen edited 'Core API v2 Requirements'",
	},
	{
		type: "document_update",
		title: "Document updated",
		body: "Sarah Kim edited 'Dashboard Widget Framework PRD'",
	},
	{
		type: "document_update",
		title: "Document updated",
		body: "Marcus Johnson edited 'Analytics Pipeline Design'",
	},
	{
		type: "document_update",
		title: "Document updated",
		body: "Priya Sharma edited 'Offline Sync Architecture — iOS'",
	},
	{
		type: "document_update",
		title: "Document updated",
		body: "David Kim edited 'CI/CD Pipeline Architecture'",
	},
	{
		type: "document_update",
		title: "Document updated",
		body: "Emily Zhang edited 'Design Token Pipeline'",
	},
	{
		type: "document_update",
		title: "Document updated",
		body: "James Lee edited 'Security Audit Framework'",
	},
	{
		type: "document_update",
		title: "Document updated",
		body: "Alex Chen edited 'RFC: Migrate to GraphQL'",
	},
	{
		type: "document_update",
		title: "Document updated",
		body: "Marcus Johnson edited 'Deployment Runbook'",
	},
	{
		type: "document_update",
		title: "Document updated",
		body: "Emily Zhang edited 'Accessibility Testing Guide'",
	},
	// issue_mentioned (10)
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "Alex Chen mentioned you in VEL-042: 'Can @you review the token rotation logic?'",
	},
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "Sarah Kim mentioned you in VEL-201: '@you what do you think about the widget API?'",
	},
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "Marcus Johnson mentioned you in VEL-267: '@you the Stripe webhook changes are ready for review'",
	},
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "Priya Sharma mentioned you in VEL-345: '@you push notification grouping is ready for testing'",
	},
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "David Kim mentioned you in VEL-378: '@you found the root cause of the memory leak'",
	},
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "Emily Zhang mentioned you in VEL-234: '@you accessibility fixes are merged'",
	},
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "James Lee mentioned you in VEL-478: '@you MFA implementation needs security review'",
	},
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "Alex Chen mentioned you in a comment: 'Can @you take a look at the GraphQL schema?'",
	},
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "Sarah Kim mentioned you in a comment: '@you the dashboard wireframes are ready'",
	},
	{
		type: "issue_mentioned",
		title: "You were mentioned",
		body: "Marcus Johnson mentioned you in a comment: '@you rate limiting config is deployed'",
	},
	// story_assigned (5)
	{
		type: "story_assigned",
		title: "Story assigned to you",
		body: "VEL-S-012: Implement GraphQL subscription support",
	},
	{
		type: "story_assigned",
		title: "Story assigned to you",
		body: "VEL-S-025: Build KPI card widget with real-time data",
	},
	{
		type: "story_assigned",
		title: "Story assigned to you",
		body: "VEL-S-038: Add biometric authentication to iOS app",
	},
	{
		type: "story_assigned",
		title: "Story assigned to you",
		body: "VEL-S-051: Implement Stripe subscription webhooks",
	},
	{
		type: "story_assigned",
		title: "Story assigned to you",
		body: "VEL-S-064: Build event ingestion pipeline",
	},
	// task_assigned (5)
	{
		type: "task_assigned",
		title: "Task assigned to you",
		body: "TSK-003: Review PR #342 for auth migration",
	},
	{
		type: "task_assigned",
		title: "Task assigned to you",
		body: "TSK-012: Update API documentation for v2 endpoints",
	},
	{
		type: "task_assigned",
		title: "Task assigned to you",
		body: "TSK-025: Run load test on WebSocket server",
	},
	{
		type: "task_assigned",
		title: "Task assigned to you",
		body: "TSK-031: Prepare sprint demo for stakeholders",
	},
	{
		type: "task_assigned",
		title: "Task assigned to you",
		body: "TSK-045: Review security audit findings",
	},
	// system (5)
	{
		type: "system",
		title: "Scheduled maintenance",
		body: "Database maintenance window: Saturday 2am-4am UTC. Expect brief API interruptions.",
	},
	{
		type: "system",
		title: "New feature available",
		body: "AI chat sidebar is now available in your workspace. Press Cmd+J to open.",
	},
	{
		type: "system",
		title: "Usage limit approaching",
		body: "Your workspace has used 80% of the monthly AI message allocation.",
	},
	{
		type: "system",
		title: "Workspace backup complete",
		body: "Weekly workspace backup completed successfully. 2.4GB stored.",
	},
	{
		type: "system",
		title: "SDK update available",
		body: "JavaScript SDK v2.1.0 is available with new webhook utilities.",
	},
	// whiteboard_update (5)
	{
		type: "whiteboard_update",
		title: "Whiteboard updated",
		body: "Alex Chen edited 'API Gateway Architecture'",
	},
	{
		type: "whiteboard_update",
		title: "Whiteboard updated",
		body: "Sarah Kim edited 'Dashboard Main View'",
	},
	{
		type: "whiteboard_update",
		title: "Whiteboard updated",
		body: "Emily Zhang edited 'Sprint 2 Board — Core API'",
	},
	{
		type: "whiteboard_update",
		title: "Whiteboard updated",
		body: "David Kim edited 'CI/CD Pipeline Diagram'",
	},
	{
		type: "whiteboard_update",
		title: "Whiteboard updated",
		body: "Priya Sharma edited 'User Registration Flow'",
	},
];

// ── Task Templates ───────────────────────────────────────────────────────────

const TASK_TITLES = [
	"Review PR #342 for auth migration",
	"Update team wiki with new API docs",
	"Prepare sprint demo for stakeholders",
	"Write unit tests for webhook handler",
	"Update Figma tokens in design system",
	"Review security audit findings",
	"Set up staging environment for billing",
	"Write migration guide for v1 to v2",
	"Fix flaky test in auth module",
	"Add monitoring dashboard for new endpoints",
	"Review and merge dependency updates",
	"Schedule pen test with CyberSafe",
	"Create demo video for onboarding flow",
	"Update README for Python SDK",
	"Run load test on analytics pipeline",
	"Set up PagerDuty escalation policies",
	"Review Stripe test mode configurations",
	"Add error boundaries to dashboard widgets",
	"Update CI workflow for matrix builds",
	"Write postmortem for Feb 5 incident",
	"Create Storybook stories for new components",
	"Review mobile app TestFlight feedback",
	"Set up ClickHouse retention policies",
	"Add CORS headers to API gateway",
	"Write integration tests for search API",
	"Review accessibility audit results",
	"Update design tokens for dark mode",
	"Configure Slack notification webhook",
	"Write API key rotation documentation",
	"Set up Grafana dashboards for monitoring",
	"Review canary deployment metrics",
	"Fix TypeScript strict mode violations",
	"Add rate limit bypass for health checks",
	"Update OpenAPI spec with new endpoints",
	"Write changelog for v2.0 release",
	"Set up automated backup verification",
	"Review and close stale issues",
	"Add custom domain support to docs site",
	"Write SDK authentication guide",
	"Create runbook for database failover",
	"Review UI component accessibility",
	"Set up GitHub Actions secrets",
	"Write technical blog post about GraphQL migration",
	"Add Sentry error tracking to mobile apps",
	"Review data migration test results",
	"Update team availability calendar",
	"Write onboarding checklist for new hires",
	"Set up preview deployment environments",
	"Create customer feedback survey",
	"Review and approve Q2 roadmap",
];

// ── AI Chat Thread Titles ────────────────────────────────────────────────────

const AI_THREAD_TITLES = [
	"Help me write a PRD for the payment system",
	"Debug the auth token refresh bug",
	"Summarize sprint 2 progress",
	"Write unit tests for the webhook handler",
	"Explain the analytics pipeline architecture",
	"Review this GraphQL schema design",
	"Draft a postmortem for the API outage",
	"Help me plan the search feature sprint",
	"Optimize this database query",
	"Write a migration guide for API v2",
	"Analyze the dashboard performance metrics",
	"Generate a sprint planning summary",
	"Help me triage these bug reports",
	"Write documentation for the Python SDK",
	"Review the security audit findings",
	"Create a deployment checklist",
	"Explain this error in the CI pipeline",
	"Help me design the notification batching algorithm",
	"Write a technical RFC for API versioning",
	"Summarize the design system component status",
	"Help debug the WebSocket reconnection issue",
	"Draft release notes for v2.0",
	"Analyze test coverage gaps",
	"Write a code review for the billing integration",
	"Help me estimate the search feature",
	"Create a data migration plan for TechStream",
	"Explain the offline sync conflict resolution",
	"Draft a customer update for the dashboard release",
	"Help me set up PagerDuty alert rules",
	"Write a proposal for the accessibility automation",
	"Review the mobile app architecture diagram",
	"Help plan the SDK auto-generation pipeline",
	"Summarize open issues for the security audit",
	"Write acceptance criteria for the onboarding flow",
	"Debug the chart widget memory leak",
	"Help me design the API key rotation flow",
	"Create a test plan for the notification system",
	"Analyze the ClickHouse query performance",
	"Write a comparison of embedding models",
	"Help me prepare for the architecture review",
	"Draft a meeting agenda for the engineering sync",
	"Review the Stripe webhook event handling",
	"Help me write a status report for the CTO",
	"Explain the canary deployment metrics",
	"Create a runbook for database incidents",
	"Help me refactor the auth middleware",
	"Write a guide for setting up the dev environment",
	"Analyze user onboarding completion rates",
	"Draft a proposal for hiring a DevOps engineer",
	"Help me debug the iOS offline sync crash",
	"Create acceptance tests for the billing portal",
	"Summarize the competitor analysis",
	"Help me write a technical specification",
	"Review the CI/CD pipeline optimization",
	"Draft a communication plan for API deprecation",
	"Help me design the webhook retry logic",
	"Write a performance budget for the dashboard",
	"Analyze the notification delivery success rates",
	"Help me create a feature flag strategy",
	"Draft a quarterly engineering report",
	"Review the Python SDK API surface",
	"Help me plan the accessibility remediation",
	"Create monitoring alerts for the analytics pipeline",
	"Write documentation for custom webhook events",
	"Help me debug a flaky integration test",
	"Summarize the Q1 security audit results",
	"Draft an incident communication template",
	"Help me optimize the search ranking algorithm",
	"Review the design token pipeline configuration",
	"Create a load testing strategy",
	"Help me write an API changelog",
	"Analyze the mobile app crash reports",
	"Draft a technical interview question set",
	"Help me set up Grafana dashboards",
	"Write a guide for Stripe testing",
	"Review the canary deployment configuration",
	"Help me design the admin impersonation feature",
	"Create a checklist for SOC 2 compliance",
	"Summarize the team retrospective action items",
	"Help me write error handling guidelines",
	"Draft a proposal for database sharding",
	"Review the WebSocket server configuration",
	"Help me plan the SDK documentation site",
	"Create a dependency update strategy",
	"Analyze the API latency regression",
	"Help me write a data retention policy",
	"Draft a technical vision document",
	"Review the push notification implementation",
	"Help me debug the dashboard widget data fetcher",
	"Create a branching strategy document",
	"Help me plan the Q2 engineering roadmap",
	"Write a guide for webhook signature verification",
	"Analyze the onboarding funnel drop-off",
	"Help me design the notification preference UI",
	"Draft a proposal for the internal admin console",
	"Review the ClickHouse materialized views",
	"Help me write a secure coding guidelines doc",
	"Create a release candidate testing plan",
	"Summarize all open P1 issues",
	"Help me debug the rate limiter edge case",
	"Draft a deprecation timeline for API v1",
];

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1: Seed Documents and Whiteboards
// ═══════════════════════════════════════════════════════════════════════════════

export const seedDocumentsAndBoards = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		creatorUserId: v.id("users"),
		userIds: v.array(v.id("users")),
		labelIds: v.array(v.id("labels")),
		projectIds: v.array(v.id("projects")),
		allIssueIds: v.array(v.id("issues")),
	},
	handler: async (
		ctx,
		{ workspaceId, creatorUserId, userIds, labelIds, projectIds, allIssueIds },
	) => {
		const documentIds: Id<"documents">[] = [];

		// ── 50 Documents ────────────────────────────────────────────────────

		for (let i = 0; i < ALL_DOCUMENTS.length && i < 50; i++) {
			const doc = ALL_DOCUMENTS[i];
			const projectId =
				doc.projectIndex !== null && doc.projectIndex < projectIds.length
					? projectIds[doc.projectIndex]
					: undefined;

			const createdByUser =
				doc.projectIndex !== null
					? userIds[
							DEMO_PROJECTS[doc.projectIndex].memberIndices[
								Math.floor(
									Math.random() *
										DEMO_PROJECTS[doc.projectIndex].memberIndices.length,
								)
							]
						]
					: pickRandom(userIds);

			const lastEditor =
				Math.random() > 0.5 ? createdByUser : pickRandom(userIds);

			const docId = await ctx.db.insert("documents", {
				workspaceId,
				projectId,
				title: doc.title,
				icon: doc.icon,
				content: doc.content,
				sortOrder: Date.now() - i * 1000,
				createdBy: createdByUser,
				lastEditedBy: lastEditor,
				updatedAt: daysAgo(Math.floor(Math.random() * 14)),
				syncVersion: "v2",
			});
			documentIds.push(docId);
		}

		// ── 100 Whiteboards ─────────────────────────────────────────────────

		const whiteboardIds: Id<"whiteboards">[] = [];
		const types = [
			"architecture",
			"wireframe",
			"flowchart",
			"planning",
		] as const;

		for (let typeIdx = 0; typeIdx < types.length; typeIdx++) {
			const type = types[typeIdx];
			const titles = WHITEBOARD_TITLES[type];

			for (let i = 0; i < 25; i++) {
				const projectIndex = (typeIdx * 25 + i) % DEMO_PROJECTS.length;
				const projectId =
					projectIndex < projectIds.length
						? projectIds[projectIndex]
						: undefined;

				const createdByUser =
					userIds[
						DEMO_PROJECTS[projectIndex].memberIndices[
							Math.floor(
								Math.random() *
									DEMO_PROJECTS[projectIndex].memberIndices.length,
							)
						]
					];

				const icons = ["📐", "🖼️", "📝", "📌"];

				const wbId = await ctx.db.insert("whiteboards", {
					workspaceId,
					projectId,
					title: titles[i],
					icon: icons[typeIdx],
					sceneData: generateWhiteboardScene(type, i),
					appState: "{}",
					sortOrder: Date.now() - (typeIdx * 25 + i) * 1000,
					createdBy: createdByUser,
					lastEditedBy:
						Math.random() > 0.5 ? createdByUser : pickRandom(userIds),
					updatedAt: daysAgo(Math.floor(Math.random() * 14)),
				});
				whiteboardIds.push(wbId);
			}
		}

		// ── Schedule Phase 2: Social Data ───────────────────────────────────

		await ctx.scheduler.runAfter(0, internal.demo.seedContent.seedSocialData, {
			workspaceId,
			creatorUserId,
			userIds,
			projectIds,
			allIssueIds,
			documentIds,
			whiteboardIds,
		});
	},
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 2: Seed Social Data (Comments, Notifications, Activity Logs)
// ═══════════════════════════════════════════════════════════════════════════════

export const seedSocialData = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		creatorUserId: v.id("users"),
		userIds: v.array(v.id("users")),
		projectIds: v.array(v.id("projects")),
		allIssueIds: v.array(v.id("issues")),
		documentIds: v.array(v.id("documents")),
		whiteboardIds: v.array(v.id("whiteboards")),
	},
	handler: async (
		ctx,
		{
			workspaceId,
			creatorUserId,
			userIds,
			projectIds,
			allIssueIds,
			documentIds,
			whiteboardIds,
		},
	) => {
		// ── 200 Comments on Issues ──────────────────────────────────────────

		const commentableIssues = pickRandomN(
			allIssueIds,
			Math.min(100, allIssueIds.length),
		);
		const commentIds: Id<"comments">[] = [];

		for (let i = 0; i < commentableIssues.length; i++) {
			const issueId = commentableIssues[i];
			const author1 = pickRandom(userIds);
			const commentId1 = await ctx.db.insert("comments", {
				issueId,
				body: COMMENT_TEXTS[i % COMMENT_TEXTS.length],
				authorId: author1,
			});
			commentIds.push(commentId1);

			const author2 = pickRandom(userIds);
			const isReply = Math.random() < 0.3;
			const commentId2 = await ctx.db.insert("comments", {
				issueId,
				parentId: isReply ? commentId1 : undefined,
				body: COMMENT_TEXTS[(i + 15) % COMMENT_TEXTS.length],
				authorId: author2,
			});
			commentIds.push(commentId2);
		}

		// ── 100 Notifications for Creator ───────────────────────────────────

		for (let i = 0; i < 100 && i < NOTIFICATION_TEMPLATES.length; i++) {
			const tmpl = NOTIFICATION_TEMPLATES[i];
			const isRead = Math.random() < 0.6;
			const eventAt = daysAgo(Math.floor(Math.random() * 14));

			const linkedIssueId =
				allIssueIds.length > 0
					? allIssueIds[Math.floor(Math.random() * allIssueIds.length)]
					: undefined;
			const linkedProjectId =
				projectIds.length > 0
					? projectIds[Math.floor(Math.random() * projectIds.length)]
					: undefined;
			const linkedDocumentId =
				documentIds.length > 0
					? documentIds[Math.floor(Math.random() * documentIds.length)]
					: undefined;

			const otherUsers = userIds.filter((id) => id !== creatorUserId);
			const actorId =
				otherUsers.length > 0 ? pickRandom(otherUsers) : userIds[0];

			await ctx.db.insert("notifications", {
				userId: creatorUserId,
				workspaceId,
				type: tmpl.type,
				title: tmpl.title,
				body: tmpl.body,
				isRead,
				readAt: isRead ? eventAt + 3600000 : undefined,
				actorId,
				issueId:
					tmpl.type.startsWith("issue") || tmpl.type === "comment"
						? linkedIssueId
						: undefined,
				projectId: tmpl.type === "project_update" ? linkedProjectId : undefined,
				documentId:
					tmpl.type === "document_update" ? linkedDocumentId : undefined,
				eventAt,
			});
		}

		// ── 50 Activity Logs ────────────────────────────────────────────────

		const activityActions = [
			"project_created",
			"issue_status_changed",
			"document_updated",
			"comment_added",
			"issue_created",
		];
		const activityDescriptions = [
			"Created project",
			"Changed status from 'todo' to 'in_progress'",
			"Updated document content",
			"Added a comment",
			"Created a new issue",
		];

		for (let i = 0; i < 50; i++) {
			const actionIdx = i % activityActions.length;
			const actorId = pickRandom(userIds);

			await ctx.db.insert("activityLogs", {
				workspaceId,
				entityType: ["project", "issue", "document", "comment", "issue"][
					actionIdx
				],
				entityId:
					actionIdx === 0
						? (projectIds[i % projectIds.length] as string)
						: actionIdx === 2
							? documentIds.length > 0
								? (documentIds[i % documentIds.length] as string)
								: "unknown"
							: allIssueIds.length > 0
								? (allIssueIds[i % allIssueIds.length] as string)
								: "unknown",
				action: activityActions[actionIdx],
				actorId,
				description: activityDescriptions[actionIdx],
				projectId:
					actionIdx === 0 ? projectIds[i % projectIds.length] : undefined,
				issueId:
					actionIdx === 1 || actionIdx === 3 || actionIdx === 4
						? allIssueIds.length > 0
							? allIssueIds[i % allIssueIds.length]
							: undefined
						: undefined,
				documentId:
					actionIdx === 2
						? documentIds.length > 0
							? documentIds[i % documentIds.length]
							: undefined
						: undefined,
			});
		}

		// ── Schedule Phase 3: AI & Finalize ─────────────────────────────────

		await ctx.scheduler.runAfter(
			0,
			internal.demo.seedContent.seedAIAndFinalize,
			{
				workspaceId,
				creatorUserId,
				userIds,
				projectIds,
				labelIds: [],
				totalIssues: allIssueIds.length,
			},
		);
	},
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3: Seed AI Config, Tasks, Favorites, Recents, Threads & Finalize
// ═══════════════════════════════════════════════════════════════════════════════

export const seedAIAndFinalize = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		creatorUserId: v.id("users"),
		userIds: v.array(v.id("users")),
		projectIds: v.array(v.id("projects")),
		labelIds: v.array(v.id("labels")),
		totalIssues: v.number(),
	},
	handler: async (
		ctx,
		{ workspaceId, creatorUserId, userIds, projectIds, labelIds, totalIssues },
	) => {
		// ── 2 AI Teammates ──────────────────────────────────────────────────

		await ctx.db.insert("aiTeammates", {
			workspaceId,
			name: "Velocity Assistant",
			description:
				"General-purpose workspace assistant. Knows about all projects, issues, docs, and team members. Ask anything about the workspace.",
			systemPrompt:
				"You are Velocity Assistant, the AI teammate for Velocity Labs. You have deep knowledge of all 20 projects, team members, and workspace content. Be helpful, concise, and actionable. Reference specific issues, docs, and team members when relevant.",
			model: "claude-sonnet-4-5-20250514",
			isDefault: true,
			createdBy: creatorUserId,
		});

		await ctx.db.insert("aiTeammates", {
			workspaceId,
			name: "Sprint Coach",
			description:
				"Specialized for sprint planning, retrospectives, and team velocity analysis. Helps plan sprints, identify risks, and improve processes.",
			systemPrompt:
				"You are Sprint Coach, a specialized AI for agile practices at Velocity Labs. Help with sprint planning, retrospectives, velocity tracking, and process improvement. Use data from current sprints and past performance to make recommendations.",
			model: "claude-sonnet-4-5-20250514",
			isDefault: false,
			createdBy: creatorUserId,
		});

		// ── 3 Sub-Agents ────────────────────────────────────────────────────

		await ctx.db.insert("subAgents", {
			workspaceId,
			name: "Project Manager",
			description:
				"Sprint planning, issue triage, status reports, and team coordination",
			instructions:
				"You are a project management sub-agent. Help with sprint planning by analyzing backlog items and team capacity. Triage incoming issues by severity and team. Generate status reports summarizing progress across projects. Coordinate cross-team dependencies.",
			isShared: true,
			isPreset: true,
			createdBy: creatorUserId,
			updatedAt: Date.now(),
		});

		await ctx.db.insert("subAgents", {
			workspaceId,
			name: "Technical Writer",
			description: "Documentation, specs, meeting notes, and technical writing",
			instructions:
				"You are a technical writing sub-agent. Help draft PRDs, technical specifications, meeting notes, and documentation. Follow the Velocity Labs writing style: clear, concise, developer-friendly. Use proper formatting with headings, lists, and code blocks.",
			isShared: true,
			isPreset: true,
			createdBy: creatorUserId,
			updatedAt: Date.now(),
		});

		await ctx.db.insert("subAgents", {
			workspaceId,
			name: "Code Reviewer",
			description:
				"Code quality, security review, best practices, and performance analysis",
			instructions:
				"You are a code review sub-agent. Analyze code for quality, security vulnerabilities, performance issues, and adherence to team conventions. Check for OWASP Top 10 issues, proper error handling, test coverage gaps, and TypeScript best practices.",
			isShared: true,
			isPreset: true,
			createdBy: creatorUserId,
			updatedAt: Date.now(),
		});

		// ── 4 Skills ────────────────────────────────────────────────────────

		await ctx.db.insert("skills", {
			workspaceId,
			name: "Sprint Planning",
			description: "Guidelines for running effective sprint planning sessions",
			category: "workflow",
			markdownContent:
				"# Sprint Planning\n\n## Process\n1. Review the backlog and prioritize items by business value\n2. Estimate stories using fibonacci points (1, 2, 3, 5, 8, 13)\n3. Team capacity: 10 points per developer per sprint\n4. Reserve 20% capacity for bugs and technical debt\n5. Identify dependencies between stories and teams\n\n## Sprint Goals\n- Each sprint should have 2-3 measurable goals\n- Goals should be achievable within the 2-week sprint\n- At least one goal should deliver user-visible value\n\n## Definition of Done\n- Code reviewed and approved\n- Unit tests passing\n- Integration tests passing\n- Documentation updated\n- Deployed to staging and verified",
			isEnabled: true,
			createdBy: creatorUserId,
			updatedAt: Date.now(),
		});

		await ctx.db.insert("skills", {
			workspaceId,
			name: "Code Review Standards",
			description: "Coding standards and review checklist for the team",
			category: "engineering",
			markdownContent:
				"# Code Review Standards\n\n## Review Checklist\n- [ ] Code follows TypeScript strict mode conventions\n- [ ] Error handling is comprehensive (no swallowed errors)\n- [ ] Authentication and authorization checks are present\n- [ ] Input validation at system boundaries\n- [ ] No sensitive data in logs or error messages\n- [ ] Tests cover happy path and edge cases\n- [ ] Performance: no N+1 queries, proper pagination\n- [ ] Accessibility: ARIA labels, keyboard navigation\n\n## Style Guidelines\n- Use Biome for formatting (run biome check --write)\n- Prefer const over let\n- Use descriptive variable names\n- Keep functions under 50 lines\n- Document non-obvious logic with comments",
			isEnabled: true,
			createdBy: creatorUserId,
			updatedAt: Date.now(),
		});

		await ctx.db.insert("skills", {
			workspaceId,
			name: "Bug Triage Protocol",
			description:
				"Severity classification and assignment rules for incoming bugs",
			category: "workflow",
			markdownContent:
				"# Bug Triage Protocol\n\n## Severity Classification\n- **P1 Critical**: Service outage, data loss, security breach. Fix immediately.\n- **P2 High**: Major feature broken, no workaround. Fix within 24 hours.\n- **P3 Medium**: Feature broken but workaround exists. Fix within current sprint.\n- **P4 Low**: Minor cosmetic issue. Schedule for backlog grooming.\n\n## Assignment Rules\n- P1: Page on-call engineer via PagerDuty\n- P2: Assign to team lead of affected area\n- P3: Add to sprint backlog, assign during planning\n- P4: Add to backlog, groom monthly\n\n## Required Information\n- Steps to reproduce\n- Expected vs actual behavior\n- Environment (browser, OS, API version)\n- Screenshots or logs if applicable",
			isEnabled: true,
			createdBy: creatorUserId,
			updatedAt: Date.now(),
		});

		await ctx.db.insert("skills", {
			workspaceId,
			name: "Documentation Guidelines",
			description: "Document structure and style guide for technical docs",
			category: "writing",
			markdownContent:
				'# Documentation Guidelines\n\n## Structure\n1. **Title** — clear, descriptive, searchable\n2. **Overview** — 2-3 sentences explaining what and why\n3. **Prerequisites** — what the reader needs before starting\n4. **Steps** — numbered list with code examples\n5. **Troubleshooting** — common issues and solutions\n\n## Style Rules\n- Use active voice: "Create a project" not "A project can be created"\n- Use second person: "You can configure..." not "Users can configure..."\n- Keep sentences under 25 words\n- Use code blocks for all code, commands, and file paths\n- Include expected output for commands\n\n## Code Examples\n- Every endpoint must have a request and response example\n- Use realistic data, not "foo" and "bar"\n- Show error responses alongside success responses',
			isEnabled: true,
			createdBy: creatorUserId,
			updatedAt: Date.now(),
		});

		// ── 50 Personal Tasks ───────────────────────────────────────────────

		const taskStatuses = ["todo", "in_progress", "done", "cancelled"];
		const taskPriorities = ["urgent", "high", "medium", "low", "none"];
		const taskTypes = ["task", "task", "task", "bug", "feature"];

		for (let i = 0; i < 50; i++) {
			const status = taskStatuses[i % taskStatuses.length];
			const priority = taskPriorities[i % taskPriorities.length];
			const taskType = taskTypes[i % taskTypes.length];
			const identifier = `TSK-${String(i + 1).padStart(3, "0")}`;

			await ctx.db.insert("tasks", {
				workspaceId,
				projectId:
					i < 30 && projectIds.length > 0
						? projectIds[i % projectIds.length]
						: undefined,
				identifier,
				title: TASK_TITLES[i],
				description:
					i % 3 === 0
						? `Details for: ${TASK_TITLES[i]}. This task needs to be completed as part of the current sprint deliverables.`
						: undefined,
				status,
				priority,
				type: taskType,
				assigneeId: creatorUserId,
				sortOrder: i,
				createdBy: creatorUserId,
				completedAt:
					status === "done"
						? daysAgo(Math.floor(Math.random() * 7))
						: undefined,
				updatedAt: daysAgo(Math.floor(Math.random() * 7)),
			});
		}

		// ── 10 Favorites ────────────────────────────────────────────────────

		for (let i = 0; i < 4 && i < projectIds.length; i++) {
			await ctx.db.insert("favorites", {
				userId: creatorUserId,
				workspaceId,
				entityType: "project",
				entityId: projectIds[i] as string,
				sortOrder: i,
			});
		}

		const docs = await ctx.db
			.query("documents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.take(3);
		for (let i = 0; i < docs.length; i++) {
			await ctx.db.insert("favorites", {
				userId: creatorUserId,
				workspaceId,
				entityType: "document",
				entityId: docs[i]._id as string,
				sortOrder: 4 + i,
			});
		}

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.take(3);
		for (let i = 0; i < issues.length; i++) {
			await ctx.db.insert("favorites", {
				userId: creatorUserId,
				workspaceId,
				entityType: "issue",
				entityId: issues[i]._id as string,
				sortOrder: 7 + i,
			});
		}

		// ── 15 Recents ──────────────────────────────────────────────────────

		const recentEntities: {
			entityType: string;
			entityId: string;
			daysBack: number;
		}[] = [];

		for (let i = 0; i < 4 && i < projectIds.length; i++) {
			recentEntities.push({
				entityType: "project",
				entityId: projectIds[i] as string,
				daysBack: i,
			});
		}

		for (let i = 0; i < 4 && i < docs.length; i++) {
			recentEntities.push({
				entityType: "document",
				entityId: docs[i]._id as string,
				daysBack: i + 1,
			});
		}

		for (let i = 0; i < 4 && i < issues.length; i++) {
			recentEntities.push({
				entityType: "issue",
				entityId: issues[i]._id as string,
				daysBack: i + 2,
			});
		}

		const boards = await ctx.db
			.query("whiteboards")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.take(3);
		for (let i = 0; i < boards.length; i++) {
			recentEntities.push({
				entityType: "whiteboard",
				entityId: boards[i]._id as string,
				daysBack: i + 3,
			});
		}

		for (let i = 0; i < Math.min(15, recentEntities.length); i++) {
			const entity = recentEntities[i];
			await ctx.db.insert("recents", {
				userId: creatorUserId,
				workspaceId,
				entityType: entity.entityType,
				entityId: entity.entityId,
				accessedAt: daysAgo(entity.daysBack),
			});
		}

		// ── 100 AI Chat Thread Metadata ─────────────────────────────────────

		const models = ["claude-sonnet-4-5-20250514", "claude-opus-4-5-20250514"];

		for (let i = 0; i < 100; i++) {
			const threadId = `demo-thread-${String(i + 1).padStart(3, "0")}`;
			const userId = userIds[i % userIds.length];

			await ctx.db.insert("aiThreads", {
				workspaceId,
				userId,
				threadId,
				title: AI_THREAD_TITLES[i % AI_THREAD_TITLES.length],
				model: models[i % models.length],
				updatedAt: daysAgo(Math.floor(Math.random() * 30)),
			});
		}

		// ── Finalize ────────────────────────────────────────────────────────

		await ctx.scheduler.runAfter(0, internal.demo.seed.finalizeDemoSeed, {
			workspaceId,
			totalIssues: totalIssues + 100,
			totalTasks: 50,
		});
	},
});
