import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Un-snooze expired notifications every minute
crons.interval(
	"unsnooze expired notifications",
	{ minutes: 1 },
	internal.notifications.unsnoozeExpired,
);

// Clean up stale document presence records every 2 minutes
crons.interval(
	"cleanup stale document presence",
	{ minutes: 2 },
	internal.documentPresence.cleanupStale,
);

// Clean up stale whiteboard presence records every 2 minutes
crons.interval(
	"cleanup stale whiteboard presence",
	{ minutes: 2 },
	internal.whiteboardPresence.cleanupStale,
);

// Clean up stale workspace presence records every 2 minutes
crons.interval(
	"cleanup stale workspace presence",
	{ minutes: 2 },
	internal.workspacePresence.cleanupStale,
);

// Clean up stale Yjs V3 presence records every 30 seconds
crons.interval(
	"cleanup stale yjs v3 presence",
	{ seconds: 30 },
	internal.yjsPresenceV3.cleanupStalePresence,
);

// Send due-date reminder notifications daily at 9:00 AM UTC
crons.cron(
	"send due date reminders",
	"0 9 * * *",
	internal.notifications.sendDueDateReminders,
);

// Clean up incognito AI threads older than 24 hours (every hour)
crons.interval(
	"cleanup incognito threads",
	{ hours: 1 },
	internal.ai.threads.cleanupIncognitoThreads,
);

// Delete audio recordings older than 2 days, daily at 3:00 AM UTC
crons.cron(
	"cleanup old audio recordings",
	"0 3 * * *",
	internal.audioRecordings.cleanupStale,
);

// Clean up expired demo workspaces daily at 4:00 AM UTC
crons.cron(
	"cleanup expired demo workspaces",
	"0 4 * * *",
	internal.demo.cleanup.cleanupExpiredDemos,
);

// GitHub periodic sync — catch missed webhooks every 15 minutes
crons.interval(
	"github periodic sync",
	{ minutes: 15 },
	internal.githubSyncActions.periodicSync,
);

export default crons;
