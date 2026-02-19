import type { Metadata } from "next";
import { AuthRedirect } from "@/components/marketing/auth-redirect";
import { Footer } from "@/components/marketing/footer";
import { Navbar } from "@/components/marketing/navbar";

export const metadata: Metadata = {
	title: "Clave — Build in sync.",
	description:
		"The AI-native workspace for teams that ship. Combine Linear-style project management, collaborative docs, and autonomous AI agents in one platform.",
	keywords: [
		"project management",
		"AI agents",
		"team collaboration",
		"Kanban board",
		"sprint planning",
		"engineering teams",
		"real-time sync",
		"developer tools",
	],
	openGraph: {
		title: "Clave — Build in sync.",
		description:
			"The AI-native workspace for teams that ship. Combine project management, collaborative docs, and autonomous AI agents in one platform.",
		url: "https://goclave.app",
		siteName: "Clave",
		type: "website",
		locale: "en_US",
	},
	twitter: {
		card: "summary_large_image",
		title: "Clave — Build in sync.",
		description: "The AI-native workspace for teams that ship.",
	},
	robots: {
		index: true,
		follow: true,
	},
};

const jsonLd = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "Clave",
	description:
		"The AI-native workspace for teams that ship. Combine Linear-style project management, collaborative docs, and autonomous AI agents in one platform.",
	url: "https://goclave.app",
	applicationCategory: "BusinessApplication",
	operatingSystem: "Web",
	offers: {
		"@type": "Offer",
		price: "0",
		priceCurrency: "USD",
	},
};

export default function MarketingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-screen bg-white dark:bg-[#0A0A0A] text-[#0A0A0A] dark:text-[#FAFAFA]">
			<AuthRedirect />
			<Navbar />
			<main>{children}</main>
			<Footer />
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data for SEO
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
		</div>
	);
}
