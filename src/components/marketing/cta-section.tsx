import Link from "next/link";

export function CtaSection() {
	return (
		<section
			className="relative overflow-hidden border-t border-[#E5E5E5] dark:border-[#1F1F1F] py-20 md:py-28"
			aria-label="Call to action"
		>
			{/* Subtle gradient background */}
			<div className="pointer-events-none absolute inset-0" aria-hidden>
				<div
					className="absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.08] dark:opacity-[0.06] animate-gradient-drift"
					style={{
						background:
							"radial-gradient(ellipse at center, #C26A3A 0%, transparent 70%)",
					}}
				/>
			</div>

			<div className="relative mx-auto max-w-6xl px-6 text-center">
				<h2
					className="text-3xl font-bold text-[#0A0A0A] dark:text-[#FAFAFA] sm:text-4xl"
					style={{ letterSpacing: "-0.02em" }}
				>
					Ready to build in sync?
				</h2>
				<p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[#525252] dark:text-[#A3A3A3]">
					Join teams shipping faster with AI teammates, real-time collaboration,
					and a workspace built for developers.
				</p>
				<div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
					<Link
						href={"/sign-in" as never}
						className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-sienna-500 px-8 py-3 text-sm font-medium text-white transition-all hover:bg-sienna-600 hover:scale-[1.03] hover:shadow-[0_0_20px_2px_rgba(194,106,58,0.3)] active:scale-100"
					>
						Start building
					</Link>
					<Link
						href={"/docs" as never}
						className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-[#D4D4D4] dark:border-[#262626] bg-transparent px-8 py-3 text-sm font-medium text-[#0A0A0A] dark:text-[#FAFAFA] transition-all hover:bg-[#F5F5F5] dark:hover:bg-[#171717] hover:scale-[1.03] active:scale-100"
					>
						Read the docs
					</Link>
				</div>
			</div>
		</section>
	);
}
