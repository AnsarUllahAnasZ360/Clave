"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { fadeInUp } from "@/lib/animations";

export function AnimatedFeatures({ children }: { children: ReactNode }) {
	const shouldReduceMotion = useReducedMotion();

	if (shouldReduceMotion) {
		return <>{children}</>;
	}

	return (
		<motion.div
			variants={fadeInUp}
			initial="hidden"
			whileInView="visible"
			viewport={{ once: true, amount: 0.2 }}
		>
			{children}
		</motion.div>
	);
}
