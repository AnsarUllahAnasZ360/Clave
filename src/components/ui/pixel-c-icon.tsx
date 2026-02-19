import { PIXEL_LETTERS } from "@/lib/pixel-data";
import { cn } from "@/lib/utils";

const C_GRID = PIXEL_LETTERS.c;

export function PixelCIcon({
	size = 20,
	color = "currentColor",
	className,
}: {
	size?: number;
	color?: string;
	className?: string;
}) {
	// 5 columns, 7 rows with 1px gap between cells
	const cols = 5;
	const rows = 7;
	const gap = size * 0.06;
	const cellW = (size - gap * (cols - 1)) / cols;
	const cellH = (size - gap * (rows - 1)) / rows;

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			fill="none"
			className={cn("shrink-0", className)}
			aria-hidden="true"
		>
			{C_GRID.map((row, ry) =>
				row.map((on, cx) => {
					if (!on) return null;
					const x = cx * (cellW + gap);
					const y = ry * (cellH + gap);
					return (
						<rect
							// biome-ignore lint/suspicious/noArrayIndexKey: static pixel grid
							key={`${ry}-${cx}`}
							x={x}
							y={y}
							width={cellW}
							height={cellH}
							rx={cellW * 0.15}
							fill={color}
						/>
					);
				}),
			)}
		</svg>
	);
}
