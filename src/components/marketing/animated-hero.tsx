"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { fadeInUp, staggerContainer } from "@/lib/animations";

export function AnimatedHero({ children }: { children: ReactNode }) {
	const shouldReduceMotion = useReducedMotion();

	if (shouldReduceMotion) {
		return <>{children}</>;
	}

	return (
		<motion.div variants={staggerContainer} initial="hidden" animate="visible">
			<motion.div variants={fadeInUp}>{children}</motion.div>
		</motion.div>
	);
}
