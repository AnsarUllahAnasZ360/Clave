import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/page";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

	const MDX = page.data.body;
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
						key={`${item.url ?? item.name}-${item.name}`}
						className="flex items-center gap-1.5"
					>
						{i !== 0 && <ChevronRight className="size-3.5 shrink-0" />}
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
			toc={page.data.toc}
			full={page.data.full}
			breadcrumb={{ component: breadcrumbComponent }}
			className="max-w-[980px] xl:mx-0"
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
			<DocsBody>
				<MDX />
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
