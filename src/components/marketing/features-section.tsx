"use client";

import {
	AddressBook,
	ChartBar,
	ChatDots,
	Kanban,
	Lightning,
	NotePencil,
	Robot,
	Tray,
	Users,
} from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";
import {
	fadeIn,
	fadeInLeft,
	fadeInRight,
	fadeInUp,
	scaleIn,
	staggerContainer,
	staggerFast,
} from "@/lib/animations";

// ── Feature showcase data ────────────────────────────────────────────────

interface FeatureShowcase {
	icon: ComponentType<{
		size?: number;
		weight?: "regular" | "duotone";
		className?: string;
	}>;
	label: string;
	title: string;
	description: string;
	highlights: string[];
	mockupSide: "left" | "right";
	accentColor: string;
	iconClass: string;
	mockupLines: { width: string; accent: boolean }[];
}

const SHOWCASES: FeatureShowcase[] = [
	{
		icon: Kanban,
		label: "Project management",
		title: "Track every project from kickoff to delivery",
		description:
			"Switch between board, list, and timeline views in one click. Drag issues across sprints, assign teammates, and watch progress update in real time.",
		highlights: [
			"Kanban boards with drag-and-drop",
			"Gantt timeline with sprint bars",
			"Sprint folders and backlog management",
		],
		mockupSide: "right",
		accentColor: "#C26A3A",
		iconClass: "text-sienna-500",
		mockupLines: [
			{ width: "75%", accent: true },
			{ width: "60%", accent: false },
			{ width: "85%", accent: false },
			{ width: "50%", accent: true },
		],
	},
	{
		icon: ChatDots,
		label: "AI assistant",
		title: "An AI teammate that knows your project",
		description:
			"Chat with AI that has full context on your issues, docs, and codebase. Create issues, search knowledge, and get status reports — all from the chat sidebar.",
		highlights: [
			"21+ workspace tools built-in",
			"RAG pipeline over your data",
			"Streaming responses with artifacts",
		],
		mockupSide: "left",
		accentColor: "#0091FF",
		iconClass: "text-blue-500",
		mockupLines: [
			{ width: "90%", accent: false },
			{ width: "65%", accent: true },
			{ width: "80%", accent: false },
		],
	},
	{
		icon: NotePencil,
		label: "Documents",
		title: "Rich docs with real-time collaboration",
		description:
			"A Notion-style editor built for project documentation. Threaded comments, AI slash commands, and live multiplayer editing — organized by project.",
		highlights: [
			"Rich text editor with slash commands",
			"Real-time multiplayer editing",
			"AI inline editing with Cmd+I",
		],
		mockupSide: "right",
		accentColor: "#17B169",
		iconClass: "text-green-500",
		mockupLines: [
			{ width: "100%", accent: false },
			{ width: "70%", accent: false },
			{ width: "55%", accent: true },
			{ width: "80%", accent: false },
			{ width: "45%", accent: false },
		],
	},
	{
		icon: Lightning,
		label: "Sprints",
		title: "Ship in rhythm with sprint cycles",
		description:
			"Plan sprints with capacity-aware tools. Auto-identifiers, priority sorting, and progress tracking keep your team shipping consistently.",
		highlights: [
			"Sprint folders for organization",
			"Hours-based time estimation",
			"Progress rings with completion %",
		],
		mockupSide: "left",
		accentColor: "#F5A623",
		iconClass: "text-amber-500",
		mockupLines: [
			{ width: "60%", accent: true },
			{ width: "80%", accent: false },
			{ width: "45%", accent: true },
		],
	},
];

// ── Quick features ───────────────────────────────────────────────────────

interface QuickFeature {
	icon: ComponentType<{
		size?: number;
		weight?: "regular" | "duotone";
		className?: string;
	}>;
	title: string;
	description: string;
	comingSoon?: boolean;
}

const QUICK_FEATURES: QuickFeature[] = [
	{
		icon: Users,
		title: "Real-time sync",
		description: "Every change reaches every teammate instantly.",
	},
	{
		icon: AddressBook,
		title: "Client CRM",
		description: "Track clients with lifecycle stages and contacts.",
	},
	{
		icon: Tray,
		title: "Smart inbox",
		description: "Assignments, mentions, and updates in one feed.",
	},
	{
		icon: ChartBar,
		title: "Analytics",
		description: "Completion rates and delivery metrics from real work.",
	},
	{
		icon: Robot,
		title: "AI teammates",
		description: "Assign issues to AI agents that deliver code.",
		comingSoon: true,
	},
];

// ── Mockup placeholder ──────────────────────────────────────────────────

function FeatureMockup({
	accentColor,
	label,
	lines,
}: {
	accentColor: string;
	label: string;
	lines: { width: string; accent: boolean }[];
}) {
	return (
		<div className="relative">
			<div
				className="pointer-events-none absolute -inset-8 rounded-2xl opacity-[0.12] dark:opacity-[0.06]"
				style={{
					background: `radial-gradient(ellipse at center, ${accentColor} 0%, transparent 70%)`,
				}}
			/>
			<div className="relative rounded-xl border border-[#262626] bg-[#0E0E0E] shadow-[0_12px_40px_rgba(0,0,0,0.4)] overflow-hidden">
				{/* Window chrome */}
				<div className="flex items-center gap-2 border-b border-[#1F1F1F] px-4 py-2.5">
					<div className="flex gap-1.5">
						<div className="h-2 w-2 rounded-full bg-[#E5484D]/50" />
						<div className="h-2 w-2 rounded-full bg-[#F5A623]/50" />
						<div className="h-2 w-2 rounded-full bg-[#17B169]/50" />
					</div>
					<span className="ml-auto font-mono text-[9px] text-[#404040]">
						{label}
					</span>
				</div>
				{/* Content skeleton */}
				<div className="p-5 space-y-4">
					{lines.map((line, i) => (
						<div
							key={`${label}-${line.width}-${i}`}
							className="flex items-center gap-3"
						>
							<div
								className="h-2.5 w-2.5 shrink-0 rounded-full transition-colors"
								style={{
									backgroundColor: line.accent ? accentColor : "#262626",
								}}
							/>
							<div
								className="h-3 rounded-sm"
								style={{
									width: line.width,
									backgroundColor: line.accent ? `${accentColor}20` : "#1A1A1A",
								}}
							/>
						</div>
					))}
					{/* Bottom bar */}
					<div className="flex gap-2 pt-2 border-t border-[#1A1A1A]">
						{[1, 2, 3].map((n) => (
							<div
								key={n}
								className="h-6 flex-1 rounded-md"
								style={{
									backgroundColor: n === 1 ? `${accentColor}12` : "#141414",
								}}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

// ── Feature showcase block ──────────────────────────────────────────────

function FeatureShowcaseBlock({ feature }: { feature: FeatureShowcase }) {
	const Icon = feature.icon;
	const isRight = feature.mockupSide === "right";
	const textVariant = isRight ? fadeInLeft : fadeInRight;
	const mockupVariant = isRight ? scaleIn : scaleIn;

	return (
		<motion.div
			className="grid items-center gap-12 md:grid-cols-2 lg:gap-20"
			variants={staggerContainer}
			initial="hidden"
			whileInView="visible"
			viewport={{ once: true, amount: 0.25 }}
		>
			{/* Text */}
			<motion.div
				className={isRight ? "md:order-1" : "md:order-2"}
				variants={textVariant}
			>
				<div className="mb-4 flex items-center gap-3">
					<div
						className="flex h-9 w-9 items-center justify-center rounded-lg"
						style={{ backgroundColor: `${feature.accentColor}12` }}
					>
						<Icon size={18} weight="duotone" className={feature.iconClass} />
					</div>
					<span
						className="text-[11px] font-semibold uppercase"
						style={{
							color: feature.accentColor,
							letterSpacing: "0.1em",
						}}
					>
						{feature.label}
					</span>
				</div>
				<h3
					className="mb-4 text-2xl font-bold text-[#0A0A0A] dark:text-[#FAFAFA] lg:text-3xl"
					style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
				>
					{feature.title}
				</h3>
				<p className="mb-6 text-[15px] leading-relaxed text-[#636363] dark:text-[#999]">
					{feature.description}
				</p>
				<ul className="space-y-3">
					{feature.highlights.map((h) => (
						<li key={h} className="flex items-start gap-3 text-sm">
							<span
								className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
								style={{
									backgroundColor: `${feature.accentColor}12`,
									color: feature.accentColor,
								}}
							>
								&#10003;
							</span>
							<span className="text-[#636363] dark:text-[#999]">{h}</span>
						</li>
					))}
				</ul>
			</motion.div>

			{/* Mockup */}
			<motion.div
				className={isRight ? "md:order-2" : "md:order-1"}
				variants={mockupVariant}
			>
				<FeatureMockup
					accentColor={feature.accentColor}
					label={feature.label}
					lines={feature.mockupLines}
				/>
			</motion.div>
		</motion.div>
	);
}

// ── Main section ────────────────────────────────────────────────────────

export function FeaturesSection() {
	const shouldReduceMotion = useReducedMotion();
	const initial = shouldReduceMotion ? "visible" : "hidden";

	return (
		<section
			id="features"
			className="relative border-t border-[#E5E5E5] dark:border-[#1F1F1F] py-24 md:py-32"
			aria-label="Features"
		>
			<div className="mx-auto max-w-6xl px-6">
				{/* Section intro — full-width statement, no numbered header */}
				<motion.div
					className="mb-20 max-w-3xl"
					variants={fadeInUp}
					initial={initial}
					whileInView="visible"
					viewport={{ once: true, amount: 0.5 }}
				>
					<p className="mb-3 text-sm font-medium text-sienna-500 dark:text-sienna-400">
						What you get
					</p>
					<h2
						className="text-3xl font-bold text-[#0A0A0A] dark:text-[#FAFAFA] sm:text-4xl lg:text-5xl"
						style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}
					>
						Everything your team needs to ship
					</h2>
					<p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#636363] dark:text-[#999]">
						Project management, collaboration, and AI teammates — without the
						tool sprawl. One workspace, zero context switching.
					</p>
				</motion.div>

				{/* Alternating feature showcases */}
				<div className="space-y-28 md:space-y-36">
					{SHOWCASES.map((feature) => (
						<FeatureShowcaseBlock key={feature.label} feature={feature} />
					))}
				</div>

				{/* Quick features — different style: horizontal cards */}
				<motion.div
					className="mt-28 md:mt-36"
					variants={staggerFast}
					initial={initial}
					whileInView="visible"
					viewport={{ once: true, amount: 0.2 }}
				>
					<motion.div variants={fadeIn} className="mb-10 text-center">
						<p className="text-sm font-medium text-[#636363] dark:text-[#999]">
							Plus everything else
						</p>
					</motion.div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
						{QUICK_FEATURES.map((feature) => {
							const QIcon = feature.icon;
							return (
								<motion.div
									key={feature.title}
									variants={fadeInUp}
									className="group relative rounded-xl border border-[#E5E5E5] dark:border-[#1F1F1F] bg-[#FAFAFA] dark:bg-[#0A0A0A] p-5 transition-all duration-300 hover:border-sienna-500/30 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(194,106,58,0.06)]"
								>
									<div className="mb-3 flex items-center gap-2">
										<QIcon
											size={16}
											weight="duotone"
											className="text-sienna-500 dark:text-sienna-400"
										/>
										<h4 className="text-sm font-semibold text-[#0A0A0A] dark:text-[#FAFAFA]">
											{feature.title}
										</h4>
										{feature.comingSoon && (
											<span className="ml-auto rounded-full bg-sienna-500/10 px-2 py-0.5 text-[9px] font-medium text-sienna-500">
												Soon
											</span>
										)}
									</div>
									<p className="text-xs leading-relaxed text-[#737373] dark:text-[#666]">
										{feature.description}
									</p>
								</motion.div>
							);
						})}
					</div>
				</motion.div>
			</div>
		</section>
	);
}
