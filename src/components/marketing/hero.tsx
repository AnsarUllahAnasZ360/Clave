import Link from "next/link";
import { ProductMockup } from "./product-mockup";

export function Hero() {
	return (
		<section className="relative overflow-hidden" aria-label="Hero">
			{/* Background effects */}
			<div className="pointer-events-none absolute inset-0" aria-hidden>
				<div
					className="absolute left-1/2 top-20 h-[700px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.15] dark:opacity-[0.08] animate-gradient-drift"
					style={{
						background:
							"radial-gradient(ellipse at center, #C26A3A 0%, transparent 70%)",
					}}
				/>
				<div
					className="absolute right-1/4 top-48 h-[500px] w-[700px] rounded-full opacity-[0.08] dark:opacity-[0.05] animate-float-slow"
					style={{
						background:
							"radial-gradient(ellipse at center, #0091FF 0%, transparent 70%)",
					}}
				/>
				<div
					className="absolute inset-0 opacity-[0.025] dark:opacity-[0.015]"
					style={{
						backgroundImage:
							"linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
						backgroundSize: "80px 80px",
					}}
				/>
				{/* Floating dots */}
				<div className="absolute left-[15%] top-[20%] h-1.5 w-1.5 rounded-full bg-sienna-400/30 animate-float" />
				<div className="absolute left-[75%] top-[15%] h-1 w-1 rounded-full bg-sienna-400/20 animate-float-delayed" />
				<div className="absolute left-[85%] top-[40%] h-2 w-2 rounded-full bg-blue-400/15 animate-float-slow" />
				<div className="absolute left-[10%] top-[50%] h-1 w-1 rounded-full bg-blue-400/20 animate-float-delayed" />
			</div>

			<div className="relative mx-auto max-w-6xl px-6 pb-24 pt-28 md:pb-32 md:pt-36 lg:pt-44">
				<div className="hero-stagger mx-auto max-w-3xl text-center">
					{/* Pill badge */}
					<div className="mb-8 inline-flex items-center gap-2 rounded-full border border-sienna-500/20 bg-sienna-500/5 px-4 py-1.5">
						<span className="h-1.5 w-1.5 rounded-full bg-sienna-500 animate-glow-pulse" />
						<span className="text-xs font-medium text-sienna-500 dark:text-sienna-400">
							AI-native project management
						</span>
					</div>

					<h1
						className="text-5xl font-bold text-[#0A0A0A] dark:text-[#FAFAFA] sm:text-6xl md:text-7xl lg:text-8xl"
						style={{ letterSpacing: "-0.04em", lineHeight: 1.0 }}
					>
						Build in{" "}
						<span className="relative inline-block">
							<span className="relative z-10 bg-gradient-to-r from-sienna-400 via-sienna-500 to-sienna-600 bg-clip-text text-transparent">
								sync
							</span>
							<span
								className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full opacity-60"
								style={{
									background:
										"linear-gradient(90deg, transparent, #C26A3A, transparent)",
								}}
							/>
						</span>
						.
					</h1>

					<p
						className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#525252] dark:text-[#A3A3A3] md:text-xl"
						style={{ letterSpacing: "-0.01em" }}
					>
						The workspace where humans and AI build together. Combine
						Linear-style issue tracking, collaborative docs, and autonomous AI
						agents — in one platform.
					</p>

					<div className="mt-12 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center">
						<Link
							href={"/sign-up" as never}
							prefetch={false}
							className="group inline-flex min-h-[48px] items-center justify-center rounded-lg bg-sienna-500 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-sienna-600 hover:scale-[1.02] hover:shadow-[0_0_30px_4px_rgba(194,106,58,0.25)] active:scale-100"
						>
							Start building
							<svg
								className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<title>Arrow right</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M13 7l5 5m0 0l-5 5m5-5H6"
								/>
							</svg>
						</Link>
						<a
							href="#features"
							className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-[#D4D4D4] dark:border-[#262626] bg-transparent px-8 py-3.5 text-sm font-medium text-[#0A0A0A] dark:text-[#FAFAFA] transition-all hover:bg-[#F5F5F5] dark:hover:bg-[#171717] hover:scale-[1.02] active:scale-100"
						>
							See how it works
						</a>
					</div>
				</div>

				{/* Product mockup with glow */}
				<div className="hero-mockup-reveal relative mx-auto mt-20 max-w-5xl md:mt-24">
					<div
						className="pointer-events-none absolute -inset-12 rounded-3xl opacity-[0.25] dark:opacity-[0.15] animate-glow-pulse"
						aria-hidden
						style={{
							background:
								"radial-gradient(ellipse at 50% 0%, #C26A3A 0%, transparent 50%)",
						}}
					/>
					<div className="relative rounded-xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.5)] dark:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.8)]">
						<ProductMockup />
					</div>
				</div>
			</div>
		</section>
	);
}
