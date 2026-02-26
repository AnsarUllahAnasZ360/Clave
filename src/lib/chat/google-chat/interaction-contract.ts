const NON_DESTRUCTIVE_STATUSES = [
	"triage",
	"backlog",
	"todo",
	"in_progress",
	"in_review",
] as const;

const SUPPORTED_ACTION_IDS = [
	"assign_to_me",
	"set_status_non_destructive",
	"open_issue_link",
] as const;

const MUTATING_ACTION_IDS = [
	"assign_to_me",
	"set_status_non_destructive",
] as const;

const APPROVAL_ACTION_IDS = [
	"ai_approval_approve",
	"ai_approval_reject",
] as const;

const TRIAGE_ACTION_IDS = [
	"triage_conversation_to_issue",
	"confirm_triage_issue_create",
	"cancel_triage_issue_create",
] as const;

export type GoogleChatIssueActionId = (typeof SUPPORTED_ACTION_IDS)[number];
export type GoogleChatApprovalActionId = (typeof APPROVAL_ACTION_IDS)[number];
export type GoogleChatTriageActionId = (typeof TRIAGE_ACTION_IDS)[number];
export type GoogleChatNonDestructiveStatus =
	(typeof NON_DESTRUCTIVE_STATUSES)[number];

export const GOOGLE_CHAT_DEFAULT_ALLOWED_ACTION_IDS: GoogleChatIssueActionId[] =
	["assign_to_me", "set_status_non_destructive", "open_issue_link"];

export type GoogleChatActionResponseType =
	| "UPDATE_MESSAGE"
	| "UPDATE_USER_MESSAGE_CARDS";

export type ParsedGoogleChatActionEvent = {
	actionId: GoogleChatIssueActionId;
	actionMethodName: string;
	actionInstanceId: string;
	actionResponseType: GoogleChatActionResponseType;
	issueId: string | null;
	issueIdentifier: string | null;
	requestedStatus: GoogleChatNonDestructiveStatus | null;
	parameters: Record<string, string>;
	idempotencyKey: string;
};

export type ParsedGoogleChatApprovalActionEvent = {
	actionId: GoogleChatApprovalActionId;
	actionMethodName: string;
	actionInstanceId: string;
	actionResponseType: GoogleChatActionResponseType;
	approvalId: string;
	toolCallId: string;
	threadId: string;
	parameters: Record<string, string>;
	idempotencyKey: string;
};

export type ParsedGoogleChatTriageActionEvent = {
	actionId: GoogleChatTriageActionId;
	actionMethodName: string;
	actionInstanceId: string;
	actionResponseType: GoogleChatActionResponseType;
	conversationKey: string | null;
	sourceSpaceName: string | null;
	sourceThreadName: string | null;
	draftTitle: string | null;
	draftDescription: string | null;
	triagePriority: string | null;
	triageType: string | null;
	triageLabels: string[];
	confirmCreate: boolean;
	parameters: Record<string, string>;
	idempotencyKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseActionParameters(
	payload: Record<string, unknown>,
): Record<string, string> {
	const action = isRecord(payload.action) ? payload.action : null;
	if (!action) return {};
	const rawParameters = action.parameters;
	if (!Array.isArray(rawParameters)) return {};

	const parsed: Record<string, string> = {};
	for (const entry of rawParameters) {
		if (!isRecord(entry)) continue;
		const key = asString(entry.key);
		const value = asString(entry.value);
		if (!key || !value) continue;
		parsed[key] = value;
	}
	return parsed;
}

function parseActionMethodName(
	payload: Record<string, unknown>,
): string | null {
	const action = isRecord(payload.action) ? payload.action : null;
	if (!action) return null;
	return asString(action.actionMethodName) ?? asString(action.function);
}

function resolveGoogleChatActionResponseType(
	payload: Record<string, unknown>,
): GoogleChatActionResponseType {
	const message = isRecord(payload.message) ? payload.message : null;
	const sender = message && isRecord(message.sender) ? message.sender : null;
	const senderType = asString(sender?.type);
	return senderType === "HUMAN"
		? "UPDATE_USER_MESSAGE_CARDS"
		: "UPDATE_MESSAGE";
}

function parseIssueId(parameters: Record<string, string>): string | null {
	return parameters.issue_id ?? parameters.issueId ?? null;
}

function parseIssueIdentifier(
	parameters: Record<string, string>,
): string | null {
	const value =
		parameters.issue_identifier ?? parameters.issueIdentifier ?? null;
	return value ? value.toUpperCase() : null;
}

function parseRequestedStatus(
	parameters: Record<string, string>,
): GoogleChatNonDestructiveStatus | null {
	const value =
		parameters.status ??
		parameters.next_status ??
		parameters.nextStatus ??
		null;
	if (!value) return null;
	if (
		NON_DESTRUCTIVE_STATUSES.includes(value as GoogleChatNonDestructiveStatus)
	) {
		return value as GoogleChatNonDestructiveStatus;
	}
	return null;
}

function parseActionId(
	actionMethodName: string,
): GoogleChatIssueActionId | null {
	if (
		SUPPORTED_ACTION_IDS.includes(actionMethodName as GoogleChatIssueActionId)
	) {
		return actionMethodName as GoogleChatIssueActionId;
	}
	return null;
}

function parseApprovalActionId(
	actionMethodName: string,
): GoogleChatApprovalActionId | null {
	if (
		APPROVAL_ACTION_IDS.includes(actionMethodName as GoogleChatApprovalActionId)
	) {
		return actionMethodName as GoogleChatApprovalActionId;
	}
	return null;
}

function parseTriageActionId(
	actionMethodName: string,
): GoogleChatTriageActionId | null {
	if (
		TRIAGE_ACTION_IDS.includes(actionMethodName as GoogleChatTriageActionId)
	) {
		return actionMethodName as GoogleChatTriageActionId;
	}
	return null;
}

function buildActionInstanceId(
	actionMethodName: string,
	parameters: Record<string, string>,
): string {
	return (
		parameters.action_instance_id ??
		parameters.actionInstanceId ??
		parameters.action_id ??
		parameters.actionId ??
		actionMethodName
	);
}

function parseApprovalId(parameters: Record<string, string>): string | null {
	return parameters.approval_id ?? parameters.approvalId ?? null;
}

function parseToolCallId(parameters: Record<string, string>): string | null {
	return parameters.tool_call_id ?? parameters.toolCallId ?? null;
}

function parseThreadId(parameters: Record<string, string>): string | null {
	return parameters.thread_id ?? parameters.threadId ?? null;
}

function getCommonFormInputs(payload: Record<string, unknown>) {
	const common = isRecord(payload.common) ? payload.common : null;
	if (!common) return null;
	const formInputs = common.formInputs;
	return isRecord(formInputs) ? formInputs : null;
}

function getInputNode(
	formInputs: Record<string, unknown>,
	widgetName: string,
): Record<string, unknown> | null {
	const widget = formInputs[widgetName];
	if (!isRecord(widget)) return null;

	if (isRecord(widget.stringInputs) || isRecord(widget.dateInput)) {
		return widget;
	}
	const nested = widget[""];
	return isRecord(nested) ? nested : null;
}

function parseStringFormInput(
	payload: Record<string, unknown>,
	widgetName: string,
): string | null {
	const formInputs = getCommonFormInputs(payload);
	if (!formInputs) return null;
	const inputNode = getInputNode(formInputs, widgetName);
	if (!inputNode) return null;

	const stringInputs = isRecord(inputNode.stringInputs)
		? inputNode.stringInputs
		: null;
	if (!stringInputs) return null;
	const value = Array.isArray(stringInputs.value)
		? stringInputs.value[0]
		: null;
	return asString(value);
}

function parseTriageLabels(parameters: Record<string, string>): string[] {
	const raw =
		parameters.triage_labels ??
		parameters.triageLabels ??
		parameters.labels ??
		"";
	if (!raw) return [];
	const seen = new Set<string>();
	const labels: string[] = [];
	for (const piece of raw.split(",")) {
		const value = piece.trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		labels.push(value);
	}
	return labels;
}

function parseBooleanParameter(
	parameters: Record<string, string>,
	keys: string[],
): boolean {
	for (const key of keys) {
		const value = parameters[key];
		if (!value) continue;
		const normalized = value.trim().toLowerCase();
		if (
			normalized === "true" ||
			normalized === "1" ||
			normalized === "yes" ||
			normalized === "confirm"
		) {
			return true;
		}
	}
	return false;
}

export function isMutatingGoogleChatAction(
	actionId: GoogleChatIssueActionId,
): boolean {
	return (
		actionId === MUTATING_ACTION_IDS[0] || actionId === MUTATING_ACTION_IDS[1]
	);
}

export function isAllowedGoogleChatAction(
	actionId: string,
	allowedActionIds: readonly string[],
): actionId is GoogleChatIssueActionId {
	return (
		SUPPORTED_ACTION_IDS.includes(actionId as GoogleChatIssueActionId) &&
		allowedActionIds.includes(actionId)
	);
}

export function parseGoogleChatActionEvent(args: {
	payload: Record<string, unknown>;
	eventType: string;
	eventId: string;
}): ParsedGoogleChatActionEvent | null {
	if (args.eventType !== "CARD_CLICKED") return null;

	const actionMethodName = parseActionMethodName(args.payload);
	if (!actionMethodName) {
		throw new Error("Missing action method name in CARD_CLICKED payload");
	}

	const actionId = parseActionId(actionMethodName);
	if (!actionId) {
		throw new Error(`Unsupported Google Chat action: ${actionMethodName}`);
	}

	const parameters = parseActionParameters(args.payload);
	const issueId = parseIssueId(parameters);
	const issueIdentifier = parseIssueIdentifier(parameters);
	const requestedStatus = parseRequestedStatus(parameters);
	const actionInstanceId = buildActionInstanceId(actionMethodName, parameters);
	const idempotencyKey = [
		args.eventId,
		actionInstanceId,
		issueId ?? issueIdentifier ?? "no-issue",
		requestedStatus ?? "no-status",
	].join(":");

	return {
		actionId,
		actionMethodName,
		actionInstanceId,
		actionResponseType: resolveGoogleChatActionResponseType(args.payload),
		issueId,
		issueIdentifier,
		requestedStatus,
		parameters,
		idempotencyKey,
	};
}

export function parseGoogleChatApprovalActionEvent(args: {
	payload: Record<string, unknown>;
	eventType: string;
	eventId: string;
}): ParsedGoogleChatApprovalActionEvent | null {
	if (args.eventType !== "CARD_CLICKED") return null;

	const actionMethodName = parseActionMethodName(args.payload);
	if (!actionMethodName) {
		throw new Error("Missing action method name in CARD_CLICKED payload");
	}

	const actionId = parseApprovalActionId(actionMethodName);
	if (!actionId) {
		return null;
	}

	const parameters = parseActionParameters(args.payload);
	const approvalId = parseApprovalId(parameters);
	const toolCallId = parseToolCallId(parameters);
	const threadId = parseThreadId(parameters);
	if (!approvalId || !toolCallId || !threadId) {
		throw new Error(
			"Approval action payload must include approval_id, tool_call_id, and thread_id parameters",
		);
	}
	const actionInstanceId = buildActionInstanceId(actionMethodName, parameters);
	const idempotencyKey = [
		args.eventId,
		actionId,
		approvalId,
		toolCallId,
		actionInstanceId,
	].join(":");

	return {
		actionId,
		actionMethodName,
		actionInstanceId,
		actionResponseType: resolveGoogleChatActionResponseType(args.payload),
		approvalId,
		toolCallId,
		threadId,
		parameters,
		idempotencyKey,
	};
}

export function parseGoogleChatTriageActionEvent(args: {
	payload: Record<string, unknown>;
	eventType: string;
	eventId: string;
}): ParsedGoogleChatTriageActionEvent | null {
	if (args.eventType !== "CARD_CLICKED") return null;

	const actionMethodName = parseActionMethodName(args.payload);
	if (!actionMethodName) {
		throw new Error("Missing action method name in CARD_CLICKED payload");
	}

	const actionId = parseTriageActionId(actionMethodName);
	if (!actionId) {
		return null;
	}

	const parameters = parseActionParameters(args.payload);
	const actionInstanceId = buildActionInstanceId(actionMethodName, parameters);
	const conversationKey =
		parameters.conversation_key ?? parameters.conversationKey ?? null;
	const sourceSpaceName =
		parameters.source_space_name ?? parameters.sourceSpaceName ?? null;
	const sourceThreadName =
		parameters.source_thread_name ?? parameters.sourceThreadName ?? null;
	const draftTitle =
		parseStringFormInput(args.payload, "triage_issue_title") ??
		parameters.draft_title ??
		parameters.draftTitle ??
		null;
	const draftDescription =
		parseStringFormInput(args.payload, "triage_issue_description") ??
		parameters.draft_description ??
		parameters.draftDescription ??
		null;
	const triagePriority =
		parameters.triage_priority ?? parameters.triagePriority ?? null;
	const triageType = parameters.triage_type ?? parameters.triageType ?? null;
	const triageLabels = parseTriageLabels(parameters);
	const confirmCreate = parseBooleanParameter(parameters, [
		"confirm_create",
		"confirmCreate",
		"confirmed",
	]);

	const idempotencyKey = [
		args.eventId,
		actionId,
		actionInstanceId,
		conversationKey ?? "no-conversation",
	].join(":");

	return {
		actionId,
		actionMethodName,
		actionInstanceId,
		actionResponseType: resolveGoogleChatActionResponseType(args.payload),
		conversationKey,
		sourceSpaceName,
		sourceThreadName,
		draftTitle,
		draftDescription,
		triagePriority,
		triageType,
		triageLabels,
		confirmCreate,
		parameters,
		idempotencyKey,
	};
}

export function getGoogleChatNonDestructiveStatuses() {
	return [...NON_DESTRUCTIVE_STATUSES];
}
