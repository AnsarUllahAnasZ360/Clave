import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<RootProvider theme={{ enabled: false }}>
			<DocsLayout
				tree={source.pageTree}
				containerProps={{
					className: "[--fd-layout-width:100%]",
				}}
				nav={{
					title: <span className="font-semibold">Clave Docs</span>,
					url: "/docs",
				}}
				sidebar={{
					defaultOpenLevel: 1,
					collapsible: false,
				}}
				links={[
					{
						text: "Back to App",
						url: "/",
					},
				]}
			>
				{children}
			</DocsLayout>
		</RootProvider>
	);
}
