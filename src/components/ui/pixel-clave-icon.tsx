import { PIXEL_LETTERS } from "@/lib/pixel-data";
import { cn } from "@/lib/utils";

const CLAVE_LETTERS = ["c", "l", "a", "v", "e"] as const;

/**
 * Renders the full "CLAVE" wordmark in the same pixel-grid style as PixelCIcon.
 *
 * @param height  - total rendered height in px (default 56). Width is computed automatically.
 * @param color   - fill color (default "currentColor")
 * @param className - optional className for the svg element
 */
export function PixelClaveIcon({
	height = 56,
	color = "currentColor",
	className,
}: {
	height?: number;
	color?: string;
	className?: string;
}) {
	const cols = 5;
	const rows = 7;

	// Derive square cell size so the icon is exactly `height` px tall.
	// height = rows * cell + (rows-1) * gap,  gap = cell * gapFraction
	const gapFraction = 0.14;
	const cell = height / (rows + (rows - 1) * gapFraction);
	const gap = cell * gapFraction;

	const letterWidth = cols * cell + (cols - 1) * gap;
	// Breathing room between letters — feels proportional to cell size
	const letterSpacing = cell * 0.85;

	const totalWidth =
		CLAVE_LETTERS.length * letterWidth +
		(CLAVE_LETTERS.length - 1) * letterSpacing;

	return (
		<svg
			width={Math.round(totalWidth)}
			height={Math.round(height)}
			viewBox={`0 0 ${totalWidth} ${height}`}
			fill="none"
			aria-label="Clave"
			className={cn("shrink-0", className)}
		>
			<title>Clave</title>
			{CLAVE_LETTERS.map((letter, letterIdx) => {
				const grid = PIXEL_LETTERS[letter];
				const xOffset = letterIdx * (letterWidth + letterSpacing);

				return grid.flatMap((row, ry) =>
					row.map((on, cx) => {
						if (!on) return null;
						const x = xOffset + cx * (cell + gap);
						const y = ry * (cell + gap);
						return (
							<rect
								// biome-ignore lint/suspicious/noArrayIndexKey: static pixel grid
								key={`${letter}-${ry}-${cx}`}
								x={x}
								y={y}
								width={cell}
								height={cell}
								rx={cell * 0.18}
								fill={color}
							/>
						);
					}),
				);
			})}
		</svg>
	);
}
