import type { Metadata } from "next";
import { ShareLayoutClient } from "./ShareLayoutClient";

export const metadata: Metadata = {
	title: "Shared content | Clave",
	description: "View shared content on Clave",
};

export default function ShareLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <ShareLayoutClient>{children}</ShareLayoutClient>;
}
