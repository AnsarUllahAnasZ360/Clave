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
		<div className="flex items-end" style={{ gap: letterGap * 1.5 }}>
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
							gap,
						}}
					>
						{grid.flat().map((on, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: pixel grid cells are static
								key={i}
								style={{
									width: cellSize,
									height: cellSize,
									borderRadius: 1,
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
