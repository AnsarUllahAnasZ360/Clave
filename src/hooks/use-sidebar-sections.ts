"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";

export type SectionKey = "recents" | "favorites" | "projects";

export type SidebarSections = Record<SectionKey, boolean>;

const DEFAULT_SECTIONS: SidebarSections = {
	recents: true,
	favorites: false,
	projects: false,
};

interface UseSidebarSectionsProps {
	initialSections?: Partial<SidebarSections> | null;
}

export function useSidebarSections({
	initialSections,
}: UseSidebarSectionsProps) {
	const [sections, setSections] = useState<SidebarSections>(DEFAULT_SECTIONS);
	const [initialized, setInitialized] = useState(false);
	const updateUser = useMutation(api.users.update);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Sync from server once user data is available
	useEffect(() => {
		if (initialSections !== undefined && !initialized) {
			setSections({ ...DEFAULT_SECTIONS, ...initialSections });
			setInitialized(true);
		}
	}, [initialSections, initialized]);

	// Cleanup debounce timer on unmount
	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

	const toggle = useCallback(
		(key: SectionKey) => {
			setSections((prev) => {
				const next = { ...prev, [key]: !prev[key] };
				if (debounceRef.current) clearTimeout(debounceRef.current);
				debounceRef.current = setTimeout(() => {
					updateUser({ sidebarSections: next }).catch(console.error);
				}, 300);
				return next;
			});
		},
		[updateUser],
	);

	return { sections, toggle };
}
