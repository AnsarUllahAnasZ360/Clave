# Changelog

All notable changes to Millhouse Web will be documented in this file.

## 0.1.0 — 2026-02-21

### Added

#### Core Platform
- Real-time collaborative workspace with multi-user presence
- Workspace-scoped data with per-user authentication (Convex Auth + Google OAuth)

#### Sidebar
- Collapsible icon sidebar mode (`Cmd+B`) with tooltips in collapsed state
- Collapsible dropdown sections (Recents, Favorites, Active Projects) with per-user persistence
- Recents tracking: top 5 recently accessed items with entity-type icons
- Keyboard shortcuts menu dialog (46+ shortcuts, accessible from sidebar footer)
- Bug report dialog with GitHub Issues integration

#### Documents
- Rich collaborative document editor (Plate.js with 40+ plugins)
- Real-time multiplayer editing via Yjs + Convex sync
- Document comments with threaded replies and presence avatars
- Document sharing with public read-only view
- GIF picker, media embeds, code blocks, tables, math, and more

#### Whiteboards
- Excalidraw-powered infinite canvas with real-time collaboration
- Whiteboard comments with pin overlays
- Whiteboard sharing with public view

#### Projects
- Project dashboard with milestones, tasks, resources, and assets
- Project description editor and overview panel

#### Issues
- Issue tracking with list, board (kanban), and timeline views
- Issue relations, labels, sprints, and priority management
- Quick-create and full-create modals

#### AI Features
- AI chat sidebar with thread management
- AI teammate integration
- Editor AI inline commands

#### Documentation
- In-app docs at `/docs` powered by Fumadocs with full-text search

#### Infrastructure
- Changesets-based version management workflow
- CI/CD pipeline (GitHub Actions)
- Preview deployments via Vercel
