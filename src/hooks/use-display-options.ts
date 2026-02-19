"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

import {
	DEFAULT_DISPLAY_OPTIONS,
	type DisplayOptions,
	type DisplayPropertyId,
	type GroupByOption,
	getStorageKey,
	type LayoutType,
	type OrderByOption,
	type OrderDirection,
	type SubGroupByOption,
	type SwimlaneSetting,
} from "@/lib/display-options";

// ── Context ─────────────────────────────────────────────────────────────────

type DisplayOptionsContextValue = {
	options: DisplayOptions;
	setOptions: (options: DisplayOptions) => void;
	updateOption: <K extends keyof DisplayOptions>(
		key: K,
		value: DisplayOptions[K],
	) => void;
	setLayout: (layout: LayoutType) => void;
	setGroupBy: (groupBy: GroupByOption) => void;
	setSubGroupBy: (subGroupBy: SubGroupByOption) => void;
	setOrderBy: (orderBy: OrderByOption) => void;
	setOrderDirection: (direction: OrderDirection) => void;
	toggleDisplayProperty: (property: DisplayPropertyId) => void;
	setShowSubIssues: (show: boolean) => void;
	setShowEmptyGroups: (show: boolean) => void;
	setSwimlaneSetting: (setting: SwimlaneSetting) => void;
	reset: () => void;
};

const DisplayOptionsContext = createContext<DisplayOptionsContextValue | null>(
	null,
);

export function useDisplayOptionsContext(): DisplayOptionsContextValue {
	const ctx = useContext(DisplayOptionsContext);
	if (!ctx) {
		throw new Error(
			"useDisplayOptionsContext must be used within a DisplayOptionsProvider",
		);
	}
	return ctx;
}

export { DisplayOptionsContext };

// ── Hook ────────────────────────────────────────────────────────────────────

function loadFromStorage(viewContext: string): DisplayOptions {
	if (typeof window === "undefined") return DEFAULT_DISPLAY_OPTIONS;
	try {
		const stored = localStorage.getItem(getStorageKey(viewContext));
		if (stored) {
			const parsed = JSON.parse(stored) as Partial<DisplayOptions>;
			return { ...DEFAULT_DISPLAY_OPTIONS, ...parsed };
		}
	} catch {
		// Corrupt data — fall through to default
	}
	return DEFAULT_DISPLAY_OPTIONS;
}

function saveToStorage(viewContext: string, options: DisplayOptions): void {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(getStorageKey(viewContext), JSON.stringify(options));
	} catch {
		// Storage full or unavailable — ignore
	}
}

export function useDisplayOptions(viewContext: string) {
	const [options, setOptionsState] = useState<DisplayOptions>(() =>
		loadFromStorage(viewContext),
	);

	// Track the view context so we can reload when it changes
	const prevContextRef = useRef(viewContext);

	useEffect(() => {
		if (prevContextRef.current !== viewContext) {
			prevContextRef.current = viewContext;
			setOptionsState(loadFromStorage(viewContext));
		}
	}, [viewContext]);

	// Auto-save whenever options change
	useEffect(() => {
		saveToStorage(viewContext, options);
	}, [viewContext, options]);

	const setOptions = useCallback((newOptions: DisplayOptions) => {
		setOptionsState(newOptions);
	}, []);

	const updateOption = useCallback(
		<K extends keyof DisplayOptions>(key: K, value: DisplayOptions[K]) => {
			setOptionsState((prev) => ({ ...prev, [key]: value }));
		},
		[],
	);

	const setLayout = useCallback((layout: LayoutType) => {
		setOptionsState((prev) => ({ ...prev, layout }));
	}, []);

	const setGroupBy = useCallback((groupBy: GroupByOption) => {
		setOptionsState((prev) => {
			// If sub-group matches the new primary, reset it
			const subGroupBy = prev.subGroupBy === groupBy ? "none" : prev.subGroupBy;
			return { ...prev, groupBy, subGroupBy };
		});
	}, []);

	const setSubGroupBy = useCallback((subGroupBy: SubGroupByOption) => {
		setOptionsState((prev) => ({ ...prev, subGroupBy }));
	}, []);

	const setOrderBy = useCallback((orderBy: OrderByOption) => {
		setOptionsState((prev) => ({ ...prev, orderBy }));
	}, []);

	const setOrderDirection = useCallback((orderDirection: OrderDirection) => {
		setOptionsState((prev) => ({ ...prev, orderDirection }));
	}, []);

	const toggleDisplayProperty = useCallback((property: DisplayPropertyId) => {
		setOptionsState((prev) => {
			const current = prev.displayProperties;
			const next = current.includes(property)
				? current.filter((p) => p !== property)
				: [...current, property];
			return { ...prev, displayProperties: next };
		});
	}, []);

	const setShowSubIssues = useCallback((showSubIssues: boolean) => {
		setOptionsState((prev) => ({ ...prev, showSubIssues }));
	}, []);

	const setShowEmptyGroups = useCallback((showEmptyGroups: boolean) => {
		setOptionsState((prev) => ({ ...prev, showEmptyGroups }));
	}, []);

	const setSwimlaneSetting = useCallback((swimlaneBy: SwimlaneSetting) => {
		setOptionsState((prev) => ({ ...prev, swimlaneBy }));
	}, []);

	const reset = useCallback(() => {
		setOptionsState(DEFAULT_DISPLAY_OPTIONS);
	}, []);

	return {
		options,
		setOptions,
		updateOption,
		setLayout,
		setGroupBy,
		setSubGroupBy,
		setOrderBy,
		setOrderDirection,
		toggleDisplayProperty,
		setShowSubIssues,
		setShowEmptyGroups,
		setSwimlaneSetting,
		reset,
	};
}
