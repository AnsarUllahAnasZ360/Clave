"use client";

import type { ReactNode } from "react";

import {
	DisplayOptionsContext,
	useDisplayOptions,
} from "@/hooks/use-display-options";

type DisplayOptionsProviderProps = {
	viewContext: string;
	children: ReactNode;
};

export function DisplayOptionsProvider({
	viewContext,
	children,
}: DisplayOptionsProviderProps) {
	const value = useDisplayOptions(viewContext);
	return (
		<DisplayOptionsContext.Provider value={value}>
			{children}
		</DisplayOptionsContext.Provider>
	);
}
