export interface PixelCrop {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Crop an image using the Canvas API and return a WebP blob.
 * Draws the specified region of `imageSrc` onto a 256x256 canvas.
 */
export async function getCroppedImageBlob(
	imageSrc: string,
	pixelCrop: PixelCrop,
	outputSize = 256,
): Promise<Blob> {
	const image = await loadImage(imageSrc);
	const canvas = document.createElement("canvas");
	canvas.width = outputSize;
	canvas.height = outputSize;

	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get canvas context");

	ctx.drawImage(
		image,
		pixelCrop.x,
		pixelCrop.y,
		pixelCrop.width,
		pixelCrop.height,
		0,
		0,
		outputSize,
		outputSize,
	);

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error("Canvas toBlob returned null"));
			},
			"image/webp",
			0.9,
		);
	});
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = (e) => reject(e);
		img.src = src;
	});
}
