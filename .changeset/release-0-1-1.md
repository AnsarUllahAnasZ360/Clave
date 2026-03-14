---
"clave": patch
---

## v0.1.1

### Auth flow improvements
- Added email OTP support for password reset and email verification via Resend
- Refactored sign-in form with multi-step flows (sign-in, sign-up, forgot password, OTP verification)
- Implemented secure redirect handling with URL sanitization for OAuth callbacks
- Added rate limiting infrastructure for auth actions
- Added auth feature flags for email verification and password reset capabilities

### Organization and workspace management
- Added demo workspace support with expiry tracking and seed status
- Implemented bidirectional membership sync (organization + workspace) on invite code join
- Added onboarding guards with unauthenticated redirect and workspace routing
- Added demo workspace popup for expiry warnings

### Real-time collaboration (Yjs v3)
- Complete rewrite of Convex Yjs provider with session-based deduplication
- Improved awareness protocol with presence debouncing and state comparison
- Added buffer management with separate debounce timers for updates and awareness
- Implemented retry logic with exponential backoff and jitter
- Added v3 backend functions for sync and presence
- Added session ID tracking per tab to prevent duplicate updates

### Google Chat integration
- New Chat SDK integration with Google Chat adapter
- Workspace-level connection management and policy configuration
- User identity linking between Clave and Google Chat accounts
- Unified webhook handler with routing for mentions, issue actions, approvals, and triage
- Idempotency enforcement via audit log deduplication
- Conversation-to-issue triage with AI-powered duplicate detection
- Action card builders for rich Google Chat message responses

### AI and chat improvements
- Increased max output tokens from 2048 to 16384 for more substantial responses
- Added prompt persistence (saves user message to DB before generation)
- Improved stream handling to prevent dangling mutations
- Added error tracking with errorMessage field on responses
- Enhanced RAG document indexing for Fumadocs MDX pages
- Improved transcription with Azure REST API fallback and server VAD support

### Dictation improvements
- Session-based chunking for long recordings (60s chunks)
- Offline caching via IndexedDB for failed dictations
- Global dictation provider accessible throughout the app
- Visual recording indicator and settings pane

### Documentation
- Restructured docs from developer-focused to user-focused content
- Added new sections: AI, analytics, features, getting started, inbox, settings
- Rewrote docs index with product overview and capability highlights

### CI/CD
- Added manual workflow dispatch for on-demand CI runs
- Enhanced CI workflow documentation for token-based team access
- Team members can control full CI/CD pipeline via GitHub without Vercel or Convex dashboard access

### Test fixes
- Fixed auth test assertions to use authenticated queries for org operations
- Fixed Google Chat webhook route test mock hoisting
- Fixed Yjs provider test type assertions
- Removed stale ts-expect-error directive from source module
