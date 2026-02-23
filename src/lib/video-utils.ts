/**
 * Pure URL parsing utilities for YouTube and Vimeo video embeds.
 * No editor dependencies — reusable across the application.
 */

export function getYouTubeId(url: string): string | null {
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

export function getVimeoId(url: string): string | null {
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

export function getEmbedUrl(
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

/** Check if a URL is a video embed (YouTube or Vimeo). */
export function isVideoEmbedUrl(url: string): boolean {
	return getEmbedUrl(url) !== null;
}
