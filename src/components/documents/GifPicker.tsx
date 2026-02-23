"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface GifResult {
	id: string;
	title: string;
	previewUrl: string;
	fullUrl: string;
	width: number;
	height: number;
}

interface GifPickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (url: string) => void;
}

const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
const GIPHY_SEARCH_URL = "https://api.giphy.com/v1/gifs/search";
const GIPHY_TRENDING_URL = "https://api.giphy.com/v1/gifs/trending";
const RESULTS_LIMIT = 24;

function parseGiphyResponse(
	data: {
		id: string;
		title: string;
		images: {
			fixed_width: { url: string; width: string; height: string };
			original: { url: string };
		};
	}[],
): GifResult[] {
	return data.map((gif) => ({
		id: gif.id,
		title: gif.title,
		previewUrl: gif.images.fixed_width.url,
		fullUrl: gif.images.original.url,
		width: Number.parseInt(gif.images.fixed_width.width, 10),
		height: Number.parseInt(gif.images.fixed_width.height, 10),
	}));
}

export function GifPicker({ open, onOpenChange, onSelect }: GifPickerProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<GifResult[]>([]);
	const [loading, setLoading] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const fetchGifs = useCallback(async (searchQuery: string) => {
		if (!GIPHY_API_KEY) {
			setResults([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const url = searchQuery.trim()
				? `${GIPHY_SEARCH_URL}?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery.trim())}&limit=${RESULTS_LIMIT}&rating=g`
				: `${GIPHY_TRENDING_URL}?api_key=${GIPHY_API_KEY}&limit=${RESULTS_LIMIT}&rating=g`;

			const res = await fetch(url);
			if (!res.ok) throw new Error("Failed to fetch GIFs");

			const json = (await res.json()) as {
				data: {
					id: string;
					title: string;
					images: {
						fixed_width: { url: string; width: string; height: string };
						original: { url: string };
					};
				}[];
			};
			setResults(parseGiphyResponse(json.data));
		} catch {
			setResults([]);
		} finally {
			setLoading(false);
		}
	}, []);

	// Load trending GIFs when dialog opens
	useEffect(() => {
		if (open) {
			setQuery("");
			fetchGifs("");
			// Focus the input after dialog animation
			setTimeout(() => inputRef.current?.focus(), 100);
		} else {
			setResults([]);
		}
	}, [open, fetchGifs]);

	// Debounced search
	useEffect(() => {
		if (!open) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			fetchGifs(query);
		}, 300);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query, open, fetchGifs]);

	const handleSelect = (gif: GifResult) => {
		onSelect(gif.fullUrl);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md p-0 gap-0" showCloseButton={false}>
				<DialogHeader className="p-3 pb-0">
					<DialogTitle className="text-sm font-medium">Insert GIF</DialogTitle>
				</DialogHeader>

				<div className="px-3 pt-2 pb-2">
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search GIFs..."
							className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 pl-8 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						/>
					</div>
				</div>

				<div className="h-[320px] overflow-y-auto px-3 pb-3">
					{loading ? (
						<div className="grid grid-cols-3 gap-1.5">
							{["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((k) => (
								<div
									key={k}
									className="aspect-square animate-pulse rounded bg-muted"
								/>
							))}
						</div>
					) : results.length === 0 ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground text-center px-4">
							{!GIPHY_API_KEY
								? "GIF search requires a GIPHY API key. Add NEXT_PUBLIC_GIPHY_API_KEY to your environment."
								: query
									? "No GIFs found"
									: "Loading..."}
						</div>
					) : (
						<div className="grid grid-cols-3 gap-1.5">
							{results.map((gif) => (
								<button
									key={gif.id}
									type="button"
									onClick={() => handleSelect(gif)}
									className="group relative overflow-hidden rounded border border-transparent hover:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
								>
									{/* biome-ignore lint/performance/noImgElement: External dynamic GIF URLs from GIPHY CDN */}
									<img
										src={gif.previewUrl}
										alt={gif.title}
										loading="lazy"
										className="w-full aspect-square object-cover"
									/>
								</button>
							))}
						</div>
					)}
				</div>

				<div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground text-right">
					Powered by GIPHY
				</div>
			</DialogContent>
		</Dialog>
	);
}
