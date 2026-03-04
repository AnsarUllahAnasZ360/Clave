import Link from "next/link";

export default function GoogleChatLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-4 py-12">
			<div className="mb-8">
				<Link
					href="/"
					className="text-sm font-medium text-neutral-400 hover:text-neutral-200 transition-colors"
				>
					Clave
				</Link>
			</div>
			{children}
		</div>
	);
}
