import { ImageResponse } from "next/og";
import type React from "react";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const alt = "Clave icon";

const C_GRID = [
	[0, 1, 1, 1, 0],
	[1, 0, 0, 0, 1],
	[1, 0, 0, 0, 0],
	[1, 0, 0, 0, 0],
	[1, 0, 0, 0, 0],
	[1, 0, 0, 0, 1],
	[0, 1, 1, 1, 0],
];

export default function Icon() {
	const padding = 3;
	const availW = size.width - padding * 2;
	const availH = size.height - padding * 2;
	const cols = 5;
	const rows = 7;
	const gapPx = 1;
	const cellW = (availW - gapPx * (cols - 1)) / cols;
	const cellH = (availH - gapPx * (rows - 1)) / rows;
	const sienna = "#C26A3A";

	const pixels: React.ReactElement[] = [];
	for (let ry = 0; ry < C_GRID.length; ry++) {
		const row = C_GRID[ry];
		for (let cx = 0; cx < row.length; cx++) {
			if (!row[cx]) continue;
			pixels.push(
				<div
					key={`${ry}-${cx}`}
					style={{
						position: "absolute",
						left: padding + cx * (cellW + gapPx),
						top: padding + ry * (cellH + gapPx),
						width: cellW,
						height: cellH,
						borderRadius: 1,
						backgroundColor: sienna,
					}}
				/>,
			);
		}
	}

	return new ImageResponse(
		<div
			style={{
				width: size.width,
				height: size.height,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: "transparent",
			}}
		>
			{pixels}
		</div>,
		{ ...size },
	);
}
