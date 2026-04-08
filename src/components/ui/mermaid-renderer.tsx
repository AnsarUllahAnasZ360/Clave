"use client";

import { useEffect, useRef } from "react";

interface MermaidRendererProps {
	code: string;
	className?: string;
}

export function MermaidRenderer({
	code,
	className = "",
}: MermaidRendererProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current || typeof window === "undefined") return;

		const renderMermaid = async () => {
			try {
				const trimmedCode = code.trim();
				if (!trimmedCode) {
					containerRef.current!.innerHTML = "";
					return;
				}

				// Ensure mermaid is loaded
				const loadMermaid = () =>
					new Promise<any>((resolve, reject) => {
						if ((window as any).mermaid) {
							resolve((window as any).mermaid);
							return;
						}

						const script = document.createElement("script");
						script.src =
							"https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
						script.async = true;
						script.onload = () => {
							resolve((window as any).mermaid);
						};
						script.onerror = reject;
						document.head.appendChild(script);
					});

				const mermaid = await loadMermaid();

				// Initialize
				mermaid.initialize({
					startOnLoad: false,
					theme: "dark",
					securityLevel: "loose",
				});

				// Clear container
				if (containerRef.current) {
					containerRef.current.innerHTML = "";

					// Create wrapper
					const wrapper = document.createElement("div");
					wrapper.style.display = "flex";
					wrapper.style.justifyContent = "center";
					wrapper.style.alignItems = "center";
					wrapper.style.width = "100%";
					wrapper.style.padding = "1rem";

					// Create mermaid div
					const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
					const div = document.createElement("div");
					div.id = id;
					div.className = "mermaid";
					div.textContent = trimmedCode;

					wrapper.appendChild(div);
					containerRef.current.appendChild(wrapper);

					// Give DOM a moment to update
					await new Promise((resolve) => setTimeout(resolve, 50));

					// Render diagram - try run() first, fallback to contentLoaded()
					try {
						if (typeof mermaid.run === "function") {
							await mermaid.run();
						} else if (typeof mermaid.contentLoaded === "function") {
							await mermaid.contentLoaded();
						} else {
							console.warn(
								"[MermaidRenderer] No render method found on mermaid:",
								Object.keys(mermaid),
							);
							throw new Error("Mermaid render method not available");
						}
					} catch (renderErr) {
						const errorMsg =
							renderErr instanceof Error
								? renderErr.message
								: typeof renderErr === "object"
									? JSON.stringify(renderErr)
									: String(renderErr);
						console.error("[MermaidRenderer] Render error:", errorMsg);
						// Still throw to trigger fallback
						throw renderErr;
					}
				}
			} catch (err) {
				// Fallback: show code
				if (containerRef.current) {
					containerRef.current.innerHTML = "";
					const pre = document.createElement("pre");
					pre.className =
						"overflow-x-auto p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap";
					pre.textContent = code;
					containerRef.current.appendChild(pre);
				}
			}
		};

		renderMermaid();
	}, [code]);

	return (
		<div
			ref={containerRef}
			className={`rounded-md bg-muted/50 overflow-auto ${className}`}
			style={{ maxHeight: "600px", minHeight: "200px" }}
		/>
	);
}
