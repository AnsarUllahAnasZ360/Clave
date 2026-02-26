"use client";

import { Star } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

type FavoriteButtonProps = {
	entityType: "project" | "document" | "whiteboard" | "client" | "issue";
	entityId: string;
	className?: string;
	size?: "sm" | "default";
};

export function FavoriteButton({
	entityType,
	entityId,
	className,
	size = "sm",
}: FavoriteButtonProps) {
	const { workspaceId } = useWorkspace();
	const isFavorited = useQuery(api.favorites.isFavorited, {
		workspaceId,
		entityType,
		entityId,
	});
	const toggleFavorite = useMutation(api.favorites.toggle);

	const favorited = isFavorited ?? false;

	const handleToggle = async () => {
		try {
			const result = await toggleFavorite({
				workspaceId,
				entityType,
				entityId,
			});
			if (result.action === "added") {
				toast.success("Added to favorites");
			} else {
				toast.success("Removed from favorites");
			}
		} catch {
			toast.error("Failed to update favorite");
		}
	};

	return (
		<Button
			variant="ghost"
			size={size === "sm" ? "icon-sm" : "icon"}
			onClick={handleToggle}
			aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
			className={cn("shrink-0", className)}
		>
			<Star
				className={cn(
					"h-4 w-4 transition-colors",
					favorited
						? "text-yellow-500 fill-yellow-500"
						: "text-muted-foreground",
				)}
				weight={favorited ? "fill" : "regular"}
			/>
		</Button>
	);
}
