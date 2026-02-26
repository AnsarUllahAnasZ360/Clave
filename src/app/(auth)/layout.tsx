"use client";

import Link from "next/link";
import { PixelLogo } from "@/components/marketing/pixel-logo";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen">
			{/* Left panel — branding */}
			<div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-[#0A0A0A] p-12 text-white">
				<Link href="/" className="shrink-0" aria-label="Clave home">
					<PixelLogo cellSize={4} gap={1} color="#E08C5A" />
				</Link>

				<div className="flex-1 flex flex-col justify-center max-w-md">
					<blockquote className="space-y-4">
						<p className="text-2xl font-light leading-relaxed tracking-tight text-[#FAFAFA]">
							&ldquo;The best tools disappear into the work. Clave gives our
							team a shared brain — every issue, every doc, every conversation
							connected.&rdquo;
						</p>
						<footer className="text-sm text-[#A3A3A3]">
							<span className="text-[#E08C5A] font-medium">Build in sync.</span>{" "}
							&mdash; Where humans and AI ship together.
						</footer>
					</blockquote>
				</div>

				<p className="text-xs text-[#525252]">
					&copy; {new Date().getFullYear()} Clave. All rights reserved.
				</p>
			</div>

			{/* Right panel — auth form */}
			<div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-background px-6 py-12">
				{/* Mobile logo */}
				<div className="mb-8 lg:hidden">
					<Link href="/" aria-label="Clave home">
						<PixelLogo cellSize={3} gap={1} color="#C26A3A" />
					</Link>
				</div>

				{children}
			</div>
		</div>
	);
}
