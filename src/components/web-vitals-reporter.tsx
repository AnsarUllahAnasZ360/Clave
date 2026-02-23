"use client";

import { useReportWebVitals } from "next/web-vitals";
import { useCallback } from "react";

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

function postMetric(metric: Parameters<ReportWebVitalsCallback>[0]) {
	if (typeof navigator === "undefined") return;

	const payload = JSON.stringify({
		...metric,
		path: window.location.pathname,
		url: window.location.href,
		viewport: {
			width: window.innerWidth,
			height: window.innerHeight,
		},
		timestamp: Date.now(),
	});

	if (navigator.sendBeacon) {
		navigator.sendBeacon("/api/web-vitals", payload);
		return;
	}

	fetch("/api/web-vitals", {
		method: "POST",
		body: payload,
		keepalive: true,
		headers: { "Content-Type": "application/json" },
	}).catch(() => {});
}

export function WebVitalsReporter() {
	const report: ReportWebVitalsCallback = useCallback((metric) => {
		postMetric(metric);
	}, []);

	useReportWebVitals(report);
	return null;
}
