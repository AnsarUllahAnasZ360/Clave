/**
 * Demo Workspace Constants
 *
 * Shared data definitions for the "Velocity Labs" demo workspace.
 * A 10-person software development company building a developer platform.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

export function daysAgo(n: number): number {
	return Date.now() - n * 24 * 60 * 60 * 1000;
}

export function daysFromNow(n: number): number {
	return Date.now() + n * 24 * 60 * 60 * 1000;
}

export function hoursAgo(n: number): number {
	return Date.now() - n * 60 * 60 * 1000;
}

// ── Demo Workspace Config ────────────────────────────────────────────────────

export const DEMO_WORKSPACE_NAME = "Demo Workspace";
export const DEMO_WORKSPACE_SLUG = "demo-workspace";
export const DEMO_WORKSPACE_DESCRIPTION =
	"Explore Clave's features with this fully populated demo workspace from Velocity Labs, a 10-person software development team.";
export const DEMO_ISSUE_PREFIX = "VEL";
export const DEMO_STORY_PREFIX = "VEL";
export const DEMO_TASK_PREFIX = "TSK";
export const DEMO_EXPIRES_DAYS = 30;

// ── Team Members ─────────────────────────────────────────────────────────────

export interface DemoUser {
	name: string;
	email: string;
	role: string;
	image: string;
	timezone: string;
}

export const DEMO_USERS: DemoUser[] = [
	{
		name: "Alex Chen",
		email: "alex.chen@velocitylabs.demo",
		role: "Engineering Lead",
		image:
			"https://api.dicebear.com/9.x/avataaars/svg?backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=AlexChen",
		timezone: "America/Los_Angeles",
	},
	{
		name: "Sarah Kim",
		email: "sarah.kim@velocitylabs.demo",
		role: "Senior Frontend Engineer",
		image:
			"https://api.dicebear.com/9.x/avataaars/svg?backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=SarahKim",
		timezone: "America/New_York",
	},
	{
		name: "Marcus Johnson",
		email: "marcus.johnson@velocitylabs.demo",
		role: "Senior Backend Engineer",
		image:
			"https://api.dicebear.com/9.x/avataaars/svg?backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=MarcusJohnson",
		timezone: "America/Chicago",
	},
	{
		name: "Priya Patel",
		email: "priya.patel@velocitylabs.demo",
		role: "Full-Stack Developer",
		image:
			"https://api.dicebear.com/9.x/avataaars/svg?backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=PriyaPatel",
		timezone: "Asia/Kolkata",
	},
	{
		name: "James O'Brien",
		email: "james.obrien@velocitylabs.demo",
		role: "DevOps / SRE",
		image:
			"https://api.dicebear.com/9.x/avataaars/svg?backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=JamesOBrien",
		timezone: "Europe/London",
	},
	{
		name: "Lisa Wang",
		email: "lisa.wang@velocitylabs.demo",
		role: "Product Designer",
		image:
			"https://api.dicebear.com/9.x/avataaars/svg?backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=LisaWang",
		timezone: "America/Los_Angeles",
	},
	{
		name: "David Rodriguez",
		email: "david.rodriguez@velocitylabs.demo",
		role: "QA Lead",
		image:
			"https://api.dicebear.com/9.x/avataaars/svg?backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=DavidRodriguez",
		timezone: "America/Denver",
	},
	{
		name: "Emma Thompson",
		email: "emma.thompson@velocitylabs.demo",
		role: "Product Manager",
		image:
			"https://api.dicebear.com/9.x/avataaars/svg?backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=EmmaThompson",
		timezone: "Europe/London",
	},
	{
		name: "Ryan Nakamura",
		email: "ryan.nakamura@velocitylabs.demo",
		role: "Junior Developer",
		image:
			"https://api.dicebear.com/9.x/avataaars/svg?backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=RyanNakamura",
		timezone: "America/Los_Angeles",
	},
];

// ── Labels ───────────────────────────────────────────────────────────────────

export interface DemoLabel {
	name: string;
	color: string;
	description: string;
}

export const DEMO_LABELS: DemoLabel[] = [
	{ name: "Bug", color: "red", description: "Something is broken" },
	{ name: "Feature", color: "blue", description: "New functionality" },
	{
		name: "Enhancement",
		color: "green",
		description: "Improvement to existing feature",
	},
	{
		name: "Documentation",
		color: "purple",
		description: "Documentation updates",
	},
	{
		name: "Performance",
		color: "yellow",
		description: "Performance improvement",
	},
	{
		name: "Security",
		color: "red",
		description: "Security vulnerability or hardening",
	},
	{ name: "UX", color: "pink", description: "User experience improvement" },
	{ name: "API", color: "indigo", description: "API changes" },
	{
		name: "Infrastructure",
		color: "amber",
		description: "Infrastructure and DevOps",
	},
	{ name: "Testing", color: "teal", description: "Test coverage and quality" },
	{
		name: "Accessibility",
		color: "cyan",
		description: "Accessibility compliance",
	},
	{
		name: "Tech Debt",
		color: "orange",
		description: "Technical debt and refactoring",
	},
];

// ── Projects ─────────────────────────────────────────────────────────────────

export interface DemoProject {
	name: string;
	icon: string;
	color: string;
	status: string;
	priority: string;
	structure: string;
	intent: string;
	description: string;
	summary: string;
	leadIndex: number; // index into DEMO_USERS
	memberIndices: number[]; // indices into DEMO_USERS
	tags: string[];
	scopeInItems: string[];
	scopeOutItems: string[];
	outcomes: string[];
	startDaysAgo: number;
	endDaysFromNow: number;
	milestones: DemoMilestone[];
	sprints: DemoSprint[];
}

export interface DemoMilestone {
	name: string;
	description: string;
	icon: string;
	status: string;
	startDaysAgo: number;
	targetDaysFromNow: number;
}

export interface DemoSprint {
	name: string;
	description: string;
	status: string;
	goals: string[];
	startDaysAgo: number;
	targetDaysFromNow: number;
}

export const DEMO_PROJECTS: DemoProject[] = [
	{
		name: "Core API Platform",
		icon: "🔧",
		color: "var(--chart-1)",
		status: "active",
		priority: "high",
		structure: "sprints",
		intent: "delivery",
		description:
			"The foundational REST and GraphQL API that powers all Velocity Labs products. Handles authentication, authorization, rate limiting, and core business logic for the developer platform.",
		summary: "Core API powering all products",
		leadIndex: 0,
		memberIndices: [0, 2, 3, 6, 8],
		tags: ["backend", "api", "core"],
		scopeInItems: [
			"REST API endpoints",
			"GraphQL schema",
			"Authentication middleware",
			"Rate limiting",
			"Database migrations",
		],
		scopeOutItems: ["Frontend integration", "Mobile SDK"],
		outcomes: [
			"99.9% API uptime",
			"<100ms p95 latency",
			"Complete API documentation",
		],
		startDaysAgo: 90,
		endDaysFromNow: 30,
		milestones: [
			{
				name: "API v2 Alpha",
				description: "Initial v2 endpoints with breaking changes",
				icon: "🅰️",
				status: "completed",
				startDaysAgo: 90,
				targetDaysFromNow: -30,
			},
			{
				name: "API v2 Beta",
				description: "Feature-complete with migration guides",
				icon: "🅱️",
				status: "active",
				startDaysAgo: 30,
				targetDaysFromNow: 14,
			},
			{
				name: "API v2 GA",
				description: "General availability with full backward compatibility",
				icon: "🚀",
				status: "active",
				startDaysAgo: 0,
				targetDaysFromNow: 30,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Auth Overhaul",
				description: "Migrate to JWT-based auth with refresh tokens",
				status: "completed",
				goals: [
					"Implement JWT auth",
					"Add refresh token rotation",
					"Migrate existing sessions",
				],
				startDaysAgo: 28,
				targetDaysFromNow: -14,
			},
			{
				name: "Sprint 2 — GraphQL Layer",
				description: "Add GraphQL schema alongside REST endpoints",
				status: "active",
				goals: [
					"Define GraphQL schema",
					"Implement resolvers",
					"Add subscription support",
				],
				startDaysAgo: 14,
				targetDaysFromNow: 0,
			},
			{
				name: "Sprint 3 — Rate Limiting & Monitoring",
				description: "Production-grade rate limiting and observability",
				status: "planned",
				goals: [
					"Implement sliding window rate limiter",
					"Add OpenTelemetry tracing",
					"Set up alerting",
				],
				startDaysAgo: 0,
				targetDaysFromNow: 14,
			},
		],
	},
	{
		name: "Customer Dashboard v2",
		icon: "📊",
		color: "var(--chart-2)",
		status: "active",
		priority: "high",
		structure: "sprints",
		intent: "delivery",
		description:
			"Complete redesign of the customer-facing dashboard with real-time analytics, customizable widgets, and improved navigation. Built with React 19 and server components.",
		summary: "Redesigned customer dashboard with real-time analytics",
		leadIndex: 1,
		memberIndices: [1, 3, 5, 7, 8],
		tags: ["frontend", "dashboard", "analytics"],
		scopeInItems: [
			"Dashboard layout engine",
			"Widget system",
			"Real-time data feeds",
			"Export functionality",
			"Dark mode",
		],
		scopeOutItems: ["Mobile responsive (separate project)", "White-labeling"],
		outcomes: [
			"50% reduction in time-to-insight",
			"NPS score > 8",
			"Sub-second dashboard load",
		],
		startDaysAgo: 60,
		endDaysFromNow: 45,
		milestones: [
			{
				name: "Design System Integration",
				description: "Adopt Orbit UI design system across all widgets",
				icon: "🎨",
				status: "completed",
				startDaysAgo: 60,
				targetDaysFromNow: -15,
			},
			{
				name: "Widget Framework",
				description: "Pluggable widget architecture with drag-and-drop",
				icon: "🧩",
				status: "active",
				startDaysAgo: 15,
				targetDaysFromNow: 20,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Layout Engine",
				description: "Grid-based layout with drag-and-drop",
				status: "completed",
				goals: [
					"Implement grid layout",
					"Add drag-and-drop",
					"Persist layouts",
				],
				startDaysAgo: 28,
				targetDaysFromNow: -14,
			},
			{
				name: "Sprint 2 — Core Widgets",
				description: "Build the 8 core dashboard widgets",
				status: "active",
				goals: ["Chart widgets", "Table widget", "KPI cards", "Activity feed"],
				startDaysAgo: 14,
				targetDaysFromNow: 0,
			},
		],
	},
	{
		name: "Mobile App (iOS)",
		icon: "📱",
		color: "var(--chart-3)",
		status: "active",
		priority: "medium",
		structure: "sprints",
		intent: "delivery",
		description:
			"Native iOS companion app for the Velocity platform. Push notifications, offline support, and biometric auth. Built with Swift and SwiftUI.",
		summary: "Native iOS app with push notifications and offline mode",
		leadIndex: 3,
		memberIndices: [3, 1, 5, 6],
		tags: ["mobile", "ios", "swift"],
		scopeInItems: [
			"Push notifications",
			"Offline data sync",
			"Biometric auth",
			"Deep linking",
		],
		scopeOutItems: ["Apple Watch app", "iPad optimization"],
		outcomes: [
			"4.5+ App Store rating",
			"10K downloads in first month",
			"Offline-first architecture",
		],
		startDaysAgo: 45,
		endDaysFromNow: 60,
		milestones: [
			{
				name: "TestFlight Beta",
				description: "Internal beta for team testing",
				icon: "✈️",
				status: "active",
				startDaysAgo: 45,
				targetDaysFromNow: 7,
			},
			{
				name: "App Store Launch",
				description: "Public App Store release",
				icon: "🍎",
				status: "active",
				startDaysAgo: 0,
				targetDaysFromNow: 60,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Auth & Navigation",
				description: "Authentication flow and tab navigation",
				status: "completed",
				goals: [
					"Biometric auth",
					"OAuth integration",
					"Tab navigation",
					"Deep linking",
				],
				startDaysAgo: 28,
				targetDaysFromNow: -14,
			},
			{
				name: "Sprint 2 — Core Features",
				description: "Project browsing and issue management",
				status: "active",
				goals: [
					"Project list",
					"Issue detail view",
					"Create/edit issues",
					"Push notifications",
				],
				startDaysAgo: 14,
				targetDaysFromNow: 0,
			},
		],
	},
	{
		name: "Mobile App (Android)",
		icon: "🤖",
		color: "var(--chart-4)",
		status: "active",
		priority: "medium",
		structure: "sprints",
		intent: "delivery",
		description:
			"Native Android companion app using Kotlin and Jetpack Compose. Feature parity with iOS, plus Material You theming.",
		summary: "Native Android app with Material You design",
		leadIndex: 8,
		memberIndices: [8, 2, 5, 6],
		tags: ["mobile", "android", "kotlin"],
		scopeInItems: [
			"Material You theming",
			"Push notifications",
			"Offline sync",
			"Widget support",
		],
		scopeOutItems: ["Wear OS app", "Tablet optimization"],
		outcomes: [
			"4.5+ Play Store rating",
			"Feature parity with iOS",
			"Material You compliance",
		],
		startDaysAgo: 45,
		endDaysFromNow: 60,
		milestones: [
			{
				name: "Internal Alpha",
				description: "Internal distribution for testing",
				icon: "🧪",
				status: "active",
				startDaysAgo: 45,
				targetDaysFromNow: 14,
			},
			{
				name: "Play Store Launch",
				description: "Public Play Store release",
				icon: "▶️",
				status: "active",
				startDaysAgo: 0,
				targetDaysFromNow: 60,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Foundation",
				description: "App architecture, auth, and navigation",
				status: "completed",
				goals: [
					"Set up Compose",
					"Auth flow",
					"Navigation graph",
					"Theme system",
				],
				startDaysAgo: 28,
				targetDaysFromNow: -14,
			},
			{
				name: "Sprint 2 — Core Screens",
				description: "Main screens and data layer",
				status: "active",
				goals: [
					"Project list",
					"Issue management",
					"Offline storage",
					"Push setup",
				],
				startDaysAgo: 14,
				targetDaysFromNow: 0,
			},
		],
	},
	{
		name: "Payment Gateway Integration",
		icon: "💳",
		color: "var(--chart-5)",
		status: "active",
		priority: "urgent",
		structure: "linear",
		intent: "delivery",
		description:
			"Integrate Stripe for subscription billing, usage-based pricing, and invoice management. Support multiple currencies and tax compliance.",
		summary: "Stripe billing with usage-based pricing",
		leadIndex: 2,
		memberIndices: [2, 0, 4, 7],
		tags: ["backend", "billing", "stripe"],
		scopeInItems: [
			"Stripe integration",
			"Subscription management",
			"Usage metering",
			"Invoice generation",
			"Tax calculation",
		],
		scopeOutItems: ["PayPal support", "Crypto payments"],
		outcomes: [
			"PCI compliance",
			"Zero billing errors",
			"Support 15+ currencies",
		],
		startDaysAgo: 30,
		endDaysFromNow: 14,
		milestones: [
			{
				name: "Stripe Integration",
				description: "Core Stripe API integration and webhook handling",
				icon: "💰",
				status: "completed",
				startDaysAgo: 30,
				targetDaysFromNow: -7,
			},
			{
				name: "Billing Portal",
				description: "Self-service billing management for customers",
				icon: "🏦",
				status: "active",
				startDaysAgo: 7,
				targetDaysFromNow: 14,
			},
		],
		sprints: [],
	},
	{
		name: "Analytics Engine",
		icon: "📈",
		color: "var(--chart-1)",
		status: "active",
		priority: "high",
		structure: "sprints",
		intent: "delivery",
		description:
			"Real-time analytics pipeline processing millions of events per day. ClickHouse for storage, Kafka for streaming, and custom aggregation engine.",
		summary: "Real-time event analytics pipeline",
		leadIndex: 2,
		memberIndices: [2, 0, 4, 3],
		tags: ["backend", "analytics", "data"],
		scopeInItems: [
			"Event ingestion",
			"Real-time aggregation",
			"Custom dashboards",
			"Data export",
			"Retention analysis",
		],
		scopeOutItems: ["ML predictions", "A/B testing framework"],
		outcomes: [
			"Process 1M events/day",
			"<5s query latency",
			"30-day data retention",
		],
		startDaysAgo: 75,
		endDaysFromNow: 30,
		milestones: [
			{
				name: "Ingestion Pipeline",
				description: "Event collection and streaming infrastructure",
				icon: "🔄",
				status: "completed",
				startDaysAgo: 75,
				targetDaysFromNow: -30,
			},
			{
				name: "Query Engine",
				description: "Fast analytical queries with custom SQL dialect",
				icon: "⚡",
				status: "active",
				startDaysAgo: 30,
				targetDaysFromNow: 15,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Ingestion",
				description: "Event collection API and Kafka producers",
				status: "completed",
				goals: [
					"Event schema",
					"Kafka producers",
					"Dead letter queue",
					"Batch ingestion",
				],
				startDaysAgo: 42,
				targetDaysFromNow: -28,
			},
			{
				name: "Sprint 2 — Aggregation",
				description: "Real-time rollups and materialized views",
				status: "active",
				goals: [
					"Minute rollups",
					"Hour rollups",
					"Custom dimensions",
					"Funnel analysis",
				],
				startDaysAgo: 14,
				targetDaysFromNow: 0,
			},
		],
	},
	{
		name: "User Onboarding Redesign",
		icon: "👋",
		color: "var(--chart-2)",
		status: "active",
		priority: "high",
		structure: "kanban",
		intent: "delivery",
		description:
			"Redesigned onboarding flow with interactive product tours, progressive disclosure, and personalized setup wizards based on user role.",
		summary: "Interactive onboarding with product tours",
		leadIndex: 5,
		memberIndices: [5, 1, 7, 3],
		tags: ["frontend", "ux", "onboarding"],
		scopeInItems: [
			"Welcome wizard",
			"Interactive product tour",
			"Template gallery",
			"Role-based setup",
			"Checklist widget",
		],
		scopeOutItems: ["Video tutorials", "Chatbot onboarding"],
		outcomes: [
			"80% onboarding completion",
			"<5 min time-to-value",
			"30% reduction in support tickets",
		],
		startDaysAgo: 21,
		endDaysFromNow: 30,
		milestones: [
			{
				name: "Flow Design",
				description: "UX research and flow mapping",
				icon: "🗺️",
				status: "completed",
				startDaysAgo: 21,
				targetDaysFromNow: -7,
			},
			{
				name: "Implementation",
				description: "Build and ship new onboarding",
				icon: "🏗️",
				status: "active",
				startDaysAgo: 7,
				targetDaysFromNow: 30,
			},
		],
		sprints: [],
	},
	{
		name: "Admin Console",
		icon: "🛡️",
		color: "var(--chart-3)",
		status: "planned",
		priority: "medium",
		structure: "sprints",
		intent: "internal",
		description:
			"Internal admin panel for user management, organization oversight, feature flags, and system health monitoring.",
		summary: "Internal admin panel for operations",
		leadIndex: 1,
		memberIndices: [1, 2, 7],
		tags: ["frontend", "admin", "internal"],
		scopeInItems: [
			"User management",
			"Organization management",
			"Feature flags",
			"System health",
			"Audit logs viewer",
		],
		scopeOutItems: ["Customer-facing admin", "Self-service admin API"],
		outcomes: [
			"Reduce ops response time by 50%",
			"Self-service feature flag management",
		],
		startDaysAgo: 0,
		endDaysFromNow: 45,
		milestones: [
			{
				name: "User & Org Management",
				description: "CRUD for users and organizations",
				icon: "👥",
				status: "active",
				startDaysAgo: 0,
				targetDaysFromNow: 21,
			},
			{
				name: "Feature Flags & Health",
				description: "Flag management and system monitoring",
				icon: "🚩",
				status: "active",
				startDaysAgo: 0,
				targetDaysFromNow: 45,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — User Management",
				description: "User CRUD, search, and impersonation",
				status: "planned",
				goals: [
					"User list with search",
					"User detail view",
					"Impersonation",
					"Suspend/unsuspend",
				],
				startDaysAgo: 0,
				targetDaysFromNow: 14,
			},
		],
	},
	{
		name: "CI/CD Pipeline Overhaul",
		icon: "🔄",
		color: "var(--chart-4)",
		status: "active",
		priority: "medium",
		structure: "linear",
		intent: "internal",
		description:
			"Migrate from Jenkins to GitHub Actions with matrix builds, automated preview deployments, and canary releases.",
		summary: "GitHub Actions migration with canary releases",
		leadIndex: 4,
		memberIndices: [4, 0, 6],
		tags: ["devops", "ci-cd", "infrastructure"],
		scopeInItems: [
			"GitHub Actions workflows",
			"Matrix builds",
			"Preview deployments",
			"Canary releases",
			"Build caching",
		],
		scopeOutItems: ["Self-hosted runners", "Multi-cloud deployment"],
		outcomes: [
			"50% faster CI builds",
			"Zero-downtime deployments",
			"Automatic rollback on failure",
		],
		startDaysAgo: 35,
		endDaysFromNow: 10,
		milestones: [
			{
				name: "GitHub Actions Migration",
				description: "Migrate all Jenkins jobs to GitHub Actions",
				icon: "🐙",
				status: "completed",
				startDaysAgo: 35,
				targetDaysFromNow: -7,
			},
			{
				name: "Canary Deployment",
				description: "Progressive rollout with automatic rollback",
				icon: "🐤",
				status: "active",
				startDaysAgo: 7,
				targetDaysFromNow: 10,
			},
		],
		sprints: [],
	},
	{
		name: "Search & Discovery",
		icon: "🔍",
		color: "var(--chart-5)",
		status: "planned",
		priority: "high",
		structure: "sprints",
		intent: "delivery",
		description:
			"Full-text search across all workspace content — issues, docs, boards, and chat. Powered by vector embeddings for semantic search.",
		summary: "Semantic full-text search across all content",
		leadIndex: 0,
		memberIndices: [0, 2, 3, 8],
		tags: ["backend", "search", "ai"],
		scopeInItems: [
			"Full-text search",
			"Vector embeddings",
			"Faceted filtering",
			"Search suggestions",
			"Recent searches",
		],
		scopeOutItems: ["Image search", "Voice search"],
		outcomes: [
			"<200ms search latency",
			"90% relevance score",
			"Search across all content types",
		],
		startDaysAgo: 7,
		endDaysFromNow: 60,
		milestones: [
			{
				name: "Indexing Pipeline",
				description: "Build content indexing and embedding pipeline",
				icon: "📇",
				status: "active",
				startDaysAgo: 7,
				targetDaysFromNow: 30,
			},
			{
				name: "Search UI",
				description: "Command palette and search results UI",
				icon: "🖥️",
				status: "active",
				startDaysAgo: 0,
				targetDaysFromNow: 60,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Indexing",
				description: "Content indexing pipeline and embedding generation",
				status: "planned",
				goals: [
					"Content crawler",
					"Embedding generation",
					"Index management",
					"Incremental updates",
				],
				startDaysAgo: 0,
				targetDaysFromNow: 14,
			},
		],
	},
	{
		name: "Notification System v2",
		icon: "🔔",
		color: "var(--chart-1)",
		status: "active",
		priority: "medium",
		structure: "sprints",
		intent: "delivery",
		description:
			"Redesigned notification system with channels (email, push, in-app, Slack), smart batching, and user-configurable preferences.",
		summary: "Multi-channel notifications with smart batching",
		leadIndex: 3,
		memberIndices: [3, 1, 2, 4],
		tags: ["backend", "frontend", "notifications"],
		scopeInItems: [
			"Multi-channel delivery",
			"Smart batching",
			"Notification preferences",
			"Slack integration",
			"Email templates",
		],
		scopeOutItems: ["SMS notifications", "WhatsApp"],
		outcomes: [
			"<1s notification delivery",
			"90% email open rate",
			"Configurable per-event preferences",
		],
		startDaysAgo: 30,
		endDaysFromNow: 21,
		milestones: [
			{
				name: "Channel Architecture",
				description: "Multi-channel delivery system",
				icon: "📡",
				status: "completed",
				startDaysAgo: 30,
				targetDaysFromNow: -7,
			},
			{
				name: "Smart Batching",
				description: "Intelligent notification grouping and digest",
				icon: "📦",
				status: "active",
				startDaysAgo: 7,
				targetDaysFromNow: 21,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Channels",
				description: "Email, push, and in-app channels",
				status: "completed",
				goals: [
					"Email via Resend",
					"Push via FCM",
					"In-app real-time",
					"Channel router",
				],
				startDaysAgo: 28,
				targetDaysFromNow: -14,
			},
			{
				name: "Sprint 2 — Preferences & Batching",
				description: "User preferences and smart digest",
				status: "active",
				goals: [
					"Preference UI",
					"Batch engine",
					"Digest emails",
					"Slack webhook",
				],
				startDaysAgo: 14,
				targetDaysFromNow: 0,
			},
		],
	},
	{
		name: "Design System (Orbit UI)",
		icon: "🎨",
		color: "var(--chart-2)",
		status: "active",
		priority: "medium",
		structure: "kanban",
		intent: "delivery",
		description:
			"Velocity's shared design system — Orbit UI. React component library, Figma tokens, documentation site, and Storybook integration.",
		summary: "Shared component library and design tokens",
		leadIndex: 5,
		memberIndices: [5, 1, 8],
		tags: ["frontend", "design-system", "ui"],
		scopeInItems: [
			"React component library",
			"Design tokens",
			"Storybook stories",
			"Figma sync",
			"Documentation site",
		],
		scopeOutItems: ["Native mobile components", "Email template components"],
		outcomes: [
			"100% component coverage",
			"WCAG AA compliance",
			"<50kb bundle size",
		],
		startDaysAgo: 120,
		endDaysFromNow: 90,
		milestones: [
			{
				name: "Core Components",
				description: "Button, Input, Dialog, Table, etc.",
				icon: "🧱",
				status: "completed",
				startDaysAgo: 120,
				targetDaysFromNow: -60,
			},
			{
				name: "Data Components",
				description: "Charts, DataTable, KPI Cards",
				icon: "📊",
				status: "active",
				startDaysAgo: 30,
				targetDaysFromNow: 30,
			},
		],
		sprints: [],
	},
	{
		name: "Performance Optimization",
		icon: "⚡",
		color: "var(--chart-3)",
		status: "active",
		priority: "high",
		structure: "linear",
		intent: "internal",
		description:
			"Cross-cutting performance initiative: bundle size reduction, lazy loading, database query optimization, and CDN caching strategy.",
		summary: "Bundle size, lazy loading, and query optimization",
		leadIndex: 4,
		memberIndices: [4, 0, 1, 2],
		tags: ["performance", "frontend", "backend"],
		scopeInItems: [
			"Bundle analysis",
			"Code splitting",
			"Database query optimization",
			"CDN strategy",
			"Image optimization",
		],
		scopeOutItems: ["Architectural rewrites", "Database migration"],
		outcomes: ["50% bundle size reduction", "<1.5s LCP", "<200ms API p95"],
		startDaysAgo: 21,
		endDaysFromNow: 21,
		milestones: [
			{
				name: "Frontend Perf",
				description: "Bundle splitting and lazy loading",
				icon: "🌐",
				status: "active",
				startDaysAgo: 21,
				targetDaysFromNow: 7,
			},
			{
				name: "Backend Perf",
				description: "Query optimization and caching",
				icon: "🗄️",
				status: "active",
				startDaysAgo: 14,
				targetDaysFromNow: 21,
			},
		],
		sprints: [],
	},
	{
		name: "Security Audit Q1",
		icon: "🔒",
		color: "var(--chart-4)",
		status: "active",
		priority: "urgent",
		structure: "linear",
		intent: "internal",
		description:
			"Quarterly security audit: penetration testing, dependency scanning, OWASP Top 10 review, and SOC 2 compliance preparation.",
		summary: "Pen testing, dependency scanning, SOC 2 prep",
		leadIndex: 6,
		memberIndices: [6, 0, 2, 4],
		tags: ["security", "compliance", "audit"],
		scopeInItems: [
			"Penetration testing",
			"Dependency audit",
			"OWASP review",
			"SOC 2 documentation",
			"Secret rotation",
		],
		scopeOutItems: ["ISO 27001", "HIPAA compliance"],
		outcomes: [
			"Zero critical vulnerabilities",
			"SOC 2 Type II readiness",
			"All secrets rotated",
		],
		startDaysAgo: 14,
		endDaysFromNow: 14,
		milestones: [
			{
				name: "Vulnerability Assessment",
				description: "Automated and manual vulnerability scanning",
				icon: "🛡️",
				status: "completed",
				startDaysAgo: 14,
				targetDaysFromNow: -3,
			},
			{
				name: "Remediation",
				description: "Fix identified vulnerabilities",
				icon: "🔧",
				status: "active",
				startDaysAgo: 3,
				targetDaysFromNow: 14,
			},
		],
		sprints: [],
	},
	{
		name: "Developer Documentation",
		icon: "📚",
		color: "var(--chart-5)",
		status: "planned",
		priority: "low",
		structure: "kanban",
		intent: "delivery",
		description:
			"Public-facing developer documentation portal with API reference, guides, tutorials, and interactive code examples.",
		summary: "API reference, guides, and interactive examples",
		leadIndex: 7,
		memberIndices: [7, 1, 0, 5],
		tags: ["documentation", "developer-experience"],
		scopeInItems: [
			"API reference (auto-generated)",
			"Getting started guide",
			"Authentication guide",
			"Webhook guide",
			"Interactive playground",
		],
		scopeOutItems: ["Video content", "Community forum"],
		outcomes: [
			"100% API coverage",
			"<30 min time-to-first-API-call",
			"Interactive examples for all endpoints",
		],
		startDaysAgo: 7,
		endDaysFromNow: 60,
		milestones: [
			{
				name: "API Reference",
				description: "Auto-generated API docs from OpenAPI spec",
				icon: "📖",
				status: "active",
				startDaysAgo: 7,
				targetDaysFromNow: 30,
			},
		],
		sprints: [],
	},
	{
		name: "Python SDK",
		icon: "🐍",
		color: "var(--chart-1)",
		status: "planned",
		priority: "medium",
		structure: "sprints",
		intent: "delivery",
		description:
			"Official Python SDK for the Velocity API. Type-safe, async-first, with Pydantic models and comprehensive test suite.",
		summary: "Type-safe async Python SDK",
		leadIndex: 2,
		memberIndices: [2, 6, 7],
		tags: ["sdk", "python", "api"],
		scopeInItems: [
			"API client",
			"Pydantic models",
			"Async support",
			"Pagination helpers",
			"Webhook validation",
		],
		scopeOutItems: ["CLI tool", "Django integration"],
		outcomes: ["100% API coverage", "Type-safe with mypy", "Published on PyPI"],
		startDaysAgo: 3,
		endDaysFromNow: 45,
		milestones: [
			{
				name: "Core SDK",
				description: "API client with auth and pagination",
				icon: "🔑",
				status: "active",
				startDaysAgo: 3,
				targetDaysFromNow: 21,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Client Foundation",
				description: "HTTP client, auth, and base models",
				status: "planned",
				goals: ["HTTP client", "OAuth flow", "Base models", "Error handling"],
				startDaysAgo: 0,
				targetDaysFromNow: 14,
			},
		],
	},
	{
		name: "JavaScript SDK",
		icon: "🟨",
		color: "var(--chart-2)",
		status: "active",
		priority: "medium",
		structure: "sprints",
		intent: "delivery",
		description:
			"Official JavaScript/TypeScript SDK. Works in Node.js, Deno, and browsers. Zero dependencies, tree-shakeable, with full TypeScript types.",
		summary: "Zero-dependency TypeScript SDK for Node/browser",
		leadIndex: 0,
		memberIndices: [0, 3, 8],
		tags: ["sdk", "javascript", "typescript"],
		scopeInItems: [
			"API client",
			"TypeScript types",
			"Node.js support",
			"Browser support",
			"Webhook utilities",
		],
		scopeOutItems: ["React hooks (separate package)", "CLI tool"],
		outcomes: ["100% API coverage", "Zero dependencies", "<5kb gzipped bundle"],
		startDaysAgo: 30,
		endDaysFromNow: 14,
		milestones: [
			{
				name: "v1.0 Release",
				description: "Feature-complete with full API coverage",
				icon: "🎯",
				status: "active",
				startDaysAgo: 30,
				targetDaysFromNow: 14,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Core Client",
				description: "HTTP client, auth, and error handling",
				status: "completed",
				goals: [
					"Fetch-based client",
					"API key auth",
					"OAuth client",
					"Error types",
				],
				startDaysAgo: 28,
				targetDaysFromNow: -14,
			},
			{
				name: "Sprint 2 — Resources & Types",
				description: "Resource classes and TypeScript definitions",
				status: "active",
				goals: [
					"All resource classes",
					"Auto-generated types",
					"Pagination iterator",
					"Webhook helpers",
				],
				startDaysAgo: 14,
				targetDaysFromNow: 0,
			},
		],
	},
	{
		name: "Data Migration Toolkit",
		icon: "📦",
		color: "var(--chart-3)",
		status: "completed",
		priority: "low",
		structure: "linear",
		intent: "internal",
		description:
			"CLI toolkit for migrating customer data from legacy systems. Supports CSV, JSON, and direct database connections with validation and rollback.",
		summary: "CLI for migrating data from legacy systems",
		leadIndex: 4,
		memberIndices: [4, 2],
		tags: ["backend", "migration", "tools"],
		scopeInItems: [
			"CSV import",
			"JSON import",
			"Database connectors",
			"Validation rules",
			"Rollback support",
		],
		scopeOutItems: ["Real-time sync", "Bidirectional migration"],
		outcomes: [
			"Migrate 1M records in <1 hour",
			"Zero data loss",
			"Automated validation reports",
		],
		startDaysAgo: 60,
		endDaysFromNow: -14,
		milestones: [
			{
				name: "CLI Tool",
				description: "Core migration CLI with importers",
				icon: "⌨️",
				status: "completed",
				startDaysAgo: 60,
				targetDaysFromNow: -14,
			},
		],
		sprints: [],
	},
	{
		name: "Monitoring & Alerting",
		icon: "📡",
		color: "var(--chart-4)",
		status: "active",
		priority: "high",
		structure: "sprints",
		intent: "internal",
		description:
			"Comprehensive observability stack: structured logging, distributed tracing, metrics collection, and PagerDuty integration for alerting.",
		summary: "Observability with logging, tracing, and alerting",
		leadIndex: 4,
		memberIndices: [4, 0, 2],
		tags: ["devops", "monitoring", "observability"],
		scopeInItems: [
			"Structured logging",
			"Distributed tracing",
			"Metrics dashboards",
			"PagerDuty integration",
			"SLO tracking",
		],
		scopeOutItems: ["Log analytics ML", "Cost optimization"],
		outcomes: [
			"MTTR < 15 minutes",
			"99.9% SLO tracking",
			"Automated incident creation",
		],
		startDaysAgo: 45,
		endDaysFromNow: 14,
		milestones: [
			{
				name: "Logging & Tracing",
				description: "Structured logs and OpenTelemetry tracing",
				icon: "📝",
				status: "completed",
				startDaysAgo: 45,
				targetDaysFromNow: -14,
			},
			{
				name: "Alerting",
				description: "PagerDuty integration and runbooks",
				icon: "🚨",
				status: "active",
				startDaysAgo: 14,
				targetDaysFromNow: 14,
			},
		],
		sprints: [
			{
				name: "Sprint 1 — Logging",
				description: "Structured logging across all services",
				status: "completed",
				goals: [
					"Log format standard",
					"Winston/Pino setup",
					"Log aggregation",
					"Search UI",
				],
				startDaysAgo: 42,
				targetDaysFromNow: -28,
			},
			{
				name: "Sprint 2 — Alerting",
				description: "Alert rules and PagerDuty integration",
				status: "active",
				goals: [
					"Alert rules engine",
					"PagerDuty webhooks",
					"Escalation policies",
					"Runbook links",
				],
				startDaysAgo: 14,
				targetDaysFromNow: 0,
			},
		],
	},
	{
		name: "Accessibility Compliance",
		icon: "♿",
		color: "var(--chart-5)",
		status: "planned",
		priority: "medium",
		structure: "kanban",
		intent: "delivery",
		description:
			"WCAG 2.1 AA compliance across all customer-facing surfaces. Keyboard navigation, screen reader support, color contrast, and ARIA labels.",
		summary: "WCAG 2.1 AA compliance and keyboard navigation",
		leadIndex: 5,
		memberIndices: [5, 1, 6, 7],
		tags: ["accessibility", "frontend", "compliance"],
		scopeInItems: [
			"Keyboard navigation",
			"Screen reader support",
			"Color contrast audit",
			"ARIA labels",
			"Focus management",
		],
		scopeOutItems: ["WCAG AAA", "Cognitive accessibility"],
		outcomes: [
			"WCAG 2.1 AA compliance",
			"Axe audit score > 95",
			"Full keyboard navigation",
		],
		startDaysAgo: 3,
		endDaysFromNow: 60,
		milestones: [
			{
				name: "Audit & Remediation Plan",
				description: "Full audit and prioritized fix plan",
				icon: "📋",
				status: "active",
				startDaysAgo: 3,
				targetDaysFromNow: 14,
			},
			{
				name: "Compliance Certification",
				description: "Third-party accessibility certification",
				icon: "✅",
				status: "active",
				startDaysAgo: 0,
				targetDaysFromNow: 60,
			},
		],
		sprints: [],
	},
];

// ── Clients ──────────────────────────────────────────────────────────────────

export interface DemoClient {
	name: string;
	status: string;
	industry: string;
	website: string;
	location: string;
	segment: string;
	notes: string;
	contacts: { name: string; email: string; role: string; isPrimary: boolean }[];
	projectIndices: number[];
}

export const DEMO_CLIENTS: DemoClient[] = [
	{
		name: "TechStream Inc.",
		status: "active",
		industry: "SaaS",
		website: "https://techstream.example.com",
		location: "San Francisco, CA",
		segment: "Enterprise",
		notes:
			"Key enterprise client. Annual contract, 500+ seats. Main contact is CTO.",
		contacts: [
			{
				name: "Michael Torres",
				email: "michael@techstream.example.com",
				role: "CTO",
				isPrimary: true,
			},
			{
				name: "Jennifer Wu",
				email: "jennifer@techstream.example.com",
				role: "Engineering Director",
				isPrimary: false,
			},
		],
		projectIndices: [0, 4],
	},
	{
		name: "GreenField Digital",
		status: "active",
		industry: "Digital Agency",
		website: "https://greenfield.example.com",
		location: "New York, NY",
		segment: "Mid-Market",
		notes: "Design partner for the dashboard project. Provides UI/UX feedback.",
		contacts: [
			{
				name: "Amanda Chen",
				email: "amanda@greenfield.example.com",
				role: "Creative Director",
				isPrimary: true,
			},
			{
				name: "Robert Kim",
				email: "robert@greenfield.example.com",
				role: "Lead Developer",
				isPrimary: false,
			},
		],
		projectIndices: [1, 6],
	},
	{
		name: "Quantum Analytics",
		status: "active",
		industry: "Data Analytics",
		website: "https://quantumanalytics.example.com",
		location: "Austin, TX",
		segment: "Enterprise",
		notes: "Beta partner for the analytics engine. Processes 10M events/day.",
		contacts: [
			{
				name: "Dr. Sarah Martinez",
				email: "sarah@quantumanalytics.example.com",
				role: "VP Engineering",
				isPrimary: true,
			},
		],
		projectIndices: [5],
	},
	{
		name: "Nordic Health Systems",
		status: "prospect",
		industry: "Healthcare",
		website: "https://nordichealth.example.com",
		location: "Stockholm, Sweden",
		segment: "Enterprise",
		notes:
			"Evaluating Velocity for their internal developer platform. SOC 2 and HIPAA required.",
		contacts: [
			{
				name: "Erik Johansson",
				email: "erik@nordichealth.example.com",
				role: "CISO",
				isPrimary: true,
			},
			{
				name: "Linnea Bergström",
				email: "linnea@nordichealth.example.com",
				role: "Platform Lead",
				isPrimary: false,
			},
		],
		projectIndices: [13],
	},
	{
		name: "Startup Foundry",
		status: "active",
		industry: "Venture Studio",
		website: "https://startupfoundry.example.com",
		location: "London, UK",
		segment: "SMB",
		notes:
			"Uses Velocity across 4 portfolio companies. Provided feedback on SDK ergonomics.",
		contacts: [
			{
				name: "Oliver Wright",
				email: "oliver@startupfoundry.example.com",
				role: "CTO",
				isPrimary: true,
			},
		],
		projectIndices: [15, 16],
	},
	{
		name: "CloudBase Solutions",
		status: "active",
		industry: "Cloud Infrastructure",
		website: "https://cloudbase.example.com",
		location: "Seattle, WA",
		segment: "Enterprise",
		notes:
			"Infrastructure partner. Provides hosting recommendations and load testing.",
		contacts: [
			{
				name: "Diane Foster",
				email: "diane@cloudbase.example.com",
				role: "Solutions Architect",
				isPrimary: true,
			},
			{
				name: "Kevin Park",
				email: "kevin@cloudbase.example.com",
				role: "Account Manager",
				isPrimary: false,
			},
		],
		projectIndices: [8, 18],
	},
	{
		name: "EduTech Innovations",
		status: "prospect",
		industry: "Education Technology",
		website: "https://edutechinnovations.example.com",
		location: "Boston, MA",
		segment: "Mid-Market",
		notes:
			"Exploring Velocity for student project management. Accessibility requirements are critical.",
		contacts: [
			{
				name: "Patricia Adams",
				email: "patricia@edutechinnovations.example.com",
				role: "Product Director",
				isPrimary: true,
			},
		],
		projectIndices: [19],
	},
	{
		name: "FinanceFlow Corp",
		status: "on_hold",
		industry: "Financial Services",
		website: "https://financeflow.example.com",
		location: "Chicago, IL",
		segment: "Enterprise",
		notes:
			"Contract on hold pending SOC 2 Type II certification. Re-engage after Q1 audit.",
		contacts: [
			{
				name: "Richard Chang",
				email: "richard@financeflow.example.com",
				role: "VP Technology",
				isPrimary: true,
			},
			{
				name: "Maria Santos",
				email: "maria@financeflow.example.com",
				role: "Compliance Officer",
				isPrimary: false,
			},
		],
		projectIndices: [4, 13],
	},
];

// ── Workspace Settings ───────────────────────────────────────────────────────

export const DEMO_AI_WORKSPACE_CONTEXT = `Velocity Labs is a 10-person software development company building a developer platform. The team works across 20 active projects including APIs, mobile apps, SDKs, and internal tools. Key technologies: TypeScript, React, Node.js, Swift, Kotlin, Python. The team follows agile practices with 2-week sprints.`;

export const DEMO_AI_ASSISTANT_CHARACTERISTICS = `Professional, concise, and technically precise. Familiar with the Velocity Labs codebase, team members, and project structure. Prefers actionable suggestions over theoretical discussions. Uses code examples when helpful.`;

export const DEMO_CUSTOM_TYPES = [
	{ key: "epic", name: "Epic", color: "#8B5CF6" },
	{ key: "spike", name: "Spike", color: "#EC4899" },
	{ key: "debt", name: "Tech Debt", color: "#F97316" },
];

export const DEMO_CUSTOM_STATUSES = [
	{ key: "testing", name: "Testing", color: "#F59E0B" },
	{ key: "staging", name: "Staging", color: "#8B5CF6" },
	{ key: "deployed", name: "Deployed", color: "#10B981" },
];

export const DEMO_SLASH_COMMANDS = [
	{
		id: "standup",
		command: "/standup",
		title: "Daily Standup",
		description: "Generate a standup summary from recent activity",
		content:
			"Summarize my activity from the last 24 hours. List what I completed, what I'm working on today, and any blockers.",
		isShortcut: true,
		createdAt: daysAgo(30),
		updatedAt: daysAgo(30),
	},
	{
		id: "sprint-summary",
		command: "/sprint-summary",
		title: "Sprint Summary",
		description: "Generate a summary of the current sprint progress",
		content:
			"Analyze the current sprint across all projects. Show completion percentage, remaining work, and at-risk items.",
		isShortcut: false,
		createdAt: daysAgo(30),
		updatedAt: daysAgo(30),
	},
	{
		id: "review-pr",
		command: "/review-pr",
		title: "PR Review Helper",
		description: "Help review a pull request",
		content:
			"Help me review a pull request. Check for common issues: error handling, edge cases, security concerns, and suggest improvements.",
		isShortcut: false,
		createdAt: daysAgo(14),
		updatedAt: daysAgo(14),
	},
];
