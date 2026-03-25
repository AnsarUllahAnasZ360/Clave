"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { fadeInUp, scaleIn, staggerContainer } from "@/lib/animations";

export function CtaSection() {
	const shouldReduceMotion = useReducedMotion();

	return (
		<section
			className="relative overflow-hidden bg-[#F0F0F0] dark:bg-[#0A0A0A] py-28 md:py-36"
			aria-label="Call to action"
		>
			{/* Dramatic gradient layers */}
			<div className="pointer-events-none absolute inset-0" aria-hidden>
				<div
					className="absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.15] animate-gradient-drift"
					style={{
						background:
							"radial-gradient(ellipse at center, #C26A3A 0%, transparent 55%)",
					}}
				/>
				<div
					className="absolute left-1/3 top-1/4 h-[400px] w-[500px] -translate-x-1/2 rounded-full opacity-[0.06] animate-float"
					style={{
						background:
							"radial-gradient(ellipse at center, #F5A623 0%, transparent 70%)",
					}}
				/>
				<div
					className="absolute right-1/4 bottom-1/4 h-[300px] w-[400px] rounded-full opacity-[0.04] animate-float-delayed"
					style={{
						background:
							"radial-gradient(ellipse at center, #0091FF 0%, transparent 70%)",
					}}
				/>
				{/* Grid texture */}
				<div
					className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]"
					style={{
						backgroundImage:
							"linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
						backgroundSize: "60px 60px",
					}}
				/>
			</div>

			<motion.div
				className="relative mx-auto max-w-3xl px-6 text-center"
				variants={staggerContainer}
				initial={shouldReduceMotion ? "visible" : "hidden"}
				whileInView="visible"
				viewport={{ once: true, amount: 0.4 }}
			>
				<motion.div variants={scaleIn}>
					<h2
						className="text-4xl font-bold text-[#0A0A0A] dark:text-white sm:text-5xl lg:text-6xl"
						style={{ letterSpacing: "-0.04em", lineHeight: 1.05 }}
					>
						Ready to{" "}
						<span className="bg-gradient-to-r from-sienna-400 to-sienna-500 bg-clip-text text-transparent">
							build in sync
						</span>
						?
					</h2>
				</motion.div>
				<motion.p
					variants={fadeInUp}
					className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-[#636363] dark:text-[#A3A3A3]"
				>
					Join teams shipping faster with AI teammates, real-time collaboration,
					and a workspace designed for how developers actually work.
				</motion.p>
				<motion.div
					variants={fadeInUp}
					className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
				>
					<Link
						href={"/sign-up" as never}
						prefetch={false}
						className="group inline-flex min-h-[52px] items-center justify-center rounded-lg bg-sienna-500 px-10 py-4 text-sm font-semibold text-white transition-all hover:bg-sienna-600 hover:scale-[1.02] hover:shadow-[0_0_40px_6px_rgba(194,106,58,0.3)] active:scale-100"
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
					<Link
						href={"/docs" as never}
						prefetch={false}
						className="inline-flex min-h-[52px] items-center justify-center rounded-lg border border-[#D4D4D4] dark:border-[#333] bg-transparent px-10 py-4 text-sm font-medium text-[#0A0A0A] dark:text-[#E5E5E5] transition-all hover:bg-[#E5E5E5] dark:hover:bg-[#111] hover:border-[#BBB] dark:hover:border-[#444] hover:scale-[1.02] active:scale-100"
					>
						Read the docs
					</Link>
				</motion.div>
			</motion.div>
		</section>
	);
}
