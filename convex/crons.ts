import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Un-snooze expired notifications every minute
crons.interval(
	"unsnooze expired notifications",
	{ minutes: 1 },
	internal.notifications.unsnoozeExpired,
);

// Clean up stale document presence records every 30 seconds
crons.interval(
	"cleanup stale document presence",
	{ seconds: 30 },
	internal.documentPresence.cleanupStale,
);

// Clean up stale whiteboard presence records every 30 seconds
crons.interval(
	"cleanup stale whiteboard presence",
	{ seconds: 30 },
	internal.whiteboardPresence.cleanupStale,
);

// Clean up stale workspace presence records every 30 seconds
crons.interval(
	"cleanup stale workspace presence",
	{ seconds: 30 },
	internal.workspacePresence.cleanupStale,
);

// Send due-date reminder notifications daily at 9:00 AM UTC
crons.cron(
	"send due date reminders",
	"0 9 * * *",
	internal.notifications.sendDueDateReminders,
);

export default crons;
