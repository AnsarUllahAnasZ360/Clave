import { PIXEL_LETTERS } from "@/lib/pixel-data";

export function PixelLogo({
	color = "#FAFAFA",
	cellSize = 6,
	gap = 2,
}: {
	color?: string;
	cellSize?: number;
	gap?: number;
}) {
	const word = "clave";
	const letterGap = cellSize + gap;
	return (
		<div className="flex items-end" style={{ gap: `${letterGap * 1.5}px` }}>
			{word.split("").map((char) => {
				const grid = PIXEL_LETTERS[char];
				if (!grid) return null;
				return (
					<div
						key={char}
						className="grid"
						style={{
							gridTemplateColumns: `repeat(5, ${cellSize}px)`,
							gridTemplateRows: `repeat(7, ${cellSize}px)`,
							gap: `${gap}px`,
						}}
					>
						{grid.flat().map((on, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: pixel grid cells are static
								key={i}
								style={{
									width: `${cellSize}px`,
									height: `${cellSize}px`,
									borderRadius: "1px",
									backgroundColor: on ? color : "transparent",
								}}
							/>
						))}
					</div>
				);
			})}
		</div>
	);
}
