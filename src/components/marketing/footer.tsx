import { GithubLogo } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { PixelLogo } from "./pixel-logo";

const FOOTER_LINKS = {
	Product: [
		{ label: "Features", href: "#features" },
		{ label: "Pricing", href: "#" },
		{ label: "Changelog", href: "/changelog" },
		{ label: "Roadmap", href: "#" },
	],
	Resources: [
		{ label: "Documentation", href: "/docs" },
		{ label: "Brand", href: "/brand" },
		{ label: "API reference", href: "#" },
		{ label: "Status", href: "#" },
	],
	Company: [
		{ label: "About", href: "#" },
		{ label: "Blog", href: "#" },
		{ label: "Privacy", href: "#" },
		{ label: "Terms", href: "#" },
	],
};

export function Footer() {
	return (
		<footer className="border-t border-[#E5E5E5] dark:border-[#1F1F1F]">
			<div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
				{/* Top section: logo + nav columns */}
				<div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-5">
					{/* Logo and tagline */}
					<div className="sm:col-span-2">
						<PixelLogo cellSize={3} gap={1} color="currentColor" />
						<p className="mt-3 max-w-xs text-sm leading-relaxed text-[#A3A3A3] dark:text-[#525252]">
							The AI-native workspace for teams that ship. Build in sync.
						</p>
						{/* Social links */}
						<div className="mt-5 flex items-center gap-3">
							<a
								href="https://github.com/AnsarUllahAnasZ360/Clave"
								target="_blank"
								rel="noopener noreferrer"
								className="flex h-8 w-8 items-center justify-center rounded-md text-[#A3A3A3] dark:text-[#525252] transition-colors hover:bg-[#F5F5F5] dark:hover:bg-[#171717] hover:text-[#525252] dark:hover:text-[#A3A3A3]"
								aria-label="GitHub"
							>
								<GithubLogo size={18} weight="regular" />
							</a>
						</div>
					</div>

					{/* Nav columns */}
					{Object.entries(FOOTER_LINKS).map(([category, links]) => (
						<nav key={category} aria-label={`${category} links`}>
							<p
								className="mb-3 text-xs font-semibold uppercase text-[#A3A3A3] dark:text-[#525252]"
								style={{ letterSpacing: "0.06em" }}
							>
								{category}
							</p>
							<ul className="flex flex-col gap-2.5">
								{links.map((link) => {
									const isInternal =
										link.href.startsWith("/") && link.href !== "#";
									return (
										<li key={link.label}>
											{isInternal ? (
												<Link
													href={link.href as never}
													prefetch={false}
													className="text-sm text-[#A3A3A3] dark:text-[#525252] transition-colors hover:text-[#525252] dark:hover:text-[#A3A3A3]"
												>
													{link.label}
												</Link>
											) : (
												<a
													href={link.href}
													className="text-sm text-[#A3A3A3] dark:text-[#525252] transition-colors hover:text-[#525252] dark:hover:text-[#A3A3A3]"
												>
													{link.label}
												</a>
											)}
										</li>
									);
								})}
							</ul>
						</nav>
					))}
				</div>

				{/* Bottom bar */}
				<div className="mt-10 flex flex-col items-center gap-4 border-t border-[#E5E5E5] dark:border-[#1F1F1F] pt-6 sm:flex-row sm:justify-between">
					<p className="text-xs text-[#A3A3A3] dark:text-[#404040]">
						{new Date().getFullYear()} Clave. All rights reserved.
					</p>
					<p className="text-xs text-[#A3A3A3] dark:text-[#404040]">
						goclave.app
					</p>
				</div>
			</div>
		</footer>
	);
}
