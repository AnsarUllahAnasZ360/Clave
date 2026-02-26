"use client";

import { useReportWebVitals } from "next/web-vitals";
import { useCallback, useRef } from "react";

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];
type WebVitalMetric = Parameters<ReportWebVitalsCallback>[0];

const ALLOWED_METRICS = new Set(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]);
const DEFAULT_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 1 : 0;
const ENABLE_IN_DEVELOPMENT =
	process.env.NEXT_PUBLIC_WEB_VITALS_IN_DEVELOPMENT === "true";

function clampSampleRate(value: number) {
	if (!Number.isFinite(value)) return DEFAULT_SAMPLE_RATE;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

const SAMPLE_RATE = clampSampleRate(
	Number(process.env.NEXT_PUBLIC_WEB_VITALS_SAMPLE_RATE ?? DEFAULT_SAMPLE_RATE),
);

function shouldReportVitals() {
	if (process.env.NODE_ENV === "development" && !ENABLE_IN_DEVELOPMENT) {
		return false;
	}
	if (SAMPLE_RATE >= 1) return true;
	if (SAMPLE_RATE <= 0) return false;
	return Math.random() < SAMPLE_RATE;
}

function postMetric(metric: WebVitalMetric) {
	if (typeof navigator === "undefined") return;
	if (!ALLOWED_METRICS.has(metric.name)) return;

	const payload = JSON.stringify({
		id: metric.id,
		name: metric.name,
		delta: metric.delta,
		navigationType: metric.navigationType,
		rating: metric.rating,
		value: metric.value,
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
	const shouldReportRef = useRef<boolean>(shouldReportVitals());
	const sentMetricKeysRef = useRef<Set<string>>(new Set());

	const report: ReportWebVitalsCallback = useCallback((metric) => {
		if (!shouldReportRef.current) return;
		const dedupeKey = `${metric.id}:${metric.name}`;
		if (sentMetricKeysRef.current.has(dedupeKey)) return;
		sentMetricKeysRef.current.add(dedupeKey);
		postMetric(metric);
	}, []);

	useReportWebVitals(report);
	return null;
}
