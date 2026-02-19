import {
	AddressBook,
	ChartBar,
	Kanban,
	Lightning,
	NotePencil,
	Robot,
	Tray,
	Users,
} from "@phosphor-icons/react/dist/ssr";
import type { ComponentType } from "react";

interface Feature {
	icon: ComponentType<{ size?: number; weight?: "regular" | "duotone" }>;
	title: string;
	description: string;
	comingSoon?: boolean;
}

const FEATURES: Feature[] = [
	{
		icon: Kanban,
		title: "Project management",
		description:
			"Cards, boards, and timelines. Switch views in one click and track every project from kickoff to delivery.",
	},
	{
		icon: Lightning,
		title: "Stories and sprints",
		description:
			"Stories for the what, tasks for the how. Auto-identifiers, priorities, and sprint cycles keep your team in rhythm.",
	},
	{
		icon: Users,
		title: "Real-time collaboration",
		description:
			"Every change reaches every teammate instantly. No refresh, no polling, no stale data.",
	},
	{
		icon: AddressBook,
		title: "Client CRM",
		description:
			"Track clients with lifecycle stages, contacts, and project linking. No extra tools needed.",
	},
	{
		icon: NotePencil,
		title: "Notes and docs",
		description:
			"Rich text editing for meeting notes, project documentation, and knowledge bases. Organized by project.",
	},
	{
		icon: Tray,
		title: "Smart inbox",
		description:
			"Real-time notifications for assignments, comments, and status changes. Everything that matters, in one feed.",
	},
	{
		icon: ChartBar,
		title: "Analytics",
		description:
			"Completion rates, project health, and delivery metrics. Computed from your real work, not vanity numbers.",
	},
	{
		icon: Robot,
		title: "AI teammates",
		description:
			"Assign issues to AI agents. They work in secure sandboxes, stream progress, and submit results.",
		comingSoon: true,
	},
];

function FeatureCard({ feature }: { feature: Feature }) {
	const Icon = feature.icon;
	return (
		<div className="group relative rounded-xl border border-[#E5E5E5] dark:border-[#1F1F1F] bg-[#FAFAFA] dark:bg-[#0E0E0E] p-6 transition-all duration-200 hover:border-[#D4D4D4] dark:hover:border-[#262626] hover:bg-[#F0F0F0] dark:hover:bg-[#131313] hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
			{/* Icon container */}
			<div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#F0F0F0] dark:bg-[#171717] text-sienna-500 dark:text-sienna-400 transition-colors group-hover:bg-sienna-500/10">
				<Icon size={20} weight="duotone" />
			</div>

			{/* Title row */}
			<div className="mb-2 flex items-center gap-2">
				<h3
					className="text-sm font-semibold text-[#0A0A0A] dark:text-[#FAFAFA]"
					style={{ letterSpacing: "-0.01em" }}
				>
					{feature.title}
				</h3>
				{feature.comingSoon && (
					<span className="rounded-full bg-sienna-500/15 px-2 py-0.5 text-[10px] font-medium text-sienna-500 dark:text-sienna-400">
						Coming soon
					</span>
				)}
			</div>

			{/* Description */}
			<p className="text-sm leading-relaxed text-[#737373]">
				{feature.description}
			</p>
		</div>
	);
}

export function FeaturesSection() {
	return (
		<section
			id="features"
			className="border-t border-[#E5E5E5] dark:border-[#1F1F1F] py-20 md:py-28"
			aria-label="Features"
		>
			<div className="mx-auto max-w-6xl px-6">
				{/* Section header */}
				<div className="mb-12 flex items-center gap-4">
					<span
						className="font-mono text-xs text-[#737373]"
						style={{ letterSpacing: "0.05em" }}
					>
						01
					</span>
					<div className="h-px w-8 bg-sienna-500" />
					<h2
						className="text-2xl font-semibold text-[#0A0A0A] dark:text-[#FAFAFA]"
						style={{ letterSpacing: "-0.02em" }}
					>
						Built for teams that ship
					</h2>
				</div>

				{/* Subheading */}
				<p className="mb-12 max-w-2xl text-base leading-relaxed text-[#525252] dark:text-[#A3A3A3]">
					Everything your engineering team needs in one workspace. Project
					management, collaboration, and AI teammates — without the tool sprawl.
				</p>

				{/* Features grid */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{FEATURES.map((feature) => (
						<FeatureCard key={feature.title} feature={feature} />
					))}
				</div>
			</div>
		</section>
	);
}
