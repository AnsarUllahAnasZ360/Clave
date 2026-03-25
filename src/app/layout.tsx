import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { GeistPixelSquare } from "geist/font/pixel";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ConvexProvider } from "@/components/providers/convex-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
	subsets: ["latin"],
	variable: "--font-sans",
});

export const metadata: Metadata = {
	title: "Clave — Build in sync.",
	description:
		"The AI-native workspace for teams that ship. Combine Linear-style project management, collaborative docs, and autonomous AI agents in one platform.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${plusJakarta.variable} ${GeistPixelSquare.variable} font-sans antialiased`}
			>
				<ConvexAuthNextjsServerProvider>
					<ConvexProvider>
						<ThemeProvider
							attribute="class"
							defaultTheme="system"
							enableSystem
							disableTransitionOnChange
						>
							{children}
							<Toaster position="bottom-right" richColors />
						</ThemeProvider>
					</ConvexProvider>
				</ConvexAuthNextjsServerProvider>
			</body>
		</html>
	);
}
