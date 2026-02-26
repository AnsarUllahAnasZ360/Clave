/**
 * Demo Issue Seeder
 *
 * Creates 1000 issues across 20 projects in 4 batched mutations.
 * Each batch creates ~250 issues, chained via ctx.scheduler.runAfter.
 * Batch 4 also creates sub-issues, issue relations, and schedules the next phase.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { DEMO_PROJECTS, daysAgo, daysFromNow, hoursAgo } from "./constants";

// ── Helpers ──────────────────────────────────────────────────────────────────

const padId = (n: number) => n.toString().padStart(3, "0");

const STATUSES = [
	"triage",
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"cancelled",
] as const;

const STATUS_WEIGHTS = [0.15, 0.2, 0.15, 0.2, 0.1, 0.15, 0.05];

const PRIORITIES = ["urgent", "high", "medium", "low", "no_priority"] as const;

const PRIORITY_WEIGHTS = [0.05, 0.15, 0.4, 0.3, 0.1];

const TAGS_POOL = [
	"frontend",
	"backend",
	"api",
	"database",
	"ux",
	"performance",
	"security",
	"mobile",
	"infra",
	"docs",
	"testing",
	"design",
	"devops",
	"analytics",
	"auth",
];

function seededRandom(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 16807 + 0) % 2147483647;
		return (s - 1) / 2147483646;
	};
}

function weightedPick<T>(
	items: readonly T[],
	weights: number[],
	rand: () => number,
): T {
	const r = rand();
	let cumulative = 0;
	for (let i = 0; i < items.length; i++) {
		cumulative += weights[i];
		if (r < cumulative) return items[i];
	}
	return items[items.length - 1];
}

function pickRandom<T>(arr: readonly T[], rand: () => number): T {
	return arr[Math.floor(rand() * arr.length)];
}

// ── Issue Data Per Project ───────────────────────────────────────────────────

interface IssueTemplate {
	title: string;
	description: string;
	type: string;
}

function generateProjectIssues(projectIndex: number): IssueTemplate[] {
	const issuesByProject: Record<number, IssueTemplate[]> = {
		// ── Project 0: Core API Platform ─────────────────────────────────────
		0: [
			{
				title: "Implement JWT refresh token rotation endpoint",
				description:
					"Add a /auth/refresh endpoint that issues new access tokens and rotates refresh tokens. Must invalidate the old refresh token to prevent replay attacks.",
				type: "feature",
			},
			{
				title: "Add rate limiting middleware for GraphQL subscriptions",
				description:
					"Subscriptions currently bypass our rate limiter. Implement per-connection rate limiting with configurable thresholds per subscription type.",
				type: "feature",
			},
			{
				title: "Fix N+1 query in project members resolver",
				description:
					"The projectMembers GraphQL resolver issues a separate DB query per member. Use DataLoader to batch these into a single query. Currently causes 200ms+ latency on large projects.",
				type: "bug",
			},
			{
				title: "Migrate user sessions from Redis to JWT",
				description:
					"Replace server-side session storage with stateless JWTs. Maintain backward compatibility during the migration window. Include session revocation via token blacklist.",
				type: "improvement",
			},
			{
				title: "Add OpenAPI 3.1 spec generation from route definitions",
				description:
					"Auto-generate OpenAPI spec from our route decorators. Must include request/response schemas, auth requirements, and example values.",
				type: "feature",
			},
			{
				title: "Database connection pool exhaustion under load",
				description:
					"Production logs show connection pool exhaustion during peak traffic (>500 RPS). Investigate pool sizing, idle timeout, and query duration distribution.",
				type: "bug",
			},
			{
				title: "Implement API versioning strategy via URL prefix",
				description:
					"Support /v1/ and /v2/ route prefixes. Requests without version should default to v1. Add version deprecation headers for v1 endpoints.",
				type: "feature",
			},
			{
				title: "Add request correlation IDs across microservices",
				description:
					"Generate a unique correlation ID for each incoming request and propagate it through all internal service calls. Log correlation ID in structured logs.",
				type: "improvement",
			},
			{
				title: "GraphQL schema stitching for federated services",
				description:
					"Implement Apollo Federation gateway to stitch schemas from auth, billing, and core services. Must support @key and @external directives.",
				type: "feature",
			},
			{
				title: "Fix timezone handling in date filters",
				description:
					"API returns different results for the same date range depending on server timezone. Standardize all date handling to UTC and accept timezone offset in query params.",
				type: "bug",
			},
			{
				title: "Implement cursor-based pagination for all list endpoints",
				description:
					"Replace offset-based pagination with cursor-based. Return next/prev cursors in response headers. Must be backward compatible with existing offset params.",
				type: "improvement",
			},
			{
				title: "Add health check endpoint with dependency status",
				description:
					"Create /health endpoint that reports status of all dependencies (database, Redis, S3, external APIs). Include latency measurements and version info.",
				type: "feature",
			},
			{
				title: "Optimize bulk issue creation endpoint",
				description:
					"The POST /issues/bulk endpoint times out when creating >100 issues. Implement chunked processing with progress tracking via webhook callback.",
				type: "improvement",
			},
			{
				title: "Implement webhook retry with exponential backoff",
				description:
					"Failed webhook deliveries should retry up to 5 times with exponential backoff (1s, 5s, 25s, 125s, 625s). Add dead letter queue for permanently failed deliveries.",
				type: "feature",
			},
			{
				title: "Fix CORS preflight caching not working in Safari",
				description:
					"Safari ignores Access-Control-Max-Age header, causing excessive OPTIONS requests. Investigate Safari-specific CORS behavior and implement workaround.",
				type: "bug",
			},
			{
				title: "Add structured error codes to all API responses",
				description:
					"Replace generic error messages with machine-readable error codes (e.g., AUTH_TOKEN_EXPIRED, RATE_LIMIT_EXCEEDED). Include error code documentation.",
				type: "improvement",
			},
			{
				title: "Implement field-level permissions for GraphQL",
				description:
					"Some fields (email, phone) should only be visible to admins. Add @auth directive to GraphQL schema that checks user role before resolving sensitive fields.",
				type: "feature",
			},
			{
				title: "Database migration fails on large tables",
				description:
					"ALTER TABLE on the issues table (5M+ rows) locks the table for >30 seconds. Implement online schema migration using pt-online-schema-change or equivalent.",
				type: "bug",
			},
			{
				title: "Add API request/response logging middleware",
				description:
					"Log all API requests with method, path, status code, duration, and request ID. Redact sensitive fields (passwords, tokens) from request body logs.",
				type: "improvement",
			},
			{
				title: "Implement idempotency keys for mutation endpoints",
				description:
					"Add Idempotency-Key header support for POST/PUT/PATCH endpoints. Store idempotency records in Redis with 24-hour TTL to prevent duplicate operations.",
				type: "feature",
			},
			{
				title: "Fix memory leak in WebSocket connection handler",
				description:
					"Server memory grows steadily under sustained WebSocket connections. Event listeners are not being cleaned up on disconnect. Profile and fix the leak.",
				type: "bug",
			},
			{
				title: "Add gzip compression for API responses over 1KB",
				description:
					"Enable response compression middleware. Only compress responses >1KB. Support gzip and br (Brotli) encoding based on Accept-Encoding header.",
				type: "improvement",
			},
			{
				title: "Implement API key scoping with granular permissions",
				description:
					"API keys should support permission scopes (read:issues, write:projects, admin:users). Add scope validation middleware and management endpoints.",
				type: "feature",
			},
			{
				title: "Fix race condition in concurrent issue status updates",
				description:
					"Two simultaneous PATCH requests to the same issue can result in inconsistent state. Implement optimistic locking with version numbers.",
				type: "bug",
			},
			{
				title: "Add batch endpoint for fetching multiple resources",
				description:
					"Create POST /batch endpoint that accepts multiple GET requests in a single HTTP call. Return results keyed by request ID. Limit to 50 sub-requests.",
				type: "feature",
			},
			{
				title: "Implement graceful shutdown for long-running requests",
				description:
					"Server currently drops in-flight requests on SIGTERM. Implement drain mode that stops accepting new connections while finishing existing ones (30s timeout).",
				type: "improvement",
			},
			{
				title: "Add ETag support for conditional GET requests",
				description:
					"Generate ETags for GET responses based on content hash. Return 304 Not Modified when If-None-Match header matches. Reduces bandwidth for polling clients.",
				type: "improvement",
			},
			{
				title: "Fix pagination count returning incorrect total",
				description:
					"The X-Total-Count header returns the unfiltered total when filters are applied. Must count against the filtered result set.",
				type: "bug",
			},
			{
				title: "Implement request body size limits per endpoint",
				description:
					"Global 10MB limit is too generous for most endpoints. Add per-route body size limits (e.g., 1KB for status updates, 5MB for file metadata).",
				type: "improvement",
			},
			{
				title: "Add GraphQL query complexity analysis",
				description:
					"Prevent expensive queries by calculating query complexity scores. Reject queries exceeding the complexity threshold (1000 points). Log complexity metrics.",
				type: "feature",
			},
			{
				title: "Fix 500 error when creating issue with empty title",
				description:
					"POST /issues with empty string title returns 500 instead of 400. Add input validation for all required fields with descriptive error messages.",
				type: "bug",
			},
			{
				title: "Implement soft delete for all resources",
				description:
					"Replace hard deletes with soft deletes (deletedAt timestamp). Add includeDeleted query param for admin endpoints. Auto-purge after 30 days.",
				type: "improvement",
			},
			{
				title: "Add OpenTelemetry distributed tracing",
				description:
					"Instrument all API handlers with OpenTelemetry spans. Propagate trace context to downstream services. Export to Jaeger for visualization.",
				type: "feature",
			},
			{
				title: "Fix slow search endpoint for large workspaces",
				description:
					"The /search endpoint takes >5s for workspaces with >10K issues. Add full-text search index and optimize the query planner.",
				type: "bug",
			},
			{
				title: "Implement API changelog generation",
				description:
					"Auto-detect breaking changes between API versions and generate a changelog. Include migration instructions for each breaking change.",
				type: "feature",
			},
			{
				title: "Add request timeout middleware with configurable limits",
				description:
					"Some endpoints hang indefinitely on downstream failures. Add per-route timeout configuration with 408 response and cleanup of abandoned requests.",
				type: "improvement",
			},
			{
				title: "Fix duplicate webhook deliveries on server restart",
				description:
					"Webhook queue processes messages that were already delivered when the server restarts. Implement exactly-once delivery with delivery receipts.",
				type: "bug",
			},
			{
				title: "Implement API usage analytics per organization",
				description:
					"Track API calls per org, endpoint, and time period. Store in ClickHouse for fast aggregation. Expose usage dashboard in admin console.",
				type: "feature",
			},
			{
				title: "Add JSON:API compliance for error responses",
				description:
					"Standardize error response format to match JSON:API spec. Include error source pointer for validation errors to identify the exact field.",
				type: "improvement",
			},
			{
				title: "Fix issue activity log missing some events",
				description:
					"Status changes made via bulk update don't appear in the activity log. Ensure all mutation paths emit activity events.",
				type: "bug",
			},
			{
				title: "Implement multi-region database read replicas",
				description:
					"Route read queries to the nearest regional replica. Implement configurable staleness tolerance. Fall back to primary on replica lag >5s.",
				type: "feature",
			},
			{
				title: "Add circuit breaker for external service calls",
				description:
					"When external services (email, Slack, GitHub) are down, requests queue up and timeout. Add circuit breaker pattern with fallback behavior.",
				type: "improvement",
			},
			{
				title: "Fix GraphQL mutation returning stale data",
				description:
					"After creating an issue via mutation, the returned object uses cached data instead of the freshly written record. Force cache invalidation on mutations.",
				type: "bug",
			},
			{
				title: "Implement content negotiation for response format",
				description:
					"Support Accept header for JSON, XML, and CSV response formats. Default to JSON. Add format=csv query param as alternative for export use cases.",
				type: "feature",
			},
			{
				title: "Add API deprecation headers and sunset dates",
				description:
					"Include Deprecation and Sunset headers for deprecated endpoints. Log usage of deprecated endpoints for migration tracking.",
				type: "improvement",
			},
			{
				title: "Fix intermittent 503 errors during deployment",
				description:
					"Rolling deployments cause brief 503 errors when old instances are terminated. Implement connection draining and readiness probe delays.",
				type: "bug",
			},
			{
				title: "Implement server-sent events for real-time updates",
				description:
					"Add SSE endpoint as lightweight alternative to WebSocket for clients that only need server-to-client updates. Support last-event-id for reconnection.",
				type: "feature",
			},
			{
				title: "Add input sanitization for rich text fields",
				description:
					"Rich text fields (descriptions, comments) accept raw HTML. Sanitize using DOMPurify allowlist to prevent XSS while preserving formatting.",
				type: "improvement",
			},
			{
				title: "Fix API key rotation leaving orphaned sessions",
				description:
					"When an API key is rotated, active sessions using the old key continue to work until they expire naturally. Force immediate session invalidation.",
				type: "bug",
			},
			{
				title: "Implement request deduplication for idempotent operations",
				description:
					"Detect duplicate requests within a 5-second window based on request hash. Return the cached response instead of processing again.",
				type: "improvement",
			},
		],

		// ── Project 1: Customer Dashboard v2 ─────────────────────────────────
		1: [
			{
				title: "Build drag-and-drop grid layout engine",
				description:
					"Implement a responsive grid layout that supports drag-and-drop widget placement. Use react-grid-layout with custom collision detection for overlapping widgets.",
				type: "feature",
			},
			{
				title: "Create real-time KPI card widget",
				description:
					"Build a configurable KPI card that shows a metric value, trend arrow, sparkline, and comparison period. Support customizable thresholds for red/yellow/green states.",
				type: "feature",
			},
			{
				title: "Fix chart tooltip positioning on scroll",
				description:
					"Recharts tooltips render at incorrect positions when the dashboard container is scrolled. The tooltip follows mouse position but doesn't account for scroll offset.",
				type: "bug",
			},
			{
				title: "Implement widget configuration panel",
				description:
					"Slide-over panel for configuring widget data source, time range, visualization type, and styling. Changes should preview in real-time before saving.",
				type: "feature",
			},
			{
				title: "Add CSV/PDF export for all chart widgets",
				description:
					"Each widget should have an export menu with CSV (raw data) and PDF (rendered chart) options. PDF should match the on-screen appearance exactly.",
				type: "feature",
			},
			{
				title: "Dashboard loading skeleton with accurate layout",
				description:
					"Show skeleton placeholders that match the actual widget sizes and positions during data loading. Currently shows a generic loading spinner.",
				type: "improvement",
			},
			{
				title: "Implement dashboard template gallery",
				description:
					"Pre-built dashboard templates for common use cases (executive overview, engineering metrics, sales pipeline). Users can start from a template and customize.",
				type: "feature",
			},
			{
				title: "Fix bar chart overflow when labels are long",
				description:
					"X-axis labels on bar charts get cut off when category names exceed 15 characters. Implement label rotation, truncation with tooltip, or responsive font sizing.",
				type: "bug",
			},
			{
				title: "Add date range picker with preset ranges",
				description:
					"Build a date range selector with presets (today, 7d, 30d, 90d, YTD, custom). Changing the range should update all widgets simultaneously.",
				type: "feature",
			},
			{
				title: "Implement widget data caching with SWR",
				description:
					"Cache widget data client-side with stale-while-revalidate strategy. Show cached data immediately while fetching fresh data in the background.",
				type: "improvement",
			},
			{
				title: "Create funnel visualization widget",
				description:
					"Build a funnel chart widget for conversion tracking. Support customizable stages, percentage labels, and comparison to previous period.",
				type: "feature",
			},
			{
				title: "Fix memory leak when switching between dashboards",
				description:
					"Switching dashboards rapidly causes memory to grow linearly. Chart instances and WebSocket subscriptions aren't being cleaned up on unmount.",
				type: "bug",
			},
			{
				title: "Add global filter that applies across all widgets",
				description:
					"Implement a filter bar at the top of the dashboard that filters data across all widgets (by project, team, date, label). Filters should persist in URL.",
				type: "feature",
			},
			{
				title: "Implement responsive breakpoints for mobile viewing",
				description:
					"Dashboards should adapt to mobile screens with single-column layout. Widgets should stack vertically and resize appropriately for touch interaction.",
				type: "improvement",
			},
			{
				title: "Build activity feed widget with real-time updates",
				description:
					"Live feed showing recent workspace activity (issue updates, comments, deployments). Support filtering by activity type and team member.",
				type: "feature",
			},
			{
				title: "Fix color contrast issues in light mode charts",
				description:
					"Several chart color combinations fail WCAG AA contrast ratio in light mode. Audit all chart color palettes and adjust for accessibility.",
				type: "bug",
			},
			{
				title: "Add widget sharing via direct URL",
				description:
					"Each widget should have a shareable link that opens it in a standalone view with its own filters. Useful for embedding in Slack or Notion.",
				type: "feature",
			},
			{
				title: "Implement dashboard auto-refresh with configurable interval",
				description:
					"Auto-refresh all widgets at a configurable interval (30s, 1m, 5m, off). Show a countdown indicator and pause auto-refresh when the tab is inactive.",
				type: "improvement",
			},
			{
				title: "Create heatmap widget for time-based data",
				description:
					"Calendar heatmap showing activity intensity over time (like GitHub contribution graph). Support daily, weekly, and monthly granularity.",
				type: "feature",
			},
			{
				title: "Fix timezone offset in chart x-axis labels",
				description:
					"Chart timestamps display in UTC instead of the user's local timezone. The data is correct but labels show wrong hours for non-UTC users.",
				type: "bug",
			},
			{
				title: "Add comparison mode for two dashboards side-by-side",
				description:
					"Allow users to compare two dashboards (e.g., this sprint vs last sprint) in a split-screen view. Synchronized scrolling and date ranges.",
				type: "feature",
			},
			{
				title: "Implement undo/redo for dashboard layout changes",
				description:
					"Track layout modifications (move, resize, add, remove widget) in a history stack. Support Cmd+Z undo and Cmd+Shift+Z redo.",
				type: "improvement",
			},
			{
				title: "Build data table widget with sorting and filtering",
				description:
					"Tabular widget with sortable columns, column filtering, row selection, and pagination. Support exporting selected rows to CSV.",
				type: "feature",
			},
			{
				title: "Fix widget resize handles not visible on dark backgrounds",
				description:
					"Drag handles for resizing widgets are invisible when a widget has a dark background color. Use contrasting handle colors based on widget background.",
				type: "bug",
			},
			{
				title: "Add dashboard access permissions",
				description:
					"Dashboard owners can set view/edit permissions per user or team. Support public dashboards visible to all workspace members.",
				type: "feature",
			},
			{
				title: "Implement print-optimized dashboard layout",
				description:
					"Add a print stylesheet that renders the dashboard in a printable format. Widgets should fill pages without breaking across page boundaries.",
				type: "improvement",
			},
			{
				title: "Create scatter plot widget with trend line",
				description:
					"XY scatter plot with optional trend line (linear, logarithmic). Support color-coded categories and tooltip details on hover.",
				type: "feature",
			},
			{
				title: "Fix dashboard search not finding archived dashboards",
				description:
					"The dashboard list search only queries active dashboards. Add a filter toggle to include archived dashboards in search results.",
				type: "bug",
			},
			{
				title: "Add dashboard versioning and restore",
				description:
					"Save dashboard snapshots when significant changes are made. Allow restoring to any previous version. Show diff between versions.",
				type: "feature",
			},
			{
				title: "Implement lazy loading for below-the-fold widgets",
				description:
					"Only render and fetch data for widgets that are visible in the viewport. Use IntersectionObserver to trigger loading as widgets scroll into view.",
				type: "improvement",
			},
			{
				title: "Build pie/donut chart widget with drill-down",
				description:
					"Pie or donut chart with click-to-drill-down into sub-categories. Show percentage labels and legend. Support >10 categories with Other grouping.",
				type: "feature",
			},
			{
				title: "Fix dashboard not saving widget positions on first save",
				description:
					"New dashboards lose widget positions when saved for the first time. The layout state isn't being serialized correctly for unsaved dashboards.",
				type: "bug",
			},
			{
				title: "Add annotation layer for charts",
				description:
					"Allow users to add annotations (notes, markers, trend lines) on top of any chart widget. Annotations should be collaborative and versioned.",
				type: "feature",
			},
			{
				title: "Implement keyboard navigation for dashboard",
				description:
					"Support Tab to navigate between widgets, Enter to expand, Escape to collapse. Arrow keys to move widgets when in edit mode.",
				type: "improvement",
			},
			{
				title: "Create burndown chart widget for sprint tracking",
				description:
					"Sprint burndown chart showing ideal vs actual progress. Support story points and issue count views. Highlight scope changes.",
				type: "feature",
			},
			{
				title: "Fix widget data refresh not triggered on filter change",
				description:
					"Changing a global filter updates the URL but doesn't trigger widget data refresh until manual reload. Bind filter changes to data fetching lifecycle.",
				type: "bug",
			},
			{
				title: "Add full-screen mode for individual widgets",
				description:
					"Click to expand any widget to full screen for detailed inspection. Full-screen mode should show additional controls not visible at default size.",
				type: "feature",
			},
			{
				title: "Implement dashboard cloning across workspaces",
				description:
					"Allow cloning a dashboard from one workspace to another. Map data sources to equivalent sources in the target workspace.",
				type: "improvement",
			},
			{
				title: "Build gauge chart widget for threshold monitoring",
				description:
					"Circular gauge showing a metric value against configurable thresholds. Support min/max ranges, color zones, and target markers.",
				type: "feature",
			},
			{
				title: "Fix slow initial dashboard load with many widgets",
				description:
					"Dashboards with >20 widgets take 4+ seconds to render. Profile React rendering and implement virtualization for off-screen widgets.",
				type: "bug",
			},
			{
				title: "Add real-time collaboration indicators on dashboard",
				description:
					"Show cursors and selection highlights for other users currently viewing or editing the same dashboard. Display user avatars near their focus area.",
				type: "feature",
			},
			{
				title: "Implement smart widget suggestions based on data",
				description:
					"When adding a new widget, suggest visualization types based on the selected data source schema. Recommend chart types that best fit the data shape.",
				type: "improvement",
			},
			{
				title: "Create stacked area chart widget",
				description:
					"Area chart with stacked series showing composition over time. Support percentage mode and individual series toggling via legend clicks.",
				type: "feature",
			},
			{
				title: "Fix dashboard embed iframe CSP issues",
				description:
					"Embedded dashboards fail to load in iframes on certain domains due to Content-Security-Policy headers. Add configurable frame-ancestors policy.",
				type: "bug",
			},
			{
				title: "Add personal dashboard pinning to sidebar",
				description:
					"Users can pin their most-used dashboards to the workspace sidebar for quick access. Support drag-and-drop reordering of pinned dashboards.",
				type: "feature",
			},
			{
				title: "Implement widget error boundaries with retry",
				description:
					"When a widget fails to load data, show a friendly error message with a retry button instead of crashing the entire dashboard.",
				type: "improvement",
			},
			{
				title: "Build treemap widget for hierarchical data",
				description:
					"Treemap visualization for showing hierarchical data like issue distribution by project > label > status. Support drill-down navigation.",
				type: "feature",
			},
			{
				title: "Fix chart animations janky on low-end devices",
				description:
					"Chart enter/exit animations cause dropped frames on devices with <4GB RAM. Detect device capabilities and reduce animations accordingly.",
				type: "bug",
			},
			{
				title: "Add dashboard scheduling for email reports",
				description:
					"Schedule automated dashboard screenshots sent via email (daily, weekly, monthly). Support multiple recipients and custom email templates.",
				type: "feature",
			},
			{
				title: "Implement widget catalog with search",
				description:
					"Searchable catalog of all available widget types with previews and descriptions. Group by category (charts, tables, KPIs, feeds).",
				type: "improvement",
			},
		],

		// ── Project 2: Mobile App (iOS) ──────────────────────────────────────
		2: [
			{
				title: "Implement biometric authentication with Face ID",
				description:
					"Add Face ID and Touch ID support for app unlock. Store auth tokens in Keychain with biometric protection flag. Fall back to passcode.",
				type: "feature",
			},
			{
				title: "Build project list view with SwiftUI",
				description:
					"Create a scrollable project list with search, filters, and pull-to-refresh. Show project status badge, member avatars, and progress indicator.",
				type: "feature",
			},
			{
				title: "Fix push notification deep linking to wrong screen",
				description:
					"Tapping an issue update notification opens the project list instead of the specific issue. Fix the deep link URL parsing in AppDelegate.",
				type: "bug",
			},
			{
				title: "Implement offline data sync with CoreData",
				description:
					"Cache workspace data locally using CoreData. Queue mutations when offline and sync when connectivity returns. Show sync status indicator.",
				type: "feature",
			},
			{
				title: "Add haptic feedback for status change gestures",
				description:
					"Implement haptic feedback when swiping to change issue status (light impact on threshold, medium on confirm). Use UIImpactFeedbackGenerator.",
				type: "improvement",
			},
			{
				title: "Build issue detail view with action menu",
				description:
					"Full issue detail screen showing title, description, status, assignee, labels, comments, and activity. Bottom action bar for quick status changes.",
				type: "feature",
			},
			{
				title: "Fix keyboard covering input fields on small screens",
				description:
					"On iPhone SE, the keyboard covers the comment input field in issue detail. Implement keyboard-aware scroll view that adjusts content insets.",
				type: "bug",
			},
			{
				title: "Implement pull-to-refresh across all list views",
				description:
					"Add pull-to-refresh gesture to project list, issue list, and activity feed. Show a custom refresh indicator with the Velocity logo animation.",
				type: "improvement",
			},
			{
				title: "Add widget for iOS home screen",
				description:
					"Build WidgetKit widgets showing: small (next due issue), medium (sprint progress), large (issue list). Support dynamic intent configuration.",
				type: "feature",
			},
			{
				title: "Fix crash on iOS 16 when opening camera for attachment",
				description:
					"App crashes when opening the camera to attach a photo on iOS 16 devices. The PHPickerViewController configuration is missing required privacy keys.",
				type: "bug",
			},
			{
				title: "Build notification preferences screen",
				description:
					"Settings screen to configure push notification preferences per event type (mentions, assignments, status changes, comments). Mirror web app settings.",
				type: "feature",
			},
			{
				title: "Implement dark mode with system preference sync",
				description:
					"Support dark mode that follows system appearance setting. Use asset catalogs with dark variants. Ensure all custom colors have dark mode alternatives.",
				type: "improvement",
			},
			{
				title: "Add issue creation flow with form validation",
				description:
					"Multi-step form for creating issues: title/description > project/assignee > labels/priority > confirm. Validate required fields and show inline errors.",
				type: "feature",
			},
			{
				title: "Fix memory warnings on devices with 3GB RAM",
				description:
					"The app receives memory warnings when viewing large project boards with >100 issues. Implement cell reuse and image downsampling for avatars.",
				type: "bug",
			},
			{
				title: "Build sprint board with horizontal columns",
				description:
					"Kanban board with horizontally scrollable columns (todo, in progress, in review, done). Support drag-and-drop between columns with haptic feedback.",
				type: "feature",
			},
			{
				title: "Implement search with recent and suggested results",
				description:
					"Global search bar with recent searches, trending issues, and type-ahead suggestions. Search across issues, projects, and team members.",
				type: "improvement",
			},
			{
				title: "Add Shortcuts app integration for common actions",
				description:
					"Register Siri Shortcuts for: create issue, view my issues, check sprint progress. Support voice commands and home screen automation.",
				type: "feature",
			},
			{
				title: "Fix app state restoration after background kill",
				description:
					"When iOS kills the app in the background, reopening loses navigation state. Implement NSUserActivity-based state restoration.",
				type: "bug",
			},
			{
				title: "Build team member directory with presence indicators",
				description:
					"List of workspace members showing role, timezone, current status, and online/offline indicator. Tap to view their assigned issues.",
				type: "feature",
			},
			{
				title: "Implement certificate pinning for API requests",
				description:
					"Pin the server's TLS certificate to prevent MITM attacks. Include backup pins for certificate rotation. Fail gracefully with user-facing error.",
				type: "improvement",
			},
			{
				title: "Add comment threading and reply support",
				description:
					"Nested comment threads on issues. Reply to specific comments, quote text, and @mention team members. Show thread indicators on parent comments.",
				type: "feature",
			},
			{
				title: "Fix VoiceOver labels missing on custom UI elements",
				description:
					"Custom buttons and status badges are not accessible to VoiceOver users. Add accessibilityLabel, accessibilityHint, and accessibilityTraits to all custom views.",
				type: "bug",
			},
			{
				title: "Build app onboarding walkthrough",
				description:
					"Four-screen onboarding showing key features (projects, issues, notifications, offline). Include animations, skip button, and sign-in CTA on final screen.",
				type: "feature",
			},
			{
				title: "Implement background refresh for notifications",
				description:
					"Use BGAppRefreshTask to periodically fetch new notifications in the background. Update badge count and deliver local notifications for urgent items.",
				type: "improvement",
			},
			{
				title: "Add file attachment viewer with preview",
				description:
					"View attached files (images, PDFs, code) inline in issue detail. Support pinch-to-zoom for images, syntax highlighting for code, and share sheet.",
				type: "feature",
			},
			{
				title: "Fix login flow hanging on slow network",
				description:
					"The OAuth login flow shows an infinite spinner on 3G connections. Add timeout handling and retry button. Show network quality indicator.",
				type: "bug",
			},
			{
				title: "Build analytics summary screen for projects",
				description:
					"Dashboard showing project health metrics: velocity, burndown, issue distribution by status/priority, and team workload chart.",
				type: "feature",
			},
			{
				title: "Implement Quick Note from notification",
				description:
					"Long-press on a notification to add a quick comment or status update without opening the full app. Use UNNotificationContentExtension.",
				type: "improvement",
			},
			{
				title: "Add iPad support with split view",
				description:
					"Adapt the app for iPad with split-view navigation (sidebar + detail). Support Stage Manager and multi-window on iPadOS 16+.",
				type: "feature",
			},
			{
				title: "Fix animation stuttering on older devices",
				description:
					"List animations drop below 60fps on iPhone 12 and older. Profile with Instruments and optimize view hierarchy. Consider reducing animation complexity.",
				type: "bug",
			},
			{
				title: "Build calendar view for issues with due dates",
				description:
					"Monthly calendar showing issues by due date. Tap a date to see all issues due. Drag issues to reschedule. Color-code by priority.",
				type: "feature",
			},
			{
				title: "Implement handoff to continue on Mac/iPad",
				description:
					"Support Handoff so users can continue viewing an issue they were looking at on their iPhone on their Mac or iPad, and vice versa.",
				type: "improvement",
			},
			{
				title: "Add markdown rendering for issue descriptions",
				description:
					"Render markdown in issue descriptions and comments. Support headings, bold, italic, code blocks, links, images, and task lists.",
				type: "feature",
			},
			{
				title: "Fix notification badge count incorrect after read",
				description:
					"Reading a notification in-app doesn't decrement the badge count until the next background refresh. Update badge immediately on notification read.",
				type: "bug",
			},
			{
				title: "Build filtered issue list with saved filters",
				description:
					"Issue list with multi-select filters (status, priority, assignee, label, sprint). Save filter combinations as named presets for quick access.",
				type: "feature",
			},
			{
				title: "Implement progressive image loading for avatars",
				description:
					"Show low-res placeholder avatars from cache while loading high-res versions. Use LQIP (Low Quality Image Placeholder) technique.",
				type: "improvement",
			},
			{
				title: "Add share extension for creating issues from other apps",
				description:
					"iOS Share Extension that creates a new issue from shared content (text, links, images). Pre-fill description with shared content.",
				type: "feature",
			},
			{
				title: "Fix AutoLayout constraint conflicts in landscape",
				description:
					"Several screens show layout warnings and visual glitches in landscape orientation on notched iPhones. Fix safe area inset handling.",
				type: "bug",
			},
			{
				title: "Build label management interface",
				description:
					"View, create, edit, and delete workspace labels. Color picker for label colors. Show issue count per label.",
				type: "feature",
			},
			{
				title: "Implement app clip for quick issue viewing",
				description:
					"App Clip that loads when scanning a QR code on a physical kanban board. Shows issue details without installing the full app.",
				type: "improvement",
			},
			{
				title: "Add gesture navigation for issue browsing",
				description:
					"Swipe left/right to navigate between issues in a list. Edge swipe to go back. Long press for context menu with quick actions.",
				type: "feature",
			},
			{
				title: "Fix Core Data migration crash on version update",
				description:
					"Users updating from v1.2 to v1.3 experience crashes due to Core Data model incompatibility. Add lightweight migration mapping model.",
				type: "bug",
			},
			{
				title: "Build workspace switcher with recent workspaces",
				description:
					"Bottom sheet for switching between workspaces. Show recent workspaces at top, all workspaces below. Cache workspace data for instant switching.",
				type: "feature",
			},
			{
				title: "Implement dynamic type for all text elements",
				description:
					"Support Dynamic Type so text scales with the user's preferred text size. Test with all accessibility sizes including AX5.",
				type: "improvement",
			},
			{
				title: "Add crash reporting integration with Sentry",
				description:
					"Integrate Sentry SDK for crash reporting. Include breadcrumbs for user actions, device context, and custom tags for workspace/project.",
				type: "feature",
			},
			{
				title: "Fix excessive battery drain from location services",
				description:
					"Background location monitoring for timezone detection is draining battery. Switch from continuous monitoring to significant location changes.",
				type: "bug",
			},
			{
				title: "Build in-app feedback and bug report flow",
				description:
					"Shake-to-report feature that captures screenshot, device info, and logs. User adds description and submits as GitHub issue or internal feedback.",
				type: "feature",
			},
			{
				title: "Implement request caching with ETag support",
				description:
					"Cache API responses locally and use ETag/If-None-Match headers to validate. Reduces bandwidth usage and improves perceived performance.",
				type: "improvement",
			},
			{
				title: "Add timeline view for project milestones",
				description:
					"Horizontal timeline showing milestones with status indicators. Tap to see milestone details and linked issues. Support zoom gestures.",
				type: "feature",
			},
			{
				title: "Fix tab bar icons not updating with unread count",
				description:
					"The inbox tab badge showing unread count doesn't update in real-time. Subscribe to notification count changes and update badge reactively.",
				type: "bug",
			},
		],

		// ── Project 3: Mobile App (Android) ──────────────────────────────────
		3: [
			{
				title: "Implement Material You dynamic color theming",
				description:
					"Extract dynamic colors from the user's wallpaper using Material You API. Apply to the entire app theme including custom components and charts.",
				type: "feature",
			},
			{
				title: "Build project list with Jetpack Compose LazyColumn",
				description:
					"Project list using Compose LazyColumn with sticky headers for project groups. Support pull-to-refresh, search bar, and filter chips.",
				type: "feature",
			},
			{
				title: "Fix notification channel not created on Android 13",
				description:
					"Push notifications are silently dropped on Android 13+ because the notification channel isn't created before requesting POST_NOTIFICATIONS permission.",
				type: "bug",
			},
			{
				title: "Implement Room database for offline caching",
				description:
					"Define Room entities for projects, issues, comments, and users. Implement DAO with Flow-based queries. Add migration strategy for schema changes.",
				type: "feature",
			},
			{
				title: "Add predictive back gesture animations",
				description:
					"Implement Android 14 predictive back gesture with preview animations. Show previous screen peek during back swipe. Use OnBackPressedDispatcher.",
				type: "improvement",
			},
			{
				title: "Build issue detail with Compose bottom sheet",
				description:
					"Issue detail screen with scrollable content and bottom sheet for actions (change status, assign, add label). Use ModalBottomSheet with Material 3.",
				type: "feature",
			},
			{
				title: "Fix Compose recomposition causing scroll position loss",
				description:
					"The issue list loses scroll position when any item in the list updates (e.g., status change). Stabilize list item keys and use remember scroll state.",
				type: "bug",
			},
			{
				title: "Implement WorkManager for background sync",
				description:
					"Use WorkManager for periodic data sync (every 15 minutes). Support constraints (network required, battery not low). Handle sync conflicts.",
				type: "improvement",
			},
			{
				title: "Add home screen widget with Glance Compose",
				description:
					"Build widgets using Glance API: small (next due issue), wide (sprint progress), large (issue list). Support widget configuration activity.",
				type: "feature",
			},
			{
				title: "Fix crash on Android 12 when requesting exact alarms",
				description:
					"App crashes on Android 12 when scheduling exact alarm for due date reminders. Check SCHEDULE_EXACT_ALARM permission and fall back to inexact.",
				type: "bug",
			},
			{
				title: "Build settings screen with preference DataStore",
				description:
					"Settings screen with Compose Preference library. Store preferences using Proto DataStore. Include notification, appearance, and sync settings.",
				type: "feature",
			},
			{
				title: "Implement edge-to-edge display with inset handling",
				description:
					"Enable edge-to-edge content display behind system bars. Use WindowInsetsCompat to handle status bar and navigation bar insets in all screens.",
				type: "improvement",
			},
			{
				title: "Add issue creation with step-by-step Compose form",
				description:
					"Horizontal pager form for issue creation: basic info > details > review. Validate each step before proceeding. Show progress indicator.",
				type: "feature",
			},
			{
				title: "Fix ProGuard stripping Kotlin coroutine debug info",
				description:
					"Stack traces from production crashes are unreadable because ProGuard strips coroutine debug metadata. Add keep rules for coroutine internals.",
				type: "bug",
			},
			{
				title: "Build kanban board with LazyRow columns",
				description:
					"Kanban board using LazyRow for horizontal columns and LazyColumn for cards within each column. Support drag-and-drop with vibration feedback.",
				type: "feature",
			},
			{
				title: "Implement global search with SearchBar Compose",
				description:
					"Top-level search using Material 3 SearchBar with suggestions, recent searches, and categorized results (issues, projects, people).",
				type: "improvement",
			},
			{
				title: "Add Android Auto integration for voice commands",
				description:
					"Support Android Auto for hands-free issue queries and status updates. Implement CarAppService with voice input handling.",
				type: "feature",
			},
			{
				title: "Fix deep links not working when app is in recents",
				description:
					"Deep links from notifications open a new task instead of bringing the existing task to front. Fix launchMode and intent flags in manifest.",
				type: "bug",
			},
			{
				title: "Build team directory with Compose contact cards",
				description:
					"Grid layout of team member cards showing avatar, name, role, timezone, and online status. Tap to see assigned issues and recent activity.",
				type: "feature",
			},
			{
				title: "Implement network security configuration",
				description:
					"Add network security config for certificate pinning. Include pin-set with backup pins. Configure cleartext traffic policy per domain.",
				type: "improvement",
			},
			{
				title: "Add threaded comments with reply composable",
				description:
					"Nested comment UI using Compose. Indent replies, show thread count, and collapse/expand threads. Support @mentions with autocomplete.",
				type: "feature",
			},
			{
				title: "Fix TalkBack focus order incorrect in kanban board",
				description:
					"TalkBack reads kanban cards in column-first order instead of row-first. Fix traversal order using semantics modifier and contentDescription.",
				type: "bug",
			},
			{
				title: "Build onboarding with animated Compose screens",
				description:
					"Three-screen onboarding with Lottie animations, pager dots, and skip/next buttons. Remember completion state in DataStore.",
				type: "feature",
			},
			{
				title: "Implement foreground service for large file uploads",
				description:
					"Use foreground service with notification progress for file uploads >5MB. Support pause/resume and handle process death gracefully.",
				type: "improvement",
			},
			{
				title: "Add file attachment with camera and gallery",
				description:
					"Attach files from camera, photo gallery, or file picker. Show upload progress. Support images, PDFs, and documents up to 25MB.",
				type: "feature",
			},
			{
				title: "Fix OAuth login WebView not handling redirects",
				description:
					"Custom tab OAuth flow fails on some devices because the redirect URI isn't caught by the intent filter. Switch to Chrome Custom Tabs with fallback.",
				type: "bug",
			},
			{
				title: "Build project analytics with MPAndroidChart",
				description:
					"Project health dashboard using MPAndroidChart: velocity chart, burndown, issue distribution pie chart, and team workload bar chart.",
				type: "feature",
			},
			{
				title: "Implement adaptive icon with monochrome variant",
				description:
					"Create adaptive icon layers (foreground, background) and monochrome variant for themed icons on Android 13+. Test across different launcher shapes.",
				type: "improvement",
			},
			{
				title: "Add split-screen and foldable support",
				description:
					"Support split-screen multitasking and foldable devices. Implement adaptive layout using WindowSizeClass. Test on Samsung Fold configurations.",
				type: "feature",
			},
			{
				title: "Fix ANR in main thread during database migration",
				description:
					"Room database migration on update runs on main thread, causing ANR. Move migration to background thread with migration progress indicator.",
				type: "bug",
			},
			{
				title: "Build calendar view with Compose Canvas",
				description:
					"Monthly calendar using Compose Canvas for rendering. Show issue due dates as colored dots. Support swipe between months and tap to view details.",
				type: "feature",
			},
			{
				title: "Implement App Links for verified deep linking",
				description:
					"Set up Android App Links with Digital Asset Links for instant deep linking without disambiguation dialog. Verify for all URL patterns.",
				type: "improvement",
			},
			{
				title: "Add markdown rendering with Markwon library",
				description:
					"Render markdown in issue descriptions using Markwon. Support GitHub Flavored Markdown including tables, task lists, and syntax-highlighted code blocks.",
				type: "feature",
			},
			{
				title: "Fix notification sound not playing on Android 14",
				description:
					"Custom notification sound stopped working on Android 14. The sound URI reference is incorrect after the package visibility changes. Fix sound channel config.",
				type: "bug",
			},
			{
				title: "Build saved filters with Compose chip group",
				description:
					"Filter bar with Material 3 FilterChips for status, priority, assignee, and label. Save filter combinations as named presets using DataStore.",
				type: "feature",
			},
			{
				title: "Implement Coil image loading with disk cache",
				description:
					"Replace Glide with Coil for Compose-native image loading. Configure memory and disk cache sizes. Implement placeholder and error composables.",
				type: "improvement",
			},
			{
				title: "Add share target for creating issues from other apps",
				description:
					"Register as share target for text and image content. Pre-fill issue title/description from shared content. Support Direct Share shortcuts.",
				type: "feature",
			},
			{
				title: "Fix layout issues on tablets in portrait mode",
				description:
					"Several screens have fixed-width elements that don't scale on tablets. Implement responsive layout using ConstraintLayout and WindowSizeClass.",
				type: "bug",
			},
			{
				title: "Build label management with color picker dialog",
				description:
					"CRUD interface for workspace labels. Material 3 color picker for selecting label colors. Show issue count and usage frequency per label.",
				type: "feature",
			},
			{
				title: "Implement Instant App for quick issue viewing",
				description:
					"Create an Instant App module that loads when opening a Velocity issue URL. Show issue details without requiring full app installation.",
				type: "improvement",
			},
			{
				title: "Add per-app language preference support",
				description:
					"Support per-app language settings on Android 13+. Include in-app language picker for older versions. Persist preference across reinstalls.",
				type: "feature",
			},
			{
				title: "Fix ViewModel not surviving configuration change",
				description:
					"Issue detail ViewModel loses state on screen rotation because it's scoped to the composable instead of the navigation backstack entry. Fix ViewModel scoping.",
				type: "bug",
			},
			{
				title: "Build workspace switcher with bottom sheet",
				description:
					"Bottom sheet showing available workspaces with avatars and last-accessed time. Support multi-account switching with different auth tokens.",
				type: "feature",
			},
			{
				title: "Implement baseline profiles for startup optimization",
				description:
					"Generate baseline profiles using Macrobenchmark. Include critical user journeys: app start, project list, issue detail. Measure startup improvement.",
				type: "improvement",
			},
			{
				title: "Add Firebase Crashlytics integration",
				description:
					"Integrate Crashlytics for crash reporting. Include custom keys for workspace ID, project, and user role. Set up crash-free rate alerts.",
				type: "feature",
			},
			{
				title: "Fix excessive battery usage from background sync",
				description:
					"WorkManager sync jobs run too frequently and drain battery. Adjust sync interval based on app usage patterns. Respect battery saver mode.",
				type: "bug",
			},
			{
				title: "Build in-app update flow with Play Core",
				description:
					"Implement in-app updates using Play Core Library. Support immediate updates for critical fixes and flexible updates for features.",
				type: "feature",
			},
			{
				title: "Implement R8 optimization rules for smaller APK",
				description:
					"Configure R8 with aggressive optimization rules. Identify and remove unused Compose animation code. Target <15MB APK size.",
				type: "improvement",
			},
			{
				title: "Add timeline view for milestones and sprints",
				description:
					"Horizontal scrollable timeline showing project milestones and sprints. Support pinch-to-zoom for different time scales (week, month, quarter).",
				type: "feature",
			},
			{
				title: "Fix back navigation inconsistency with deep links",
				description:
					"Navigating back after opening a deep link sometimes goes to the wrong screen. Fix the back stack by building the correct parent chain.",
				type: "bug",
			},
		],

		// ── Project 4: Payment Gateway Integration ───────────────────────────
		4: [
			{
				title: "Implement Stripe Customer Portal integration",
				description:
					"Redirect users to Stripe's hosted customer portal for managing payment methods, viewing invoices, and canceling subscriptions.",
				type: "feature",
			},
			{
				title: "Build subscription plan selection UI",
				description:
					"Pricing page with plan cards showing features, limits, and pricing. Support monthly/annual toggle. Highlight recommended plan and current plan.",
				type: "feature",
			},
			{
				title: "Fix webhook signature validation failing intermittently",
				description:
					"About 2% of Stripe webhook events fail signature validation. The issue is clock skew between our server and Stripe's timestamp. Increase tolerance window.",
				type: "bug",
			},
			{
				title: "Implement usage-based billing with Stripe Metering",
				description:
					"Track API call usage per organization and report to Stripe Billing Meter. Handle meter event batching and fallback for Stripe API downtime.",
				type: "feature",
			},
			{
				title: "Add invoice generation with custom branding",
				description:
					"Generate branded PDF invoices with company logo, line items, tax breakdown, and payment instructions. Store in UploadThing and email to billing contact.",
				type: "feature",
			},
			{
				title: "Fix proration calculation incorrect on mid-cycle upgrade",
				description:
					"Upgrading from Pro to Enterprise mid-cycle charges the full Enterprise price instead of prorated amount. Fix the proration behavior in Stripe subscription update.",
				type: "bug",
			},
			{
				title: "Implement Stripe Tax for automatic tax calculation",
				description:
					"Enable Stripe Tax to automatically calculate and collect sales tax, VAT, and GST based on customer location. Support tax-exempt organizations.",
				type: "feature",
			},
			{
				title: "Build billing history page with download links",
				description:
					"List of all invoices with date, amount, status, and PDF download link. Support filtering by date range and status (paid, open, void).",
				type: "feature",
			},
			{
				title: "Fix subscription webhook events processed out of order",
				description:
					"Rapid subscription changes (upgrade then downgrade) sometimes process out of order. Implement event ordering using Stripe event sequence numbers.",
				type: "bug",
			},
			{
				title: "Implement coupon and promotion code system",
				description:
					"Support Stripe promotion codes for discounts. Allow percentage or fixed amount off. Support single-use and multi-use codes with expiration dates.",
				type: "feature",
			},
			{
				title: "Add payment method management UI",
				description:
					"Screen for adding, removing, and setting default payment methods. Support credit cards, ACH bank transfer, and SEPA direct debit.",
				type: "feature",
			},
			{
				title: "Fix trial period not starting on first subscription",
				description:
					"New customers don't get the 14-day trial period because the trial_end parameter isn't set on initial subscription creation.",
				type: "bug",
			},
			{
				title: "Implement revenue recognition reporting",
				description:
					"Generate monthly revenue reports following ASC 606 standards. Track deferred revenue, recognized revenue, and MRR changes.",
				type: "feature",
			},
			{
				title: "Build plan limit enforcement middleware",
				description:
					"Check plan limits (projects, members, storage) on every mutation. Return descriptive error with upgrade CTA when limits are exceeded.",
				type: "improvement",
			},
			{
				title: "Fix double charge on retry after payment failure",
				description:
					"When a payment fails and the user retries immediately, they sometimes get charged twice. Add idempotency key to all Stripe API calls.",
				type: "bug",
			},
			{
				title: "Implement dunning flow for failed payments",
				description:
					"Automated email sequence for failed payments: immediate notification, 3-day reminder, 7-day warning, 14-day account suspension. Include update payment link.",
				type: "feature",
			},
			{
				title: "Add multi-currency support with exchange rate display",
				description:
					"Support pricing in USD, EUR, GBP, and AUD. Show prices in the customer's local currency with real-time exchange rate from Stripe.",
				type: "feature",
			},
			{
				title: "Fix Stripe webhook endpoint failing health checks",
				description:
					"The /webhooks/stripe endpoint returns 500 on GET requests, causing our health check to flag it as down. Return 200 on GET, only process POST.",
				type: "bug",
			},
			{
				title: "Implement seat-based billing with auto-adjustment",
				description:
					"Automatically adjust subscription quantity when workspace members are added or removed. Pro-rate charges for mid-cycle changes.",
				type: "feature",
			},
			{
				title: "Build usage dashboard showing current period consumption",
				description:
					"Widget showing API calls, storage used, and member count against plan limits. Include projected overage costs. Update in real-time.",
				type: "feature",
			},
			{
				title: "Fix subscription status not updating after successful payment",
				description:
					"Subscription shows 'past_due' even after successful retry payment. The invoice.paid webhook handler doesn't update the subscription status.",
				type: "bug",
			},
			{
				title: "Implement Stripe Connect for marketplace features",
				description:
					"Set up Stripe Connect for future marketplace capabilities. Handle onboarding flow, account verification, and payout scheduling.",
				type: "feature",
			},
			{
				title: "Add billing email notifications for approaching limits",
				description:
					"Send email alerts when usage reaches 80% and 95% of plan limits. Include upgrade recommendations and link to billing settings.",
				type: "improvement",
			},
			{
				title: "Fix tax ID validation rejecting valid EU VAT numbers",
				description:
					"Stripe Tax ID validation rejects VAT numbers with country prefix (e.g., DE123456789). Strip country code before validation.",
				type: "bug",
			},
			{
				title: "Implement annual billing discount with migration path",
				description:
					"Offer 20% discount for annual billing. Build migration flow for monthly subscribers to switch to annual. Handle pro-ration correctly.",
				type: "feature",
			},
			{
				title: "Build admin billing overview for all organizations",
				description:
					"Admin dashboard showing MRR, churn rate, ARPU, plan distribution, and revenue growth chart. Support filtering by plan and date range.",
				type: "feature",
			},
			{
				title: "Fix Stripe checkout session expiration not handled",
				description:
					"Expired checkout sessions leave pending subscription records in our database. Add cleanup job that runs hourly to void expired sessions.",
				type: "bug",
			},
			{
				title: "Implement grandfathering for legacy plan subscribers",
				description:
					"Existing customers should keep their current pricing when we change plan prices. Track original pricing in metadata and apply on renewal.",
				type: "improvement",
			},
			{
				title: "Add Stripe billing portal link in workspace settings",
				description:
					"One-click access to Stripe's hosted billing portal from workspace settings. Pre-fill customer email for faster authentication.",
				type: "feature",
			},
			{
				title: "Fix webhook retry storm after extended Stripe outage",
				description:
					"After a Stripe outage, hundreds of queued webhooks arrive simultaneously. Implement rate limiting and queuing for webhook processing.",
				type: "bug",
			},
			{
				title: "Implement credit system for prepaid usage",
				description:
					"Allow customers to purchase API call credits in advance at a discount. Deduct from credit balance before metered billing kicks in.",
				type: "feature",
			},
			{
				title: "Build subscription comparison table for upgrade flow",
				description:
					"Side-by-side comparison of current plan vs target plan. Highlight new features, changed limits, and price difference. Show pro-rated cost.",
				type: "improvement",
			},
			{
				title: "Fix organization billing association after ownership transfer",
				description:
					"Transferring org ownership doesn't update the Stripe customer association. The old owner continues to be charged.",
				type: "bug",
			},
			{
				title: "Implement PCI-compliant payment form with Stripe Elements",
				description:
					"Replace the basic card input with Stripe Elements for PCI-compliant payment collection. Support Apple Pay and Google Pay payment methods.",
				type: "feature",
			},
			{
				title: "Add billing audit trail for compliance",
				description:
					"Log all billing-related actions (plan changes, payment attempts, refunds, credits) with timestamp, actor, and before/after state.",
				type: "improvement",
			},
			{
				title: "Fix subscription cancelation not taking effect at period end",
				description:
					"Canceling a subscription takes effect immediately instead of at the end of the current billing period. Set cancel_at_period_end correctly.",
				type: "bug",
			},
			{
				title: "Implement Stripe Radar rules for fraud prevention",
				description:
					"Configure Stripe Radar rules to block suspicious payment attempts. Add velocity checks, geographic restrictions, and card testing prevention.",
				type: "feature",
			},
			{
				title: "Build refund processing workflow",
				description:
					"Admin interface for processing refunds. Support full and partial refunds with reason codes. Update subscription status and send confirmation email.",
				type: "feature",
			},
			{
				title: "Fix currency rounding errors in invoice totals",
				description:
					"Invoice totals sometimes differ by 1 cent from the sum of line items due to floating point rounding. Use integer cents for all calculations.",
				type: "bug",
			},
			{
				title: "Implement Stripe payment links for quick purchases",
				description:
					"Generate shareable payment links for one-time purchases (consulting hours, premium support). Track conversion from link to payment.",
				type: "feature",
			},
			{
				title: "Add billing notification preferences per role",
				description:
					"Admins receive all billing notifications. Members only see plan limit warnings. Owners get financial reports. Configurable per workspace.",
				type: "improvement",
			},
			{
				title: "Fix test mode webhooks interfering with production",
				description:
					"Stripe test mode webhook events are being processed by the production webhook handler. Add environment check and separate endpoints.",
				type: "bug",
			},
			{
				title: "Implement subscription pause and resume",
				description:
					"Allow customers to pause their subscription for up to 3 months. Maintain data access in read-only mode during pause. Resume with pro-ration.",
				type: "feature",
			},
			{
				title: "Build revenue forecasting based on current subscriptions",
				description:
					"Project future MRR based on current subscription data, expansion/contraction trends, and historical churn rate. Show 3/6/12 month forecasts.",
				type: "feature",
			},
			{
				title: "Fix Stripe API version mismatch causing field errors",
				description:
					"Recent Stripe API version update changed the payment_intent.charges field to latest_charge. Pin API version and update field references.",
				type: "bug",
			},
			{
				title: "Implement enterprise custom pricing contracts",
				description:
					"Support custom pricing for enterprise customers outside standard plans. Store contract terms in metadata. Override plan limits per organization.",
				type: "feature",
			},
			{
				title: "Add payment retry scheduling configuration",
				description:
					"Allow configuring the retry schedule for failed payments (immediate, 1d, 3d, 7d). Different schedules for card vs ACH vs SEPA payment methods.",
				type: "improvement",
			},
			{
				title: "Fix billing page SSR hydration mismatch",
				description:
					"The billing page shows a flash of incorrect content on load because server-rendered HTML doesn't match client-rendered Stripe Elements. Fix hydration.",
				type: "bug",
			},
			{
				title: "Implement Stripe financial reporting exports",
				description:
					"Export monthly financial data (revenue, refunds, fees, net) as CSV and connect to accounting software via Stripe Data Pipeline.",
				type: "feature",
			},
			{
				title: "Build plan downgrade flow with feature impact warning",
				description:
					"When downgrading, show which features/data will be affected. Require confirmation of data that will be archived. Send summary email.",
				type: "improvement",
			},
		],

		// ── Project 5: Analytics Engine ──────────────────────────────────────
		5: [
			{
				title: "Build Kafka producer for event ingestion API",
				description:
					"Create a high-throughput event ingestion endpoint that publishes to Kafka. Support batch mode (up to 1000 events per request) with schema validation.",
				type: "feature",
			},
			{
				title: "Implement ClickHouse materialized views for rollups",
				description:
					"Create materialized views for minute, hour, and day rollups. Use AggregatingMergeTree engine. Auto-merge partitions on a daily schedule.",
				type: "feature",
			},
			{
				title: "Fix event deduplication not working for retried events",
				description:
					"Kafka consumer processes duplicate events when a producer retries. Implement idempotent consumer using event_id and deduplication window.",
				type: "bug",
			},
			{
				title: "Design analytics query DSL for custom reports",
				description:
					"Define a SQL-like query DSL that supports dimensions, metrics, filters, and time grouping. Parse to ClickHouse SQL with parameterized queries.",
				type: "feature",
			},
			{
				title: "Add retention analysis with cohort tables",
				description:
					"Build cohort-based retention analysis. Group users by signup week and track weekly retention rates. Visualize as retention matrix heatmap.",
				type: "feature",
			},
			{
				title: "Fix Kafka consumer lag growing during peak hours",
				description:
					"Consumer group lag exceeds 100K messages during peak traffic (2-4pm UTC). Scale consumer instances and optimize batch processing size.",
				type: "bug",
			},
			{
				title: "Implement funnel analysis engine",
				description:
					"Define custom funnels with ordered steps and conversion windows. Calculate drop-off rates between steps. Support segmentation by user properties.",
				type: "feature",
			},
			{
				title: "Build real-time event stream viewer",
				description:
					"Live-tail view showing events as they arrive. Support filtering by event type, user, and properties. Limit to last 1000 events for performance.",
				type: "feature",
			},
			{
				title: "Fix ClickHouse query timeout on large date ranges",
				description:
					"Queries spanning >90 days timeout at 30s. Optimize by pre-aggregating to daily summaries and querying rollup tables for wide ranges.",
				type: "bug",
			},
			{
				title: "Implement user property tracking and enrichment",
				description:
					"Track mutable user properties (plan, role, company) alongside events. Enrich historical events with current properties for segmentation.",
				type: "feature",
			},
			{
				title: "Add custom event schema validation",
				description:
					"Allow teams to define event schemas with required/optional properties and types. Validate incoming events against schema. Reject malformed events with error details.",
				type: "improvement",
			},
			{
				title: "Fix data export job failing for workspaces with >1M events",
				description:
					"CSV export OOMs when exporting large workspaces. Implement streaming export with chunked file generation and S3 multipart upload.",
				type: "bug",
			},
			{
				title: "Build analytics dashboard template system",
				description:
					"Pre-built dashboard templates for common analytics use cases: product usage, feature adoption, user engagement. One-click setup with real data.",
				type: "feature",
			},
			{
				title: "Implement A/B test event attribution",
				description:
					"Tag events with experiment variant for A/B tests. Calculate statistical significance between variants. Support multi-variant experiments.",
				type: "feature",
			},
			{
				title: "Fix event timestamps inconsistent across timezones",
				description:
					"Events sent from different timezones have inconsistent timestamps. Standardize to server-side timestamp while preserving client timezone as property.",
				type: "bug",
			},
			{
				title: "Add SQL query editor with autocomplete",
				description:
					"In-browser SQL editor for advanced analytics queries. Auto-complete table and column names. Show query plan and estimated cost before execution.",
				type: "feature",
			},
			{
				title: "Implement event sampling for high-volume sources",
				description:
					"For events exceeding 10K/min from a single source, implement client-side sampling with server-side extrapolation to reduce storage costs.",
				type: "improvement",
			},
			{
				title: "Fix Kafka partition rebalancing causing event loss",
				description:
					"During consumer group rebalancing, some events are lost because offsets are committed before processing completes. Implement manual offset management.",
				type: "bug",
			},
			{
				title: "Build automated anomaly detection for metrics",
				description:
					"Detect anomalies in key metrics using rolling standard deviation. Alert when a metric deviates by >2 sigma from the 7-day moving average.",
				type: "feature",
			},
			{
				title: "Implement cross-device user identification",
				description:
					"Merge anonymous events with identified user events using alias mapping. Handle identity resolution across multiple devices and sessions.",
				type: "feature",
			},
			{
				title: "Fix dashboard chart not updating with new event types",
				description:
					"Charts configured for specific event types don't pick up newly created event types that match the filter pattern. Fix the event type enumeration.",
				type: "bug",
			},
			{
				title: "Add data governance with PII redaction",
				description:
					"Automatically detect and redact PII (emails, IPs, names) from event properties. Support configurable redaction rules and audit logging.",
				type: "improvement",
			},
			{
				title: "Implement real-time alerting engine",
				description:
					"Define alert rules on metric thresholds with configurable evaluation windows. Support multi-channel notifications (email, Slack, PagerDuty, webhook).",
				type: "feature",
			},
			{
				title: "Build event replay system for reprocessing",
				description:
					"Replay historical events through updated processing pipelines. Support time-range selection, speed control (1x-100x), and dry-run mode.",
				type: "feature",
			},
			{
				title: "Fix ClickHouse disk space not reclaimed after TTL expiry",
				description:
					"Expired data partitions are marked for deletion but disk space isn't reclaimed. Force partition merging and optimize table cleanup schedule.",
				type: "bug",
			},
			{
				title: "Implement path analysis for user journeys",
				description:
					"Visualize common user navigation paths through the product. Show most frequent paths, drop-off points, and conversion paths to key actions.",
				type: "feature",
			},
			{
				title: "Add analytics API rate limiting per organization",
				description:
					"Implement per-org rate limits for analytics query API. Free: 100 queries/day, Pro: 10K/day, Enterprise: unlimited. Return rate limit headers.",
				type: "improvement",
			},
			{
				title: "Fix timezone conversion in weekly aggregation boundaries",
				description:
					"Weekly rollups split at UTC midnight, not the org's configured timezone. This causes Monday morning data to appear in the previous week's totals.",
				type: "bug",
			},
			{
				title: "Build comparison reports (period over period)",
				description:
					"Compare any metric between two time periods. Show absolute and percentage change. Support week-over-week, month-over-month, and custom ranges.",
				type: "feature",
			},
			{
				title: "Implement event property indexing for fast filtering",
				description:
					"Allow indexing specific event properties for fast query filtering. Track index usage and suggest indexes for commonly filtered properties.",
				type: "improvement",
			},
			{
				title: "Fix Kafka consumer not processing events after broker restart",
				description:
					"Consumer fails to reconnect after Kafka broker restart. Implement robust reconnection logic with exponential backoff and partition reassignment.",
				type: "bug",
			},
			{
				title: "Add data warehouse export connector",
				description:
					"Export analytics data to external warehouses (BigQuery, Snowflake, Redshift). Support incremental sync with configurable schedule.",
				type: "feature",
			},
			{
				title: "Implement session recording replay",
				description:
					"Record user sessions (clicks, scrolls, form inputs) and replay them visually. Store session data efficiently with event compression.",
				type: "feature",
			},
			{
				title: "Fix materialized view refresh blocking insert queries",
				description:
					"Materialized view refresh operations lock the source table, blocking incoming inserts. Use asynchronous materialized views with eventual consistency.",
				type: "bug",
			},
			{
				title: "Build custom metric definition system",
				description:
					"Allow users to define custom metrics as expressions over events (e.g., 'daily_active_users = count(distinct user_id where event=pageview per day)'). Validate and cache.",
				type: "feature",
			},
			{
				title: "Implement data deletion for GDPR compliance",
				description:
					"Support user data deletion requests. Delete all events and properties for a given user ID. Generate compliance certificate.",
				type: "improvement",
			},
			{
				title: "Fix analytics dashboard embedding CSP violations",
				description:
					"Embedded analytics iframes fail on customer domains due to Content-Security-Policy. Generate per-customer embed tokens with domain allowlisting.",
				type: "bug",
			},
			{
				title: "Add predictive analytics using linear regression",
				description:
					"Forecast future metric values using simple linear regression on historical data. Show confidence intervals and trend direction indicators.",
				type: "feature",
			},
			{
				title: "Implement analytics event batching client SDK",
				description:
					"Client-side SDK that batches events and flushes every 10 seconds or 50 events. Support automatic page view tracking and error capture.",
				type: "feature",
			},
			{
				title: "Fix ingestion API returning 200 for invalid event payloads",
				description:
					"Invalid event payloads are silently accepted and dropped during processing. Return 400 with validation errors at ingestion time.",
				type: "bug",
			},
			{
				title: "Build team performance analytics module",
				description:
					"Metrics for engineering teams: velocity over time, cycle time, lead time, throughput, and WIP limits. Aggregated by team and individual.",
				type: "feature",
			},
			{
				title: "Implement query result caching with TTL",
				description:
					"Cache analytics query results in Redis with configurable TTL based on data freshness requirements. Invalidate cache on new data ingestion.",
				type: "improvement",
			},
			{
				title: "Fix historical backfill corrupting rollup tables",
				description:
					"Backfilling historical events causes rollup tables to double-count because the materialized view processes both original and backfill data.",
				type: "bug",
			},
			{
				title: "Add multi-project analytics comparison",
				description:
					"Compare analytics metrics across multiple projects side-by-side. Normalize data for fair comparison (per-user, per-day). Export comparison report.",
				type: "feature",
			},
			{
				title: "Implement real-time streaming dashboard updates",
				description:
					"Push analytics updates to dashboards via WebSocket as new events arrive. Throttle updates to every 5 seconds to prevent excessive re-rendering.",
				type: "improvement",
			},
			{
				title: "Fix event schema migration breaking existing queries",
				description:
					"Adding new required fields to event schema breaks saved queries that don't include the new fields. Implement backward-compatible schema evolution.",
				type: "bug",
			},
			{
				title: "Build geographic analytics with map visualization",
				description:
					"Show event distribution on a world map. Support drill-down from country to city level. Color-code regions by metric intensity.",
				type: "feature",
			},
			{
				title: "Implement analytics data archival to cold storage",
				description:
					"Archive events older than 90 days to S3 Glacier. Support on-demand restoration for historical queries. Track archival status per partition.",
				type: "feature",
			},
			{
				title: "Fix query builder generating invalid SQL for nested filters",
				description:
					"The visual query builder generates incorrect SQL when combining AND/OR filter groups. Fix the parenthesization logic in the SQL generator.",
				type: "bug",
			},
			{
				title: "Add webhook for analytics alert notifications",
				description:
					"Send webhook payloads when analytics alerts fire. Include metric value, threshold, alert metadata, and deep link to the affected dashboard.",
				type: "improvement",
			},
		],

		// ── Project 6: User Onboarding Redesign ──────────────────────────────
		6: [
			{
				title: "Build welcome wizard with role-based paths",
				description:
					"Multi-step wizard that adapts based on user role (developer, designer, PM, executive). Each path emphasizes different features and setup steps.",
				type: "feature",
			},
			{
				title: "Implement interactive product tour with Shepherd.js",
				description:
					"Step-by-step product tour highlighting key features. Support skip, back, and dismiss. Track completion rate per step for optimization.",
				type: "feature",
			},
			{
				title: "Fix wizard progress not saving on browser refresh",
				description:
					"Refreshing the browser during onboarding resets progress to step 1. Save current step and form data to sessionStorage.",
				type: "bug",
			},
			{
				title: "Create workspace template gallery",
				description:
					"Gallery of pre-configured workspace templates (Software Team, Design Agency, Marketing, Startup). Each template includes sample projects and configured views.",
				type: "feature",
			},
			{
				title: "Add checklist widget for onboarding tasks",
				description:
					"Persistent bottom-right widget showing onboarding tasks: create project, invite member, create issue, set up notifications. Track completion.",
				type: "feature",
			},
			{
				title: "Fix email verification link expired error message unclear",
				description:
					"Users see a generic error when clicking an expired verification link. Show a specific message with a resend button and explain the 24-hour expiry.",
				type: "bug",
			},
			{
				title: "Implement progressive disclosure for complex features",
				description:
					"Hide advanced features (custom fields, automation, API keys) until the user has completed basic setup. Gradually reveal as proficiency grows.",
				type: "improvement",
			},
			{
				title: "Build team invitation flow with bulk import",
				description:
					"Invite team members via email with role selection. Support CSV import for bulk invitations. Show invitation status and resend option.",
				type: "feature",
			},
			{
				title: "Fix onboarding animations causing layout shift",
				description:
					"Hero animations in the welcome wizard cause cumulative layout shift (CLS > 0.25). Pre-allocate space for animations to eliminate CLS.",
				type: "bug",
			},
			{
				title: "Create personalized dashboard for new users",
				description:
					"First-time users see a personalized dashboard with getting started cards, recommended actions, and contextual help based on their role.",
				type: "feature",
			},
			{
				title: "Add contextual tooltips for first-time feature usage",
				description:
					"Show helpful tooltips the first time a user interacts with key features (command palette, AI chat, kanban board). One tooltip per session maximum.",
				type: "improvement",
			},
			{
				title: "Fix SSO redirect loop during onboarding",
				description:
					"Users signing up via Google SSO get stuck in a redirect loop if their email domain doesn't match the invited organization. Break the loop with clear error.",
				type: "bug",
			},
			{
				title: "Implement sample data generation for empty workspaces",
				description:
					"Auto-generate sample projects, issues, and documents when a workspace is created. Allow users to clear sample data when ready for production use.",
				type: "feature",
			},
			{
				title: "Build keyboard shortcuts discovery overlay",
				description:
					"Cmd+/ overlay showing all keyboard shortcuts grouped by context (global, issues, editor, chat). Include search and show recently used.",
				type: "feature",
			},
			{
				title: "Fix onboarding completion rate tracking inaccurate",
				description:
					"Analytics shows 95% of users complete onboarding but support tickets suggest otherwise. The completion event fires before the final step is actually done.",
				type: "bug",
			},
			{
				title: "Create empty state designs for all list views",
				description:
					"Design and implement engaging empty states for projects, issues, docs, and boards. Include illustration, description, and primary action button.",
				type: "improvement",
			},
			{
				title: "Implement A/B test framework for onboarding flows",
				description:
					"Support multiple onboarding flow variants for A/B testing. Track conversion rates per variant. Auto-promote the winning variant.",
				type: "feature",
			},
			{
				title: "Build workspace setup checklist with progress ring",
				description:
					"Circular progress indicator showing workspace setup completion. Persistent in sidebar until 100%. Each segment represents a setup category.",
				type: "feature",
			},
			{
				title: "Fix invite link sharing not working on mobile browsers",
				description:
					"Workspace invite links fail to open properly in mobile Safari and Chrome. The deep link handler doesn't fall back to web signup on mobile.",
				type: "bug",
			},
			{
				title: "Add video walkthrough option for visual learners",
				description:
					"Short (30-60s) video clips embedded in onboarding steps for users who prefer visual learning. Track play rate and completion.",
				type: "feature",
			},
			{
				title: "Implement smart defaults based on team size",
				description:
					"Auto-configure workspace settings based on team size. Solo: simplified views, <10: all features visible, 10+: enable admin features and permissions.",
				type: "improvement",
			},
			{
				title: "Fix onboarding wizard skipped for users joining via invite",
				description:
					"Users who join via team invite skip the onboarding wizard entirely. Show a condensed version that covers essential features.",
				type: "bug",
			},
			{
				title: "Build interactive sandbox environment",
				description:
					"Protected sandbox workspace where new users can experiment without affecting real data. Pre-populated with realistic demo content.",
				type: "feature",
			},
			{
				title: "Create onboarding email drip campaign",
				description:
					"7-day email sequence: welcome, first project tips, collaboration features, AI features, advanced tips, feedback request. Triggered by signup.",
				type: "feature",
			},
			{
				title: "Fix dark mode not applied during onboarding flow",
				description:
					"The onboarding wizard always renders in light mode regardless of system preference. Apply the user's theme choice from the first wizard step.",
				type: "bug",
			},
			{
				title: "Implement feature discovery nudges",
				description:
					"Subtle UI hints for underutilized features based on user behavior. Show nudge for AI chat if user hasn't tried it after 3 days.",
				type: "improvement",
			},
			{
				title: "Build role-specific quick start guides",
				description:
					"In-app quick start guide tailored to the user's role. Developer: API setup, CI/CD. Designer: boards, docs. PM: projects, analytics.",
				type: "feature",
			},
			{
				title: "Add onboarding analytics dashboard",
				description:
					"Admin dashboard showing onboarding funnel, step completion rates, drop-off points, time spent per step, and cohort retention.",
				type: "feature",
			},
			{
				title: "Fix wizard back button losing form state",
				description:
					"Going back in the wizard clears form data entered in previous steps. Maintain form state in React context across all wizard steps.",
				type: "bug",
			},
			{
				title: "Implement in-app help center with search",
				description:
					"Searchable help center accessible from any page via ? icon. Show contextual articles based on current page. Link to external docs for details.",
				type: "feature",
			},
			{
				title: "Create first-run experience for AI features",
				description:
					"Dedicated introduction to AI capabilities: chat sidebar, inline AI in editor, issue AI suggestions. Include try-it-now prompts.",
				type: "feature",
			},
			{
				title: "Fix workspace creation failing for non-Latin characters",
				description:
					"Workspace name with CJK or Arabic characters causes slug generation to fail. Implement transliteration fallback for slug generation.",
				type: "bug",
			},
			{
				title: "Build guided project creation with best practices",
				description:
					"Step-by-step project creation that suggests best practices: scope definition, milestone planning, member assignment, and initial issue creation.",
				type: "improvement",
			},
			{
				title: "Add onboarding state persistence across devices",
				description:
					"Sync onboarding progress to the server so users can continue onboarding on a different device from where they left off.",
				type: "improvement",
			},
			{
				title: "Fix loading state flash during onboarding transitions",
				description:
					"Brief white flash between onboarding steps due to layout recalculation. Add crossfade transition between steps.",
				type: "bug",
			},
			{
				title: "Implement contextual onboarding for workspace imports",
				description:
					"When user imports data from another tool (Jira, Linear, Asana), adapt onboarding to highlight migration-specific features and differences.",
				type: "feature",
			},
			{
				title: "Build team onboarding cohort tracking",
				description:
					"Track onboarding progress for team cohorts (all users invited in the same batch). Show team adoption metrics to workspace admins.",
				type: "feature",
			},
			{
				title: "Fix notification permission request timing",
				description:
					"Notification permission is requested too early during onboarding before the user understands the value. Defer to after first meaningful interaction.",
				type: "bug",
			},
			{
				title: "Add gamification elements to onboarding completion",
				description:
					"Award badges for completing onboarding milestones. Show achievement toast notifications. Display badges on user profile.",
				type: "improvement",
			},
			{
				title: "Implement pre-onboarding survey for personalization",
				description:
					"Quick 3-question survey before onboarding: role, team size, primary use case. Use responses to personalize the entire onboarding experience.",
				type: "feature",
			},
			{
				title: "Fix onboarding tour tooltip overlapping sidebar",
				description:
					"Tour tooltips render behind the sidebar when pointing to sidebar elements. Fix z-index stacking and add sidebar auto-expand for relevant steps.",
				type: "bug",
			},
			{
				title: "Build workspace health score for setup completeness",
				description:
					"Score (0-100) reflecting workspace setup quality: members invited, projects created, integrations connected, AI configured. Show in settings.",
				type: "feature",
			},
			{
				title: "Create integration setup wizards for each provider",
				description:
					"Dedicated setup wizards for GitHub, Slack, Figma integrations within onboarding. Each wizard handles OAuth, permission selection, and initial sync.",
				type: "feature",
			},
			{
				title: "Fix time-to-value metric not tracking correctly",
				description:
					"The 'time to first issue created' metric counts from account creation instead of first login. Fix the event timing to measure actual engagement.",
				type: "bug",
			},
			{
				title: "Implement adaptive onboarding pace",
				description:
					"Detect user engagement speed and adapt onboarding pace. Power users can skip ahead. Slow users get more explanation and fewer steps per session.",
				type: "improvement",
			},
			{
				title: "Add exit survey for users who skip onboarding",
				description:
					"When users skip onboarding, show a 1-question survey: 'Why did you skip?' Options: experienced user, exploring, invited by team, other.",
				type: "improvement",
			},
			{
				title: "Fix onboarding completion webhook not firing",
				description:
					"The webhook that notifies analytics when a user completes onboarding doesn't fire for users who complete out of order. Fix event emission.",
				type: "bug",
			},
			{
				title: "Build onboarding performance monitoring",
				description:
					"Track page load times, animation frame rates, and interaction latency during onboarding. Alert if any step exceeds 3s load time.",
				type: "improvement",
			},
			{
				title: "Implement localized onboarding for top 5 languages",
				description:
					"Translate onboarding content to Spanish, French, German, Japanese, and Portuguese. Support RTL layout for Arabic (future). Auto-detect browser locale.",
				type: "feature",
			},
			{
				title: "Create re-onboarding flow for major feature releases",
				description:
					"When a major feature launches, show a condensed 're-onboarding' for existing users. Highlight what's new without repeating known features.",
				type: "feature",
			},
		],

		// ── Project 7: Admin Console ─────────────────────────────────────────
		7: [
			{
				title: "Build user management table with search and filters",
				description:
					"DataTable of all users with columns: name, email, org, role, status, created date. Support text search, role filter, and status filter.",
				type: "feature",
			},
			{
				title: "Implement user impersonation with audit trail",
				description:
					"Admin can impersonate any user to debug issues. Log every impersonation with admin ID, target user, start/end time. Require 2FA confirmation.",
				type: "feature",
			},
			{
				title: "Fix admin sidebar not collapsing on mobile",
				description:
					"The admin console sidebar overlaps content on mobile viewports instead of collapsing into a hamburger menu. Add responsive breakpoint handling.",
				type: "bug",
			},
			{
				title: "Build organization management dashboard",
				description:
					"Overview of all organizations: member count, plan, usage, creation date. Click to view org details, members, and billing information.",
				type: "feature",
			},
			{
				title: "Add feature flag management with percentage rollout",
				description:
					"CRUD for feature flags. Support boolean, percentage rollout, and user targeting. Show current state and rollout history per flag.",
				type: "feature",
			},
			{
				title: "Fix audit log pagination skipping entries",
				description:
					"Navigating to page 2 of audit logs skips some entries because new events are inserted while paginating. Implement cursor-based pagination.",
				type: "bug",
			},
			{
				title: "Implement system health monitoring dashboard",
				description:
					"Real-time system health: API latency, error rate, active WebSocket connections, Convex function usage, database size. Auto-refresh every 30s.",
				type: "feature",
			},
			{
				title: "Build user suspension and account deletion flow",
				description:
					"Admin can suspend accounts (reversible) or permanently delete them. Suspension blocks all access. Deletion removes all user data after 30-day grace period.",
				type: "feature",
			},
			{
				title: "Fix date filters not respecting admin timezone",
				description:
					"Date filters in audit logs and analytics use UTC. Convert to admin's local timezone for display while keeping UTC for queries.",
				type: "bug",
			},
			{
				title: "Create bulk user operations interface",
				description:
					"Select multiple users and perform bulk actions: change role, suspend, send notification, export to CSV. Show operation progress and results.",
				type: "feature",
			},
			{
				title: "Add environment variable management UI",
				description:
					"View and edit Convex environment variables from the admin console. Support create, update, delete with confirmation. Show last modified date.",
				type: "feature",
			},
			{
				title: "Fix admin search not returning inactive organizations",
				description:
					"Organization search only queries active orgs. Add a status filter toggle to include inactive, suspended, and trial-expired organizations.",
				type: "bug",
			},
			{
				title: "Implement admin action confirmation dialogs",
				description:
					"All destructive admin actions (delete, suspend, impersonate) require a typed confirmation dialog. Include the target entity name for verification.",
				type: "improvement",
			},
			{
				title: "Build analytics overview for admin dashboard",
				description:
					"Key business metrics: DAU/MAU, new signups, churn rate, active workspaces, API usage, storage consumption. Support daily/weekly/monthly views.",
				type: "feature",
			},
			{
				title: "Fix CSV export encoding issues with Unicode names",
				description:
					"Exported CSV files show garbled characters for non-ASCII names. Add UTF-8 BOM and proper encoding headers to CSV exports.",
				type: "bug",
			},
			{
				title: "Create workspace usage report generator",
				description:
					"Generate detailed usage reports per workspace: issues created, docs edited, AI queries, storage used. Export as PDF with charts and tables.",
				type: "feature",
			},
			{
				title: "Implement role-based access for admin console",
				description:
					"Three admin roles: super admin (full access), support admin (read + impersonate), analytics admin (read-only). Enforce in both UI and API.",
				type: "feature",
			},
			{
				title: "Build notification broadcast system",
				description:
					"Send in-app notifications or emails to all users, specific organizations, or users matching criteria. Support scheduling and template previews.",
				type: "feature",
			},
			{
				title: "Fix admin console session timeout not redirecting",
				description:
					"After session timeout, API calls fail silently. Detect 401 responses and redirect to admin login page with return URL.",
				type: "bug",
			},
			{
				title: "Add real-time activity feed for admin dashboard",
				description:
					"Live feed of significant events: new signups, plan changes, errors, feature flag changes. Support filtering and auto-pause on hover.",
				type: "feature",
			},
			{
				title: "Implement database query explorer",
				description:
					"Safe read-only query interface for investigating data issues. Pre-built query templates for common lookups. Log all admin queries for audit.",
				type: "feature",
			},
			{
				title: "Fix admin console dark mode contrast issues",
				description:
					"Several admin UI elements have insufficient contrast in dark mode. Audit all components against WCAG AA requirements.",
				type: "bug",
			},
			{
				title: "Create migration management dashboard",
				description:
					"Track database migration status: pending, running, completed, rolled back. Support manually triggering and rolling back migrations.",
				type: "feature",
			},
			{
				title: "Build customer support ticket viewer",
				description:
					"View support tickets from within admin console. Link tickets to user accounts and workspaces. Add internal notes visible only to admins.",
				type: "feature",
			},
			{
				title: "Fix admin API endpoints not rate limited",
				description:
					"Admin API endpoints have no rate limiting. A compromised admin token could make unlimited requests. Add conservative rate limits.",
				type: "bug",
			},
			{
				title: "Implement admin changelog and release notes",
				description:
					"In-admin changelog showing recent system changes, deployments, and feature flags. Include rollback links for recent deployments.",
				type: "improvement",
			},
			{
				title: "Add workspace data export for compliance requests",
				description:
					"Generate complete data export for a workspace (all issues, docs, comments, files). Package as ZIP. Required for GDPR data portability.",
				type: "feature",
			},
			{
				title: "Build infrastructure cost tracking dashboard",
				description:
					"Track and visualize infrastructure costs: Convex usage, Vercel bandwidth, storage, AI API calls. Show trends and projected monthly cost.",
				type: "feature",
			},
			{
				title: "Fix admin console loading spinner stuck on slow networks",
				description:
					"The initial admin console load shows a spinner indefinitely on slow connections. Add timeout with retry button and offline indicator.",
				type: "bug",
			},
			{
				title: "Implement admin two-factor authentication enforcement",
				description:
					"Require 2FA for all admin accounts. Support TOTP authenticator apps and hardware security keys. Grace period for first-time setup.",
				type: "feature",
			},
			{
				title: "Create automated system health alerts",
				description:
					"Automated alerts for: error rate >1%, p95 latency >500ms, database size >80% limit, Convex function timeout rate >0.1%. Notify via Slack and email.",
				type: "feature",
			},
			{
				title: "Fix admin table sorting not persisting across navigation",
				description:
					"Sort order resets to default when navigating away and returning to a table. Persist sort preferences in URL query params.",
				type: "bug",
			},
			{
				title: "Build demo workspace management interface",
				description:
					"View all demo workspaces, their expiration dates, and usage. Support extending, deleting, and recreating demo workspaces.",
				type: "feature",
			},
			{
				title: "Implement admin session recording for compliance",
				description:
					"Record all admin console sessions (actions taken, pages viewed) for SOC 2 compliance. Store recordings with 90-day retention.",
				type: "improvement",
			},
			{
				title: "Add webhook event explorer for debugging",
				description:
					"View recent webhook events (Stripe, GitHub) with payload, response, and retry history. Support resending failed events manually.",
				type: "feature",
			},
			{
				title: "Fix organization detail page crashing for deleted owners",
				description:
					"Org detail page throws an error when the org owner has been deleted. Handle null owner gracefully with 'deleted user' placeholder.",
				type: "bug",
			},
			{
				title: "Build system configuration management",
				description:
					"Admin UI for managing system-wide configuration: rate limits, plan features, default settings. Hot-reload without deployment.",
				type: "feature",
			},
			{
				title: "Implement gradual feature rollout manager",
				description:
					"Manage feature rollouts with percentage, user segment, and organization targeting. Show rollout status and impact metrics per feature.",
				type: "feature",
			},
			{
				title: "Fix bulk operations timeout on large selections",
				description:
					"Bulk operations on >100 users timeout. Implement background processing with progress tracking and completion notification.",
				type: "bug",
			},
			{
				title: "Add admin documentation and runbook library",
				description:
					"Built-in runbook library for common admin tasks: investigate billing issue, handle data deletion request, debug auth failure. Searchable and linkable.",
				type: "improvement",
			},
			{
				title: "Build user feedback aggregation dashboard",
				description:
					"Aggregate user feedback from in-app surveys, support tickets, and NPS scores. Show trends, common themes, and sentiment analysis.",
				type: "feature",
			},
			{
				title: "Fix admin console not accessible behind corporate proxy",
				description:
					"Admin console assets fail to load through corporate proxies that block certain headers. Adjust CSP headers and resource loading.",
				type: "bug",
			},
			{
				title: "Implement admin API for automation scripts",
				description:
					"REST API for common admin operations (user lookup, org management, flag toggling). Support API key auth. Include rate limiting and audit logging.",
				type: "feature",
			},
			{
				title: "Create incident management dashboard",
				description:
					"Track active incidents: status, severity, affected services, timeline, resolution notes. Integrate with PagerDuty and Statuspage.",
				type: "feature",
			},
			{
				title: "Fix search indexing status not reflecting in admin",
				description:
					"The search index status in admin shows 'healthy' even when indexing is behind. Query actual Convex search index metadata.",
				type: "bug",
			},
			{
				title: "Add admin dark mode toggle independent of system",
				description:
					"Admin console should have its own light/dark mode toggle independent of the OS setting. Persist preference in admin user profile.",
				type: "improvement",
			},
			{
				title: "Build compliance dashboard for SOC 2 evidence",
				description:
					"Dashboard collecting SOC 2 evidence: access reviews, change logs, security scans, uptime reports. Generate compliance report on demand.",
				type: "feature",
			},
			{
				title: "Implement admin notification preferences",
				description:
					"Admin-specific notification preferences: system alerts, new signups, plan changes, error spikes. Support per-channel configuration.",
				type: "improvement",
			},
			{
				title: "Fix admin console crashing on very wide tables",
				description:
					"Tables with many columns cause horizontal overflow and layout issues. Implement column pinning, hiding, and responsive truncation.",
				type: "bug",
			},
			{
				title: "Add keyboard navigation for admin data tables",
				description:
					"Support keyboard navigation in all admin tables: arrow keys to move, Enter to view details, Space to select, Delete to remove.",
				type: "improvement",
			},
		],

		// ── Project 8: CI/CD Pipeline Overhaul ───────────────────────────────
		8: [
			{
				title: "Create GitHub Actions workflow for PR checks",
				description:
					"Matrix build workflow running lint, typecheck, unit tests, and integration tests on every PR. Support cancellation of superseded runs.",
				type: "feature",
			},
			{
				title: "Implement preview deployment on PR creation",
				description:
					"Auto-deploy preview environments for every PR using Vercel. Include Convex preview deployment. Add deployment URL comment to PR.",
				type: "feature",
			},
			{
				title: "Fix build cache invalidation causing stale deployments",
				description:
					"Turbopack build cache sometimes serves stale code after dependency updates. Implement hash-based cache invalidation tied to lock file changes.",
				type: "bug",
			},
			{
				title: "Build canary release pipeline with traffic splitting",
				description:
					"Deploy to canary (5% traffic) first, monitor error rates for 15 minutes, then promote to 100%. Auto-rollback if error rate exceeds threshold.",
				type: "feature",
			},
			{
				title: "Add build time analytics and optimization",
				description:
					"Track build duration per workflow step. Identify bottlenecks. Implement parallel test execution and selective test running based on changed files.",
				type: "improvement",
			},
			{
				title: "Fix Docker layer caching not working in CI",
				description:
					"Docker builds in CI don't use layer caching, causing 10-minute build times. Configure GitHub Actions cache for Docker BuildKit layers.",
				type: "bug",
			},
			{
				title: "Implement semantic versioning automation",
				description:
					"Auto-generate version numbers from commit messages using conventional commits. Create GitHub releases with auto-generated changelogs.",
				type: "feature",
			},
			{
				title: "Build deployment rollback with one-click revert",
				description:
					"Dashboard showing recent deployments with one-click rollback. Rollback reverts both frontend (Vercel) and backend (Convex) to the previous version.",
				type: "feature",
			},
			{
				title: "Fix flaky tests causing false CI failures",
				description:
					"Three tests intermittently fail due to timing issues. Add retry logic for known flaky tests and track flakiness metrics. Fix root causes.",
				type: "bug",
			},
			{
				title: "Implement PR size analysis and warnings",
				description:
					"GitHub bot that warns when PR exceeds 500 lines changed. Suggest splitting large PRs. Block merge for PRs >1000 lines without approval.",
				type: "improvement",
			},
			{
				title: "Add dependency vulnerability scanning to CI",
				description:
					"Run npm audit and Snyk scanning on every PR. Block merge for critical vulnerabilities. Create issues for high-severity findings.",
				type: "feature",
			},
			{
				title: "Fix CI environment variables leaking in build logs",
				description:
					"Some env vars are printed in build output during the Convex deploy step. Mask sensitive values in workflow logs.",
				type: "bug",
			},
			{
				title: "Implement blue-green deployment strategy",
				description:
					"Set up blue-green deployment with instant cutover. Both environments run simultaneously during verification. Route traffic via DNS switch.",
				type: "feature",
			},
			{
				title: "Build deployment approval workflow for production",
				description:
					"Require manual approval from a team lead before production deployment. Show deployment diff and test results in the approval request.",
				type: "feature",
			},
			{
				title: "Fix parallel test execution causing port conflicts",
				description:
					"Tests running in parallel on CI bind to the same ports, causing failures. Assign dynamic ports to each test worker.",
				type: "bug",
			},
			{
				title: "Implement branch protection rules automation",
				description:
					"Auto-configure branch protection rules: require CI pass, require review, enforce linear history, prevent force push. Sync across repos.",
				type: "improvement",
			},
			{
				title: "Add performance regression testing to CI",
				description:
					"Run Lighthouse CI on preview deployments. Compare scores against main branch. Fail if performance score drops >5 points.",
				type: "feature",
			},
			{
				title: "Build CI dashboard with run history and metrics",
				description:
					"Dashboard showing CI run history, pass rate, average duration, most common failure reasons, and trend charts.",
				type: "feature",
			},
			{
				title: "Fix GitHub Actions cache eviction causing slow builds",
				description:
					"Cache is evicted too quickly on the free plan, causing every build to start cold. Optimize cache keys and reduce cache size.",
				type: "bug",
			},
			{
				title: "Implement infrastructure-as-code for CI resources",
				description:
					"Define all CI/CD infrastructure (workflows, environments, secrets, branch rules) as code using Terraform or Pulumi. Enable PR-based changes.",
				type: "feature",
			},
			{
				title: "Add automated changelog generation from PRs",
				description:
					"Generate release changelog from merged PR titles and labels. Categorize entries as features, fixes, and improvements. Publish to docs site.",
				type: "improvement",
			},
			{
				title: "Fix preview deployment cleanup not running",
				description:
					"Preview deployments are never cleaned up, consuming Vercel resources. Implement cleanup job that removes previews for merged/closed PRs.",
				type: "bug",
			},
			{
				title: "Implement smoke test suite for post-deployment validation",
				description:
					"Quick smoke test suite (10 tests, <30s) that runs after each deployment. Verify critical paths: auth, page loads, API health.",
				type: "feature",
			},
			{
				title: "Build deploy freeze management system",
				description:
					"Admin interface to freeze deployments during high-risk periods. Block merge and deploy during freeze. Support scheduled freezes.",
				type: "feature",
			},
			{
				title: "Fix CI secrets rotation breaking scheduled workflows",
				description:
					"Rotating CI secrets invalidates scheduled workflow runs that were queued with old secrets. Implement graceful secret rotation.",
				type: "bug",
			},
			{
				title: "Implement test coverage tracking and reporting",
				description:
					"Track code coverage per PR and overall. Show coverage diff in PR comments. Fail if coverage drops below configured threshold.",
				type: "improvement",
			},
			{
				title: "Add bundle size tracking to CI pipeline",
				description:
					"Measure and report JavaScript bundle size on every PR. Show size diff and warn if bundle increases by >5%. Block if >10%.",
				type: "feature",
			},
			{
				title: "Build CI notification system for team channels",
				description:
					"Send build status notifications to team Slack channels. Include: PR title, status, duration, failure reason, and link to logs.",
				type: "feature",
			},
			{
				title: "Fix Convex preview deployments not auto-expiring",
				description:
					"Preview deployments should expire after 5 days but remain active indefinitely. Fix the expiration scheduler in the cleanup workflow.",
				type: "bug",
			},
			{
				title: "Implement matrix testing for multiple Node versions",
				description:
					"Run tests against Node 18, 20, and 22 in matrix configuration. Fail fast if any version fails. Report compatibility issues.",
				type: "improvement",
			},
			{
				title: "Add code quality gates with Biome",
				description:
					"Enforce Biome lint and format checks in CI. Block merge for any lint errors. Auto-fix formatting and commit back to the PR branch.",
				type: "feature",
			},
			{
				title: "Build release train schedule management",
				description:
					"Manage bi-weekly release trains: cut release branch, run full test suite, create release candidate, schedule deployment window.",
				type: "feature",
			},
			{
				title: "Fix CI workflow not triggering on dependabot PRs",
				description:
					"Dependabot PRs don't trigger the full CI workflow because of GitHub Actions permissions restrictions on fork PRs. Use pull_request_target.",
				type: "bug",
			},
			{
				title: "Implement feature flag gating in CI",
				description:
					"Support running tests with different feature flag configurations in CI. Ensure all flag combinations pass tests before merging.",
				type: "feature",
			},
			{
				title: "Add deployment metrics collection and monitoring",
				description:
					"Collect deployment metrics: frequency, lead time, failure rate, MTTR. Display in Grafana dashboard. Calculate DORA metrics.",
				type: "improvement",
			},
			{
				title: "Fix CI build artifacts not downloadable after expiry",
				description:
					"Build artifacts expire after 1 day, making post-mortem debugging difficult. Extend retention to 30 days for failed builds.",
				type: "bug",
			},
			{
				title: "Implement progressive delivery with feature flags",
				description:
					"Integrate feature flag evaluation into deployment pipeline. Deploy code behind flags, then gradually enable. Auto-disable on error spike.",
				type: "feature",
			},
			{
				title: "Build hotfix deployment pipeline",
				description:
					"Expedited pipeline for critical hotfixes: skip non-essential checks, fast-track review, direct-to-production deployment with monitoring.",
				type: "feature",
			},
			{
				title: "Fix workflow concurrency not limiting parallel runs",
				description:
					"Multiple pushes to the same branch trigger parallel CI runs that compete for resources. Implement concurrency groups with cancel-in-progress.",
				type: "bug",
			},
			{
				title: "Add accessibility testing to CI pipeline",
				description:
					"Run axe-core accessibility tests on key pages during CI. Report violations categorized by impact. Block merge for critical violations.",
				type: "improvement",
			},
			{
				title: "Implement database migration safety checks",
				description:
					"CI step that analyzes database migrations for safety: checks for locking operations, backward compatibility, and data loss potential.",
				type: "feature",
			},
			{
				title: "Build deployment changelog with linked PRs",
				description:
					"Auto-generate deployment changelog listing all PRs included since last deployment. Group by type, include author, and link to PR.",
				type: "improvement",
			},
			{
				title: "Fix scheduled workflow runs using wrong branch",
				description:
					"Scheduled CI workflows run against the default branch instead of the configured branch. Fix the workflow trigger configuration.",
				type: "bug",
			},
			{
				title: "Implement CI cost optimization analysis",
				description:
					"Track CI minutes usage per workflow and team. Identify expensive workflows. Suggest optimizations like cache improvements and test parallelization.",
				type: "improvement",
			},
			{
				title: "Add E2E test recording to CI artifacts",
				description:
					"Record video and trace files for all E2E test runs in CI. Upload as artifacts for failed tests. Include screenshots at failure point.",
				type: "feature",
			},
			{
				title: "Fix GitHub status checks not updating on rerun",
				description:
					"Rerunning a failed CI workflow doesn't update the PR status check, leaving it in a failed state. Fix status check reporting on rerun events.",
				type: "bug",
			},
			{
				title: "Implement multi-repo deployment coordination",
				description:
					"Coordinate deployments across frontend, backend, and SDK repos. Ensure compatible versions are deployed together. Block mismatched deploys.",
				type: "feature",
			},
			{
				title: "Build CI configuration linting and validation",
				description:
					"Validate GitHub Actions workflow files before committing. Check for common errors: missing permissions, invalid matrix values, circular dependencies.",
				type: "improvement",
			},
			{
				title: "Fix CI test reports not rendering in GitHub UI",
				description:
					"JUnit XML test reports are generated but GitHub doesn't display them in the checks tab. Fix the report upload action configuration.",
				type: "bug",
			},
			{
				title: "Add dependency update automation with Renovate",
				description:
					"Replace Dependabot with Renovate for more flexible dependency updates. Configure automerge for patch updates, group related updates.",
				type: "feature",
			},
		],

		// ── Project 9: Search & Discovery ────────────────────────────────────
		9: [
			{
				title: "Build content indexing pipeline for issues",
				description:
					"Index all issues (title, description, comments) into a vector store. Support incremental updates when issues change. Handle deletions.",
				type: "feature",
			},
			{
				title: "Implement semantic search with vector embeddings",
				description:
					"Generate embeddings for all workspace content using text-embedding-3-small. Store in Convex vector index. Support similarity threshold.",
				type: "feature",
			},
			{
				title: "Fix search results not including recently created content",
				description:
					"Content created in the last 5 minutes doesn't appear in search results. The indexing pipeline has too much latency. Target <30s indexing delay.",
				type: "bug",
			},
			{
				title: "Build command palette search UI (Cmd+K)",
				description:
					"Command palette with type-ahead search across all content types. Show categorized results (issues, docs, boards, people). Support keyboard navigation.",
				type: "feature",
			},
			{
				title: "Add faceted filtering for search results",
				description:
					"Filter search results by: content type, project, status, assignee, date range, label. Show filter counts. Support combining multiple facets.",
				type: "feature",
			},
			{
				title: "Fix search ranking not considering recency",
				description:
					"Old archived issues rank higher than recent active ones. Add time-decay factor to search scoring. Recent results should rank higher for equal relevance.",
				type: "bug",
			},
			{
				title: "Implement document content indexing",
				description:
					"Index document body text (Plate.js JSON to plain text conversion). Handle embedded images (OCR text), tables, and code blocks.",
				type: "feature",
			},
			{
				title: "Build recent searches with quick access",
				description:
					"Store last 20 searches per user. Show recent searches in command palette on open. Support clearing individual items and all history.",
				type: "feature",
			},
			{
				title: "Fix search query parsing breaking on special characters",
				description:
					"Search queries with quotes, brackets, or backslashes cause a 500 error. Escape special characters before passing to the search engine.",
				type: "bug",
			},
			{
				title: "Implement search suggestions and autocomplete",
				description:
					"As the user types, show search suggestions from: recent searches, popular searches, entity names (projects, people). Update on each keystroke.",
				type: "feature",
			},
			{
				title: "Add search analytics for query insights",
				description:
					"Track search queries, result click-through rates, and zero-result queries. Surface insights to admins for content gap analysis.",
				type: "improvement",
			},
			{
				title:
					"Fix duplicate results when content appears in multiple contexts",
				description:
					"An issue mentioned in a document appears twice in results (once as issue, once in document). Deduplicate and show the primary result with context links.",
				type: "bug",
			},
			{
				title: "Implement whiteboard content search",
				description:
					"Extract text from Excalidraw elements (text boxes, sticky notes, shapes with labels) and index for search. Support searching by diagram type.",
				type: "feature",
			},
			{
				title: "Build search result previews with highlighting",
				description:
					"Show content preview for each search result with the matching terms highlighted. Support highlighting in title, description, and body text.",
				type: "feature",
			},
			{
				title: "Fix search index growing unbounded for deleted content",
				description:
					"Deleted content remains in the search index forever. Implement garbage collection that removes index entries for deleted documents.",
				type: "bug",
			},
			{
				title: "Implement cross-workspace search for admins",
				description:
					"Admin users can search across all workspaces in their organization. Show workspace name as context for each result. Respect per-workspace permissions.",
				type: "feature",
			},
			{
				title: "Add natural language search query understanding",
				description:
					"Parse natural language queries like 'bugs assigned to me this week' into structured filters. Support date expressions, user references, and status terms.",
				type: "feature",
			},
			{
				title: "Fix search performance degradation at scale",
				description:
					"Search latency increases linearly with workspace size. At 50K documents, queries take >3s. Optimize vector index with HNSW parameters.",
				type: "bug",
			},
			{
				title: "Implement saved searches with notifications",
				description:
					"Save search queries as named searches. Optionally subscribe to notifications when new content matches a saved search.",
				type: "feature",
			},
			{
				title: "Build search settings for result ranking preferences",
				description:
					"Allow users to configure search behavior: prefer recent content, exact match vs fuzzy, include archived, result limit per category.",
				type: "improvement",
			},
			{
				title: "Fix search not working when query contains only stop words",
				description:
					"Queries like 'the', 'is', 'and' return empty results instead of falling back to recent content. Handle stop-word-only queries gracefully.",
				type: "bug",
			},
			{
				title: "Implement comment and note search indexing",
				description:
					"Index all comments (on issues, documents, whiteboards) and workspace notes. Show parent context (issue title, document name) in results.",
				type: "feature",
			},
			{
				title: "Add search keyboard shortcuts for power users",
				description:
					"Keyboard shortcuts in search results: Tab to switch category, Enter to open, Cmd+Enter to open in new tab, Cmd+C to copy link.",
				type: "improvement",
			},
			{
				title: "Fix search index corruption after schema migration",
				description:
					"After a recent schema change, some index entries have stale field mappings. Build re-indexing tool and schedule full reindex.",
				type: "bug",
			},
			{
				title: "Implement federated search across integrations",
				description:
					"Search results include content from connected integrations (GitHub repos, Slack messages, Figma files). Show integration icon and deep link.",
				type: "feature",
			},
			{
				title: "Build search result actions menu",
				description:
					"Right-click or three-dot menu on search results: open, copy link, assign to me, change status. Actions vary by content type.",
				type: "feature",
			},
			{
				title: "Fix embedding generation failing for long documents",
				description:
					"Documents exceeding 8K tokens fail embedding generation. Implement chunking strategy that splits documents into overlapping segments.",
				type: "bug",
			},
			{
				title: "Implement search result clustering",
				description:
					"Group related search results into clusters. Show cluster labels (e.g., 'Authentication issues', 'API performance'). Allow expanding clusters.",
				type: "improvement",
			},
			{
				title: "Add voice search support in command palette",
				description:
					"Microphone button in command palette for voice search. Use Whisper for transcription. Show transcription confidence and allow editing.",
				type: "feature",
			},
			{
				title: "Fix search results page not updating on content changes",
				description:
					"Search results are stale — if an issue status changes after searching, the results page still shows the old status. Implement real-time result updates.",
				type: "bug",
			},
			{
				title: "Implement search-as-you-navigate content highlighting",
				description:
					"When navigating to a search result, highlight the matching section in the document or issue. Scroll to the first match automatically.",
				type: "feature",
			},
			{
				title: "Build search performance monitoring dashboard",
				description:
					"Track search latency percentiles, query volume, index size, and cache hit rates. Alert on degradation. Show in admin console.",
				type: "improvement",
			},
			{
				title: "Fix search API rate limiting too aggressive for power users",
				description:
					"Power users who search frequently hit the rate limit. Increase limit for search endpoints and implement burst allowance.",
				type: "bug",
			},
			{
				title: "Implement personalized search ranking",
				description:
					"Boost search results based on user's history: recently viewed, frequently accessed projects, team members they interact with most.",
				type: "feature",
			},
			{
				title: "Add search export to CSV for reporting",
				description:
					"Export search results to CSV with all metadata (title, type, status, assignee, project, date). Support exporting up to 1000 results.",
				type: "feature",
			},
			{
				title: "Fix search index out of sync after bulk import",
				description:
					"Bulk importing issues via CSV creates the records but doesn't trigger search indexing. Add index update hook to bulk import endpoint.",
				type: "bug",
			},
			{
				title: "Implement search operator syntax",
				description:
					"Support search operators: project:api status:open assignee:me label:bug. Parse operators from the query string. Show available operators in help.",
				type: "feature",
			},
			{
				title: "Build global search shortcut in navigation bar",
				description:
					"Persistent search input in the top navigation bar. Focus with / key. Show recent searches on focus. Navigate to full search on Enter.",
				type: "improvement",
			},
			{
				title: "Fix search highlighting breaking markdown rendering",
				description:
					"Search term highlighting in markdown content breaks the markdown parser. Highlight after rendering rather than in the raw text.",
				type: "bug",
			},
			{
				title: "Implement GitHub repo content search",
				description:
					"Index README, code comments, and commit messages from connected GitHub repos. Show file path and line number in results. Link to GitHub.",
				type: "feature",
			},
			{
				title: "Add search result bookmarking",
				description:
					"Bookmark search results for later reference. View all bookmarks in a dedicated list. Support organizing bookmarks into collections.",
				type: "feature",
			},
			{
				title: "Fix search indexing consuming too many Convex function calls",
				description:
					"Full reindex of a large workspace uses millions of Convex function calls. Batch indexing operations and implement rate limiting for the indexer.",
				type: "bug",
			},
			{
				title: "Implement typo tolerance in search queries",
				description:
					"Handle common typos using Levenshtein distance. Suggest corrections ('Did you mean...') for queries with zero results. Configure tolerance level.",
				type: "improvement",
			},
			{
				title: "Build search in-context for issue boards",
				description:
					"Search within a kanban board to filter visible cards. Highlight matching cards and fade non-matching ones. Support search across all columns.",
				type: "feature",
			},
			{
				title: "Fix search API returning different results for same query",
				description:
					"Non-deterministic result ordering for equally-ranked results. Add secondary sort by creation date for stable ordering.",
				type: "bug",
			},
			{
				title: "Implement search scope restriction by permission",
				description:
					"Search results must respect user permissions. Users should only see content from projects they have access to. Filter at query time, not post-query.",
				type: "improvement",
			},
			{
				title: "Add search integration with AI chat",
				description:
					"AI chat can invoke search to find relevant issues, docs, and discussions. Show search results inline in chat. Link to source content.",
				type: "feature",
			},
			{
				title: "Fix mobile search UI keyboard issues",
				description:
					"On mobile, the search input loses focus when results load, dismissing the keyboard. Keep focus on input until user selects a result.",
				type: "bug",
			},
			{
				title: "Implement search warm-up for frequently accessed workspaces",
				description:
					"Pre-warm search caches for active workspaces during off-peak hours. Reduce cold-start latency for first searches of the day.",
				type: "improvement",
			},
			{
				title: "Build advanced search page with structured filters",
				description:
					"Dedicated search page with sidebar filters, result sorting, view toggles (list, grid), and pagination. Support bookmarking search URLs.",
				type: "feature",
			},
		],

		// ── Project 10: Notification System v2 ───────────────────────────────
		10: [
			{
				title: "Build notification channel router",
				description:
					"Route notifications to the correct channel (in-app, email, push, Slack) based on event type and user preferences. Support fallback channels.",
				type: "feature",
			},
			{
				title: "Implement smart notification batching engine",
				description:
					"Batch related notifications within a 5-minute window. Group by project or issue. Show digest summary instead of individual notifications.",
				type: "feature",
			},
			{
				title: "Fix in-app notifications not appearing in real-time",
				description:
					"Notifications have a 30-second delay before appearing. The real-time subscription is polling instead of using WebSocket push.",
				type: "bug",
			},
			{
				title: "Build notification preferences UI",
				description:
					"Settings page where users configure notification preferences per event type (mention, assignment, status change, comment) and per channel.",
				type: "feature",
			},
			{
				title: "Add email notification templates with branding",
				description:
					"Design responsive email templates for all notification types. Include workspace branding, action buttons, and one-click unsubscribe.",
				type: "feature",
			},
			{
				title: "Fix duplicate email notifications for edited comments",
				description:
					"Editing a comment within 5 minutes triggers a new email notification. Only send for new comments, not edits within the grace period.",
				type: "bug",
			},
			{
				title: "Implement Slack integration for notifications",
				description:
					"Send notifications to Slack channels and DMs. Support workspace-level Slack connection. Map notification types to Slack message formats.",
				type: "feature",
			},
			{
				title: "Build notification inbox with read/unread tracking",
				description:
					"Unified inbox showing all notifications with read/unread state. Support mark as read, archive, and bulk actions. Filter by type and project.",
				type: "feature",
			},
			{
				title:
					"Fix push notifications not delivered on iOS when app is foregrounded",
				description:
					"Push notifications are suppressed when the app is in foreground on iOS. Implement UNUserNotificationCenterDelegate to show in-app banners.",
				type: "bug",
			},
			{
				title: "Implement @mention notifications across all content types",
				description:
					"Detect @mentions in issues, documents, comments, and chat. Notify mentioned users via preferred channel. Support @team mentions.",
				type: "feature",
			},
			{
				title: "Add notification digest email (daily/weekly summary)",
				description:
					"Scheduled email digests summarizing unread notifications. Include top mentions, status changes, and due date reminders. Configurable frequency.",
				type: "feature",
			},
			{
				title: "Fix notification count badge showing incorrect number",
				description:
					"Badge count includes archived notifications. Only count unread, non-archived notifications. Update badge in real-time across all clients.",
				type: "bug",
			},
			{
				title: "Implement notification snooze and remind later",
				description:
					"Snooze a notification for 1 hour, 4 hours, tomorrow, or custom time. Re-deliver at the snoozed time. Show snoozed count in inbox.",
				type: "feature",
			},
			{
				title: "Build notification template system for custom events",
				description:
					"Admin-configurable notification templates with variable interpolation. Support conditional sections based on event data. Preview before save.",
				type: "improvement",
			},
			{
				title: "Fix Slack notification webhook failing silently",
				description:
					"Failed Slack webhook deliveries are logged but not retried. Implement retry with backoff. Alert admin after 3 consecutive failures.",
				type: "bug",
			},
			{
				title: "Implement thread-based notification grouping",
				description:
					"Group all notifications from the same issue thread into a single expandable notification. Show the latest update with thread activity count.",
				type: "feature",
			},
			{
				title: "Add do-not-disturb mode with schedule",
				description:
					"DND mode that suppresses all notifications except urgent mentions. Support scheduled DND (e.g., weekends, after 6pm). Show DND status to team.",
				type: "feature",
			},
			{
				title: "Fix email notification links broken for mobile users",
				description:
					"Deep links in email notifications open the web app instead of the mobile app. Implement universal links/app links for email CTAs.",
				type: "bug",
			},
			{
				title: "Implement notification priority levels",
				description:
					"Classify notifications as urgent, normal, or low priority. Urgent: immediate delivery. Normal: batched. Low: digest only. User-configurable thresholds.",
				type: "feature",
			},
			{
				title: "Build notification analytics dashboard",
				description:
					"Track delivery rates, open rates, click-through rates per notification type and channel. Show engagement trends and optimization suggestions.",
				type: "improvement",
			},
			{
				title: "Fix notification preferences not syncing across devices",
				description:
					"Changing preferences on web doesn't update mobile app preferences. Store preferences server-side and sync to all clients on change.",
				type: "bug",
			},
			{
				title: "Implement smart notification routing based on activity",
				description:
					"Route to mobile push when user is on mobile, in-app when active on web, email when offline for >1 hour. Use presence detection.",
				type: "feature",
			},
			{
				title: "Add custom notification sounds per channel",
				description:
					"Allow users to choose notification sounds for different channels and event types. Support uploading custom sounds. Preview before saving.",
				type: "feature",
			},
			{
				title: "Fix notification deletion not cascading to email queue",
				description:
					"Deleting a notification doesn't remove it from the email send queue. Notifications that are deleted before email delivery still get sent.",
				type: "bug",
			},
			{
				title: "Implement notification subscription management per issue",
				description:
					"Subscribe/unsubscribe from notifications on individual issues. Auto-subscribe when mentioned, assigned, or commenting. Show subscriber list.",
				type: "feature",
			},
			{
				title: "Build notification center floating panel",
				description:
					"Floating panel accessible from the bell icon. Shows recent notifications with quick actions. Support keyboard navigation. Pin important items.",
				type: "feature",
			},
			{
				title: "Fix timezone handling in scheduled notification delivery",
				description:
					"Scheduled notifications (digests, reminders) deliver at UTC time instead of the user's local time. Convert schedule to user timezone.",
				type: "bug",
			},
			{
				title: "Implement notification forwarding rules",
				description:
					"User-defined rules to forward specific notification types to different channels. Example: forward all bug assignments to personal Slack DM.",
				type: "feature",
			},
			{
				title: "Add unsubscribe management page",
				description:
					"Central page showing all notification subscriptions with bulk unsubscribe. Group by project and type. Support one-click resubscribe.",
				type: "improvement",
			},
			{
				title: "Fix batch notification combining unrelated events",
				description:
					"The batching engine sometimes groups unrelated events from different projects. Fix grouping logic to only batch events within the same context.",
				type: "bug",
			},
			{
				title: "Implement webhook notifications for external systems",
				description:
					"Allow configuring outgoing webhooks for notification events. Support custom payloads with template variables. Include HMAC signature verification.",
				type: "feature",
			},
			{
				title: "Build notification A/B testing framework",
				description:
					"Test different notification copy, timing, and channels. Track engagement metrics per variant. Auto-promote winning variants.",
				type: "improvement",
			},
			{
				title: "Fix email notifications landing in spam folder",
				description:
					"Several email providers mark our notifications as spam. Implement DKIM, SPF, and DMARC. Warm up sending domain. Monitor deliverability.",
				type: "bug",
			},
			{
				title: "Implement notification archival and retention policy",
				description:
					"Auto-archive read notifications after 30 days. Permanently delete after 90 days. Support manual archival. Show archived count.",
				type: "feature",
			},
			{
				title: "Add notification accessibility improvements",
				description:
					"Screen reader announcements for new notifications. High contrast mode support. Keyboard-accessible dismiss and action buttons.",
				type: "improvement",
			},
			{
				title: "Fix push notification payload too large for FCM",
				description:
					"Push notification payloads exceed FCM's 4KB limit when the notification body contains long issue titles. Truncate body and include deep link.",
				type: "bug",
			},
			{
				title: "Implement notification deduplication across channels",
				description:
					"If a user reads an in-app notification, don't send the email version. Track read state across channels. Cancel pending deliveries on read.",
				type: "feature",
			},
			{
				title: "Build notification rate limiting per user",
				description:
					"Limit to 50 notifications per hour per user. Queue excess notifications for the next window. Show rate limit status in preferences.",
				type: "improvement",
			},
			{
				title: "Fix notification sort order inconsistent between clients",
				description:
					"Web shows notifications newest-first, mobile shows them by priority. Standardize sort order across all clients to timestamp descending.",
				type: "bug",
			},
			{
				title: "Implement browser push notifications for web",
				description:
					"Support Web Push API for browser notifications when the tab is in background. Show permission request at the right moment. Support Safari.",
				type: "feature",
			},
			{
				title: "Add notification templates for workspace admins",
				description:
					"Workspace admins can create custom notification templates for workspace events (deployment, milestone, all-hands). Rich text editor for templates.",
				type: "feature",
			},
			{
				title: "Fix notification mark-all-as-read timeout for large inboxes",
				description:
					"Mark all as read times out for users with >1000 unread notifications. Implement batch update with progress indicator.",
				type: "bug",
			},
			{
				title: "Implement intelligent notification scheduling",
				description:
					"Analyze user activity patterns and schedule non-urgent notifications for when the user is most likely to engage. Learn from historical data.",
				type: "feature",
			},
			{
				title: "Build notification debug console for admins",
				description:
					"Admin tool showing notification pipeline: event received, rules evaluated, channels selected, delivery status. Trace individual notifications.",
				type: "improvement",
			},
			{
				title: "Fix notification webhook retries consuming all workers",
				description:
					"Failed webhook retries queue up and consume all background workers. Implement separate retry queue with limited concurrency.",
				type: "bug",
			},
			{
				title: "Implement notification permission request optimization",
				description:
					"Time the push notification permission request for maximum acceptance rate. A/B test different prompt timings and copy.",
				type: "improvement",
			},
			{
				title: "Add notification grouping by project in inbox",
				description:
					"Option to group inbox notifications by project instead of chronological order. Show project sections with notification counts.",
				type: "feature",
			},
			{
				title: "Fix silent push notifications waking device unnecessarily",
				description:
					"Data-only push notifications for badge updates wake the device and drain battery. Batch badge updates and reduce frequency.",
				type: "bug",
			},
			{
				title: "Implement cross-org notification routing for admins",
				description:
					"Org admins can receive notifications from all workspaces in their org in a unified inbox. Support per-workspace muting.",
				type: "feature",
			},
			{
				title: "Build notification SLA monitoring",
				description:
					"Track notification delivery SLA: in-app <1s, push <5s, email <30s. Alert on SLA violations. Show compliance dashboard.",
				type: "improvement",
			},
		],

		// ── Project 11: Design System (Orbit UI) ─────────────────────────────
		11: [
			{
				title: "Build Button component with all variants",
				description:
					"Button component with variants: primary, secondary, outline, ghost, destructive, link. Support sizes: sm, md, lg. Include loading state and icon slots.",
				type: "feature",
			},
			{
				title: "Create Input component with validation states",
				description:
					"Text input with label, placeholder, helper text, and error message. Support prefix/suffix icons. Variants for search, password, and number.",
				type: "feature",
			},
			{
				title: "Fix Dialog component not trapping focus",
				description:
					"Tab key escapes the dialog overlay and focuses background elements. Implement focus trap using @radix-ui/react-focus-scope.",
				type: "bug",
			},
			{
				title: "Implement design token system with CSS variables",
				description:
					"Define design tokens for colors, spacing, typography, shadows, and borders as CSS custom properties. Support runtime theme switching.",
				type: "feature",
			},
			{
				title: "Add DataTable component with sorting and filtering",
				description:
					"Feature-rich data table: sortable columns, column filtering, row selection, pagination, and column resizing. Built on @tanstack/react-table.",
				type: "feature",
			},
			{
				title:
					"Fix Select component dropdown clipped by overflow:hidden parent",
				description:
					"Select dropdown is clipped when rendered inside a container with overflow:hidden. Use Radix Portal to render dropdown at document root.",
				type: "bug",
			},
			{
				title: "Build Chart components with consistent styling",
				description:
					"Wrapper components for Recharts (AreaChart, BarChart, LineChart, PieChart) with Orbit UI theming. Shared tooltip and legend components.",
				type: "feature",
			},
			{
				title: "Create Toast notification component",
				description:
					"Toast component with variants: success, error, warning, info. Support auto-dismiss, manual dismiss, action button, and stacking.",
				type: "feature",
			},
			{
				title: "Fix Tooltip component flickering on rapid hover",
				description:
					"Rapidly moving the mouse over tooltip triggers causes flickering. Add debounce to show delay and proper exit animation handling.",
				type: "bug",
			},
			{
				title: "Implement Figma token sync pipeline",
				description:
					"Auto-sync design tokens from Figma to CSS variables via Figma API. Run on token changes. Include diff preview before commit.",
				type: "feature",
			},
			{
				title: "Add Storybook stories for all components",
				description:
					"Write comprehensive Storybook stories covering all component variants, states (default, hover, focus, disabled, error), and edge cases.",
				type: "improvement",
			},
			{
				title: "Fix Card component border radius inconsistent across browsers",
				description:
					"Card border radius renders slightly differently in Safari vs Chrome. Use explicit border-radius values instead of shorthand.",
				type: "bug",
			},
			{
				title: "Build KPI Card component for dashboards",
				description:
					"Specialized card component showing metric value, label, trend indicator (up/down arrow with percentage), and optional sparkline.",
				type: "feature",
			},
			{
				title: "Create form composition utilities",
				description:
					"Form primitives: FormField, FormLabel, FormDescription, FormMessage. Integration with react-hook-form for validation. Support horizontal layout.",
				type: "feature",
			},
			{
				title: "Fix Badge component text overflowing on long labels",
				description:
					"Badge text overflows the container when the label exceeds 20 characters. Add text truncation with ellipsis and title tooltip.",
				type: "bug",
			},
			{
				title: "Implement responsive typography scale",
				description:
					"Fluid typography system that scales between mobile and desktop breakpoints. Use clamp() for smooth scaling. Define semantic text styles.",
				type: "improvement",
			},
			{
				title: "Add Avatar component with group and status",
				description:
					"Avatar with image, initials fallback, and status indicator (online, away, busy). AvatarGroup with overlap and +N counter.",
				type: "feature",
			},
			{
				title: "Build Calendar component for date selection",
				description:
					"Calendar component supporting single date, date range, and multi-select modes. Keyboard navigation, disabled dates, and month navigation.",
				type: "feature",
			},
			{
				title: "Fix Accordion component animation jarring with dynamic content",
				description:
					"Accordion panels with dynamic height content show a jerky animation. Use CSS max-height transition with measured content height.",
				type: "bug",
			},
			{
				title: "Create documentation site with live examples",
				description:
					"Documentation website showing all Orbit UI components with live code editors, prop tables, and usage guidelines. Build with Storybook Docs.",
				type: "feature",
			},
			{
				title: "Implement color palette with accessibility ratios",
				description:
					"Define color scales (neutral, brand, semantic) with WCAG AA contrast ratios documented. Include a contrast checker tool in docs.",
				type: "improvement",
			},
			{
				title: "Fix Command component search not filtering by shortcut text",
				description:
					"Cmd+K command palette search doesn't match on keyboard shortcut labels. Include shortcut text in the search index.",
				type: "bug",
			},
			{
				title: "Build Sidebar component with collapsible sections",
				description:
					"Sidebar navigation with collapsible section groups, icon + label items, active state, and resizable width. Support keyboard navigation.",
				type: "feature",
			},
			{
				title: "Add Progress component with multiple variants",
				description:
					"Progress bar with linear, circular, and step variants. Support indeterminate state, percentage label, and color based on value.",
				type: "feature",
			},
			{
				title: "Fix Tabs component not supporting dynamic tab addition",
				description:
					"Adding tabs dynamically after initial render doesn't update the tab list. Fix the controlled/uncontrolled tab state management.",
				type: "bug",
			},
			{
				title: "Implement spacing and layout utilities",
				description:
					"Layout primitives: Stack (vertical), Inline (horizontal), Grid, Container, Spacer. Support responsive gap values and alignment.",
				type: "feature",
			},
			{
				title: "Create accessibility testing utilities",
				description:
					"Testing utilities for component accessibility: axe-core integration, keyboard navigation tests, ARIA attribute validators, focus order checks.",
				type: "improvement",
			},
			{
				title: "Fix Popover component not repositioning on scroll",
				description:
					"Popovers stay at their initial position when the page scrolls, floating off-screen. Use @floating-ui/react for dynamic positioning.",
				type: "bug",
			},
			{
				title: "Build DatePicker component with presets",
				description:
					"Date picker combining Calendar with Input. Support presets (today, yesterday, this week, last 30 days). Timezone-aware formatting.",
				type: "feature",
			},
			{
				title: "Add Skeleton component for loading states",
				description:
					"Skeleton loader with pulse animation. Support: text, circle, rectangle, and custom shapes. Compose to match any UI layout.",
				type: "feature",
			},
			{
				title: "Fix Sheet component closing on inner scroll drag",
				description:
					"Mobile sheet (bottom drawer) closes when scrolling content inside it touches the top. Disable sheet gesture when inner content is scrollable.",
				type: "bug",
			},
			{
				title: "Implement icon system with tree-shaking",
				description:
					"Icon component that wraps Lucide React icons with Orbit UI styling. Support size, color, and stroke width customization. Ensure tree-shakeable imports.",
				type: "improvement",
			},
			{
				title: "Build DropdownMenu with keyboard navigation",
				description:
					"Dropdown menu with items, separators, sub-menus, checkboxes, and radio groups. Full keyboard navigation. Support disabled items.",
				type: "feature",
			},
			{
				title: "Create theme customization API",
				description:
					"API for customizing the design system theme: override colors, spacing, border radius, and fonts. Generate CSS variables from theme config.",
				type: "feature",
			},
			{
				title: "Fix NavigationMenu component not closing on route change",
				description:
					"Navigation menu stays open after clicking a link that triggers a route change. Listen to router events and close the menu.",
				type: "bug",
			},
			{
				title: "Implement dark mode with system preference detection",
				description:
					"Dark mode that follows system preference by default. Support manual override. Transition smoothly between modes without flash.",
				type: "improvement",
			},
			{
				title: "Add ScrollArea component with custom scrollbar",
				description:
					"Cross-browser custom scrollbar component. Thin overlay scrollbar, always visible option, auto-hide behavior. Support horizontal scrolling.",
				type: "feature",
			},
			{
				title: "Build Toggle component with group support",
				description:
					"Toggle button with pressed state. ToggleGroup for single and multiple selection. Support size variants and disabled state.",
				type: "feature",
			},
			{
				title: "Fix HoverCard component not accessible via keyboard",
				description:
					"HoverCard only shows on mouse hover, making it inaccessible to keyboard users. Add focus trigger that opens the card on Tab focus.",
				type: "bug",
			},
			{
				title: "Create component changelog and migration guides",
				description:
					"Document all breaking changes between versions. Provide migration guides with before/after code examples. Include codemods where possible.",
				type: "improvement",
			},
			{
				title: "Implement motion and animation guidelines",
				description:
					"Define animation tokens: duration, easing curves, and motion preferences. Respect prefers-reduced-motion. Provide reusable animation utilities.",
				type: "feature",
			},
			{
				title: "Add AlertDialog component for confirmations",
				description:
					"Alert dialog with title, description, and action buttons. Support destructive variant with red primary action. Require explicit dismissal.",
				type: "feature",
			},
			{
				title: "Fix Breadcrumb component overflow on deep paths",
				description:
					"Breadcrumbs with >5 levels overflow the container. Implement collapsible breadcrumb with dropdown for intermediate levels.",
				type: "bug",
			},
			{
				title: "Build Combobox component with async search",
				description:
					"Combobox (searchable select) supporting async options loading, multi-select, group headers, and create-new option. Virtualized for large lists.",
				type: "feature",
			},
			{
				title: "Create visual regression testing pipeline",
				description:
					"Automated visual regression tests using Chromatic. Compare component screenshots across PRs. Require approval for visual changes.",
				type: "improvement",
			},
			{
				title:
					"Fix Carousel component swipe gesture interfering with page scroll",
				description:
					"Horizontal swipe on the carousel prevents vertical page scroll on mobile. Implement gesture direction detection before capturing.",
				type: "bug",
			},
			{
				title: "Implement component bundle size budget",
				description:
					"Track bundle size per component. Fail CI if any component exceeds its budget (e.g., Button < 2KB, DataTable < 15KB). Report size trends.",
				type: "improvement",
			},
			{
				title: "Add Resizable component for split panes",
				description:
					"Resizable split pane component with drag handle. Support horizontal and vertical splits. Persist sizes. Collapse panels to minimum.",
				type: "feature",
			},
			{
				title: "Build ContextMenu component for right-click menus",
				description:
					"Right-click context menu with items, sub-menus, and separators. Support per-item keyboard shortcuts. Mobile long-press trigger.",
				type: "feature",
			},
			{
				title:
					"Fix Switch component not announcing state change to screen readers",
				description:
					"VoiceOver doesn't announce when the Switch changes state. Add aria-checked attribute and live region for state changes.",
				type: "bug",
			},
		],

		// ── Project 12: Performance Optimization ─────────────────────────────
		12: [
			{
				title: "Analyze and reduce JavaScript bundle size",
				description:
					"Run bundle analysis (webpack-bundle-analyzer). Identify large dependencies. Target 50% reduction from current 450KB gzipped to <225KB.",
				type: "improvement",
			},
			{
				title: "Implement route-based code splitting",
				description:
					"Split code by route using Next.js dynamic imports. Ensure each page only loads its required dependencies. Measure initial load reduction.",
				type: "improvement",
			},
			{
				title: "Fix LCP regression on project detail page",
				description:
					"LCP increased from 1.2s to 3.1s after adding the analytics widget. The widget loads 200KB of chart library synchronously. Lazy load it.",
				type: "bug",
			},
			{
				title: "Optimize database queries for issue list view",
				description:
					"Issue list page makes 12 separate queries. Consolidate into 3 queries using batch loading. Reduce page load from 800ms to <200ms.",
				type: "improvement",
			},
			{
				title: "Implement image optimization with next/image",
				description:
					"Replace all img tags with next/image for automatic optimization. Configure image sizes, quality, and formats (WebP, AVIF). Set up CDN.",
				type: "improvement",
			},
			{
				title: "Fix memory leak in real-time subscription manager",
				description:
					"Each Convex subscription listener leaks 50KB on unmount. After navigating 20 pages, memory usage exceeds 500MB. Fix listener cleanup.",
				type: "bug",
			},
			{
				title: "Add server component optimization for static pages",
				description:
					"Convert marketing, docs, and settings pages to React Server Components. Eliminate client-side JavaScript for static content.",
				type: "improvement",
			},
			{
				title: "Implement virtual scrolling for large lists",
				description:
					"Issue lists with >500 items cause janky scrolling. Implement virtualized list with @tanstack/react-virtual. Maintain scroll position on navigation.",
				type: "feature",
			},
			{
				title: "Fix Cumulative Layout Shift on dashboard page",
				description:
					"Dashboard CLS is 0.35 (target: <0.1). Widget placeholders don't match final sizes. Pre-calculate and reserve space for each widget.",
				type: "bug",
			},
			{
				title: "Optimize Convex query patterns for read-heavy pages",
				description:
					"Reduce Convex function calls per page load. Combine related queries into single functions. Use indexes effectively for common access patterns.",
				type: "improvement",
			},
			{
				title: "Implement CDN caching strategy for static assets",
				description:
					"Configure Vercel Edge cache for static assets with appropriate max-age headers. Implement cache busting for updated assets.",
				type: "improvement",
			},
			{
				title: "Fix slow Plate.js editor initialization",
				description:
					"Document editor takes 2.3s to become interactive. Profile and optimize plugin initialization. Defer non-essential plugins.",
				type: "bug",
			},
			{
				title: "Add prefetching for predicted navigation paths",
				description:
					"Prefetch data for likely next pages based on user behavior. Pre-load issue detail when hovering over issue in list. Use router prefetch.",
				type: "feature",
			},
			{
				title: "Implement tree-shaking audit for unused exports",
				description:
					"Audit all barrel exports (index.ts) for tree-shaking effectiveness. Replace barrel exports with direct imports where beneficial.",
				type: "improvement",
			},
			{
				title: "Fix First Input Delay spike during hydration",
				description:
					"FID exceeds 200ms during React hydration on initial load. Implement progressive hydration for below-fold content. Prioritize interactive elements.",
				type: "bug",
			},
			{
				title: "Optimize font loading strategy",
				description:
					"Geist Sans and Mono fonts add 120KB to initial load. Use font-display: swap, preload critical weights, and subset to Latin characters.",
				type: "improvement",
			},
			{
				title: "Implement API response compression analysis",
				description:
					"Audit API response sizes. Enable Brotli compression for responses >1KB. Measure bandwidth savings per endpoint.",
				type: "improvement",
			},
			{
				title: "Fix unnecessary re-renders in issue board",
				description:
					"Kanban board re-renders all columns when any issue changes. Implement fine-grained subscriptions per column. Use React.memo effectively.",
				type: "bug",
			},
			{
				title: "Add performance budgets to CI pipeline",
				description:
					"Define performance budgets: LCP <2s, FID <100ms, CLS <0.1, bundle <250KB. Fail CI when budgets are exceeded. Show trends.",
				type: "feature",
			},
			{
				title: "Implement service worker for offline static assets",
				description:
					"Cache critical static assets (HTML shell, CSS, JS) in service worker. Serve cached version on network failure. Background update on new deployment.",
				type: "feature",
			},
			{
				title: "Fix slow TypeScript compilation in development",
				description:
					"Full TypeScript check takes 45s. Investigate incremental compilation, project references, and tsconfig optimization. Target <15s.",
				type: "bug",
			},
			{
				title: "Optimize React context providers for reduced renders",
				description:
					"Workspace context provider causes full subtree re-render on any state change. Split into granular providers (user, settings, permissions).",
				type: "improvement",
			},
			{
				title: "Implement database query caching layer",
				description:
					"Add caching layer for frequently accessed, slowly changing data (workspace settings, user profiles, label definitions). Cache invalidation on mutations.",
				type: "feature",
			},
			{
				title: "Fix excessive DOM nodes on complex pages",
				description:
					"Issue detail page has 8,000+ DOM nodes causing slow rendering. Reduce nesting, virtualize comment threads, and lazy-render collapsed sections.",
				type: "bug",
			},
			{
				title: "Add real user monitoring with Core Web Vitals",
				description:
					"Instrument real user metrics: LCP, FID, CLS, TTFB, INP per page. Report to analytics dashboard. Track by device type and connection.",
				type: "feature",
			},
			{
				title: "Implement streaming SSR for large pages",
				description:
					"Use React Suspense boundaries to stream SSR for heavy pages. Show skeleton for slow data while fast data renders immediately.",
				type: "improvement",
			},
			{
				title: "Fix Excalidraw memory consumption on complex boards",
				description:
					"Whiteboards with >200 elements consume 1GB+ memory. Implement viewport-based rendering that only processes visible elements.",
				type: "bug",
			},
			{
				title: "Optimize CSS delivery and reduce unused styles",
				description:
					"Audit Tailwind CSS output for unused utilities. Ensure PurgeCSS configuration covers all template files. Target <30KB CSS.",
				type: "improvement",
			},
			{
				title: "Implement lazy loading for below-fold components",
				description:
					"Use IntersectionObserver to lazy-load components not in the initial viewport. Reduce initial JavaScript execution by 40%.",
				type: "feature",
			},
			{
				title: "Fix slow search index update after bulk operations",
				description:
					"Bulk updating 100 issues takes 30s for search index to catch up. Batch index updates and use priority queue for recent changes.",
				type: "bug",
			},
			{
				title: "Add performance regression alerts",
				description:
					"Automated alerts when key performance metrics regress by >10% over a 24-hour period. Compare against 7-day moving average.",
				type: "feature",
			},
			{
				title: "Implement module federation for shared dependencies",
				description:
					"Share React, Lucide, and Radix UI between the main app and admin console using Module Federation. Reduce duplicate downloads.",
				type: "improvement",
			},
			{
				title: "Fix animation frame drops during page transitions",
				description:
					"Page transitions drop to 20fps due to layout recalculation. Use CSS transform for transitions instead of layout-triggering properties.",
				type: "bug",
			},
			{
				title: "Optimize third-party script loading",
				description:
					"Audit and defer third-party scripts (analytics, error tracking, intercom). Load non-critical scripts after initial render. Measure impact.",
				type: "improvement",
			},
			{
				title: "Implement request collapsing for duplicate API calls",
				description:
					"Multiple components requesting the same data make duplicate API calls. Implement request deduplication at the fetch layer.",
				type: "feature",
			},
			{
				title: "Fix WebSocket reconnection storm after server restart",
				description:
					"All connected clients reconnect simultaneously after a server restart, causing a thundering herd. Add random jitter to reconnection delay.",
				type: "bug",
			},
			{
				title: "Add network-aware resource loading",
				description:
					"Detect network quality (4G, 3G, 2G) and adjust resource loading: reduce image quality, defer non-critical data, simplify animations.",
				type: "feature",
			},
			{
				title: "Implement stale-while-revalidate for workspace data",
				description:
					"Show cached workspace data immediately while fetching fresh data in background. Use SWR pattern for non-critical data (member list, labels).",
				type: "improvement",
			},
			{
				title: "Fix main thread blocking during large data processing",
				description:
					"Processing 1000+ issues in the browser blocks the main thread for 500ms. Move filtering and sorting to a Web Worker.",
				type: "bug",
			},
			{
				title: "Optimize SVG icon rendering performance",
				description:
					"Lucide icons are rendered as inline SVG, adding 200+ SVG elements per page. Investigate sprite sheets or icon font alternatives.",
				type: "improvement",
			},
			{
				title: "Implement preconnect for critical third-party origins",
				description:
					"Add preconnect hints for Convex, Dicebear, UploadThing, and Vercel Analytics origins. Reduce connection setup time.",
				type: "improvement",
			},
			{
				title: "Fix scroll performance on issue list with 500+ items",
				description:
					"Scrolling the issue list at >30fps is impossible with 500+ items. Content visibility: auto and virtualization needed.",
				type: "bug",
			},
			{
				title: "Add performance profiling scripts for developers",
				description:
					"CLI scripts to profile: build time, bundle composition, hydration time, and query patterns. Generate HTML report with recommendations.",
				type: "feature",
			},
			{
				title: "Implement partial hydration for mixed interactive pages",
				description:
					"Use React Server Components to skip hydration for static portions of pages. Only hydrate interactive islands.",
				type: "improvement",
			},
			{
				title: "Fix database index not being used for common queries",
				description:
					"Query profiling shows several queries doing full table scans. Add missing composite indexes and verify query planner is using them.",
				type: "bug",
			},
			{
				title: "Optimize WebSocket message payload sizes",
				description:
					"Real-time subscription messages include full document payloads. Send only changed fields (diffs). Reduce average message size by 70%.",
				type: "improvement",
			},
			{
				title: "Add build-time static analysis for performance patterns",
				description:
					"ESLint rules to catch common performance anti-patterns: inline functions in JSX, missing memo, large component files, barrel imports.",
				type: "feature",
			},
			{
				title: "Fix Safari-specific performance regression on boards",
				description:
					"Kanban board renders 3x slower in Safari vs Chrome. Profile with Safari Web Inspector and optimize paint/layout operations.",
				type: "bug",
			},
			{
				title: "Implement edge function caching for API routes",
				description:
					"Move frequently called read-only API routes to Vercel Edge Functions with caching. Reduce origin server load by 60%.",
				type: "feature",
			},
			{
				title: "Optimize initial page load waterfall",
				description:
					"Audit the critical rendering path. Identify and eliminate render-blocking resources. Optimize resource loading order for fastest LCP.",
				type: "improvement",
			},
		],

		// ── Project 13: Security Audit Q1 ────────────────────────────────────
		13: [
			{
				title: "Conduct automated penetration testing with OWASP ZAP",
				description:
					"Run OWASP ZAP automated scan against staging environment. Categorize findings by severity. Create remediation tickets for each finding.",
				type: "issue",
			},
			{
				title: "Audit authentication flow for session fixation",
				description:
					"Review the auth flow for session fixation vulnerabilities. Ensure session ID is regenerated after login. Test with manual session manipulation.",
				type: "issue",
			},
			{
				title: "Fix XSS vulnerability in issue description rendering",
				description:
					"Markdown rendering in issue descriptions doesn't sanitize HTML. Inject <script> tag via description to demonstrate. Implement DOMPurify.",
				type: "bug",
			},
			{
				title: "Implement Content Security Policy headers",
				description:
					"Define and deploy CSP headers. Allow only trusted origins for scripts, styles, images, and connections. Monitor violations via report-uri.",
				type: "improvement",
			},
			{
				title: "Audit all API endpoints for authorization bypass",
				description:
					"Systematically test all API endpoints for: missing auth checks, horizontal privilege escalation, and vertical privilege escalation.",
				type: "issue",
			},
			{
				title: "Fix IDOR vulnerability in document sharing",
				description:
					"Document share links use sequential IDs, allowing enumeration. Replace with cryptographically random tokens. Rate limit share link access.",
				type: "bug",
			},
			{
				title: "Implement rate limiting for authentication endpoints",
				description:
					"Add aggressive rate limiting to login, register, and password reset endpoints. 5 attempts per minute per IP. Implement CAPTCHA after 3 failures.",
				type: "improvement",
			},
			{
				title: "Conduct dependency vulnerability audit",
				description:
					"Run npm audit, Snyk, and Socket.dev on all dependencies. Prioritize: critical (fix immediately), high (fix in 1 week), medium (fix in 1 month).",
				type: "issue",
			},
			{
				title: "Fix sensitive data exposure in error responses",
				description:
					"API error responses include stack traces and internal file paths. Return generic error messages to clients. Log details server-side only.",
				type: "bug",
			},
			{
				title: "Implement secrets rotation automation",
				description:
					"Build automated rotation for: API keys, database credentials, JWT signing keys, and OAuth client secrets. Zero-downtime rotation with gradual cutover.",
				type: "feature",
			},
			{
				title: "Audit file upload handling for malicious content",
				description:
					"Test file upload endpoints for: unrestricted file types, file size bypass, directory traversal in filenames, and malicious file content.",
				type: "issue",
			},
			{
				title: "Fix CSRF protection missing on mutation endpoints",
				description:
					"Mutation endpoints don't validate CSRF tokens. Implement double-submit cookie pattern or use SameSite cookie attribute.",
				type: "bug",
			},
			{
				title: "Implement audit logging for all sensitive operations",
				description:
					"Log all auth events, permission changes, data exports, and admin actions. Include actor, target, timestamp, and IP. Store with 1-year retention.",
				type: "feature",
			},
			{
				title: "Conduct SOC 2 Type II readiness assessment",
				description:
					"Review all SOC 2 Trust Service Criteria against current controls. Document gaps and create remediation plan. Engage external auditor.",
				type: "issue",
			},
			{
				title: "Fix API key visible in browser developer tools",
				description:
					"The API key is included in client-side JavaScript bundle for direct API calls. Move all API calls through server-side proxy.",
				type: "bug",
			},
			{
				title: "Implement encryption at rest for sensitive data",
				description:
					"Encrypt PII fields (email, name, phone) at rest in the database. Use envelope encryption with AWS KMS. Implement key rotation.",
				type: "feature",
			},
			{
				title: "Audit WebSocket connections for security",
				description:
					"Review WebSocket auth (token validation on connect), message validation, rate limiting, and origin checking. Test for injection attacks.",
				type: "issue",
			},
			{
				title: "Fix insecure direct object reference in file downloads",
				description:
					"File download URLs contain the internal storage path. Replace with signed, time-limited URLs that validate user permissions.",
				type: "bug",
			},
			{
				title: "Implement security headers across all responses",
				description:
					"Add: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Strict-Transport-Security, Permissions-Policy to all responses.",
				type: "improvement",
			},
			{
				title: "Conduct phishing simulation for team security awareness",
				description:
					"Run simulated phishing campaign targeting the engineering team. Track click rates and credential submissions. Provide security training follow-up.",
				type: "issue",
			},
			{
				title: "Fix password reset token not expiring after use",
				description:
					"Used password reset tokens remain valid for the full 24-hour window. Invalidate tokens immediately after successful password reset.",
				type: "bug",
			},
			{
				title: "Implement role-based access control audit trail",
				description:
					"Log all permission changes: who granted what role to whom, when, and from which IP. Support rollback of recent permission changes.",
				type: "feature",
			},
			{
				title: "Audit third-party integrations for data exposure",
				description:
					"Review data shared with GitHub, Slack, Stripe, and analytics integrations. Ensure minimum necessary data is shared. Document data flows.",
				type: "issue",
			},
			{
				title: "Fix OAuth state parameter not validated on callback",
				description:
					"The OAuth callback doesn't validate the state parameter, making it vulnerable to CSRF. Generate and validate cryptographic state token.",
				type: "bug",
			},
			{
				title: "Implement data retention and deletion policies",
				description:
					"Define and enforce data retention periods: active data (indefinite), soft-deleted (30 days), audit logs (1 year), backups (90 days).",
				type: "feature",
			},
			{
				title: "Conduct code review for SQL injection vulnerabilities",
				description:
					"Review all database queries for SQL injection risk. Ensure all queries use parameterized statements. Implement linting rule.",
				type: "issue",
			},
			{
				title: "Fix unvalidated redirect in login flow",
				description:
					"The return_url parameter in the login flow accepts any URL, enabling open redirect attacks. Validate against allowlist of internal URLs.",
				type: "bug",
			},
			{
				title: "Implement API request signing for webhook verification",
				description:
					"Sign all outgoing webhook payloads with HMAC-SHA256. Include timestamp to prevent replay attacks. Document verification process.",
				type: "improvement",
			},
			{
				title: "Audit cookie security attributes",
				description:
					"Review all cookies for: Secure flag, HttpOnly, SameSite, Path scope, and appropriate Max-Age. Fix any cookies missing security attributes.",
				type: "issue",
			},
			{
				title: "Fix JWT not invalidated on password change",
				description:
					"Existing JWTs remain valid after a user changes their password. Implement a token version claim that increments on password change.",
				type: "bug",
			},
			{
				title: "Implement security monitoring and alerting",
				description:
					"Set up real-time alerts for: multiple failed logins, unusual API patterns, privilege escalation attempts, and data exfiltration indicators.",
				type: "feature",
			},
			{
				title: "Conduct infrastructure security review",
				description:
					"Review Vercel and Convex security configurations: access controls, network policies, encryption settings, and backup procedures.",
				type: "issue",
			},
			{
				title: "Fix rate limit bypass using different IP addresses",
				description:
					"Rate limiting is per-IP only, easily bypassed with rotating IPs. Implement combined rate limiting using IP + user session + fingerprint.",
				type: "bug",
			},
			{
				title: "Implement secure file upload scanning",
				description:
					"Scan all uploaded files for malware using ClamAV integration. Quarantine suspicious files. Notify admin of detections.",
				type: "feature",
			},
			{
				title: "Audit environment variable management",
				description:
					"Review all environment variables for: overly broad access, unencrypted sensitive values, and unused variables. Document required env vars.",
				type: "issue",
			},
			{
				title: "Fix API endpoint returning data for deleted workspaces",
				description:
					"API queries can still return data from deleted workspaces if you know the workspace ID. Add deletion check to all workspace queries.",
				type: "bug",
			},
			{
				title: "Implement network segmentation documentation",
				description:
					"Document network architecture: which services communicate, on which ports, with what authentication. Identify unnecessary connections.",
				type: "improvement",
			},
			{
				title: "Create security incident response plan",
				description:
					"Document incident response procedures: detection, triage, containment, eradication, recovery, and post-mortem. Assign roles and contacts.",
				type: "issue",
			},
			{
				title: "Fix brute force protection not working for API keys",
				description:
					"API key authentication has no brute force protection. Implement progressive delays and account lockout after 10 invalid API key attempts.",
				type: "bug",
			},
			{
				title: "Implement GDPR data subject access request flow",
				description:
					"Build automated workflow for GDPR data access requests: verify identity, collect all user data, generate report, deliver securely.",
				type: "feature",
			},
			{
				title: "Conduct load testing for DDoS resilience",
				description:
					"Simulate DDoS conditions with 10K concurrent connections. Measure at what point the service degrades. Implement auto-scaling triggers.",
				type: "issue",
			},
			{
				title: "Fix session not terminated after account deletion",
				description:
					"Deleting a user account doesn't invalidate their active sessions. The user can continue to access the platform until the session expires.",
				type: "bug",
			},
			{
				title: "Implement certificate transparency monitoring",
				description:
					"Monitor Certificate Transparency logs for unauthorized TLS certificates issued for our domains. Alert immediately on detection.",
				type: "feature",
			},
			{
				title: "Create secure development guidelines document",
				description:
					"Document secure coding practices for the team: input validation, output encoding, auth patterns, secret management, and dependency policy.",
				type: "improvement",
			},
			{
				title: "Fix cross-origin request forgery in GraphQL mutations",
				description:
					"GraphQL mutations from any origin are accepted because CORS is overly permissive. Restrict Access-Control-Allow-Origin to our domains.",
				type: "bug",
			},
			{
				title: "Implement backup encryption and testing",
				description:
					"Encrypt all database backups using AES-256. Test backup restoration monthly. Verify backup integrity with checksums.",
				type: "feature",
			},
			{
				title: "Audit logging for compliance requirements",
				description:
					"Map logging to SOC 2 and GDPR requirements. Ensure all required events are captured. Verify log integrity and tamper-evidence.",
				type: "issue",
			},
			{
				title: "Fix admin API accepting expired JWT tokens",
				description:
					"The admin API has a misconfigured JWT verification that doesn't check the exp claim. Add proper expiration validation to admin token verification.",
				type: "bug",
			},
			{
				title: "Implement vulnerability disclosure program",
				description:
					"Create a security.txt file, set up a responsible disclosure policy, and configure a bug bounty program via HackerOne.",
				type: "feature",
			},
			{
				title: "Create security training materials for new hires",
				description:
					"Onboarding security training covering: secure coding, phishing awareness, incident reporting, and access management procedures.",
				type: "improvement",
			},
		],

		// ── Project 14: Developer Documentation ──────────────────────────────
		14: [
			{
				title: "Build API reference auto-generation from OpenAPI spec",
				description:
					"Parse the OpenAPI 3.1 spec and generate documentation pages for each endpoint. Include request/response schemas, auth requirements, and examples.",
				type: "feature",
			},
			{
				title: "Create getting started guide with quickstart",
				description:
					"Step-by-step guide from signup to first API call in <5 minutes. Include code snippets in Python, JavaScript, and cURL. Test all examples.",
				type: "feature",
			},
			{
				title: "Fix code examples using deprecated API endpoints",
				description:
					"Several documentation code examples reference v1 endpoints that are now deprecated. Update all examples to use v2 endpoints.",
				type: "bug",
			},
			{
				title: "Implement interactive API playground",
				description:
					"In-browser API playground where users can make real API calls. Pre-fill with API key from their account. Show request/response with syntax highlighting.",
				type: "feature",
			},
			{
				title: "Add authentication guide with code examples",
				description:
					"Comprehensive auth guide covering: API keys, OAuth 2.0 flow, JWT handling, token refresh, and session management with code examples per language.",
				type: "feature",
			},
			{
				title: "Fix search not working on documentation site",
				description:
					"The Algolia DocSearch integration returns no results. Re-crawl the docs site and update the search configuration.",
				type: "bug",
			},
			{
				title: "Create webhook integration guide",
				description:
					"Guide for setting up webhooks: event types, payload schemas, signature verification, retry behavior, and troubleshooting common issues.",
				type: "feature",
			},
			{
				title: "Build changelog with breaking change indicators",
				description:
					"Auto-generated changelog from releases. Highlight breaking changes with visual indicators. Include migration steps for each breaking change.",
				type: "feature",
			},
			{
				title: "Fix code syntax highlighting broken in dark mode",
				description:
					"Syntax highlighting theme in documentation is hardcoded to light mode colors. Add dark mode variant that matches the docs site theme.",
				type: "bug",
			},
			{
				title: "Implement versioned documentation",
				description:
					"Support documentation versions matching API versions (v1, v2). Version switcher in navigation. Show deprecation warnings for old versions.",
				type: "feature",
			},
			{
				title: "Add rate limiting documentation with examples",
				description:
					"Document rate limit policies per endpoint. Include headers (X-RateLimit-*), retry strategies, and best practices for staying within limits.",
				type: "feature",
			},
			{
				title: "Fix broken internal links across documentation",
				description:
					"Link checker found 47 broken internal links. Most are from page restructuring. Fix all broken links and add CI check to prevent future breakage.",
				type: "bug",
			},
			{
				title: "Create error handling guide with all error codes",
				description:
					"Comprehensive list of all API error codes with: description, common causes, resolution steps, and example error responses.",
				type: "feature",
			},
			{
				title: "Build SDK quickstart guides per language",
				description:
					"Language-specific quickstart: install SDK, configure credentials, make first API call, handle errors. Python, JavaScript, Go, Ruby.",
				type: "feature",
			},
			{
				title: "Fix mobile responsiveness of documentation site",
				description:
					"Code blocks overflow on mobile screens. Navigation sidebar doesn't collapse. Table of contents is not accessible. Fix all mobile layout issues.",
				type: "bug",
			},
			{
				title: "Implement copy-to-clipboard for all code blocks",
				description:
					"Add copy button to all code blocks. Support copying individual blocks and entire multi-block examples. Show copy confirmation.",
				type: "improvement",
			},
			{
				title: "Add pagination guide with cursor examples",
				description:
					"Document cursor-based pagination: how cursors work, implementing forward/backward pagination, handling cursor expiration, and common patterns.",
				type: "feature",
			},
			{
				title: "Create migration guide from v1 to v2 API",
				description:
					"Step-by-step migration guide: breaking changes list, code transformation examples, compatibility layer usage, and migration timeline.",
				type: "feature",
			},
			{
				title: "Fix API playground not saving authentication tokens",
				description:
					"Users have to re-enter their API key every time they visit the playground. Persist API key in localStorage with encryption.",
				type: "bug",
			},
			{
				title: "Implement feedback widget on every docs page",
				description:
					"Thumbs up/down + optional comment on every page. Track satisfaction per page. Surface low-rated pages for improvement.",
				type: "improvement",
			},
			{
				title: "Add real-time data streaming documentation",
				description:
					"Guide for using WebSocket and SSE endpoints: connection setup, authentication, event handling, reconnection, and example implementations.",
				type: "feature",
			},
			{
				title: "Build documentation contribution guide",
				description:
					"Guide for contributing to docs: local setup, writing style guide, PR process, preview deployments, and review checklist.",
				type: "feature",
			},
			{
				title: "Fix table of contents not updating on scroll",
				description:
					"The sidebar table of contents doesn't highlight the current section when scrolling. Implement scroll spy with IntersectionObserver.",
				type: "bug",
			},
			{
				title: "Implement multi-language code examples",
				description:
					"Each code example should have tabs for: cURL, JavaScript, Python, Go, Ruby. Persist language preference across pages.",
				type: "feature",
			},
			{
				title: "Add bulk operations guide",
				description:
					"Document the batch API: request format, response handling, error recovery, partial success behavior, and performance recommendations.",
				type: "feature",
			},
			{
				title: "Fix OpenAPI spec not matching actual API behavior",
				description:
					"Several endpoint descriptions and required fields in the OpenAPI spec don't match the implementation. Audit and fix all discrepancies.",
				type: "bug",
			},
			{
				title: "Create security best practices guide",
				description:
					"Document security recommendations: API key handling, webhook verification, CSP headers, OAuth scopes, and data encryption patterns.",
				type: "feature",
			},
			{
				title: "Build documentation analytics dashboard",
				description:
					"Track: page views, time on page, search queries, most visited pages, bounce rates. Use analytics to prioritize documentation improvements.",
				type: "improvement",
			},
			{
				title: "Fix documentation build time exceeding 5 minutes",
				description:
					"Docs site build takes 7 minutes due to rendering 300+ pages. Implement incremental builds and parallel page generation.",
				type: "bug",
			},
			{
				title: "Implement API reference code generation",
				description:
					"Auto-generate API client code from OpenAPI spec. Offer download for Python, JS, Go, and Ruby. Regenerate on spec changes.",
				type: "feature",
			},
			{
				title: "Add troubleshooting guide for common issues",
				description:
					"FAQ-style troubleshooting: auth failures, webhook delivery issues, rate limiting, CORS errors, and SDK version compatibility.",
				type: "feature",
			},
			{
				title: "Create data model documentation with diagrams",
				description:
					"Document the data model: entities, relationships, field types, and constraints. Include ER diagrams. Keep in sync with schema changes.",
				type: "feature",
			},
			{
				title: "Fix documentation not accessible without JavaScript",
				description:
					"The docs site requires JavaScript to render any content. Implement static HTML generation for content with progressive enhancement.",
				type: "bug",
			},
			{
				title: "Implement documentation translation framework",
				description:
					"Set up i18n framework for documentation. Start with Spanish and Japanese. Support community contributions. Track translation coverage.",
				type: "feature",
			},
			{
				title: "Add integration guides for popular frameworks",
				description:
					"Framework-specific integration guides: Next.js, Express, FastAPI, Django, Rails. Include working example repositories for each.",
				type: "feature",
			},
			{
				title: "Fix code example indentation inconsistent",
				description:
					"Some code examples use tabs, others spaces. Mixed 2-space and 4-space indentation. Standardize to 2-space indentation for all examples.",
				type: "bug",
			},
			{
				title: "Build documentation testing framework",
				description:
					"Test framework that validates: all code examples compile/run, API endpoints return expected responses, links resolve, and images load.",
				type: "improvement",
			},
			{
				title: "Create GraphQL documentation with schema explorer",
				description:
					"GraphQL docs with interactive schema explorer (GraphiQL-like). Document all types, queries, mutations, and subscriptions.",
				type: "feature",
			},
			{
				title: "Fix PDF export of docs cutting off code blocks",
				description:
					"PDF export of documentation pages truncates code blocks that exceed page width. Implement word wrap and page break handling for code.",
				type: "bug",
			},
			{
				title: "Implement documentation CI with broken link checking",
				description:
					"CI pipeline for docs repo: build check, link validation, spell check, code example validation, and screenshot testing.",
				type: "improvement",
			},
			{
				title: "Add environment setup guide for contributors",
				description:
					"Detailed setup guide: prerequisites, repository clone, dependency install, local dev server, and running tests. Support macOS, Linux, and Windows.",
				type: "feature",
			},
			{
				title: "Create architecture decision records (ADRs)",
				description:
					"Document key architectural decisions: API versioning strategy, auth mechanism choice, database selection, and SDK design patterns.",
				type: "feature",
			},
			{
				title: "Fix sidebar navigation collapsing wrong sections",
				description:
					"Clicking to expand a sidebar section collapses the previously opened one. Allow multiple sections to be expanded simultaneously.",
				type: "bug",
			},
			{
				title: "Implement runnable code snippets in documentation",
				description:
					"Embed runnable code snippets using Sandpack. Users can modify and execute examples directly in the documentation.",
				type: "feature",
			},
			{
				title: "Add API status page integration",
				description:
					"Display current API status on documentation site. Show recent incidents. Link to the full status page for details.",
				type: "improvement",
			},
			{
				title: "Fix documentation dark mode toggle not persisting",
				description:
					"Dark mode preference resets on every page navigation. Store preference in cookie (not just localStorage) for SSR support.",
				type: "bug",
			},
			{
				title: "Build onboarding tutorial series",
				description:
					"Progressive tutorial series: Hello World, CRUD operations, real-time subscriptions, file uploads, and advanced workflows. Track progress.",
				type: "feature",
			},
			{
				title: "Create API design guidelines for internal team",
				description:
					"Internal guide for API design: naming conventions, resource modeling, error format, pagination, versioning, and deprecation process.",
				type: "improvement",
			},
			{
				title: "Fix images not loading in documentation preview",
				description:
					"Images referenced in documentation markdown don't load in local preview. The image path resolution differs between dev and production.",
				type: "bug",
			},
			{
				title: "Implement documentation community forum integration",
				description:
					"Link each docs page to a community forum thread. Allow users to ask questions in context. Surface popular community solutions.",
				type: "feature",
			},
		],

		// ── Project 15: Python SDK ───────────────────────────────────────────
		15: [
			{
				title: "Implement HTTP client with retry and timeout",
				description:
					"Base HTTP client using httpx with: configurable timeouts, automatic retry with exponential backoff, request/response logging, and proxy support.",
				type: "feature",
			},
			{
				title: "Build Pydantic models for all API resources",
				description:
					"Auto-generate Pydantic v2 models from OpenAPI spec. Include field validation, optional fields, and datetime serialization. Support strict mode.",
				type: "feature",
			},
			{
				title: "Fix async client not properly closing connections",
				description:
					"AsyncClient doesn't close the httpx connection pool on __aexit__. Implement proper cleanup in context manager and add connection pool monitoring.",
				type: "bug",
			},
			{
				title: "Implement OAuth 2.0 authentication flow",
				description:
					"Full OAuth 2.0 implementation: authorization URL generation, callback handling, token exchange, automatic refresh, and token persistence.",
				type: "feature",
			},
			{
				title: "Add pagination helpers with async iterator",
				description:
					"Auto-paginating iterators for list endpoints. Support both sync and async iteration. Handle cursor-based and offset-based pagination.",
				type: "feature",
			},
			{
				title: "Fix rate limit handling not respecting Retry-After header",
				description:
					"Rate limited responses include a Retry-After header that the client ignores. Implement automatic retry after the specified delay.",
				type: "bug",
			},
			{
				title: "Build webhook signature verification utility",
				description:
					"Utility function to verify Stripe-style webhook signatures. Support multiple signing secrets for key rotation. Include timestamp validation.",
				type: "feature",
			},
			{
				title: "Implement resource CRUD methods for issues",
				description:
					"Issues resource: list (with filters), get, create, update, delete. Support bulk operations. Include typed parameters and response models.",
				type: "feature",
			},
			{
				title: "Fix datetime serialization inconsistent with API",
				description:
					"SDK sends datetime as ISO 8601 strings but API expects Unix timestamps. Add custom serializer that converts to millisecond timestamps.",
				type: "bug",
			},
			{
				title: "Add typed error classes for all API errors",
				description:
					"Error class hierarchy: VelocityError > AuthError, RateLimitError, ValidationError, NotFoundError, ServerError. Include error code and retry info.",
				type: "feature",
			},
			{
				title: "Implement project resource methods",
				description:
					"Projects resource: list, get, create, update, archive. Include member management sub-resource. Support filtering by status and team.",
				type: "feature",
			},
			{
				title: "Fix connection pooling leaking file descriptors",
				description:
					"Long-running applications gradually leak file descriptors because idle connections aren't being cleaned up. Configure max idle time.",
				type: "bug",
			},
			{
				title: "Build comprehensive test suite with pytest",
				description:
					"Test suite using pytest: unit tests with mocked responses, integration tests against staging API, and contract tests against OpenAPI spec.",
				type: "improvement",
			},
			{
				title: "Implement document resource methods",
				description:
					"Documents resource: list, get, create, update, delete. Support content upload in Markdown and HTML formats. Include version history.",
				type: "feature",
			},
			{
				title: "Fix Python 3.9 compatibility issues",
				description:
					"Type hints use 3.10+ syntax (list[str] instead of List[str]). Add from __future__ import annotations or use typing module for compatibility.",
				type: "bug",
			},
			{
				title: "Add CLI tool for common operations",
				description:
					"CLI tool (velocity-cli) using Click: list issues, create issue, search, sync configuration. Support multiple profiles for different workspaces.",
				type: "feature",
			},
			{
				title: "Implement workspace and organization methods",
				description:
					"Workspace CRUD, member management, settings. Organization listing and switching. Cache workspace context for subsequent calls.",
				type: "feature",
			},
			{
				title: "Fix multipart file upload corrupting binary files",
				description:
					"File upload endpoint corrupts binary files (images, PDFs) because the content is being encoded as UTF-8 text. Use binary mode for file reading.",
				type: "bug",
			},
			{
				title: "Build documentation with Sphinx and ReadTheDocs",
				description:
					"API documentation using Sphinx with autodoc. Host on ReadTheDocs. Include usage examples, type information, and changelog.",
				type: "feature",
			},
			{
				title: "Implement event subscription with WebSocket client",
				description:
					"Real-time event subscription using WebSocket. Support subscribing to specific event types. Handle reconnection with exponential backoff.",
				type: "feature",
			},
			{
				title: "Fix mypy type checking failing on generic types",
				description:
					"Generic type aliases cause mypy errors in strict mode. Replace Protocol-based generics with proper TypeVar bounds and overloads.",
				type: "bug",
			},
			{
				title: "Add request interceptor middleware",
				description:
					"Middleware system for request/response interception. Built-in middleware: logging, authentication, rate limiting, retry. Support custom middleware.",
				type: "feature",
			},
			{
				title: "Implement batch request support",
				description:
					"Send multiple API requests in a single HTTP call using the batch endpoint. Return typed responses keyed by request ID. Handle partial failures.",
				type: "feature",
			},
			{
				title: "Fix SDK installation failing on Alpine Linux",
				description:
					"httpx dependency requires additional system libraries on Alpine. Add a note to docs and consider pure-Python fallback for minimal environments.",
				type: "bug",
			},
			{
				title: "Build example applications repository",
				description:
					"GitHub repo with example applications: Flask integration, Django integration, CLI tool, GitHub Action, and data migration script.",
				type: "feature",
			},
			{
				title: "Implement search and filtering across resources",
				description:
					"Type-safe search API that supports: text search, field filters, date ranges, and sorting. Return typed results with pagination.",
				type: "feature",
			},
			{
				title: "Fix async context manager not working with pytest-asyncio",
				description:
					"Tests using async context manager fail with pytest-asyncio because the event loop closes before cleanup. Fix fixture scoping.",
				type: "bug",
			},
			{
				title: "Add response caching with configurable TTL",
				description:
					"Optional response caching layer. Cache GET requests with configurable TTL per resource type. Support cache invalidation on mutations.",
				type: "feature",
			},
			{
				title: "Implement changelog and release automation",
				description:
					"Auto-generate changelog from commit messages. Publish to PyPI on GitHub release. Include wheel and sdist distributions.",
				type: "improvement",
			},
			{
				title: "Fix SDK version conflict with popular packages",
				description:
					"SDK's httpx version requirement conflicts with FastAPI's dependency. Relax version constraints and test against multiple httpx versions.",
				type: "bug",
			},
			{
				title: "Build GitHub Action for SDK-based automations",
				description:
					"GitHub Action that uses the Python SDK for: issue sync, status updates, and automated comments. Configurable via workflow YAML.",
				type: "feature",
			},
			{
				title: "Implement type stubs for IDE support",
				description:
					"Generate py.typed marker and type stubs. Ensure auto-complete works in VS Code and PyCharm. Test with mypy and pyright.",
				type: "improvement",
			},
			{
				title: "Fix large response handling causing memory issues",
				description:
					"Downloading a list of 10K issues loads everything into memory. Implement streaming response parsing with incremental deserialization.",
				type: "bug",
			},
			{
				title: "Add configuration from environment variables",
				description:
					"Support configuration via VELOCITY_API_KEY, VELOCITY_BASE_URL, VELOCITY_TIMEOUT environment variables. Override with constructor arguments.",
				type: "improvement",
			},
			{
				title: "Implement label and sprint resource methods",
				description:
					"Labels: CRUD and assign to issues. Sprints: list, get, create issues, move between sprints. Include bulk assignment helpers.",
				type: "feature",
			},
			{
				title: "Fix thread safety issue in synchronous client",
				description:
					"Synchronous client shares httpx.Client across threads, causing occasional connection resets. Make client thread-local or add locking.",
				type: "bug",
			},
			{
				title: "Build performance benchmarking suite",
				description:
					"Benchmark suite measuring: request latency overhead, serialization time, memory usage, and connection pool efficiency. Compare against raw httpx.",
				type: "improvement",
			},
			{
				title: "Implement custom field support",
				description:
					"Support reading and writing custom fields on issues and projects. Dynamic typing based on field configuration. Validate against field schema.",
				type: "feature",
			},
			{
				title: "Fix SDK not handling 204 No Content responses",
				description:
					"DELETE endpoints return 204 with no body, but the SDK tries to parse JSON, causing an error. Handle empty responses gracefully.",
				type: "bug",
			},
			{
				title: "Add proxy configuration documentation",
				description:
					"Document how to configure the SDK for: HTTP proxy, SOCKS proxy, corporate proxy with authentication, and SSL certificate verification.",
				type: "improvement",
			},
			{
				title: "Implement notification resource methods",
				description:
					"Notifications: list, mark read, mark unread, archive. Support filtering by type and date. Include real-time subscription option.",
				type: "feature",
			},
			{
				title: "Fix SDK hanging when API returns malformed JSON",
				description:
					"Malformed JSON responses cause the SDK to hang during parsing. Add timeout to JSON parsing and return descriptive error.",
				type: "bug",
			},
			{
				title: "Build migration tool from competing SDK",
				description:
					"Script that converts code using Jira/Linear Python SDK to Velocity SDK. Map common patterns. Generate migration report.",
				type: "feature",
			},
			{
				title: "Implement request logging with redaction",
				description:
					"Structured logging for all API requests. Redact sensitive fields (Authorization header, API keys, PII). Configurable log level.",
				type: "improvement",
			},
			{
				title: "Fix async generator not cleaning up on early termination",
				description:
					"Breaking out of an async for loop over paginated results doesn't clean up the HTTP connection. Implement proper generator finalization.",
				type: "bug",
			},
			{
				title: "Add Django integration package",
				description:
					"Django app providing: model sync, management commands, template tags, and admin actions for the Velocity API. Include middleware for auth.",
				type: "feature",
			},
			{
				title: "Implement file upload and download methods",
				description:
					"File operations: upload with progress callback, download to file or bytes, get metadata. Support large files with chunked transfer.",
				type: "feature",
			},
			{
				title: "Fix pytest fixtures not isolated between tests",
				description:
					"Tests share client state because fixtures have incorrect scope. Use function-scoped fixtures with fresh client instances per test.",
				type: "bug",
			},
			{
				title: "Build contribution guide and developer setup",
				description:
					"Guide for SDK contributors: dev environment setup, coding standards, test requirements, PR process, and release checklist.",
				type: "improvement",
			},
			{
				title: "Implement analytics resource methods",
				description:
					"Analytics: query events, get aggregations, run funnels, export reports. Support complex filter expressions with typed builder pattern.",
				type: "feature",
			},
		],

		// ── Project 16: JavaScript SDK ────────────────────────────────────────
		16: [
			{
				title: "Build fetch-based HTTP client with zero dependencies",
				description:
					"HTTP client using native fetch API. No external dependencies. Support Node.js 18+, Deno, and modern browsers. Add retry and timeout.",
				type: "feature",
			},
			{
				title: "Implement TypeScript type generation from OpenAPI",
				description:
					"Auto-generate TypeScript interfaces from OpenAPI spec. Include request params, response types, and discriminated union error types.",
				type: "feature",
			},
			{
				title: "Fix ESM/CJS dual package compatibility issues",
				description:
					"SDK fails to import in CommonJS projects. Configure package.json exports map for both ESM and CJS. Add separate entry points.",
				type: "bug",
			},
			{
				title: "Build API key and OAuth authentication",
				description:
					"Support API key auth (header-based), OAuth 2.0 PKCE flow for browser, and OAuth client credentials for server. Auto-refresh tokens.",
				type: "feature",
			},
			{
				title: "Add auto-pagination with async iterators",
				description:
					"List methods return AsyncIterable that auto-fetches next pages. Support breaking early, getting all results at once, and page-by-page access.",
				type: "feature",
			},
			{
				title: "Fix request body not stringified for nested objects",
				description:
					"Nested objects in request body are sent as [object Object]. Fix JSON serialization for deeply nested request payloads.",
				type: "bug",
			},
			{
				title: "Implement webhook verification helper",
				description:
					"Function to verify webhook signatures with timing-safe comparison. Support multiple concurrent signing secrets. Include Express/Koa middleware.",
				type: "feature",
			},
			{
				title: "Build issues resource with full CRUD",
				description:
					"Issues: list (filterable, sortable, paginated), get by ID/identifier, create, update, delete, bulk update. Full TypeScript types.",
				type: "feature",
			},
			{
				title: "Fix Date objects not serialized correctly in filters",
				description:
					"Passing Date objects in filter parameters sends them as toString() instead of ISO 8601. Add proper Date serialization.",
				type: "bug",
			},
			{
				title: "Implement custom error classes with cause chaining",
				description:
					"Error hierarchy: VelocityError > ApiError > RateLimitError, AuthError, NotFoundError, ValidationError. Include request/response context.",
				type: "feature",
			},
			{
				title: "Build projects resource with member management",
				description:
					"Projects: CRUD, list members, add/remove members, update member roles. Include typed filter parameters and response types.",
				type: "feature",
			},
			{
				title: "Fix AbortController not stopping in-flight requests",
				description:
					"Calling abort() on a request doesn't cancel the fetch operation. Wire AbortController signal through to the underlying fetch call.",
				type: "bug",
			},
			{
				title: "Implement comprehensive test suite with Vitest",
				description:
					"Test suite: unit tests with msw mocking, integration tests against staging, type tests with tsd, and bundle size tests.",
				type: "improvement",
			},
			{
				title: "Build documents resource methods",
				description:
					"Documents: CRUD, version history, sharing, and content operations. Support Markdown and HTML content formats. Include comment management.",
				type: "feature",
			},
			{
				title: "Fix tree-shaking not working with named imports",
				description:
					"Importing a single resource class pulls in the entire SDK. Fix barrel exports and add sideEffects: false to package.json.",
				type: "bug",
			},
			{
				title: "Add React hooks package (@velocity/react)",
				description:
					"React integration: useIssues, useProjects, useSearch hooks. Built-in SWR caching and optimistic updates. Suspense support.",
				type: "feature",
			},
			{
				title: "Implement workspace and organization methods",
				description:
					"Workspace: CRUD, settings, members. Organization: list, switch, create workspace. Cache workspace context in client instance.",
				type: "feature",
			},
			{
				title: "Fix content-type header missing for JSON requests",
				description:
					"Requests without explicit Content-Type header fail on some proxy servers. Always set Content-Type: application/json for JSON bodies.",
				type: "bug",
			},
			{
				title: "Build documentation site with TypeDoc",
				description:
					"Generate API docs from JSDoc comments using TypeDoc. Host on GitHub Pages. Include usage examples, type information, and changelog.",
				type: "feature",
			},
			{
				title: "Implement real-time subscriptions with WebSocket",
				description:
					"WebSocket client for real-time events. Support subscribe/unsubscribe to event types. Handle reconnection with exponential backoff.",
				type: "feature",
			},
			{
				title: "Fix TypeScript strict mode errors in generated types",
				description:
					"Generated types produce errors with noUncheckedIndexedAccess and exactOptionalPropertyTypes. Fix type generation for strict configs.",
				type: "bug",
			},
			{
				title: "Add request/response interceptors",
				description:
					"Middleware system: beforeRequest, afterResponse, onError hooks. Built-in interceptors for logging, auth, and retry. Support async interceptors.",
				type: "feature",
			},
			{
				title: "Implement batch request support",
				description:
					"Send multiple API requests in one HTTP call. Type-safe request/response mapping. Support partial failure handling with per-request errors.",
				type: "feature",
			},
			{
				title: "Fix Deno compatibility with import maps",
				description:
					"SDK imports fail in Deno because of Node.js-specific module resolution. Add Deno-compatible imports and test in Deno CI.",
				type: "bug",
			},
			{
				title: "Build example projects repository",
				description:
					"Example projects: Next.js app, Express server, Deno script, browser extension, and GitHub Action. Each with README and deployment guide.",
				type: "feature",
			},
			{
				title: "Implement search and filtering utilities",
				description:
					"Type-safe query builder: where(), orderBy(), select(). Compile to API query parameters. Validate against resource schema.",
				type: "feature",
			},
			{
				title: "Fix memory leak in WebSocket reconnection loop",
				description:
					"Failed WebSocket reconnections accumulate event listeners. Each attempt adds new listeners without removing previous ones.",
				type: "bug",
			},
			{
				title: "Add response caching with SWR strategy",
				description:
					"Optional caching layer with stale-while-revalidate strategy. In-memory cache with configurable TTL. Support cache invalidation.",
				type: "feature",
			},
			{
				title: "Implement changelog automation with changesets",
				description:
					"Use changesets for versioning. Auto-generate changelog from changeset files. Publish to npm on GitHub release.",
				type: "improvement",
			},
			{
				title: "Fix SDK bundling issue with webpack 4",
				description:
					"webpack 4 can't process optional chaining syntax. Add build target for ES2019 compatibility. Include in package.json exports.",
				type: "bug",
			},
			{
				title: "Build Next.js integration package",
				description:
					"Next.js helpers: server component data fetching, API route handlers, middleware for auth, and ISR cache invalidation webhooks.",
				type: "feature",
			},
			{
				title: "Implement type narrowing for conditional responses",
				description:
					"API responses with discriminated unions (success/error) should narrow correctly. Use branded types for resource IDs.",
				type: "improvement",
			},
			{
				title: "Fix large file upload exceeding Node.js memory limit",
				description:
					"Uploading files >500MB crashes with heap out of memory. Implement streaming upload with ReadableStream and chunked transfer.",
				type: "bug",
			},
			{
				title: "Add environment variable configuration",
				description:
					"Support VELOCITY_API_KEY, VELOCITY_BASE_URL, VELOCITY_DEBUG environment variables. Override with constructor options.",
				type: "improvement",
			},
			{
				title: "Implement label and sprint resources",
				description:
					"Labels: CRUD, assign to issues. Sprints: list, create, add/remove issues, complete sprint. Include typed builders.",
				type: "feature",
			},
			{
				title: "Fix race condition in concurrent token refresh",
				description:
					"Multiple concurrent requests trigger multiple token refreshes. Implement single-flight pattern for token refresh.",
				type: "bug",
			},
			{
				title: "Build performance benchmark suite",
				description:
					"Benchmark: request overhead, serialization time, bundle parse time, and tree-shaking effectiveness. Compare against competitors.",
				type: "improvement",
			},
			{
				title: "Implement file operations with progress tracking",
				description:
					"File upload/download with progress callback. Support chunked upload, resume on failure, and server-side processing status.",
				type: "feature",
			},
			{
				title: "Fix SDK not working in Cloudflare Workers",
				description:
					"Cloudflare Workers don't support Node.js APIs used by the SDK. Replace with Web Standard APIs (fetch, ReadableStream, crypto).",
				type: "bug",
			},
			{
				title: "Add comprehensive JSDoc comments for IDE support",
				description:
					"Add JSDoc comments to all public methods and types. Include @example, @param, @returns, @throws, and @see tags.",
				type: "improvement",
			},
			{
				title: "Implement notification resource methods",
				description:
					"Notifications: list, mark read/unread, archive, configure preferences. Support filtering and real-time subscription.",
				type: "feature",
			},
			{
				title: "Fix edge case in cursor pagination at collection end",
				description:
					"Requesting next page at the end of a collection returns an error instead of empty result. Handle empty cursor correctly.",
				type: "bug",
			},
			{
				title: "Build browser extension example",
				description:
					"Chrome extension using the SDK: popup with issue list, right-click to create issue from selection, badge with notification count.",
				type: "feature",
			},
			{
				title: "Implement request deduplication",
				description:
					"Identical GET requests within 100ms window should share a single HTTP call. Return cloned response to all callers.",
				type: "improvement",
			},
			{
				title: "Fix TypeScript interface not exported from package",
				description:
					"Some utility types (FilterParams, SortOptions, PageInfo) are used in return types but not exported. Add to public API.",
				type: "bug",
			},
			{
				title: "Add migration guide from Jira/Linear SDK",
				description:
					"Migration guide mapping Jira and Linear SDK patterns to Velocity SDK equivalents. Include code comparison tables.",
				type: "feature",
			},
			{
				title: "Implement custom field support with dynamic types",
				description:
					"Read/write custom fields with type safety. Generate types from workspace custom field configuration. Validate field values.",
				type: "feature",
			},
			{
				title: "Fix npm package includes unnecessary files",
				description:
					"Published package includes test files, examples, and source maps adding 2MB. Configure files field in package.json correctly.",
				type: "bug",
			},
			{
				title: "Build contribution guide",
				description:
					"Guide for contributors: setup, coding standards, testing requirements, PR checklist, and release process.",
				type: "improvement",
			},
			{
				title: "Implement analytics query builder",
				description:
					"Type-safe builder for analytics queries: select metrics, group by dimensions, apply filters, set time range. Validate before execution.",
				type: "feature",
			},
		],

		// ── Project 17: Data Migration Toolkit ───────────────────────────────
		17: [
			{
				title: "Build CSV import parser with validation",
				description:
					"Parse CSV files with configurable column mapping. Validate data types, required fields, and referential integrity. Report errors per row.",
				type: "feature",
			},
			{
				title: "Implement JSON import with schema validation",
				description:
					"Import JSON files matching a defined schema. Support nested objects, arrays, and references. Validate against JSON Schema.",
				type: "feature",
			},
			{
				title: "Fix large CSV files causing memory overflow",
				description:
					"CSV files over 100MB crash the process. Implement streaming CSV parser that processes rows in chunks of 1000.",
				type: "bug",
			},
			{
				title: "Create Jira data migration connector",
				description:
					"Import from Jira Cloud: projects, issues, comments, attachments, labels, and sprints. Map Jira fields to Velocity fields.",
				type: "feature",
			},
			{
				title: "Add rollback support for failed migrations",
				description:
					"Track all created records during migration. On failure, automatically delete created records. Support manual rollback of completed migrations.",
				type: "feature",
			},
			{
				title: "Fix encoding issues with UTF-16 CSV files",
				description:
					"CSV files exported from Excel in UTF-16 encoding fail to parse. Add encoding detection and automatic conversion to UTF-8.",
				type: "bug",
			},
			{
				title: "Implement Linear data migration connector",
				description:
					"Import from Linear: teams as projects, issues, comments, labels, cycles as sprints. Map Linear priorities and statuses.",
				type: "feature",
			},
			{
				title: "Build migration progress dashboard",
				description:
					"Real-time dashboard showing migration progress: records processed, records created, errors encountered, estimated time remaining.",
				type: "feature",
			},
			{
				title: "Fix date parsing inconsistent across locales",
				description:
					"Date fields are parsed differently for US (MM/DD/YYYY) and European (DD/MM/YYYY) formats. Add explicit date format configuration.",
				type: "bug",
			},
			{
				title: "Create Asana data migration connector",
				description:
					"Import from Asana: projects, tasks (as issues), subtasks, comments, and custom fields. Handle Asana's task hierarchy.",
				type: "feature",
			},
			{
				title: "Add dry-run mode for migration preview",
				description:
					"Run migration without writing to database. Show what would be created, modified, or skipped. Generate preview report.",
				type: "improvement",
			},
			{
				title: "Fix migration hanging on network timeout",
				description:
					"API timeouts during migration leave the process in an unknown state. Add timeout handling with automatic retry and state recovery.",
				type: "bug",
			},
			{
				title: "Implement GitHub Issues migration connector",
				description:
					"Import from GitHub Issues: issues, labels, milestones, comments, and assignees. Map GitHub labels to Velocity labels.",
				type: "feature",
			},
			{
				title: "Build validation rule configuration system",
				description:
					"Configurable validation rules: required fields, field lengths, enum values, date ranges, and custom regex patterns. Apply per migration.",
				type: "feature",
			},
			{
				title: "Fix duplicate detection not working for updated records",
				description:
					"Re-running a migration creates duplicates instead of updating existing records. Implement upsert logic using identifier matching.",
				type: "bug",
			},
			{
				title: "Create Notion data migration connector",
				description:
					"Import from Notion: pages as documents, databases as projects/issues. Handle Notion's block-based content format conversion.",
				type: "feature",
			},
			{
				title: "Add attachment migration with parallel downloads",
				description:
					"Download and re-upload file attachments from source systems. Support parallel downloads (5 concurrent). Handle large files >100MB.",
				type: "feature",
			},
			{
				title: "Fix migration log file growing unbounded",
				description:
					"Migration logs grow to gigabytes for large imports. Implement log rotation with configurable max file size and retention.",
				type: "bug",
			},
			{
				title: "Implement incremental sync for ongoing migration",
				description:
					"After initial import, sync changes incrementally. Track last sync timestamp. Handle creates, updates, and deletes.",
				type: "feature",
			},
			{
				title: "Build migration template system",
				description:
					"Pre-configured migration templates for each source system. Templates define field mappings, validations, and transformations. User-customizable.",
				type: "improvement",
			},
			{
				title: "Fix migration CLI showing incorrect completion percentage",
				description:
					"Progress percentage jumps from 60% to 100% because the total count doesn't include related records (comments, attachments).",
				type: "bug",
			},
			{
				title: "Create Trello data migration connector",
				description:
					"Import from Trello: boards as projects, lists as statuses, cards as issues, checklists as sub-issues. Map labels and members.",
				type: "feature",
			},
			{
				title: "Add field transformation pipeline",
				description:
					"Configurable transformations: string formatting, date conversion, status mapping, user mapping, and custom JavaScript functions.",
				type: "feature",
			},
			{
				title: "Fix migration failing silently on API rate limits",
				description:
					"When API rate limit is hit, migration silently skips records. Implement rate limit detection with automatic throttling and retry.",
				type: "bug",
			},
			{
				title: "Implement cross-reference resolution",
				description:
					"Resolve cross-references between migrated records (issue links, mentions, parent-child). Queue references and resolve after all records created.",
				type: "feature",
			},
			{
				title: "Build migration audit report",
				description:
					"Post-migration report: total records migrated, skipped, failed, time elapsed, and data integrity verification results.",
				type: "feature",
			},
			{
				title: "Fix parallel migration workers causing data conflicts",
				description:
					"Running multiple migration workers creates conflicting identifier sequences. Implement distributed sequence generator.",
				type: "bug",
			},
			{
				title: "Create Monday.com data migration connector",
				description:
					"Import from Monday.com: boards as projects, items as issues, subitems, updates as comments. Map status columns to Velocity statuses.",
				type: "feature",
			},
			{
				title: "Add user mapping interface for migration",
				description:
					"UI for mapping source system users to Velocity users. Auto-match by email. Support creating new users for unmatched entries.",
				type: "feature",
			},
			{
				title: "Fix migration corrupting rich text content",
				description:
					"HTML-formatted descriptions lose formatting during migration. Implement proper HTML to Plate.js JSON conversion with all block types.",
				type: "bug",
			},
			{
				title: "Implement migration scheduling and queuing",
				description:
					"Schedule migrations for off-peak hours. Queue multiple migrations with priority. Support pause/resume for long-running imports.",
				type: "feature",
			},
			{
				title: "Build data cleaning utilities",
				description:
					"Pre-migration data cleaning: remove duplicates, fix encoding, normalize dates, trim whitespace, and validate email formats.",
				type: "improvement",
			},
			{
				title: "Fix migration breaking when source has circular references",
				description:
					"Circular issue references (A blocks B, B blocks A) cause infinite loop in reference resolution. Detect and break cycles.",
				type: "bug",
			},
			{
				title: "Create ClickUp data migration connector",
				description:
					"Import from ClickUp: spaces as projects, tasks as issues, subtasks, comments, and custom fields. Map ClickUp statuses and priorities.",
				type: "feature",
			},
			{
				title: "Add migration testing sandbox",
				description:
					"Isolated sandbox for testing migrations before running against production. Clone workspace data for testing. Compare results.",
				type: "feature",
			},
			{
				title: "Fix CSV import ignoring header row with BOM character",
				description:
					"CSV files with UTF-8 BOM character cause the first header to include the BOM. Strip BOM before parsing headers.",
				type: "bug",
			},
			{
				title: "Implement migration API for programmatic usage",
				description:
					"REST API for triggering and managing migrations programmatically. Support all CLI features via API. Include webhook callbacks.",
				type: "feature",
			},
			{
				title: "Build migration documentation and guides",
				description:
					"Step-by-step migration guides for each supported source system. Include field mapping tables, known limitations, and troubleshooting.",
				type: "improvement",
			},
			{
				title: "Fix migration not preserving original timestamps",
				description:
					"Created and updated timestamps are set to migration time instead of original values. Pass original timestamps to API.",
				type: "bug",
			},
			{
				title: "Create generic database connector",
				description:
					"Direct database import from PostgreSQL, MySQL, and MongoDB. Configurable query and field mapping. Support SSL connections.",
				type: "feature",
			},
			{
				title: "Add email notification for migration completion",
				description:
					"Send email notification when migration completes. Include summary stats, error count, and link to detailed report.",
				type: "improvement",
			},
			{
				title: "Fix migration resume not working after crash",
				description:
					"Crashed migration cannot be resumed because checkpoint data is stored in memory only. Persist checkpoints to disk.",
				type: "bug",
			},
			{
				title: "Implement data reconciliation after migration",
				description:
					"Post-migration reconciliation: compare source and target record counts, verify field values, flag discrepancies.",
				type: "feature",
			},
			{
				title: "Build migration metrics and analytics",
				description:
					"Track migration metrics: average speed, error rates by field, most common mapping issues. Use to improve migration quality.",
				type: "improvement",
			},
			{
				title: "Fix migration tool not handling null values correctly",
				description:
					"Null values in source data are imported as empty strings. Preserve null semantics and map to appropriate Velocity field defaults.",
				type: "bug",
			},
			{
				title: "Create Basecamp data migration connector",
				description:
					"Import from Basecamp: projects, to-dos as issues, discussions as comments, schedules as milestones. Handle Basecamp's flat structure.",
				type: "feature",
			},
			{
				title: "Implement parallel processing for large migrations",
				description:
					"Split large migrations across multiple workers. Coordinate via message queue. Merge results and handle conflicts.",
				type: "improvement",
			},
			{
				title: "Fix migration failing for workspaces near plan limits",
				description:
					"Migration doesn't check plan limits before starting, failing midway when limits are reached. Pre-check limits and warn.",
				type: "bug",
			},
			{
				title: "Add migration undo with selective record deletion",
				description:
					"Undo a completed migration by deleting all records created during that migration. Support selective undo of specific record types.",
				type: "feature",
			},
			{
				title: "Build migration comparison tool",
				description:
					"Compare data between source system and Velocity side-by-side. Highlight differences, missing records, and field value mismatches.",
				type: "feature",
			},
		],

		// ── Project 18: Monitoring & Alerting ────────────────────────────────
		18: [
			{
				title: "Implement structured logging with JSON format",
				description:
					"Standardize all log output to JSON format with fields: timestamp, level, message, service, trace_id, span_id, and custom context.",
				type: "feature",
			},
			{
				title: "Build OpenTelemetry tracing integration",
				description:
					"Add OpenTelemetry instrumentation to all API endpoints and Convex functions. Include custom spans for database queries and external calls.",
				type: "feature",
			},
			{
				title: "Fix log aggregation missing events during high load",
				description:
					"Under heavy load (>1000 req/s), about 5% of log events are dropped. Increase the log buffer size and implement async log shipping.",
				type: "bug",
			},
			{
				title: "Create Grafana dashboards for key metrics",
				description:
					"Pre-built Grafana dashboards: API performance (latency, error rate, throughput), infrastructure health, and business metrics.",
				type: "feature",
			},
			{
				title: "Implement SLO tracking and error budget",
				description:
					"Define SLOs for: API availability (99.9%), latency (p95 <200ms), error rate (<0.1%). Track error budget consumption. Alert at 50% and 80%.",
				type: "feature",
			},
			{
				title: "Fix Prometheus metrics endpoint returning stale data",
				description:
					"Custom metrics endpoint returns cached values from the last scrape instead of current values. Fix the metrics collection timing.",
				type: "bug",
			},
			{
				title: "Build PagerDuty integration for critical alerts",
				description:
					"Route critical alerts to PagerDuty. Configure escalation policies, on-call schedules, and acknowledgment workflows. Include runbook links.",
				type: "feature",
			},
			{
				title: "Implement log-based alerting rules",
				description:
					"Define alert rules that trigger on log patterns: error rate spikes, specific error codes, slow queries. Support regex matching.",
				type: "feature",
			},
			{
				title: "Fix trace context not propagated to background jobs",
				description:
					"Background jobs (webhooks, scheduled tasks) lose trace context. Propagate W3C trace parent through the job queue.",
				type: "bug",
			},
			{
				title: "Create runbook library for common incidents",
				description:
					"Standard runbooks for: API down, high error rate, database connection issues, memory leak, and certificate expiry. Include resolution steps.",
				type: "feature",
			},
			{
				title: "Add custom metrics collection for business events",
				description:
					"Track business metrics: signups, project creations, issue throughput, AI usage, and feature adoption. Export to Prometheus.",
				type: "improvement",
			},
			{
				title: "Fix alert fatigue from noisy health check alerts",
				description:
					"Health check endpoint flapping causes excessive alerts. Implement alert dampening: require 3 consecutive failures before alerting.",
				type: "bug",
			},
			{
				title: "Implement distributed tracing across microservices",
				description:
					"Propagate trace IDs across all service boundaries: API > Convex functions > webhooks > external APIs. Visualize in Jaeger.",
				type: "feature",
			},
			{
				title: "Build status page for public service health",
				description:
					"Public status page showing: current status per service, incident history, maintenance schedule. Auto-update from monitoring data.",
				type: "feature",
			},
			{
				title: "Fix metric labels causing cardinality explosion",
				description:
					"Adding user_id as a metric label creates millions of unique time series. Replace with bounded labels (plan, role, region).",
				type: "bug",
			},
			{
				title: "Create alert routing rules based on severity",
				description:
					"Route alerts by severity: critical > PagerDuty + Slack, warning > Slack only, info > log only. Support custom routing rules.",
				type: "feature",
			},
			{
				title: "Implement synthetic monitoring with periodic probes",
				description:
					"Scheduled synthetic checks every 30s: API health, auth flow, WebSocket connection, search functionality. Alert on failures.",
				type: "feature",
			},
			{
				title: "Fix memory usage metrics not accurate in containers",
				description:
					"Memory metrics report container limit instead of actual usage. Use cgroup memory stats for accurate container memory tracking.",
				type: "bug",
			},
			{
				title: "Build incident timeline auto-generation",
				description:
					"Automatically create incident timeline from: alerts triggered, actions taken, metrics changes, and resolution events. Export as post-mortem.",
				type: "feature",
			},
			{
				title: "Implement log search with Elasticsearch",
				description:
					"Ship logs to Elasticsearch. Build search UI with: full-text search, field filtering, time range selection, and log level filtering.",
				type: "feature",
			},
			{
				title: "Fix Grafana dashboard variables not working with new metrics",
				description:
					"Dashboard template variables don't include newly added metrics. Refresh variable queries to use wildcard matching.",
				type: "bug",
			},
			{
				title: "Create on-call rotation management",
				description:
					"On-call schedule management: define rotations, handle overrides, calculate compensation, and integrate with PagerDuty schedules.",
				type: "feature",
			},
			{
				title: "Add real-time log streaming for debugging",
				description:
					"Live log tail from the monitoring dashboard. Filter by service, level, and trace ID. Support sharing live sessions with team.",
				type: "feature",
			},
			{
				title: "Fix alert silence not working for specific instances",
				description:
					"Silencing an alert for a specific service instance silences it for all instances. Fix the alert instance matching logic.",
				type: "bug",
			},
			{
				title: "Implement cost monitoring for cloud resources",
				description:
					"Track cloud spending: Convex usage, Vercel bandwidth, UploadThing storage, API costs. Alert on budget threshold (80%, 100%).",
				type: "feature",
			},
			{
				title: "Build automated anomaly detection for metrics",
				description:
					"Use rolling statistics to detect metric anomalies. Alert on values >3 standard deviations from the 7-day rolling average.",
				type: "feature",
			},
			{
				title: "Fix dashboard load time exceeding 10 seconds",
				description:
					"Grafana dashboards with 50+ panels load slowly. Optimize queries, implement lazy panel loading, and cache historical data.",
				type: "bug",
			},
			{
				title: "Create monitoring-as-code with Terraform",
				description:
					"Define all dashboards, alerts, and rules as Terraform resources. Version control monitoring config. PR-based changes.",
				type: "improvement",
			},
			{
				title: "Implement trace sampling for high-volume services",
				description:
					"Sample 10% of traces for high-volume endpoints while keeping 100% of error traces. Implement head-based and tail-based sampling.",
				type: "improvement",
			},
			{
				title: "Fix alert notifications sending duplicate messages",
				description:
					"Each alert state change sends 2-3 duplicate notifications. Fix the notification deduplication in the alert manager.",
				type: "bug",
			},
			{
				title: "Build capacity planning dashboard",
				description:
					"Forecast resource needs based on growth trends: database size, API traffic, storage usage, and compute requirements. 3/6/12 month projections.",
				type: "feature",
			},
			{
				title: "Implement error tracking integration with Sentry",
				description:
					"Send application errors to Sentry. Include breadcrumbs, user context, and custom tags. Link Sentry issues to monitoring alerts.",
				type: "feature",
			},
			{
				title: "Fix logs not including request body for debugging",
				description:
					"Request body is stripped from logs for privacy. Add configurable body logging with PII redaction for specific debugging scenarios.",
				type: "bug",
			},
			{
				title: "Create SLA reporting for enterprise customers",
				description:
					"Automated monthly SLA reports per customer: uptime, incident count, response times, and SLA compliance percentage.",
				type: "feature",
			},
			{
				title: "Add health check for all external dependencies",
				description:
					"Health probes for: Stripe API, GitHub API, Resend email, UploadThing, and OpenAI. Alert when any dependency degrades.",
				type: "improvement",
			},
			{
				title: "Fix metric collection gaps during deployment",
				description:
					"Metrics have 30-60 second gaps during rolling deployments. Implement overlapping collection with proper instance labeling.",
				type: "bug",
			},
			{
				title: "Implement log retention policies",
				description:
					"Configure log retention: debug (7 days), info (30 days), warn (90 days), error (1 year). Auto-archive to cold storage after retention.",
				type: "improvement",
			},
			{
				title: "Build custom dashboard builder for teams",
				description:
					"Allow teams to create custom monitoring dashboards from a library of widgets. Save and share dashboards. Template system.",
				type: "feature",
			},
			{
				title: "Fix alert escalation not working for weekend on-call",
				description:
					"Escalation to secondary on-call fails on weekends because the schedule doesn't account for weekend rotations.",
				type: "bug",
			},
			{
				title: "Create performance regression detection",
				description:
					"Auto-detect performance regressions: compare deployment metrics against baseline. Alert and create ticket if latency regresses >10%.",
				type: "feature",
			},
			{
				title: "Implement uptime monitoring with geographic distribution",
				description:
					"Monitor endpoint availability from multiple regions (US, EU, APAC). Detect regional outages. Calculate per-region availability.",
				type: "feature",
			},
			{
				title: "Fix Grafana annotations not showing deployment markers",
				description:
					"Deployment markers should appear on all dashboards. The annotation source is configured but the deployment webhook isn't firing.",
				type: "bug",
			},
			{
				title: "Add monitoring for background job health",
				description:
					"Track background job metrics: queue depth, processing time, failure rate, retry count. Alert when queue depth exceeds threshold.",
				type: "feature",
			},
			{
				title: "Implement change management tracking",
				description:
					"Log all infrastructure and configuration changes with: who, what, when, and why. Correlate changes with incidents.",
				type: "improvement",
			},
			{
				title: "Fix alert rules not evaluating after Grafana upgrade",
				description:
					"Alert rules stopped evaluating after upgrading Grafana. The rule format changed between versions. Migrate all alert rules.",
				type: "bug",
			},
			{
				title: "Build mobile-friendly monitoring dashboard",
				description:
					"Responsive monitoring dashboard for mobile access. Focus on key metrics and active alerts. Support push notifications for critical alerts.",
				type: "improvement",
			},
			{
				title: "Implement service dependency mapping",
				description:
					"Auto-discover service dependencies from trace data. Visualize dependency graph. Identify critical paths and single points of failure.",
				type: "feature",
			},
			{
				title: "Fix metric aggregation losing precision for small values",
				description:
					"Metrics with values <0.01 are rounded to 0 in aggregation. Use higher precision floating point for sub-millisecond latency tracking.",
				type: "bug",
			},
			{
				title: "Create post-mortem template and automation",
				description:
					"Standardized post-mortem template: timeline, root cause, impact, resolution, and action items. Auto-populate from incident data.",
				type: "improvement",
			},
			{
				title: "Add monitoring coverage audit tool",
				description:
					"Audit which services and endpoints have monitoring coverage. Identify blind spots. Generate coverage report with recommendations.",
				type: "feature",
			},
		],

		// ── Project 19: Accessibility Compliance ─────────────────────────────
		19: [
			{
				title: "Conduct full WCAG 2.1 AA audit with axe-core",
				description:
					"Run axe-core automated audit on all customer-facing pages. Categorize findings by impact (critical, serious, moderate, minor). Prioritize fixes.",
				type: "issue",
			},
			{
				title: "Implement keyboard navigation for main navigation",
				description:
					"Full keyboard navigation: Tab through nav items, Enter to activate, Escape to close dropdowns, arrow keys within menus. Show focus indicators.",
				type: "feature",
			},
			{
				title: "Fix color contrast failing on status badges",
				description:
					"Status badges (triage, backlog, in-progress) fail WCAG AA contrast requirements in both light and dark mode. Adjust badge colors.",
				type: "bug",
			},
			{
				title: "Add ARIA labels to all interactive elements",
				description:
					"Audit all buttons, links, inputs, and custom controls for missing ARIA labels. Add descriptive labels that convey purpose, not just visual text.",
				type: "improvement",
			},
			{
				title: "Implement focus management for modal dialogs",
				description:
					"When a dialog opens: move focus to the first interactive element. When it closes: return focus to the trigger. Trap focus inside dialog.",
				type: "feature",
			},
			{
				title: "Fix screen reader not announcing dynamic content updates",
				description:
					"When issues are created or status changes, screen readers don't announce the update. Add aria-live regions for dynamic content.",
				type: "bug",
			},
			{
				title: "Build skip navigation links",
				description:
					"Add skip links at the top of every page: Skip to main content, Skip to navigation, Skip to search. Visible on focus for keyboard users.",
				type: "feature",
			},
			{
				title: "Implement keyboard shortcuts with screen reader compatibility",
				description:
					"Ensure all keyboard shortcuts are announced by screen readers. Provide a shortcut reference (Cmd+/) that is keyboard and screen reader accessible.",
				type: "improvement",
			},
			{
				title: "Fix drag-and-drop not accessible via keyboard",
				description:
					"Kanban board drag-and-drop only works with mouse. Add keyboard alternative: select card, arrow keys to move, Enter to place.",
				type: "bug",
			},
			{
				title: "Add focus visible indicators to all interactive elements",
				description:
					"Ensure all focusable elements have visible focus indicators that meet WCAG (3:1 contrast, 2px minimum). Use focus-visible for mouse/keyboard distinction.",
				type: "feature",
			},
			{
				title: "Implement semantic HTML throughout the application",
				description:
					"Audit and fix HTML semantics: use proper heading hierarchy, landmark roles, lists, and tables. Replace div-based layouts with semantic elements.",
				type: "improvement",
			},
			{
				title: "Fix table headers not associated with data cells",
				description:
					"Data tables in issue list and analytics don't use proper th/td association. Add scope attributes and associate headers with cells.",
				type: "bug",
			},
			{
				title: "Build accessible form validation",
				description:
					"Form errors: use aria-invalid, aria-describedby for error messages, focus first error on submit, and announce errors to screen readers.",
				type: "feature",
			},
			{
				title: "Add alt text to all informational images",
				description:
					"Audit all images and icons. Add descriptive alt text to informational images. Use alt='' for decorative images. Handle dynamic images.",
				type: "improvement",
			},
			{
				title: "Fix dropdown menus not accessible with VoiceOver",
				description:
					"Dropdown menus built with custom components don't expose their state to VoiceOver. Implement proper ARIA attributes: expanded, haspopup, controls.",
				type: "bug",
			},
			{
				title: "Implement reduced motion preference respect",
				description:
					"Detect prefers-reduced-motion media query. Disable or simplify all CSS animations and transitions. Provide static alternatives.",
				type: "feature",
			},
			{
				title: "Build accessible date picker component",
				description:
					"Replace the existing date picker with an accessible version: keyboard navigable calendar, screen reader announcements, and clear date format labeling.",
				type: "feature",
			},
			{
				title: "Fix autocomplete suggestions not navigable by keyboard",
				description:
					"Autocomplete dropdowns (search, @mentions, commands) can't be navigated with arrow keys. Implement combobox pattern with proper ARIA.",
				type: "bug",
			},
			{
				title: "Add heading hierarchy audit and fixes",
				description:
					"Audit all pages for heading hierarchy: ensure h1 > h2 > h3 order without skipping levels. Fix pages with missing or skipped heading levels.",
				type: "improvement",
			},
			{
				title: "Implement accessible notifications and toasts",
				description:
					"Notifications and toasts should be announced by screen readers using aria-live='polite'. Persistent toasts should have dismiss button.",
				type: "feature",
			},
			{
				title: "Fix chart visualizations not accessible",
				description:
					"Charts and graphs have no text alternative for screen reader users. Add data tables as alternative representations. Include chart descriptions.",
				type: "bug",
			},
			{
				title: "Build accessible color palette with sufficient contrast",
				description:
					"Review and adjust the entire color palette for WCAG AA contrast. Ensure text on all background combinations meets 4.5:1 for normal text, 3:1 for large.",
				type: "improvement",
			},
			{
				title: "Add landmark regions to all page layouts",
				description:
					"Implement ARIA landmark roles: banner, navigation, main, complementary, contentinfo. Ensure each page has exactly one main landmark.",
				type: "feature",
			},
			{
				title: "Fix custom checkbox and radio not announcing state",
				description:
					"Custom styled checkboxes and radios don't announce their checked/unchecked state. Use proper role=checkbox/radio with aria-checked.",
				type: "bug",
			},
			{
				title: "Implement accessible error pages",
				description:
					"Error pages (404, 500) should be accessible: descriptive heading, explanation text, and link back to home. Include proper page title.",
				type: "feature",
			},
			{
				title: "Build accessibility testing into CI pipeline",
				description:
					"Run axe-core tests on all pages in CI. Fail build on critical violations. Generate accessibility report as build artifact.",
				type: "improvement",
			},
			{
				title: "Fix tab order incorrect on issue detail page",
				description:
					"Tab order on the issue detail page jumps illogically between sections. Fix tabindex values and DOM order to match visual layout.",
				type: "bug",
			},
			{
				title: "Add visible text labels to icon-only buttons",
				description:
					"Identify all icon-only buttons (close, edit, delete, settings). Add visible text labels or tooltips with aria-label for screen readers.",
				type: "improvement",
			},
			{
				title: "Implement accessible rich text editor",
				description:
					"Ensure the Plate.js editor is accessible: keyboard formatting, screen reader announcements for block types, and accessible toolbar.",
				type: "feature",
			},
			{
				title: "Fix zoom breaking layout at 200% magnification",
				description:
					"At 200% browser zoom, several layouts break: sidebar overlaps content, buttons become unreachable, text truncates. Fix responsive breakpoints.",
				type: "bug",
			},
			{
				title: "Build accessibility documentation for developers",
				description:
					"Internal documentation: accessibility checklist for new features, component accessibility patterns, testing procedures, and ARIA reference.",
				type: "improvement",
			},
			{
				title: "Add captions for all video content",
				description:
					"Any video content (onboarding, tutorials, demos) must have captions. Implement caption file format, display, and editing capability.",
				type: "feature",
			},
			{
				title: "Fix link purpose not clear from link text alone",
				description:
					"Many links use generic text ('click here', 'learn more', 'read more') without context. Make all link text descriptive of the destination.",
				type: "bug",
			},
			{
				title: "Implement accessible data visualization alternatives",
				description:
					"For every chart/graph, provide: aria description of trends, accessible data table, and keyboard-navigable data points.",
				type: "feature",
			},
			{
				title: "Build screen reader testing automation",
				description:
					"Automated tests using screen reader simulation (aria-query). Verify announcement text, focus order, and role information for key flows.",
				type: "improvement",
			},
			{
				title: "Fix sidebar navigation not collapsing accessibly",
				description:
					"Sidebar collapse/expand button doesn't announce state (expanded/collapsed). Add aria-expanded and screen reader text for the toggle.",
				type: "bug",
			},
			{
				title: "Add high contrast mode support",
				description:
					"Support Windows High Contrast Mode and forced-colors media query. Ensure all UI elements remain visible and distinguishable.",
				type: "feature",
			},
			{
				title: "Implement accessible loading states",
				description:
					"Loading spinners and skeleton screens should be announced to screen readers. Use aria-busy and aria-live for loading content regions.",
				type: "improvement",
			},
			{
				title: "Fix required form fields not indicated for screen readers",
				description:
					"Required fields only show a visual asterisk. Add aria-required='true' and descriptive text. Announce required status on focus.",
				type: "bug",
			},
			{
				title: "Build VPAT (Voluntary Product Accessibility Template)",
				description:
					"Create VPAT document detailing WCAG 2.1 AA conformance per criterion. Include current status, known exceptions, and remediation timeline.",
				type: "issue",
			},
			{
				title: "Add accessible context menus",
				description:
					"Right-click context menus must be keyboard accessible (Shift+F10 or dedicated key). Announce menu items and support arrow key navigation.",
				type: "feature",
			},
			{
				title: "Fix tooltip content not accessible to screen readers",
				description:
					"Tooltips are only triggered by hover and not accessible to keyboard or screen reader users. Implement focus-triggered tooltips with ARIA.",
				type: "bug",
			},
			{
				title: "Implement touch target size compliance",
				description:
					"Audit all interactive elements for minimum touch target size (44x44px). Enlarge small targets on mobile. Add spacing between adjacent targets.",
				type: "improvement",
			},
			{
				title: "Build accessibility feedback mechanism",
				description:
					"Add 'Report accessibility issue' link in footer. Direct reports to dedicated accessibility inbox. Track and prioritize reports.",
				type: "feature",
			},
			{
				title: "Fix pagination not announcing current page to screen readers",
				description:
					"Pagination component doesn't announce which page is current. Add aria-current='page' to current page and aria-label to navigation.",
				type: "bug",
			},
			{
				title: "Add text resizing support without layout breaking",
				description:
					"Ensure layout remains functional when text is resized up to 200% (WCAG 1.4.4). Use relative units (rem, em) instead of fixed px for text.",
				type: "improvement",
			},
			{
				title: "Implement accessible toggle switches",
				description:
					"Replace custom toggle switches with proper role='switch' and aria-checked. Announce state changes. Support keyboard activation.",
				type: "feature",
			},
			{
				title: "Fix mobile menu not accessible after orientation change",
				description:
					"Rotating the device while the mobile menu is open causes the menu to be invisible but still capture focus. Fix orientation change handler.",
				type: "bug",
			},
			{
				title: "Create accessibility conformance testing report",
				description:
					"Generate comprehensive conformance report against all WCAG 2.1 AA success criteria. Include evidence screenshots and test methodology.",
				type: "issue",
			},
			{
				title: "Build automated accessibility regression testing",
				description:
					"Integration tests that catch accessibility regressions: focus management, ARIA attributes, heading hierarchy, and contrast ratios.",
				type: "improvement",
			},
		],
	};

	return issuesByProject[projectIndex] || [];
}

// ── Shared args validator ────────────────────────────────────────────────────

const batchArgs = {
	workspaceId: v.id("workspaces"),
	creatorUserId: v.id("users"),
	userIds: v.array(v.id("users")),
	labelIds: v.array(v.id("labels")),
	projectIds: v.array(v.id("projects")),
	milestoneIds: v.array(v.id("milestones")),
	sprintIds: v.array(v.id("sprints")),
	projectMeta: v.array(
		v.object({
			projectIndex: v.number(),
			milestoneIds: v.array(v.id("milestones")),
			sprintIds: v.array(v.id("sprints")),
		}),
	),
	startIssueNumber: v.optional(v.number()),
	allIssueIds: v.optional(v.array(v.id("issues"))),
};

// ── Issue creation helper ────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: Convex mutation ctx type is complex and varies by generated types
async function createIssuesForProjects(
	ctx: any,
	args: {
		workspaceId: Id<"workspaces">;
		creatorUserId: Id<"users">;
		userIds: Id<"users">[];
		labelIds: Id<"labels">[];
		projectIds: Id<"projects">[];
		projectMeta: {
			projectIndex: number;
			milestoneIds: Id<"milestones">[];
			sprintIds: Id<"sprints">[];
		}[];
	},
	projectRange: [number, number],
	startIssueNumber: number,
): Promise<{ issueIds: Id<"issues">[]; nextIssueNumber: number }> {
	const rand = seededRandom(startIssueNumber * 7919);
	const issueIds: Id<"issues">[] = [];
	let issueNumber = startIssueNumber;

	for (let pi = projectRange[0]; pi <= projectRange[1]; pi++) {
		const meta = args.projectMeta.find((m) => m.projectIndex === pi);
		if (!meta) continue;

		const projectId = args.projectIds[pi];
		if (!projectId) continue;

		const project = DEMO_PROJECTS[pi];
		const templates = generateProjectIssues(pi);
		const memberIndices = project.memberIndices;

		for (let ti = 0; ti < templates.length; ti++) {
			const template = templates[ti];
			const status = weightedPick(STATUSES, STATUS_WEIGHTS, rand);
			const priority = weightedPick(PRIORITIES, PRIORITY_WEIGHTS, rand);

			const memberIdx =
				memberIndices[Math.floor(rand() * memberIndices.length)];
			const assigneeId = rand() < 0.85 ? args.userIds[memberIdx] : undefined;

			const creatorIdx =
				memberIndices[Math.floor(rand() * memberIndices.length)];
			const createdBy = args.userIds[creatorIdx] ?? args.creatorUserId;

			const hasLabels = rand() < 0.6;
			const labelCount = hasLabels ? Math.floor(rand() * 2) + 1 : 0;
			const labelIds: Id<"labels">[] = [];
			if (labelCount > 0) {
				const shuffled = [...args.labelIds].sort(() => rand() - 0.5);
				for (let l = 0; l < labelCount && l < shuffled.length; l++) {
					labelIds.push(shuffled[l]);
				}
			}

			const isActive = status === "in_progress" || status === "in_review";
			const startDate = isActive
				? daysAgo(Math.floor(rand() * 14) + 1)
				: undefined;
			const hasDueDate = rand() < 0.4;
			const dueDate = hasDueDate
				? daysFromNow(Math.floor(rand() * 30) + 1)
				: undefined;
			const hasEstimate = rand() < 0.5;
			const estimate = hasEstimate ? Math.floor(rand() * 8) + 1 : undefined;

			const completedAt =
				status === "done" ? daysAgo(Math.floor(rand() * 14) + 1) : undefined;

			const isNotBacklog = status !== "backlog" && status !== "triage";
			const hasSprint =
				isNotBacklog && meta.sprintIds.length > 0 && rand() < 0.6;
			const sprintId = hasSprint
				? meta.sprintIds[Math.floor(rand() * meta.sprintIds.length)]
				: undefined;

			const hasMilestone = meta.milestoneIds.length > 0 && rand() < 0.4;
			const milestoneId = hasMilestone
				? meta.milestoneIds[Math.floor(rand() * meta.milestoneIds.length)]
				: undefined;

			const hasTags = rand() < 0.3;
			const tags: string[] = [];
			if (hasTags) {
				const tagCount = Math.floor(rand() * 2) + 1;
				const shuffledTags = [...TAGS_POOL].sort(() => rand() - 0.5);
				for (let t = 0; t < tagCount; t++) {
					tags.push(shuffledTags[t]);
				}
			}

			const createdDaysAgo = Math.floor(rand() * 60) + 1;

			const issueId = await ctx.db.insert("issues", {
				workspaceId: args.workspaceId,
				projectId,
				identifier: `VEL-${padId(issueNumber)}`,
				title: template.title,
				description: template.description,
				status,
				priority,
				type: template.type,
				assigneeId,
				labelIds: labelIds.length > 0 ? labelIds : undefined,
				startDate,
				dueDate,
				sortOrder: ti + 1,
				estimate,
				tags: tags.length > 0 ? tags : undefined,
				createdBy,
				completedAt,
				sprintId,
				milestoneId,
				updatedAt: hoursAgo(Math.floor(rand() * 48)),
			});

			issueIds.push(issueId);
			issueNumber++;
		}
	}

	return { issueIds, nextIssueNumber: issueNumber };
}

// ── Batch 1: Issues 1-250 (projects 0-4) ────────────────────────────────────

export const seedIssuesBatch1 = internalMutation({
	args: batchArgs,
	handler: async (ctx, args) => {
		const startNum = args.startIssueNumber ?? 1;
		const { issueIds, nextIssueNumber } = await createIssuesForProjects(
			ctx,
			args,
			[0, 4],
			startNum,
		);

		await ctx.scheduler.runAfter(0, internal.demo.seedIssues.seedIssuesBatch2, {
			...args,
			startIssueNumber: nextIssueNumber,
			allIssueIds: [...(args.allIssueIds ?? []), ...issueIds],
		});
	},
});

// ── Batch 2: Issues 251-500 (projects 5-9) ──────────────────────────────────

export const seedIssuesBatch2 = internalMutation({
	args: batchArgs,
	handler: async (ctx, args) => {
		const startNum = args.startIssueNumber ?? 251;
		const { issueIds, nextIssueNumber } = await createIssuesForProjects(
			ctx,
			args,
			[5, 9],
			startNum,
		);

		await ctx.scheduler.runAfter(0, internal.demo.seedIssues.seedIssuesBatch3, {
			...args,
			startIssueNumber: nextIssueNumber,
			allIssueIds: [...(args.allIssueIds ?? []), ...issueIds],
		});
	},
});

// ── Batch 3: Issues 501-750 (projects 10-14) ────────────────────────────────

export const seedIssuesBatch3 = internalMutation({
	args: batchArgs,
	handler: async (ctx, args) => {
		const startNum = args.startIssueNumber ?? 501;
		const { issueIds, nextIssueNumber } = await createIssuesForProjects(
			ctx,
			args,
			[10, 14],
			startNum,
		);

		await ctx.scheduler.runAfter(0, internal.demo.seedIssues.seedIssuesBatch4, {
			...args,
			startIssueNumber: nextIssueNumber,
			allIssueIds: [...(args.allIssueIds ?? []), ...issueIds],
		});
	},
});

// ── Batch 4: Issues 751-1000 (projects 15-19) + sub-issues + relations ──────

export const seedIssuesBatch4 = internalMutation({
	args: batchArgs,
	handler: async (ctx, args) => {
		const startNum = args.startIssueNumber ?? 751;
		const { issueIds, nextIssueNumber } = await createIssuesForProjects(
			ctx,
			args,
			[15, 19],
			startNum,
		);

		const allIssueIds = [...(args.allIssueIds ?? []), ...issueIds];
		const rand = seededRandom(42424242);

		// ── Sub-issues: 100 sub-issues for 50 parent issues ──────────────
		let subIssueNumber = nextIssueNumber;
		const subIssueIds: Id<"issues">[] = [];

		// Pick 50 parent issues distributed across projects
		const parentIndices: number[] = [];
		for (let i = 0; i < 50; i++) {
			const idx = Math.floor(rand() * allIssueIds.length);
			if (!parentIndices.includes(idx)) {
				parentIndices.push(idx);
			} else {
				// retry once
				const retryIdx = Math.floor(rand() * allIssueIds.length);
				if (!parentIndices.includes(retryIdx)) {
					parentIndices.push(retryIdx);
				}
			}
		}

		for (const parentIdx of parentIndices) {
			const parentId = allIssueIds[parentIdx];
			if (!parentId) continue;

			for (let s = 0; s < 2; s++) {
				const subPrefix =
					s === 0 ? "Write unit tests for" : "Update documentation for";
				const subIssueId = await ctx.db.insert("issues", {
					workspaceId: args.workspaceId,
					parentId,
					identifier: `VEL-${padId(subIssueNumber)}`,
					title: `${subPrefix} parent issue`,
					description: `Sub-task generated for VEL-${padId(parentIdx + 1)}.`,
					status: weightedPick(STATUSES, STATUS_WEIGHTS, rand),
					priority: weightedPick(PRIORITIES, PRIORITY_WEIGHTS, rand),
					type: "issue",
					assigneeId: args.userIds[Math.floor(rand() * args.userIds.length)],
					sortOrder: s + 1,
					createdBy: args.creatorUserId,
					updatedAt: hoursAgo(Math.floor(rand() * 24)),
				});
				subIssueIds.push(subIssueId);
				subIssueNumber++;
			}
		}

		// ── Issue relations: 50 relations ────────────────────────────────
		// 25 "blocks" pairs
		for (let r = 0; r < 25; r++) {
			const aIdx = Math.floor(rand() * allIssueIds.length);
			let bIdx = Math.floor(rand() * allIssueIds.length);
			if (bIdx === aIdx) bIdx = (bIdx + 1) % allIssueIds.length;

			const issueA = allIssueIds[aIdx];
			const issueB = allIssueIds[bIdx];
			if (!issueA || !issueB) continue;

			await ctx.db.insert("issueRelations", {
				issueId: issueA,
				relatedIssueId: issueB,
				type: "blocks",
				createdBy: args.creatorUserId,
				createdAt: daysAgo(Math.floor(rand() * 30)),
			});

			await ctx.db.insert("issueRelations", {
				issueId: issueB,
				relatedIssueId: issueA,
				type: "blocked_by",
				createdBy: args.creatorUserId,
				createdAt: daysAgo(Math.floor(rand() * 30)),
			});
		}

		// 25 "relates_to" pairs (cross-project)
		for (let r = 0; r < 25; r++) {
			const aIdx = Math.floor(rand() * allIssueIds.length);
			let bIdx = Math.floor(rand() * allIssueIds.length);
			if (bIdx === aIdx) bIdx = (bIdx + 1) % allIssueIds.length;

			const issueA = allIssueIds[aIdx];
			const issueB = allIssueIds[bIdx];
			if (!issueA || !issueB) continue;

			await ctx.db.insert("issueRelations", {
				issueId: issueA,
				relatedIssueId: issueB,
				type: "relates_to",
				createdBy: args.creatorUserId,
				createdAt: daysAgo(Math.floor(rand() * 30)),
			});
		}

		// ── Schedule next phase ──────────────────────────────────────────
		await ctx.scheduler.runAfter(
			0,
			internal.demo.seedContent.seedDocumentsAndBoards,
			{
				workspaceId: args.workspaceId,
				creatorUserId: args.creatorUserId,
				userIds: args.userIds,
				labelIds: args.labelIds,
				projectIds: args.projectIds,
				allIssueIds: [...allIssueIds, ...subIssueIds],
			},
		);
	},
});
