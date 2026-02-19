import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Shared content | Clave",
	description: "View shared content on Clave",
};

export default function ShareLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col bg-background">{children}</div>
	);
}
