import type { Variants } from "motion/react";

export const fadeInUp: Variants = {
	hidden: { opacity: 0, y: 30 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { type: "spring", stiffness: 80, damping: 18, duration: 0.6 },
	},
};

export const fadeIn: Variants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { type: "spring", stiffness: 80, damping: 18 },
	},
};

export const fadeInLeft: Variants = {
	hidden: { opacity: 0, x: -40 },
	visible: {
		opacity: 1,
		x: 0,
		transition: { type: "spring", stiffness: 80, damping: 18, duration: 0.6 },
	},
};

export const fadeInRight: Variants = {
	hidden: { opacity: 0, x: 40 },
	visible: {
		opacity: 1,
		x: 0,
		transition: { type: "spring", stiffness: 80, damping: 18, duration: 0.6 },
	},
};

export const scaleIn: Variants = {
	hidden: { opacity: 0, scale: 0.92 },
	visible: {
		opacity: 1,
		scale: 1,
		transition: { type: "spring", stiffness: 80, damping: 18, duration: 0.5 },
	},
};

export const staggerContainer: Variants = {
	hidden: {},
	visible: {
		transition: { staggerChildren: 0.1 },
	},
};

export const staggerFast: Variants = {
	hidden: {},
	visible: {
		transition: { staggerChildren: 0.06 },
	},
};

export const scaleOnHover = {
	whileHover: { scale: 1.03 },
	transition: { type: "spring", stiffness: 300, damping: 20 },
} as const;
