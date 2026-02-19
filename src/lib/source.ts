// @ts-expect-error fumadocs-mdx virtual module not resolved in IDE
import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});
