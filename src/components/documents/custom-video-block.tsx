"use client";

import {
	BlockNoteSchema,
	createVideoBlockConfig,
	defaultBlockSpecs,
	videoParse,
} from "@blocknote/core";
import {
	createReactBlockSpec,
	type ReactCustomBlockRenderProps,
	ResizableFileBlockWrapper,
	useResolveUrl,
} from "@blocknote/react";
import { Video } from "lucide-react";

type VideoBlockConfig = ReturnType<typeof createVideoBlockConfig>;

function getYouTubeId(url: string): string | null {
	try {
		const u = new URL(url);
		if (
			u.hostname === "www.youtube.com" ||
			u.hostname === "youtube.com" ||
			u.hostname === "m.youtube.com"
		) {
			if (u.pathname === "/watch") return u.searchParams.get("v");
			const embedMatch = u.pathname.match(/^\/embed\/([^/?]+)/);
			if (embedMatch) return embedMatch[1];
		}
		if (u.hostname === "youtu.be") {
			return u.pathname.slice(1).split("/")[0] || null;
		}
	} catch {
		return null;
	}
	return null;
}

function getVimeoId(url: string): string | null {
	try {
		const u = new URL(url);
		if (u.hostname === "vimeo.com" || u.hostname === "www.vimeo.com") {
			const match = u.pathname.match(/^\/(\d+)/);
			return match ? match[1] : null;
		}
		if (u.hostname === "player.vimeo.com") {
			const match = u.pathname.match(/^\/video\/(\d+)/);
			return match ? match[1] : null;
		}
	} catch {
		return null;
	}
	return null;
}

function getEmbedUrl(
	url: string,
): { type: "youtube" | "vimeo"; embedUrl: string } | null {
	const ytId = getYouTubeId(url);
	if (ytId) {
		return {
			type: "youtube",
			embedUrl: `https://www.youtube.com/embed/${ytId}`,
		};
	}
	const vimeoId = getVimeoId(url);
	if (vimeoId) {
		return {
			type: "vimeo",
			embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
		};
	}
	return null;
}

type VideoPreviewProps = Omit<
	ReactCustomBlockRenderProps<
		VideoBlockConfig["type"],
		VideoBlockConfig["propSchema"],
		VideoBlockConfig["content"]
	>,
	"contentRef"
>;

const CustomVideoPreview = (props: VideoPreviewProps) => {
	const resolved = useResolveUrl(props.block.props.url ?? "");
	const url =
		resolved.loadingState === "loading"
			? props.block.props.url
			: resolved.downloadUrl;

	const embed = url ? getEmbedUrl(url) : null;

	if (embed) {
		return (
			<div
				style={{
					position: "relative",
					width: "100%",
					paddingBottom: "56.25%",
					height: 0,
					overflow: "hidden",
					borderRadius: "4px",
				}}
			>
				<iframe
					src={embed.embedUrl}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: "100%",
						height: "100%",
						border: "none",
					}}
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
					allowFullScreen
					title={`${embed.type} video`}
				/>
			</div>
		);
	}

	return (
		// biome-ignore lint/a11y/useMediaCaption: BlockNote default video block pattern, captions not available for user-provided URLs
		<video
			className="bn-visual-media"
			src={url ?? undefined}
			controls={true}
			contentEditable={false}
			draggable={false}
		/>
	);
};

const CustomVideoBlock = (
	props: ReactCustomBlockRenderProps<
		VideoBlockConfig["type"],
		VideoBlockConfig["propSchema"],
		VideoBlockConfig["content"]
	>,
) => {
	return (
		<ResizableFileBlockWrapper
			{...(props as unknown as Parameters<typeof ResizableFileBlockWrapper>[0])}
			buttonIcon={<Video size={24} />}
		>
			<CustomVideoPreview {...(props as unknown as VideoPreviewProps)} />
		</ResizableFileBlockWrapper>
	);
};

const CustomVideoToExternalHTML = (props: VideoPreviewProps) => {
	if (!props.block.props.url) {
		return <p>Add video</p>;
	}

	const embed = getEmbedUrl(props.block.props.url);

	if (embed && props.block.props.showPreview) {
		return (
			<iframe
				src={embed.embedUrl}
				width={props.block.props.previewWidth || 560}
				height={
					props.block.props.previewWidth
						? Math.round(props.block.props.previewWidth * 0.5625)
						: 315
				}
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				allowFullScreen
				title="video"
			/>
		);
	}

	const video = props.block.props.showPreview ? (
		// biome-ignore lint/a11y/useMediaCaption: External HTML export, captions not available
		<video src={props.block.props.url} />
	) : (
		<a href={props.block.props.url}>
			{props.block.props.name || props.block.props.url}
		</a>
	);

	return video;
};

export const customVideoBlock = createReactBlockSpec(
	createVideoBlockConfig,
	(config) => ({
		render: CustomVideoBlock,
		parse: videoParse(config),
		toExternalHTML: CustomVideoToExternalHTML,
	}),
);

export const customBlockSchema = BlockNoteSchema.create({
	blockSpecs: {
		...defaultBlockSpecs,
		video: customVideoBlock(),
	},
});
