"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

type RightPanelContextType = {
	anyOpen: boolean;
	register: () => () => void;
};

const RightPanelContext = createContext<RightPanelContextType>({
	anyOpen: false,
	register: () => () => {},
});

/**
 * Provides a shared counter that tracks how many right-side panels are
 * currently mounted.  Components that render sidebars call `register()` on
 * mount and invoke the returned cleanup on unmount.
 */
export function RightPanelProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [count, setCount] = useState(0);
	const register = useCallback(() => {
		setCount((c) => c + 1);
		return () => setCount((c) => c - 1);
	}, []);
	return (
		<RightPanelContext.Provider value={{ anyOpen: count > 0, register }}>
			{children}
		</RightPanelContext.Provider>
	);
}

export function useRightPanel() {
	return useContext(RightPanelContext);
}

/**
 * Call in any component that renders a right sidebar panel.
 * The branding watermark automatically hides while this component is mounted.
 */
export function useRegisterRightPanel(isActive = true) {
	const { register } = useRightPanel();
	useEffect(() => {
		if (!isActive) return;
		return register();
	}, [isActive, register]);
}
