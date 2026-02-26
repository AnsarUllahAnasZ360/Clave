"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { PixelLogo } from "./pixel-logo";

export function Navbar() {
	const [mobileOpen, setMobileOpen] = useState(false);
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	const isDark = resolvedTheme === "dark";

	return (
		<nav
			className="sticky top-0 z-50 border-b border-[#E5E5E5] dark:border-[#1F1F1F] bg-white/90 dark:bg-[#0A0A0A]/90 backdrop-blur-md"
			aria-label="Main navigation"
		>
			<div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
				{/* Logo */}
				<Link
					href="/"
					prefetch={false}
					className="shrink-0"
					aria-label="Clave home"
				>
					<PixelLogo
						cellSize={3}
						gap={1}
						color={isDark ? "#E08C5A" : "#C26A3A"}
					/>
				</Link>

				{/* Desktop nav */}
				<div className="hidden items-center gap-8 md:flex">
					<a
						href="#features"
						className="relative text-sm text-[#525252] dark:text-[#A3A3A3] transition-colors hover:text-[#0A0A0A] dark:hover:text-[#FAFAFA] after:absolute after:bottom-[-2px] after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-200 hover:after:w-full"
					>
						Features
					</a>
					<Link
						href={"/docs" as never}
						prefetch={false}
						className="relative text-sm text-[#525252] dark:text-[#A3A3A3] transition-colors hover:text-[#0A0A0A] dark:hover:text-[#FAFAFA] after:absolute after:bottom-[-2px] after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-200 hover:after:w-full"
					>
						Docs
					</Link>
				</div>

				{/* Desktop CTAs */}
				<div className="hidden items-center gap-3 md:flex">
					{/* Theme toggle */}
					{mounted && (
						<button
							type="button"
							onClick={() => setTheme(isDark ? "light" : "dark")}
							className="flex h-9 w-9 items-center justify-center rounded-md text-[#525252] dark:text-[#A3A3A3] transition-colors hover:bg-[#F5F5F5] dark:hover:bg-[#171717] hover:text-[#0A0A0A] dark:hover:text-[#FAFAFA]"
							aria-label={
								isDark ? "Switch to light mode" : "Switch to dark mode"
							}
						>
							{isDark ? (
								<Sun size={18} weight="regular" />
							) : (
								<Moon size={18} weight="regular" />
							)}
						</button>
					)}
					<Link
						href={"/sign-in" as never}
						prefetch={false}
						className="rounded-md px-4 py-2 text-sm font-medium text-[#525252] dark:text-[#A3A3A3] transition-colors hover:text-[#0A0A0A] dark:hover:text-[#FAFAFA]"
					>
						Sign in
					</Link>
					<Link
						href={"/sign-up" as never}
						prefetch={false}
						className="rounded-md bg-sienna-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-sienna-600 hover:scale-[1.03] hover:shadow-[0_0_16px_2px_rgba(194,106,58,0.25)] active:scale-100"
					>
						Start building
					</Link>
				</div>

				{/* Mobile menu button */}
				<button
					type="button"
					onClick={() => setMobileOpen(!mobileOpen)}
					className="flex h-11 w-11 items-center justify-center rounded-md text-[#525252] dark:text-[#A3A3A3] transition-colors hover:text-[#0A0A0A] dark:hover:text-[#FAFAFA] md:hidden"
					aria-label="Toggle menu"
					aria-expanded={mobileOpen}
				>
					{mobileOpen ? (
						<svg
							width="18"
							height="18"
							viewBox="0 0 18 18"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<path d="M4 4l10 10M14 4L4 14" />
						</svg>
					) : (
						<svg
							width="18"
							height="18"
							viewBox="0 0 18 18"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<path d="M2 5h14M2 9h14M2 13h14" />
						</svg>
					)}
				</button>
			</div>

			{/* Mobile menu */}
			{mobileOpen && (
				<div className="border-t border-[#E5E5E5] dark:border-[#1F1F1F] px-6 pb-6 pt-4 md:hidden">
					<div className="flex flex-col gap-1">
						<button
							type="button"
							className="flex min-h-[44px] items-center text-left text-sm text-[#525252] dark:text-[#A3A3A3] transition-colors hover:text-[#0A0A0A] dark:hover:text-[#FAFAFA]"
							onClick={() => {
								setMobileOpen(false);
								document
									.getElementById("features")
									?.scrollIntoView({ behavior: "smooth" });
							}}
						>
							Features
						</button>
						<Link
							href={"/docs" as never}
							prefetch={false}
							className="flex min-h-[44px] items-center text-sm text-[#525252] dark:text-[#A3A3A3] transition-colors hover:text-[#0A0A0A] dark:hover:text-[#FAFAFA]"
							onClick={() => setMobileOpen(false)}
						>
							Docs
						</Link>
						<div className="mt-3 flex flex-col gap-3 border-t border-[#E5E5E5] dark:border-[#1F1F1F] pt-4">
							{/* Mobile theme toggle */}
							{mounted && (
								<button
									type="button"
									onClick={() => setTheme(isDark ? "light" : "dark")}
									className="flex min-h-[44px] items-center gap-2 text-sm text-[#525252] dark:text-[#A3A3A3] transition-colors hover:text-[#0A0A0A] dark:hover:text-[#FAFAFA]"
								>
									{isDark ? (
										<Sun size={16} weight="regular" />
									) : (
										<Moon size={16} weight="regular" />
									)}
									{isDark ? "Light mode" : "Dark mode"}
								</button>
							)}
							<Link
								href={"/sign-in" as never}
								prefetch={false}
								className="flex min-h-[44px] items-center text-sm font-medium text-[#525252] dark:text-[#A3A3A3] transition-colors hover:text-[#0A0A0A] dark:hover:text-[#FAFAFA]"
							>
								Sign in
							</Link>
							<Link
								href={"/sign-up" as never}
								prefetch={false}
								className="flex min-h-[44px] items-center justify-center rounded-md bg-sienna-500 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-sienna-600"
							>
								Start building
							</Link>
						</div>
					</div>
				</div>
			)}
		</nav>
	);
}
