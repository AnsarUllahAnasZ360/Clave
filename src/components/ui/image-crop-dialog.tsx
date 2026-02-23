"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import type { Area } from "react-easy-crop";
import Cropper from "react-easy-crop";
import { getCroppedImageBlob } from "@/lib/crop-image";
import { Button } from "./button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./dialog";
import { Slider } from "./slider";

interface ImageCropDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	imageSrc: string | null;
	cropShape: "round" | "rect";
	title?: string;
	onCropComplete: (blob: Blob) => void;
}

export function ImageCropDialog({
	open,
	onOpenChange,
	imageSrc,
	cropShape,
	title = "Crop image",
	onCropComplete,
}: ImageCropDialogProps) {
	const [crop, setCrop] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [croppedArea, setCroppedArea] = useState<Area | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);

	const handleCropComplete = useCallback(
		(_croppedArea: Area, croppedAreaPixels: Area) => {
			setCroppedArea(croppedAreaPixels);
		},
		[],
	);

	const handleApply = async () => {
		if (!imageSrc || !croppedArea) return;
		setIsProcessing(true);
		try {
			const blob = await getCroppedImageBlob(imageSrc, croppedArea);
			onCropComplete(blob);
			onOpenChange(false);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setCrop({ x: 0, y: 0 });
			setZoom(1);
			setCroppedArea(null);
		}
		onOpenChange(nextOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md gap-0 overflow-hidden p-0">
				<DialogHeader className="px-6 pt-6 pb-4">
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				<div className="relative h-72 bg-neutral-950">
					{imageSrc && (
						<Cropper
							image={imageSrc}
							crop={crop}
							zoom={zoom}
							aspect={1}
							cropShape={cropShape}
							showGrid={false}
							onCropChange={setCrop}
							onZoomChange={setZoom}
							onCropComplete={handleCropComplete}
						/>
					)}
				</div>

				<div className="flex items-center gap-3 px-6 py-4">
					<Minus className="h-4 w-4 shrink-0 text-muted-foreground" />
					<Slider
						value={[zoom]}
						min={1}
						max={3}
						step={0.01}
						onValueChange={([v]) => setZoom(v)}
					/>
					<Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
				</div>

				<DialogFooter className="px-6 pb-6">
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={isProcessing}
					>
						Cancel
					</Button>
					<Button onClick={handleApply} disabled={isProcessing}>
						{isProcessing ? "Applying..." : "Apply"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
