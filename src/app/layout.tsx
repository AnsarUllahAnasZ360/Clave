import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GeistPixelSquare } from "geist/font/pixel";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexProvider } from "@/components/providers/convex-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
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
				className={`${inter.variable} ${GeistPixelSquare.variable} font-sans antialiased`}
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
						</ThemeProvider>
					</ConvexProvider>
				</ConvexAuthNextjsServerProvider>
			</body>
		</html>
	);
}
