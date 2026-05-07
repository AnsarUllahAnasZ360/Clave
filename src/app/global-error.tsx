"use client";

import { useEffect } from "react";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("Root error boundary caught:", error);
	}, [error]);

	// global-error replaces the root html/body when the root layout itself
	// throws. Keep markup minimal — providers, fonts, theme classes are not
	// available here, so we render with inline styles only.
	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					minHeight: "100vh",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: "1.5rem",
					padding: "1rem",
					background: "#0A0A0A",
					color: "#FAFAFA",
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
					textAlign: "center",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "0.5rem",
					}}
				>
					<p
						style={{
							margin: 0,
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "0.75rem",
							textTransform: "uppercase",
							letterSpacing: "0.18em",
							color: "#C26A3A",
						}}
					>
						Critical error
					</p>
					<h1
						style={{
							margin: 0,
							fontSize: "1.5rem",
							fontWeight: 600,
							letterSpacing: "-0.01em",
						}}
					>
						Clave couldn&apos;t load
					</h1>
					<p
						style={{
							margin: 0,
							maxWidth: "24rem",
							fontSize: "0.875rem",
							color: "rgba(250, 250, 250, 0.7)",
						}}
					>
						A fatal error occurred at the application root. Try reloading; if
						this persists, the team has been notified.
					</p>
					{error.digest ? (
						<p
							style={{
								marginTop: "0.5rem",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "0.6875rem",
								color: "rgba(250, 250, 250, 0.5)",
							}}
						>
							Reference: {error.digest}
						</p>
					) : null}
				</div>
				<button
					type="button"
					onClick={() => reset()}
					style={{
						appearance: "none",
						background: "#C26A3A",
						color: "#FAFAFA",
						border: "none",
						borderRadius: "0.375rem",
						padding: "0.5rem 1rem",
						fontSize: "0.875rem",
						fontWeight: 500,
						cursor: "pointer",
					}}
				>
					Try again
				</button>
			</body>
		</html>
	);
}
