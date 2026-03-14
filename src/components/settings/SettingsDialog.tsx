/**
 * Settings barrel — re-exports all pane components and config.
 *
 * Each pane lives in its own file for code-splitting.
 * The settings page (src/app/[workspaceSlug]/settings/page.tsx)
 * imports from this barrel so existing consumer code doesn't break.
 */

import {
	Bell,
	ChatCircleText,
	FileText,
	Globe,
	LinkSimple,
	Microphone,
	Robot,
	ShieldCheck,
	SlidersHorizontal,
	Sparkle,
	SquaresFour,
	UserCircle,
	UsersThree,
} from "@phosphor-icons/react/dist/ssr";

export { AccountSettingsPane } from "./AccountPane";
export { ClaveAISettingsPane, SlashCommandsSettingsPane } from "./ClaveAIPane";
export { DictationClipboardPane } from "./DictationPane";
export { GoogleChatIdentityPane } from "./GoogleChatIdentityPane";
export { GoogleChatIntegrationsPane } from "./GoogleChatIntegrationsPane";
export { IdentitySettingsPane } from "./IdentityPane";
export { McpServersSettingsPane } from "./McpServersPane";
export { NotificationsSettingsPane } from "./NotificationsPane";
export { SkillsSettingsPane } from "./SkillsPane";
export { SubAgentsSettingsPane } from "./SubAgentsPane";
// Re-export shared helpers for any consumer that needs them
export {
	PaneDescription,
	PaneTitle,
	SettingRow,
	SettingSection,
} from "./settings-shared";
// Re-export all pane components
export { TeammatesSettingsPane } from "./TeammatesPane";
export { TypesSettingsPane } from "./TypesPane";

// ── Settings config ──────────────────────────────────────────────────────

export const settingsSections = [
	{
		id: "personal",
		label: "Personal",
		items: [
			{ id: "account", label: "Account" },
			{ id: "notifications", label: "Notifications" },
			{ id: "dictation", label: "Dictation" },
			{ id: "google-chat-identity", label: "Google Chat" },
		],
	},
	{
		id: "workspace",
		label: "Workspace",
		items: [
			{ id: "identity", label: "Workspace" },
			{ id: "teammates", label: "Teammates" },
			{ id: "types", label: "Types" },
			{ id: "clave-ai", label: "Clave AI" },
			{ id: "slash-commands", label: "Slash Commands" },
			{ id: "agents", label: "Agents" },
			{ id: "skills", label: "Skills" },
			{ id: "mcp-servers", label: "MCP Servers" },
			{ id: "google-chat", label: "Google Chat" },
		],
	},
] as const;

export const settingsItemIcons: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	account: UserCircle,
	notifications: Bell,
	teammates: UsersThree,
	identity: SlidersHorizontal,
	types: SquaresFour,
	"clave-ai": ShieldCheck,
	"slash-commands": FileText,
	agents: Robot,
	skills: Sparkle,
	"mcp-servers": Globe,
	"google-chat": ChatCircleText,
	"google-chat-identity": LinkSimple,
	dictation: Microphone,
};

export type SettingsItemId =
	(typeof settingsSections)[number]["items"][number]["id"];

export function PlaceholderSettingsPane() {
	return (
		<div className="flex h-full flex-col items-start justify-center gap-2">
			<h2 className="text-lg leading-none font-semibold text-xl">
				Settings preview
			</h2>
			<p className="text-muted-foreground text-sm">
				This area is reserved for additional settings pages in the full product.
			</p>
		</div>
	);
}
