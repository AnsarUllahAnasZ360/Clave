import Link from "next/link";
import { ProductMockup } from "./product-mockup";

export function Hero() {
	return (
		<section className="relative overflow-hidden" aria-label="Hero">
			{/* Gradient background effects */}
			<div className="pointer-events-none absolute inset-0" aria-hidden>
				{/* Large radial glow — sienna, behind hero text */}
				<div
					className="absolute left-1/2 top-32 h-[600px] w-[800px] -translate-x-1/2 rounded-full opacity-[0.12] dark:opacity-[0.07] animate-gradient-drift"
					style={{
						background:
							"radial-gradient(ellipse at center, #C26A3A 0%, transparent 70%)",
					}}
				/>
				{/* Secondary glow — cool accent for depth */}
				<div
					className="absolute left-1/4 top-64 h-[400px] w-[600px] -translate-x-1/2 rounded-full opacity-[0.06] dark:opacity-[0.04]"
					style={{
						background:
							"radial-gradient(ellipse at center, #0091FF 0%, transparent 70%)",
					}}
				/>
				{/* Grid pattern overlay for subtle texture */}
				<div
					className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]"
					style={{
						backgroundImage:
							"linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
						backgroundSize: "64px 64px",
					}}
				/>
			</div>

			{/* Content */}
			<div className="relative mx-auto max-w-6xl px-6 pb-20 pt-24 md:pb-28 md:pt-32 lg:pt-40">
				{/* Text block — staggered animation */}
				<div className="hero-stagger mx-auto max-w-3xl text-center">
					{/* Eyebrow */}
					<p
						className="mb-6 font-mono text-xs font-medium uppercase text-sienna-500 dark:text-sienna-400"
						style={{ letterSpacing: "0.1em" }}
					>
						AI-native project management
					</p>

					{/* Headline */}
					<h1
						className="text-4xl font-bold text-[#0A0A0A] dark:text-[#FAFAFA] sm:text-5xl md:text-6xl lg:text-7xl"
						style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
					>
						Build in sync.
					</h1>

					{/* Sub-headline */}
					<p
						className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#525252] dark:text-[#A3A3A3] md:text-lg"
						style={{ letterSpacing: "-0.01em" }}
					>
						The workspace where humans and AI build together. Combine
						Linear-style project management, collaborative docs, and autonomous
						AI agents — in one platform.
					</p>

					{/* CTAs */}
					<div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center">
						<Link
							href={"/sign-in" as never}
							className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-sienna-500 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-sienna-600 hover:scale-[1.03] hover:shadow-[0_0_20px_2px_rgba(194,106,58,0.3)] active:scale-100"
						>
							Start building
						</Link>
						<a
							href="#features"
							className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-[#D4D4D4] dark:border-[#262626] bg-transparent px-6 py-3 text-sm font-medium text-[#0A0A0A] dark:text-[#FAFAFA] transition-all hover:bg-[#F5F5F5] dark:hover:bg-[#171717] hover:scale-[1.03] active:scale-100"
						>
							See how it works
						</a>
					</div>
				</div>

				{/* Product screenshot mockup */}
				<div className="hero-mockup-reveal relative mx-auto mt-16 max-w-5xl md:mt-20">
					{/* Glow behind screenshot */}
					<div
						className="pointer-events-none absolute -inset-8 rounded-2xl opacity-[0.20] dark:opacity-[0.15]"
						aria-hidden
						style={{
							background:
								"radial-gradient(ellipse at 50% 0%, #C26A3A 0%, transparent 60%)",
						}}
					/>
					<div className="relative">
						<ProductMockup />
					</div>
				</div>
			</div>
		</section>
	);
}
