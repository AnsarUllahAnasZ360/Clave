import { Quotes } from "@phosphor-icons/react/dist/ssr";

interface Testimonial {
	quote: string;
	name: string;
	role: string;
	company: string;
}

const TESTIMONIALS: Testimonial[] = [
	{
		quote:
			"We replaced Linear, Notion, and a handful of integrations with Clave. The real-time sync alone was worth the switch.",
		name: "Sarah Kim",
		role: "Engineering Manager",
		company: "Meridian Labs",
	},
	{
		quote:
			"Having AI teammates that actually pick up issues and deliver code changed how we think about sprint planning.",
		name: "Marco Alvarez",
		role: "CTO",
		company: "Onda Studio",
	},
	{
		quote:
			"Keyboard-first, real-time, dark mode by default. Clave feels like it was built by engineers who understand our workflow.",
		name: "Alex Chen",
		role: "Senior Developer",
		company: "Tidal Systems",
	},
];

interface TechBadge {
	name: string;
	label: string;
}

const TECH_BADGES: TechBadge[] = [
	{ name: "Next.js", label: "Next.js 16" },
	{ name: "React", label: "React 19" },
	{ name: "Convex", label: "Convex" },
	{ name: "TypeScript", label: "TypeScript" },
	{ name: "Tailwind", label: "Tailwind CSS" },
	{ name: "Vercel", label: "Vercel" },
];

interface ValueProp {
	metric: string;
	description: string;
}

const VALUE_PROPS: ValueProp[] = [
	{ metric: "Real-time sync", description: "Every change, instant" },
	{ metric: "Type-safe", description: "From database to UI" },
	{ metric: "22+ tables", description: "Full-featured backend" },
	{ metric: "100+ components", description: "Production-ready UI" },
];

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
	return (
		<div className="flex flex-col justify-between rounded-xl border border-[#E5E5E5] dark:border-[#1F1F1F] bg-[#FAFAFA] dark:bg-[#0E0E0E] p-6">
			<div>
				<Quotes
					size={20}
					weight="duotone"
					className="mb-4 text-sienna-400/40"
				/>
				<p className="text-sm leading-relaxed text-[#525252] dark:text-[#A3A3A3]">
					{testimonial.quote}
				</p>
			</div>
			<div className="mt-6 border-t border-[#E5E5E5] dark:border-[#1F1F1F] pt-4">
				<p className="text-sm font-medium text-[#0A0A0A] dark:text-[#FAFAFA]">
					{testimonial.name}
				</p>
				<p className="mt-0.5 text-xs text-[#A3A3A3] dark:text-[#525252]">
					{testimonial.role}, {testimonial.company}
				</p>
			</div>
		</div>
	);
}

export function SocialProof() {
	return (
		<section
			className="border-t border-[#E5E5E5] dark:border-[#1F1F1F] py-20 md:py-28"
			aria-label="Social proof"
		>
			<div className="mx-auto max-w-6xl px-6">
				{/* Section header */}
				<div className="mb-12 flex items-center gap-4">
					<span
						className="font-mono text-xs text-[#737373]"
						style={{ letterSpacing: "0.05em" }}
					>
						02
					</span>
					<div className="h-px w-8 bg-sienna-500" />
					<h2
						className="text-2xl font-semibold text-[#0A0A0A] dark:text-[#FAFAFA]"
						style={{ letterSpacing: "-0.02em" }}
					>
						Trusted by teams who build
					</h2>
				</div>

				{/* Testimonials grid */}
				<div className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-3">
					{TESTIMONIALS.map((testimonial) => (
						<TestimonialCard key={testimonial.name} testimonial={testimonial} />
					))}
				</div>

				{/* Value props */}
				<div className="mb-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
					{VALUE_PROPS.map((prop) => (
						<div
							key={prop.metric}
							className="rounded-xl border border-[#E5E5E5] dark:border-[#1F1F1F] bg-[#FAFAFA] dark:bg-[#0E0E0E] px-5 py-4 text-center"
						>
							<p
								className="text-lg font-semibold text-[#0A0A0A] dark:text-[#FAFAFA]"
								style={{ letterSpacing: "-0.01em" }}
							>
								{prop.metric}
							</p>
							<p className="mt-1 text-xs text-[#A3A3A3] dark:text-[#525252]">
								{prop.description}
							</p>
						</div>
					))}
				</div>

				{/* Built with tech badges */}
				<div className="text-center">
					<p
						className="mb-4 text-xs font-medium uppercase text-[#A3A3A3] dark:text-[#525252]"
						style={{ letterSpacing: "0.08em" }}
					>
						Built with
					</p>
					<div className="flex flex-wrap items-center justify-center gap-3">
						{TECH_BADGES.map((badge) => (
							<span
								key={badge.name}
								className="rounded-full border border-[#E5E5E5] dark:border-[#1F1F1F] bg-[#FAFAFA] dark:bg-[#0E0E0E] px-4 py-1.5 font-mono text-xs text-[#737373]"
							>
								{badge.label}
							</span>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
