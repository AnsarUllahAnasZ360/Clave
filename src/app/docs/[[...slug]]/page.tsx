import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
import defaultMdxComponents from "fumadocs-ui/mdx";
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/page";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type React from "react";
import { source } from "@/lib/source";

interface PageProps {
	params: Promise<{ slug?: string[] }>;
}

export default async function Page(props: PageProps) {
	const params = await props.params;
	const page = source.getPage(params.slug);

	if (!page) {
		notFound();
	}

	// fumadocs-mdx virtual module provides body/toc/full at build time
	const pageData = page.data as unknown as Record<string, unknown>;
	const MDX = pageData.body as React.ComponentType<{
		// biome-ignore lint/suspicious/noExplicitAny: MDX component types are dynamic
		components?: Record<string, React.ComponentType<any>>;
	}>;
	const breadcrumbs = getBreadcrumbItems(page.url, source.pageTree, {
		includeRoot: false,
		includePage: false,
		includeSeparator: true,
	});

	const breadcrumbComponent =
		breadcrumbs.length > 0 ? (
			<div className="flex items-center gap-1.5 text-sm text-fd-muted-foreground">
				{breadcrumbs.map((item) => (
					<span
						key={`${item.url ?? ""}-${item.name}`}
						className="flex items-center gap-1.5"
					>
						{item !== breadcrumbs[0] && (
							<ChevronRight className="size-3.5 shrink-0" />
						)}
						{item.url ? (
							<a
								href={item.url}
								className="truncate transition-opacity hover:opacity-80"
							>
								{item.name}
							</a>
						) : (
							<span className="truncate">{item.name}</span>
						)}
					</span>
				))}
			</div>
		) : undefined;

	return (
		<DocsPage
			toc={pageData.toc as never}
			full={pageData.full as boolean | undefined}
			breadcrumb={{ component: breadcrumbComponent }}
			className="max-w-[980px] xl:mx-0"
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
			<DocsBody>
				<MDX
					components={
						// biome-ignore lint/suspicious/noExplicitAny: MDX component types are dynamic
						defaultMdxComponents as Record<string, React.ComponentType<any>>
					}
				/>
			</DocsBody>
		</DocsPage>
	);
}

export async function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
	const params = await props.params;
	const page = source.getPage(params.slug);

	if (!page) notFound();

	return {
		title: page.data.title,
		description: page.data.description,
	};
}
