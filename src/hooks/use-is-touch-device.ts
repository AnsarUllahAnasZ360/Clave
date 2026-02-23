"use client";

import * as React from "react";

export function useIsTouchDevice() {
	const [isTouchDevice] = React.useState(() => {
		if (typeof window === "undefined") return false;
		return "ontouchstart" in window || navigator.maxTouchPoints > 0;
	});

	return isTouchDevice;
}
