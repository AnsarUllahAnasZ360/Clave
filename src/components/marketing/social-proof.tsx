"use client";

import { Quotes } from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "motion/react";
import { fadeIn, fadeInUp, scaleIn, staggerContainer } from "@/lib/animations";

// ── Data ─────────────────────────────────────────────────────────────────

const TESTIMONIALS = [
	{
		quote:
			"We replaced Linear, Notion, and a handful of integrations with Clave. The real-time sync alone was worth the switch.",
		name: "Sarah Kim",
		role: "Engineering Manager",
		company: "Meridian Labs",
		initials: "SK",
	},
	{
		quote:
			"Having AI teammates that actually pick up issues and deliver code changed how we think about sprint planning.",
		name: "Marco Alvarez",
		role: "CTO",
		company: "Onda Studio",
		initials: "MA",
	},
	{
		quote:
			"Keyboard-first, real-time, dark mode by default. Clave feels like it was built by engineers who understand our workflow.",
		name: "Alex Chen",
		role: "Senior Developer",
		company: "Tidal Systems",
		initials: "AC",
	},
];

const STATS = [
	{ value: "22+", label: "Database tables", detail: "Full-featured backend" },
	{
		value: "100+",
		label: "UI components",
		detail: "Production-ready from day one",
	},
	{ value: "21+", label: "AI tools", detail: "Built into every workspace" },
	{ value: "<50ms", label: "Sync latency", detail: "Real-time, always" },
];

const TECH_STACK = [
	"Next.js 16",
	"React 19",
	"Convex",
	"TypeScript",
	"Tailwind CSS",
	"Vercel",
];

// ── Component ────────────────────────────────────────────────────────────

export function SocialProof() {
	const shouldReduceMotion = useReducedMotion();
	const initial = shouldReduceMotion ? "visible" : "hidden";

	return (
		<>
			{/* ── Stats band — contrasting background ────────────────── */}
			<section
				className="relative overflow-hidden bg-[#F5F5F5] dark:bg-[#0A0A0A] py-20 md:py-24"
				aria-label="Platform stats"
			>
				{/* Glow accents */}
				<div className="pointer-events-none absolute inset-0" aria-hidden>
					<div
						className="absolute left-1/4 top-0 h-[300px] w-[400px] rounded-full opacity-[0.06] animate-float-slow"
						style={{
							background:
								"radial-gradient(ellipse at center, #C26A3A 0%, transparent 70%)",
						}}
					/>
					<div
						className="absolute right-1/4 bottom-0 h-[250px] w-[350px] rounded-full opacity-[0.04]"
						style={{
							background:
								"radial-gradient(ellipse at center, #0091FF 0%, transparent 70%)",
						}}
					/>
				</div>

				<div className="relative mx-auto max-w-6xl px-6">
					<motion.div
						className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:gap-10"
						variants={staggerContainer}
						initial={initial}
						whileInView="visible"
						viewport={{ once: true, amount: 0.3 }}
					>
						{STATS.map((stat) => (
							<motion.div
								key={stat.label}
								variants={scaleIn}
								className="text-center"
							>
								<p
									className="text-3xl font-bold text-[#0A0A0A] dark:text-white sm:text-4xl lg:text-5xl"
									style={{ letterSpacing: "-0.03em" }}
								>
									{stat.value}
								</p>
								<p className="mt-2 text-sm font-medium text-[#525252] dark:text-[#A3A3A3]">
									{stat.label}
								</p>
								<p className="mt-0.5 text-xs text-[#A3A3A3] dark:text-[#525252]">
									{stat.detail}
								</p>
							</motion.div>
						))}
					</motion.div>
				</div>
			</section>

			{/* ── Testimonials — light section ───────────────────────── */}
			<section
				className="border-t border-[#E5E5E5] dark:border-[#1F1F1F] py-24 md:py-32"
				aria-label="Testimonials"
			>
				<div className="mx-auto max-w-6xl px-6">
					{/* Header — right-aligned for variety */}
					<motion.div
						className="mb-14 ml-auto max-w-lg text-right"
						variants={fadeIn}
						initial={initial}
						whileInView="visible"
						viewport={{ once: true, amount: 0.5 }}
					>
						<p className="mb-2 text-sm font-medium text-sienna-500 dark:text-sienna-400">
							From our users
						</p>
						<h2
							className="text-2xl font-bold text-[#0A0A0A] dark:text-[#FAFAFA] sm:text-3xl"
							style={{ letterSpacing: "-0.02em" }}
						>
							Teams ship faster with Clave
						</h2>
					</motion.div>

					{/* Cards */}
					<motion.div
						className="grid grid-cols-1 gap-5 md:grid-cols-3"
						variants={staggerContainer}
						initial={initial}
						whileInView="visible"
						viewport={{ once: true, amount: 0.2 }}
					>
						{TESTIMONIALS.map((t, i) => (
							<motion.div
								key={t.name}
								variants={fadeInUp}
								className="group flex flex-col rounded-xl border border-[#E5E5E5] dark:border-[#1F1F1F] bg-[#FAFAFA] dark:bg-[#0A0A0A] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
								style={{
									// Offset cards vertically for visual interest
									marginTop: i === 1 ? "24px" : i === 2 ? "48px" : "0",
								}}
							>
								<Quotes
									size={24}
									weight="duotone"
									className="mb-4 text-sienna-400/40"
								/>
								<p className="flex-1 text-[15px] leading-relaxed text-[#525252] dark:text-[#999]">
									&ldquo;{t.quote}&rdquo;
								</p>
								<div className="mt-6 flex items-center gap-3 border-t border-[#E5E5E5] dark:border-[#1F1F1F] pt-4">
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-sienna-500/10 text-xs font-bold text-sienna-500">
										{t.initials}
									</div>
									<div>
										<p className="text-sm font-medium text-[#0A0A0A] dark:text-[#FAFAFA]">
											{t.name}
										</p>
										<p className="text-[11px] text-[#A3A3A3] dark:text-[#525252]">
											{t.role}, {t.company}
										</p>
									</div>
								</div>
							</motion.div>
						))}
					</motion.div>

					{/* Tech stack badges */}
					<motion.div
						className="mt-20 text-center"
						variants={fadeInUp}
						initial={initial}
						whileInView="visible"
						viewport={{ once: true, amount: 0.5 }}
					>
						<p
							className="mb-5 text-[11px] font-medium uppercase text-[#A3A3A3] dark:text-[#525252]"
							style={{ letterSpacing: "0.12em" }}
						>
							Built with modern tools
						</p>
						<div className="flex flex-wrap items-center justify-center gap-3">
							{TECH_STACK.map((name) => (
								<span
									key={name}
									className="rounded-full border border-[#E5E5E5] dark:border-[#1F1F1F] bg-white dark:bg-[#0A0A0A] px-4 py-2 font-mono text-[11px] text-[#737373] transition-colors hover:border-sienna-500/30 hover:text-sienna-500"
								>
									{name}
								</span>
							))}
						</div>
					</motion.div>
				</div>
			</section>
		</>
	);
}
