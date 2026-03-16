// biome-ignore lint/suspicious/noTsIgnore: virtual module resolved at build time
// @ts-ignore — virtual module generated at build time by fumadocs-mdx
import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});
