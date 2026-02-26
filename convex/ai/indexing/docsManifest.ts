/**
 * Documentation Page Manifest — Static content for RAG indexing.
 *
 * Contains plain-text representations of all product documentation pages.
 * MDX frontmatter is stripped; markdown syntax is preserved as-is since
 * headings and lists provide useful structure for search relevance.
 *
 * Used by the docsIndexer to embed documentation into the global:docs
 * RAG namespace so the AI assistant can answer product questions.
 */

export interface DocPage {
	slug: string;
	title: string;
	section: string;
	content: string;
}

export const DOC_PAGES: DocPage[] = [
	// ── Getting Started ─────────────────────────────────────────────────
	{
		slug: "getting-started/signing-up",
		title: "Signing up",
		section: "Getting Started",
		content: `Signing up

Create your account

Clave supports two ways to sign in: Google OAuth and email/password. You can create a new account or sign in to an existing one on the same screen.

Navigate to the Clave sign-in page. You will see the Clave logo and a sign-in form.

Sign in with Google

Signing in with Google is the fastest way to get started.

1. Click Continue with Google.
2. A Google sign-in popup or redirect will open.
3. Select the Google account you want to use.
4. Grant Clave the requested permissions.

You are signed in and redirected to the organizations page.

Sign in with email and password

If you prefer not to use Google, you can sign in with an email and password.

Create a new account

1. Click Sign up at the bottom of the sign-in card.
2. Enter your name, email address, and a password (at least 6 characters).
3. Click Create account.

You are signed in and redirected to the organizations page.

Sign in to an existing account

1. Enter your email address and password.
2. Click Sign in or press Enter.

If your credentials are correct, you are redirected to the organizations page.

What happens after signing in

After your first sign-in, Clave takes you to the Organizations page. From here you can create a new organization or join an existing one with an invite code.`,
	},
	{
		slug: "getting-started/creating-an-organization",
		title: "Creating an organization",
		section: "Getting Started",
		content: `Creating an organization

What is an organization?

An organization is the highest level in Clave's structure. It holds one or more workspaces, manages team membership, and owns billing. Think of it as your company or team account.

You can belong to multiple organizations and switch between them from the Clave header.

Create your first organization

After signing in, you land on the Organizations page.

1. Click Create organization.
2. A dialog opens asking for: Name (display name for your organization) and URL slug (short identifier used in workspace URLs, auto-generated from name).
3. Click Create organization.

Organization roles

Owner: Full access — manage members, billing, settings, and delete the org.
Admin: Manage members and settings, but not billing or org deletion.
Member: Access workspaces they are invited to.

The person who creates an organization is the owner by default.

Managing organization settings

Click the organization name in the header and select Settings. Settings include General, Members, Invite codes, and Billing sections.

Join an existing organization

On the Organizations page, click Join. Enter the invite code your teammate shared with you and click Join organization.`,
	},
	{
		slug: "getting-started/creating-a-workspace",
		title: "Creating a workspace",
		section: "Getting Started",
		content: `Creating a workspace

What is a workspace?

A workspace is a shared environment within an organization. It contains all your team's work: projects, issues, documents, whiteboards, tasks, and more. You can have multiple workspaces in one organization.

Workspaces have their own member lists, settings, and AI context.

Create a workspace

From the Organizations page, click an organization to open it. Then:

1. Click New workspace (or the + button).
2. Enter Name, URL slug, and Visibility (Public or Private).
3. Click Create workspace.

You are taken directly into the new workspace, starting at the Projects view.

Workspace visibility

Public: Anyone in the organization can discover and join this workspace.
Private: Only members who are explicitly invited can access it.

You can change visibility later in workspace settings.

Switch between workspaces

The workspace selector sits at the top of the left sidebar. Click it to see all workspaces you have access to, and click any workspace to switch to it. You can also switch organizations from the same menu.`,
	},
	{
		slug: "getting-started/inviting-teammates",
		title: "Inviting teammates",
		section: "Getting Started",
		content: `Inviting teammates

How inviting works in Clave

Clave uses invite codes to bring people in. There are two levels: Organization invite codes (join the organization) and Workspace invite codes (join a specific workspace).

Generate an organization invite code

You need to be an admin or owner of the organization.

1. Go to Organization Settings.
2. Select the Invite codes tab.
3. Click Generate invite code.
4. Copy the 6-character code that appears.

Share the code with your teammate. They enter it on the Organizations page by clicking Join.

Invite code options

Max uses: The code expires after a set number of uses.
Expiration: Set a time limit (24 hours, 7 days, etc.).

How a teammate joins

Joining an organization: Sign in, go to Organizations page, click Join, enter the invite code.
Joining a private workspace: A workspace admin generates a workspace invite code and shares it.

Manage members

Organization members: View and manage in Organization Settings > Members.
Workspace members: View and manage in Workspace Settings > Members.

Remove a member

From Organization Settings > Members to remove from the entire org, or Workspace Settings > Members to remove from just one workspace.`,
	},
	{
		slug: "getting-started/navigating-the-app",
		title: "Navigating the app",
		section: "Getting Started",
		content: `Navigating the app

The sidebar

The left sidebar is your main navigation in Clave. It is always visible while you are inside a workspace.

Workspace selector: At the top. Switch between workspaces or organizations.

Main navigation sections: Chat, Inbox, My issues, Projects, Docs, Boards, Clients, Performance. A badge on Inbox shows unread notification count.

Recents: Tracks the last items you visited. Click any item to jump back.

Favorites: Items you have starred. Persist across sessions.

Active Projects: Projects currently in progress.

User menu: At the bottom. Access account settings, workspace settings, or sign out.

Collapse the sidebar

Click the collapse toggle to switch to icon-only mode. Click again to expand.

Search

The Search bar at the top of the sidebar lets you find items across the workspace. Press Cmd+K to open the command palette.

Command palette

Open with Cmd+K (Mac) or Ctrl+K (Windows/Linux). Jump to any project, document, issue, or board. Create new items. Run AI actions. Access settings. Start typing to filter results.

Keyboard shortcuts

Cmd+K: Open command palette.
Cmd+J: Open AI chat.

More keyboard shortcuts available in the Keyboard shortcuts page.`,
	},
	// ── Features — Projects ─────────────────────────────────────────────
	{
		slug: "features/projects/creating-projects",
		title: "Creating Projects",
		section: "Features / Projects",
		content: `Creating Projects

Projects are the top-level containers for your team's work in Clave. Each project groups related issues, sprints, documents, boards, and files in one place.

Creating a new project

Quick create: Navigate to Projects in the sidebar. Click New project. Type a project title (the only required field). Optionally pick an emoji icon. Use property chips for Priority, Client, and Tags. Click Create project or press Cmd+Enter.

Expanded create: In the quick create modal, click Show details to reveal additional fields.

Project fields: Title, Icon, Summary, Description, Priority (No priority/Low/Medium/High/Urgent), Status (Backlog/Planned/Active/Completed/Cancelled), Lead, Client, Start date, End date, Methodology (Linear/Sprints/Kanban), Tags.

Project statuses: Backlog (not started), Planned (default for new projects), Active (in progress), Completed (delivered), Cancelled (stopped).

Project methodology: Linear (flat list), Sprints (time-boxed cycles), Kanban (board by status). You can change later.

Editing a project: Open the project, click the project name in the header, update fields, click Save changes.

Adding team members: From project detail Overview tab, click Add member.

Assigning a lead: Set during creation or update later in the edit dialog.`,
	},
	{
		slug: "features/projects/milestones-and-sprints",
		title: "Milestones and Sprints",
		section: "Features / Projects",
		content: `Milestones and Sprints

Sprints help you plan work in focused time-boxed cycles. Each sprint has a name, optional description, start date, and target end date.

Sprints are available on projects that use the Sprints methodology.

Creating a sprint

1. Open your project.
2. Find the Sprints section or sprint panel.
3. Click New sprint.
4. Enter the sprint name (required), optional description, start and target dates.
5. Click Create.

Sprint fields: Name (required), Description (optional), Start date, Target date.

Editing a sprint: Find the sprint, click the three-dot menu or sprint name, select Edit sprint, update fields, click Save changes.

Assigning issues to sprints

When creating an issue: Select a project first, then choose the sprint from the Sprint picker.
From the issue detail page: Click the Sprint field in the properties sidebar.
From the board or list view: Click an issue to open properties panel.

Sprint progress: Shows complete vs. total issues, status breakdown, blocked or overdue issues.

Removing an issue from a sprint: Open the issue detail, click Sprint field, select a different sprint or clear the assignment.`,
	},
	{
		slug: "features/projects/project-dashboard",
		title: "Project Dashboard",
		section: "Features / Projects",
		content: `Project Dashboard

The project dashboard gives you a real-time view of your project's health. Open any project and click the Dashboard tab.

Overview metrics: Overdue open (past due date), Blocked open (blocking relations), Cycle time P50 (median days to complete), Scope delta (created minus completed in 30 days), Cancellation rate.

Completion chart: Circular progress showing overall completion percentage.

Issues by status: Bar chart showing Triage, Backlog, Todo, In progress, In review, Done, Cancelled counts.

Issues by assignee: Bar chart showing issue count and completion rate per team member.

Project updates: Post status updates with health indicators (On track, At risk, Off track). Updates appear in a chronological feed.

Knowledge tab: All documents and whiteboards linked to the project. Filter by All, Docs, or Boards. Sort by Recent, Title, or Type. Create new documents or boards linked to the project.

Resources tab: Files and external links. Filter by All, Images, Documents, PDFs, or Links. Upload files or add external link URLs.

Activity tab: Chronological feed of all changes — status changes, assignments, comments.`,
	},
	{
		slug: "features/projects/backlog",
		title: "Backlog",
		section: "Features / Projects",
		content: `Backlog

The backlog is your holding area for issues not yet committed to a sprint. Any issue without a sprint assignment lives in the backlog.

Accessing the backlog: From a project, click the Issues tab. Issues without a sprint appear in the backlog section.

Prioritizing issues: Use the Priority field — Urgent, High, Medium, Low, No priority.

Reordering issues: In list view with Manual ordering, drag issues to reorder.

Moving issues into a sprint: Open the issue, click the Sprint field, select the target sprint.

Filtering the backlog: Filter by Status, Priority, Assignee, Label, Type using the Filter button.

Grouping and display options: Group by status, priority, assignee, project, or sprint. Order by manual position, status, priority, creation date, or due date. Toggle sub-issues and empty groups.`,
	},
	// ── Features — Issues ───────────────────────────────────────────────
	{
		slug: "features/issues/creating-issues",
		title: "Creating Issues",
		section: "Features / Issues",
		content: `Creating Issues

Issues are the atomic units of work in Clave. Every bug, feature request, or task lives as an issue with a unique identifier (like CLV-042).

Creating an issue

Quick-create: Press C anywhere to open the quick issue creation modal. Type a title and press Enter.

Full create: Press Shift+C or click New issue for the full modal with title, description editor, and properties sidebar.

From within a project: Navigate to project's Issues tab and click New issue — automatically linked to that project.

Issue fields: Title (required), Description (rich text), Status (Triage/Backlog/Todo/In progress/In review/Done/Cancelled), Priority (Urgent/High/Medium/Low/No priority), Type (Issue/Bug/Improvement/Feature), Assignee, Project, Sprint, Labels, Estimate (1/2/3/5/8/13 points), Due date.

Issue identifiers: Auto-generated in PREFIX-NNN format (e.g., CLV-001). Immutable.

AI-assisted triage: When you type a title, AI suggests Priority, Type, and Labels. Click Apply to accept or Dismiss to ignore.

Duplicate detection: AI checks for similar existing issues and warns you if matches are found.

Create more: Enable the toggle to keep the modal open after each creation.`,
	},
	{
		slug: "features/issues/board-list-timeline",
		title: "Board, List, and Timeline Views",
		section: "Features / Issues",
		content: `Board, List, and Timeline Views

Three ways to view issues: kanban board, flat list, and timeline. Switch between them using the Display button (gear icon) or press Shift+V.

Board view: Issues as cards in columns by status. Drag cards between columns to change status. Swimlanes available: Assignee, Priority, Sprint, None. Click + at the bottom of any column to create a new issue.

List view: Issues in rows. Sort by Manual, Status, Priority, Created, Updated, Due date. Group by status, priority, assignee, project, or sprint. Toggle display properties: Identifier, Priority, Status, Labels, Assignee, Project, Sprint, Estimate, Due date, Created date, Updated date. Show sub-issues inline.

Timeline view: Gantt-style chart based on due dates. Click and drag edges to extend/shorten duration. Drag middle to shift date range. Respects same grouping options as list view.

Display options: Layout (Board/List/Timeline), Grouping, Sub-grouping, Ordering, Swimlanes (board only), Show sub-issues, Show empty groups, Reset.`,
	},
	{
		slug: "features/issues/issue-details",
		title: "Issue Details",
		section: "Features / Issues",
		content: `Issue Details

The issue detail page is the full-screen view for a single issue. URL uses the issue's identifier (e.g., /issues/CLV-042).

Layout: Left panel (title, description, sub-issues, relations, attachments, activity). Right panel (properties sidebar).

Title: Click to edit inline. Press Enter to save.

Description: Rich-text editor with headings, bold, italic, code blocks, lists, checkboxes. AI Draft description button generates a starter description.

Sub-issues: Listed below description. Click Add sub-issue to create a child issue. Sub-issues inherit the parent's project.

Relations: Blocks, Blocked by, Related to, Duplicate of. Click Add relation to link issues.

Attachments: Files, linked documents, and whiteboards.

Activity and comments: Chronological log of all changes. Post comments with Cmd+Enter. @mention workspace members.

Properties sidebar: Status, Assignee, Priority, Labels, Project, Sprint, Type, Estimate, Due date, Branch (Git). Timestamps for created, updated, completed.

Toolbar actions: Favorite, Subscribe/Unsubscribe, Copy link, Copy identifier, Toggle properties, Options menu (delete).`,
	},
	{
		slug: "features/issues/labels-and-filters",
		title: "Labels and Filters",
		section: "Features / Issues",
		content: `Labels and Filters

Labels: Free-form tags for categorizing issues. An issue can have multiple labels.

Creating labels: Workspace settings > New label. Enter name, choose a color.

Applying labels: In the full create modal, from the issue detail page, or from the board/list view.

Filters: Click Filter button in the issues toolbar. Available filter dimensions: Status, Priority, Assignee, Label, Type, Sprint, Project.

Combining filters: AND logic between dimensions, OR logic within a dimension.

Display options: Grouping (by status/priority/assignee/project/sprint), Ordering (manual/priority/status/created/updated/due date), Sub-issues toggle, Empty groups toggle.

My issues filter: Shows issues assigned to you across all projects.`,
	},
	{
		slug: "features/issues/sub-issues-and-relations",
		title: "Sub-issues and Relations",
		section: "Features / Issues",
		content: `Sub-issues and Relations

Sub-issues

A sub-issue is a child issue nested under a parent. Each has its own status, assignee, priority, and identifier.

Creating a sub-issue: From the parent issue's detail page, find Sub-issues section, click Add sub-issue, type the title and press Enter.

Viewing the hierarchy: In list view, enable Show sub-issues. In board view, sub-issues appear as cards with a parent indicator badge.

Sub-issue progress: Parent shows count of sub-issues and how many are complete.

Relations

Types: Blocks (must be resolved first), Blocked by (cannot proceed), Related to (general connection), Duplicate of (same issue).

Adding a relation: Open issue detail, find Relations section, click Add relation, choose type, search for target issue.

How relations affect workflows: Blocking relations show as "Blocked open" in project dashboard. Duplicate relations help consolidate reports.

Removing a relation: Hover over relation entry, click X button.`,
	},
	// ── Features — Documents ────────────────────────────────────────────
	{
		slug: "features/documents/creating-documents",
		title: "Creating Documents",
		section: "Features / Documents",
		content: `Creating Documents

Documents are rich-text pages for meeting notes, specs, runbooks, or any long-form content.

Create a new document: From the sidebar, click Docs, then New document. Enter a title, optionally assign to a project, click Create.

From a project: Create from the Knowledge tab — automatically linked.

Set a title and icon: Click the title field to edit. Click the emoji icon to pick an emoji.

Add a cover image: Hover over the title area, click Add cover, select an image (max 5 MB). Reposition by clicking Reposition and dragging.

Favorite a document: Click the star icon in the header.

Document actions: Copy link, Delete document. Also rename, duplicate, or share from the Documents list.

Organize documents: Filter by project, sort by Recent/Title/Project, switch between card grid and list view.

Delete a document: Open the document, click the three-dot menu, select Delete document. Permanent and cannot be undone.`,
	},
	{
		slug: "features/documents/rich-editing",
		title: "Rich Editing",
		section: "Features / Documents",
		content: `Rich Editing

Clave documents use a block-based rich text editor. Every piece of content is a block you can format, rearrange, and transform.

Text formatting: Bold (Cmd+B), Italic (Cmd+I), Strikethrough, Inline code, Links (Cmd+K), Text color and highlight.

Slash commands: Type / to open the menu.

AI commands: Continue writing, Summarize above, Write from prompt, Improve writing, Translate, Dictate with voice.

Basic blocks: Text, Heading 1-3, Bulleted list, Numbered list, To-do list, Toggle, Code Block, Table, Blockquote, Callout.

Media: Image, Video, Video Embed, GIF.

Advanced blocks: Table of contents, 2 columns, 3 columns, Equation, Excalidraw embed, Code Drawing (Mermaid, PlantUML, Graphviz).

Inline elements: Mention (@), Date, Inline Equation.

Tables: Insert with /Table. Click cells to edit, hover for insert/delete, drag to reorder.

Drag and drop: Every block has a drag handle on the left side.

Inline AI (Cmd+I): Select text, press Cmd+I to open inline AI menu. Actions: rewrite, shorten, expand, summarize.`,
	},
	{
		slug: "features/documents/collaboration",
		title: "Collaboration",
		section: "Features / Documents",
		content: `Collaboration

Clave documents support real-time collaborative editing. Multiple people can work in the same document simultaneously.

Seeing who's online: Avatars appear in the document header. Hover to see names.

Editing together: No lock or checkout system. Everyone edits freely. Changes merged using conflict-free real-time sync.

Last edited indicator: Shows who last edited and when.

How sync works: Yjs-based operational transformation. Character-level merging. No conflicts requiring manual resolution. Local changes queued during disconnection and synced on reconnection. Continuous auto-save.

Opening comments: Click Add comment below the title or the comment icon in the header to open the comments sidebar.`,
	},
	{
		slug: "features/documents/comments-and-threads",
		title: "Comments and Threads",
		section: "Features / Documents",
		content: `Comments and Threads

Comments annotate specific passages in a document with threaded discussions.

Open the comments sidebar: Click the comment bubble icon in the document header.

Add a comment: Select text, click the comment icon in the floating toolbar, type your comment, press Enter or Submit.

Comment threads: Each comment starts a thread. Click a thread in the sidebar to reply.

@mentioning teammates: Type @ followed by a name to notify them.

Edit or delete a comment: Hover over your comment for edit (pencil) and delete (trash) icons.

Resolve a thread: Open the thread, click the Resolve button (checkmark). Resolved threads shown with reduced opacity. Click Unresolve to reopen.

Thread sorting: Unresolved threads first, then by creation time (newest first).

Comments notifications: @mentions in comments generate inbox notifications.`,
	},
	{
		slug: "features/documents/sharing",
		title: "Sharing Documents",
		section: "Features / Documents",
		content: `Sharing Documents

Open the Share dialog: Click the Share button in the document header.

Visibility settings: Private (only you and explicitly shared people), Workspace (anyone in workspace), Public (anyone with the link, no login required).

Copy the share link: Available when visibility is Workspace or Public.

Share with specific people: Search for teammates, set access level (view or edit).

Revoke access: Remove specific people from the Share dialog. Change visibility back to Private to revoke all public access.

Regenerate the share token: Click Regenerate link to invalidate old links.

External viewers see: Title, cover image, all content formatted normally. No editing controls, no sidebar, no navigation. Comments not visible.`,
	},
	// ── Features — Whiteboards ──────────────────────────────────────────
	{
		slug: "features/whiteboards/creating-boards",
		title: "Creating Whiteboards",
		section: "Features / Whiteboards",
		content: `Creating Whiteboards

Whiteboards are infinite canvas spaces for diagramming, wireframing, brainstorming, and planning.

Create a new whiteboard: Click Boards in the sidebar, click New board. Enter a title, optionally assign to a project, click Create.

Set a title and emoji: Click the title in the header to edit. Click the emoji icon to pick one.

Canvas basics: Pan with Space+drag or scroll wheel. Zoom with Cmd/Ctrl+scroll. Fit to screen with Shift+1. Click to select elements, drag on empty space for selection rectangle.

Favorite a whiteboard: Click the star icon in the header.

Whiteboard actions: Rename, Copy link, Share, Duplicate, Delete.

Save indicator: Auto-saves. Shows Saving... and Saved indicators.

Delete a whiteboard: Click the three-dot menu, select Delete whiteboard. Permanent.`,
	},
	{
		slug: "features/whiteboards/drawing-tools",
		title: "Drawing Tools",
		section: "Features / Whiteboards",
		content: `Drawing Tools

Powered by Excalidraw. Toolbar on the left side of the canvas.

Tool palette: Selection (V), Rectangle (R), Diamond (D), Ellipse (O), Arrow (A), Line (L), Freehand (P), Text (T), Image (9), Frame (F), Laser pointer (K), Eraser (E).

Drawing shapes: Select tool, click and drag. Hold Shift for equal width/height.

Arrows and connectors: Select Arrow tool, drag from shape to shape. Bound connectors move with shapes.

Text: Select Text tool, click to place. Double-click any shape to add text inside.

Freehand: Click and drag to draw freely. Good for annotations.

Images: Select Image tool, click canvas, select file. Also paste from clipboard.

Styling elements: Stroke color, Background color, Stroke width, Stroke style (solid/dashed/dotted), Fill style, Opacity, Roundness, Edge style (arrows), Font (Virgil/Helvetica/Cascadia), Font size, Text alignment.

AI whiteboard tools: Generate diagram (describe and AI draws), Explain diagram (AI explains selected elements), Clean up layout (reorganize elements).

Keyboard shortcuts: Undo (Cmd+Z), Redo (Cmd+Shift+Z), Copy, Paste, Duplicate (Cmd+D), Delete, Group (Cmd+G), Send to back, Bring to front, Lock element, Zoom in/out, Fit to screen (Shift+1).`,
	},
	{
		slug: "features/whiteboards/collaboration",
		title: "Whiteboard Collaboration",
		section: "Features / Whiteboards",
		content: `Whiteboard Collaboration

Real-time collaborative drawing. Teammates' changes appear instantly.

Presence avatars: Other users shown as avatars in the header.

Comment pins: Attach threaded discussions to specific locations on the canvas.

Enable comment mode: Click the comment bubble icon in the header.

Add a comment pin: Enable comment mode, click Add comment in the sidebar, click on canvas to place pin, type comment and press Enter.

Read and reply: Click a pin badge or thread in the sidebar.

@mention teammates: Type @ in comments.

Resolve a thread: Click Resolve. Click Unresolve to reopen.

Comment mode and drawing: Can be active at the same time.`,
	},
	{
		slug: "features/whiteboards/sharing",
		title: "Sharing Whiteboards",
		section: "Features / Whiteboards",
		content: `Sharing Whiteboards

Open the Share dialog: Click Share in the whiteboard header.

Visibility: Private, Workspace, or Public.

Copy the share link: Available for Workspace or Public visibility. Public links open at /share/board/[token] as read-only.

Share with specific people: Search for teammates, set permissions.

Revoke access: Remove individuals or change visibility to Private.

Regenerate share token: Creates new token, old link becomes invalid.

External viewers see: Full canvas with all elements, board title and emoji, zoom and pan controls, but no editing tools, no comment pins.`,
	},
	// ── Features — Tasks, Clients, Files, Notes ─────────────────────────
	{
		slug: "features/tasks",
		title: "Tasks",
		section: "Features",
		content: `Tasks

Personal work tracker inside a workspace. Unlike project issues, tasks are focused on what's assigned to you.

Open Tasks: Click Tasks in the left sidebar.

Create a task: Click New Task. Fields: Title (required), Status (Todo/In Progress/In Review/Done), Priority, Project (optional), Due date, Start date, Assignee (defaults to you), Description, Tags.

Views: List view (tasks as rows grouped by project) and Board view (kanban by status with drag-and-drop).

Filter tasks: By Status, Priority, Project, Tags, Assignee, Due date.

Task detail: Click any task to open the detail sheet. Edit fields, view comments, see activity.

Bulk actions: Shift+click to select multiple. Bulk action bar for status, priority, project updates, or deletion.

Ask AI: Click Ask AI button for AI chat with task context.

Tasks vs. Issues: Tasks are personal (assigned to you), issues are project-wide (visible to team). Tasks live in My Tasks view, issues in project views.`,
	},
	{
		slug: "features/clients",
		title: "Clients",
		section: "Features",
		content: `Clients

Lightweight CRM built into Clave. Track organizations, manage contacts, link to projects.

Open Clients: Click Clients in the left sidebar.

Add a client: Click New client. Fields: Client name (required), Status (Prospect/Active/On hold/Archived), Primary contact name, Primary contact email, Industry, Location, Website, Notes.

Client statuses: Prospect (exploring), Active (work ongoing), On hold (paused), Archived (no longer active).

View a client: Click any client row for the detail page with all info and linked projects.

Edit a client: Click Edit from the detail page. All fields editable.

Link clients to projects: Projects linked when a project is created or edited with the client selected.

Delete a client: Click the three-dot menu, select Delete. Does not delete linked projects.

Filter by status: Use the status filter on the Clients list page.`,
	},
	{
		slug: "features/files",
		title: "Files",
		section: "Features",
		content: `Files

File storage for your workspace. Accessible to all workspace members.

Open Files: Click Files in the left sidebar.

File storage is coming to Clave. When available: Upload files from your computer, preview common file types, link files to projects and issues, organize by project/type/date, share via link.

Files in issues and projects: You can already attach files to issues using the Attachments section.

File types: Images (PNG, JPG, GIF, SVG, WebP), Documents (PDF, DOCX, XLSX, PPTX), Video and audio, Archives (ZIP, TAR), Code and text files.

Storage limits depend on your workspace plan.`,
	},
	{
		slug: "features/notes",
		title: "Notes",
		section: "Features",
		content: `Notes

Shared scratchpad for your workspace. Quick thoughts, meeting agendas, team announcements.

Open Notes: Click Notes in the left sidebar. Opens directly — no list view.

Writing: Block-based editor. Supports headings (#, ##, ###), bulleted lists (-), numbered lists (1.), to-do checkboxes ([]), code blocks, blockquotes (>), slash commands (/).

Notes vs. Documents: Notes are for quick team notes (one per workspace). Documents are for long-form structured content (many individual documents with titles, cover images, comment threads, and public sharing).

Saving: Automatic as you type.

Workspace notes: Shared across all workspace members. One notes page per workspace.`,
	},
	{
		slug: "features/overview",
		title: "Features overview",
		section: "Features",
		content: `Features overview

Clave is a unified workspace combining project management, issue tracking, real-time documents, whiteboards, and a deeply integrated AI assistant.

Project management: Track work from idea to delivery. Milestones, sprint cycles, backlog, team members, status updates. Dashboard with completion rates and activity.

Issue tracking: Create, assign, and triage issues. Kanban, list, and timeline views. Sub-issues, blocking relations, labels, priorities, sprints. AI auto-triage.

Documents: Rich block-based editor with headings, code blocks, tables, embeds, slash commands, inline AI. Real-time collaboration with live cursors.

Whiteboards: Infinite canvas powered by Excalidraw. Shapes, text, images, comment pins. AI can generate diagrams or explain existing ones.

Personal tasks: To-do list with kanban board or flat list. Title, status, priority, due date, project link.

Clients: Lightweight CRM. Client companies, contacts, notes. Link clients to projects.

Files: Upload and store files. Attach to issues, documents, projects.

Notes: Quick scratch pad. Lightweight block editor with auto-save.

AI chat and agents: Cmd+J for sidebar chat. Workspace-aware AI that reads issues, docs, projects. Preset agents (Project Manager, Technical Writer, Code Reviewer) and custom sub-agents.

Inbox and notifications: Every @mention, assignment, comment, and status change. Grouped, filterable, real-time. Snooze and AI smart digest.

Analytics: Performance dashboard with on-track rate, completed issues, cycle time, blocked work, scope delta. Filter by project or member. Export PDF.

Settings: Customize issue types, statuses, priorities, labels. Configure AI behavior. GitHub integration, MCP servers, members, billing.`,
	},
	// ── AI ───────────────────────────────────────────────────────────────
	{
		slug: "ai/overview",
		title: "AI Overview",
		section: "AI",
		content: `AI Overview

Clave is AI-native from the ground up. The AI understands your actual workspace — projects, issues, documents, sprints, and team members.

What makes Clave AI-native: The AI is connected to your workspace. It searches issues, reads documents, checks project data before answering. When asked to do something, it acts directly in your workspace with approval for consequential actions.

AI capabilities: Chat (conversational sidebar and dedicated page), Tools and actions (20+ workspace tools), Sub-agents (specialized AI personas), Skills (composable instruction sets), Inline AI (in document editor), Issue AI (auto-triage, descriptions, duplicates, @AI comments), Voice (dictation and transcription).

How AI accesses your workspace: Issues, Projects, Documents, Whiteboards, Notifications, Team members, GitHub repos.

Approval for consequential actions: Create issue, mark as done, create project — shows approval card. Less consequential actions execute immediately.

Rate limiting: Usage subject to plan limits. Banner appears when limit reached.`,
	},
	{
		slug: "ai/chat",
		title: "AI Chat",
		section: "AI",
		content: `AI Chat

Main interface for talking with Clave's AI. Sidebar or full-page view with thread browser.

Opening: Sidebar with Cmd+J. Full page from Chat in sidebar.

Starting a conversation: Type in the input field, press Enter. Real-time streaming. New chat icon for new conversation.

Thread browser: Click History icon. Threads listed by recency. Rename or delete threads.

Choosing a model: GPT 5.2 (default, fast) or Kimi K2.5 (higher-capacity). Selection persists per conversation.

Context chips: Auto-added when on a specific page (issue, document, project). Tells AI what you're looking at.

Mentioning items: Type @ to bring up mention picker. Search issues, documents, projects, team members.

Artifacts: Substantial content rendered as artifact cards (code with syntax highlighting, markdown, tables, diagrams). Expand icon for side-by-side view.

MCP server connections: Click MCP button in chat toolbar to connect external tools.

Incognito mode: Messages not saved to thread history.

Approval cards: Shown for consequential actions. Click Approve or Reject.

Voice input: Click microphone icon or Cmd+Shift+V.

Shortcuts: Cmd+J (toggle sidebar), Enter (send), Shift+Enter (new line), Cmd+Shift+V (voice).`,
	},
	{
		slug: "ai/tools-and-actions",
		title: "Tools and actions",
		section: "AI",
		content: `Tools and actions

The AI can read your workspace data and take actions. These are called tools. The AI chooses which tools to use based on your request.

Read tools: Search issues (text search, filter by status/priority/assignee/project), Get issue details, List projects, Get project details, Search documents, Get document (full text), List workspace members, List labels, List sprints, Get activity, Get notifications, Search project knowledge (semantic + keyword search), Search code (GitHub semantic search), Global search (across everything).

Write tools: Create issue (requires approval), Update issue (some need approval), Assign issue, Batch update issues (always requires approval), Add comment, Create document, Create project (requires approval), Create label, Generate whiteboard diagram.

Just describe your request naturally. The AI selects appropriate tools and shows approval cards where needed.`,
	},
	{
		slug: "ai/sub-agents",
		title: "Sub-agents",
		section: "AI",
		content: `Sub-agents

Specialized AI personas for specific jobs. Tuned with focused instructions, specific tool access, and knowledge scope.

Built-in presets:
- Project Manager: Sprint planning, issue decomposition, priority decisions, status reporting.
- Technical Writer: Documentation, specifications, summaries, onboarding guides.
- Code Reviewer: Code quality, security issues, change reviews.

Using sub-agents: Type @ in chat input and select the agent. Or use the sub-agents button in the chat toolbar.

Creating custom sub-agents: Workspace settings > Sub-agents > New agent. Fields: Name, Description, Avatar, Instructions (system prompt), Model, Enabled tools, Knowledge scope, Shared toggle.

Writing good instructions: Start with a clear role statement. List core responsibilities. Specify output format. Add behavioral guidelines.

Editing and deleting: Go to Workspace settings > Sub-agents. Preset agents cannot be deleted.

Agent permissions: Personal agents (visible only to you), Shared agents (visible to all, admin-only creation), Preset agents (built-in, configurable but not deletable).`,
	},
	{
		slug: "ai/skills",
		title: "Skills",
		section: "AI",
		content: `Skills

Reusable instruction sets that tell the AI how to behave. When enabled, included in every AI request.

What skills do: Markdown instructions read by the AI. Examples: "Always use conventional commit messages", "Follow this issue description template", "Our brand voice is direct and plain".

Browsing and managing: Workspace settings > Skills.

Enabling and disabling: Click the toggle. Changes take effect immediately.

Importing from catalog: Clave connects to skills.sh. Click Browse catalog to search and import community skills.

Creating custom skills: Workspace settings > Skills > New skill. Fields: Name (unique), Description, Category, Content (markdown instructions).

Writing effective content: Imperative statements, specific triggers, examples, keep each skill focused.

Attaching skills to sub-agents: Workspace settings > Sub-agents > open agent > Skills section.

Skill permissions: Creator and admins can edit/delete/toggle.

When skills take effect: Included in every AI message. Mid-conversation enable applies to next message.`,
	},
	{
		slug: "ai/inline-ai",
		title: "Inline AI",
		section: "AI",
		content: `Inline AI

AI inside the document editor. Triggered by keyboard shortcut or text selection.

Cmd+I — AI at the cursor: Press Cmd+I anywhere in the editor. Type your instruction, press Enter. AI generates content at the cursor. Examples: "Write an introduction", "Draft acceptance criteria", "Add a comparison table".

Slash commands: Type / and look for the AI group. Commands: Continue writing, Summarize above, Write from prompt, Improve writing, Translate.

Selection toolbar: Select text to see floating toolbar with six AI actions: Improve, Rewrite, Summarize, Translate, Fix grammar, Expand.

For Translate, a language picker appears first.

Accepting or discarding: Selection toolbar results shown as suggested replacement (Accept/Discard). Cursor-based results inserted directly — use Cmd+Z to undo.

Tips: Be specific with prompts. Use summarize for long sections. Use expand for drafts. Continue writing works well at section breaks.`,
	},
	{
		slug: "ai/issue-ai",
		title: "Issue AI",
		section: "AI",
		content: `Issue AI

AI features built into the issue workflow.

Auto-triage: When creating an issue, AI reads the title and suggests Priority, Type, and Labels in real time. Click Apply to accept or ignore.

AI-drafted descriptions: Click the AI button in the description toolbar. AI generates description based on title, type, and priority. Available for both new and existing issues.

Duplicate detection: AI checks for similar existing issues while you type the title. Shows identifier, title, status, and link to each match.

@AI in comments: Mention @AI in any issue comment. AI reads full issue context and responds as a comment. Examples: "@AI summarize the discussion", "@AI what are the acceptance criteria?", "@AI is this related to CLV-123?"

AI-suggested labels: Auto-triage panel suggests labels from your workspace's existing set.

Tips: Write specific titles for better triage. Review AI suggestions before applying. Use @AI for long threads to get summaries.`,
	},
	{
		slug: "ai/voice",
		title: "Voice",
		section: "AI",
		content: `Voice

Dictate into the AI chat instead of typing. Speech is transcribed and inserted as text.

Starting voice recording: Click the microphone icon in chat input toolbar, or press Cmd+Shift+V.

Recording: Speak clearly. Max 20 minutes. Max 25 MB file size.

Stopping and transcribing: Click microphone again or press Cmd+Shift+V. Transcription takes a few seconds.

Editing the transcript: Fully editable in the input field. Fix incorrect words before sending.

Supported audio formats: WebM with Opus (Chrome, Firefox), MP4 audio (Safari, Chrome on macOS/iOS). Automatic selection.

Troubleshooting: Check browser microphone permissions. Error toast with auto-retry (up to 3 times). Manually type technical terms if consistently mis-transcribed.

Voice in documents: Also available in the document editor. Microphone button in toolbar or Cmd+Shift+V. Text inserted at cursor.`,
	},
	// ── Inbox and Notifications ──────────────────────────────────────────
	{
		slug: "inbox-and-notifications/inbox",
		title: "Inbox",
		section: "Inbox and Notifications",
		content: `Inbox

Unified notification feed. All mentions, assignments, comments, and updates in one place.

Accessing: Click Inbox in sidebar, or press G then I.

Notification types: Issues (assigned, status changes), Mentions (@mentions in comments/descriptions), Comments (new comments on items you follow), Projects (project updates), Documents (shared or commented), Whiteboards (updates), Reminders (due dates, overdue, stale).

Layout: Left panel (scrollable notification list with actor, action, title, time, unread dot). Right panel (preview of selected notification; can update issue fields directly).

Reading notifications: Click to select and mark as read. Press U to toggle read/unread. Mark all read with Alt+U.

Filtering: By Type (Issues/Comments/Mentions/Projects/Documents/Whiteboards/Reminders) and Status (All/Unread/Read). Search with Cmd+F.

Snoozed notifications: Defer with clock icon. Presets: 1 hour, 3 hours, Tomorrow 9 AM, Next Monday 9 AM, Custom. Press H for 1-hour snooze.

Archiving and deleting: E to archive, Backspace to delete, Shift+Backspace to delete all visible, Cmd+D to delete all read.

AI smart digest: Short AI-generated summary of unread notifications at the top of inbox.

Keyboard shortcuts: J/K (navigate), U (toggle read), H (snooze 1h), E (archive), Backspace (delete), Alt+U (mark all read), Cmd+F (search).`,
	},
	{
		slug: "inbox-and-notifications/notification-settings",
		title: "Notification settings",
		section: "Inbox and Notifications",
		content: `Notification settings

Control where Clave sends notifications. Settings > Personal > Notifications.

In-app notifications: Flow into your Inbox. On by default.

Email notifications: Summaries sent to your account email. On by default.

Toggle each channel independently. Changes save immediately.

Tips: Use inbox filters to manage volume rather than disabling in-app notifications. Snooze notifications you're not ready for. Use AI smart digest to catch up quickly.`,
	},
	// ── Settings ─────────────────────────────────────────────────────────
	{
		slug: "settings/workspace-settings",
		title: "Workspace settings",
		section: "Settings",
		content: `Workspace settings

Configure workspace identity, issue types, AI behavior, and team access. Most require admin access.

Workspace identity: Logo, Name, URL slug, Description, Workspace ID, Visibility (Public/Private).

Types (issue customization): Issue types (Issue/Bug/Improvement/Feature — rename and recolor), Statuses (Triage/Backlog/To Do/In Progress/In Review/Done/Cancelled), Priorities (No Priority/Low/Medium/High/Urgent), Labels (create with name, color, optional description).

Clave AI: Personalization (personal — About me, How to work with me). Workspace AI profile (admin — Workspace context, Assistant characteristics).

Slash commands: Built-in commands (always available), Workspace commands (admin — shared), Personal commands (your own).

Teammates: View members and roles, remove members. Invite via invite flow.

AI agents and skills: Configure sub-agents and composable skills.

MCP servers: Connect external tools to AI assistant.`,
	},
	{
		slug: "settings/account-settings",
		title: "Account settings",
		section: "Settings",
		content: `Account settings

Personal settings that only affect your experience. Settings > Personal > Account.

Profile: Photo (up to 2 MB), Full name, Email (from Google, read-only), Job title (max 100 chars).

Appearance: Theme (System default/Light/Dark), Compact mode (denser layout), Sidebar collapsed (start collapsed).

Location and time: Timezone selection (IANA names). Affects due dates, timestamps, reminders.

Authentication: User ID (read-only, copy for support).`,
	},
	{
		slug: "settings/billing",
		title: "Billing",
		section: "Settings",
		content: `Billing

Organization-level billing. Requires admin access.

Plans:
- Free ($0): Set limits for members, workspaces, storage, AI messages.
- Pro ($12/member/month): Higher limits. Full feature set.
- Enterprise (custom pricing): Everything in Pro plus SSO, audit log, priority support.

Current plan: Shown in billing page header with Active/Trialing/Past due badge.

Usage: Members, Workspaces, Storage, AI messages. Real-time bars.

Upgrading: Click Upgrade on Pro card. Stripe checkout. Immediate upgrade.

Managing subscription: Click Manage subscription for Stripe portal. Update payment, download invoices, cancel, view history.

Plan limit warnings: Displayed when approaching limits. Feature pauses when hard limit hit.`,
	},
	{
		slug: "settings/integrations",
		title: "Integrations",
		section: "Settings",
		content: `Integrations

Connect GitHub and MCP servers. Per-workspace, requires admin access.

GitHub integration: Connect a repository to index code, sync issues, surface context in AI.
1. Settings > Integrations > Connect GitHub.
2. Authorize the Clave GitHub app.
3. Select repository.
What syncs: Repository indexing, issue sync, webhooks (push, PR, issue events).

MCP servers: Open standard for connecting AI to external tools.

Built-in Excalidraw server: Always active, enables AI whiteboard diagrams.

Adding an MCP server: Settings > MCP Servers > Add Server. Fields: Name, Server URL, Transport (SSE or HTTP), Authentication (None/API key/OAuth), Description.

Testing: Click Test to verify connection. Shows tool count and names.

Enabling/disabling: Toggle next to each server. Excalidraw cannot be toggled.

Editing: Click Edit to update name, URL, transport, auth, description.

Removing: Click trash icon for immediate removal.`,
	},
	{
		slug: "settings/keyboard-shortcuts",
		title: "Keyboard shortcuts",
		section: "Settings",
		content: `Keyboard shortcuts

Clave is built for keyboard-first workflows. Press ? to open the shortcuts overlay.

Global shortcuts: C (create issue), V (full-screen issue create), ? (shortcuts overlay), / (search), Cmd+K (command palette), Cmd+B (toggle sidebar).

Navigation: G then I/T/P/D/B/C/S (go to Inbox/Tasks/Projects/Docs/Boards/Clients/Settings). J/K or arrows (move selection). Enter (open item). Space (peek issue preview).

Issue actions: S (set status), A (set assignee), P (set priority), L (set labels), Shift+M (set sprint), Shift+P (set project).

Inbox shortcuts: J/K (navigate), U (toggle read/unread), Alt+U (mark all read), H (snooze 1h), E (archive), Backspace (delete), Shift+Backspace (delete all visible), Cmd+D (delete all read), Cmd+F (focus search).

Views: Shift+V (display options), F (open filter).

AI shortcuts: Cmd+J (toggle chat), Cmd+N (new chat thread), Cmd+/ (focus chat input), Cmd+I (inline AI in editor), Cmd+Shift+A (AI action menu), Cmd+Shift+V (voice dictation), Escape (close AI panel).

On Windows and Linux, Cmd is replaced by Ctrl.`,
	},
	// ── Analytics ────────────────────────────────────────────────────────
	{
		slug: "analytics/workspace-analytics",
		title: "Workspace analytics",
		section: "Analytics",
		content: `Workspace analytics

Performance dashboard for tracking execution. Click Analytics in sidebar.

Date range: Last 7/30/90 days or custom range.

Filter by project or member.

Key performance indicators (6 cards): On-track projects (fraction and percentage), Overdue open issues, Completed in range, Cycle time P50 (median days), Blocked open issues, Scope delta (created minus completed). Color-coded: green/amber/red.

Throughput trend: Bar chart of issues completed per period.

Work mix: Stacked bar of issue types (Bug/Improvement/Feature/Issue).

Flow signals: WIP issues, Blocked open, Scope created, Scope completed, Cancellation rate.

Delivery risk: Projects falling behind schedule. Name, status, issue count, health label, variance, due date.

Scope trend: Side-by-side bars comparing created vs. completed per period.

Project health table: Project name, Progress (actual vs. expected), Health label and variance, Due date.

Exporting: Click Export PDF for a report with all metrics, charts, and tables.`,
	},
	// ── Welcome page ────────────────────────────────────────────────────
	{
		slug: "index",
		title: "Welcome to Clave",
		section: "Welcome",
		content: `Welcome to Clave

Clave is a thinking workspace where your team and AI work together. It combines issue tracking, rich documents, real-time whiteboards, and a deeply integrated AI layer in one place.

What you can do in Clave:

Track work: Create projects, manage issues across kanban boards, lists, and timelines. Organize work into sprints and milestones.

Write together: Draft documents with a rich editor, collaborate in real time, leave threaded comments.

Draw and diagram: Use whiteboards for brainstorming, system diagrams, and visual work. Share boards publicly.

Manage clients: Lightweight CRM alongside your work. Link client contacts to projects.

Talk to your AI: Open the AI chat to ask questions, create issues, search your workspace using natural language.

Stay informed: Unified inbox for all notifications and @mentions. AI can summarize what you missed.

How Clave is organized: Organizations (top-level container for companies/teams) contain Workspaces (where actual work happens with projects, issues, docs, boards, tasks).`,
	},
];
