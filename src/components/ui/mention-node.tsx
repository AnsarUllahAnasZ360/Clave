"use client";

import type { TComboboxInputElement, TMentionElement } from "platejs";
import { IS_APPLE, KEYS } from "platejs";
import type { PlateElementProps } from "platejs/react";
import {
	PlateElement,
	useFocused,
	useReadOnly,
	useSelected,
} from "platejs/react";
import * as React from "react";

import {
	type MentionUserItem,
	useMentionUsers,
} from "@/components/editor/use-mention-users";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import {
	InlineCombobox,
	InlineComboboxContent,
	InlineComboboxEmpty,
	InlineComboboxGroup,
	InlineComboboxInput,
	InlineComboboxItem,
} from "./inline-combobox";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";

/** Get a user's initials from their display name. */
function getInitials(name: string): string {
	return name
		.split(" ")
		.map((part) => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

/**
 * Rendered mention chip: shows @name in an accent-colored inline chip.
 * Includes user avatar and a hover tooltip with additional user info.
 */
export function MentionElement(
	props: PlateElementProps<TMentionElement> & {
		prefix?: string;
	},
) {
	const element = props.element;
	const avatarUrl = (element as any).avatarUrl as string | undefined;
	const displayName = element.value as string;

	const selected = useSelected();
	const focused = useFocused();
	const mounted = useMounted();
	const readOnly = useReadOnly();

	const chip = (
		<PlateElement
			{...props}
			className={cn(
				"inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 align-baseline font-medium text-primary text-sm",
				!readOnly && "cursor-pointer hover:bg-primary/15",
				selected && focused && "ring-2 ring-ring",
				element.children[0][KEYS.bold] === true && "font-bold",
				element.children[0][KEYS.italic] === true && "italic",
				element.children[0][KEYS.underline] === true && "underline",
			)}
			attributes={{
				...props.attributes,
				contentEditable: false,
				"data-slate-value": element.value,
				draggable: true,
			}}
		>
			{mounted && IS_APPLE ? (
				<>
					{props.children}
					<Avatar className="inline-flex size-4 text-[10px]">
						{avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
						<AvatarFallback className="bg-primary/20 text-primary text-[10px]">
							{getInitials(displayName)}
						</AvatarFallback>
					</Avatar>
					{props.prefix}@{displayName}
				</>
			) : (
				<>
					<Avatar className="inline-flex size-4 text-[10px]">
						{avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
						<AvatarFallback className="bg-primary/20 text-primary text-[10px]">
							{getInitials(displayName)}
						</AvatarFallback>
					</Avatar>
					{props.prefix}@{displayName}
					{props.children}
				</>
			)}
		</PlateElement>
	);

	if (readOnly) return chip;

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{chip}</TooltipTrigger>
				<TooltipContent side="top" className="text-xs">
					<p className="font-medium">{displayName}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

/**
 * Mention input combobox: shows when user types "@".
 * Queries workspace members from Convex and renders them with avatars.
 */
export function MentionInputElement(
	props: PlateElementProps<TComboboxInputElement>,
) {
	const { editor, element } = props;
	const [search, setSearch] = React.useState("");
	const users = useMentionUsers();

	const handleSelect = React.useCallback(
		(item: MentionUserItem) => {
			editor.tf.insertNodes({
				type: KEYS.mention,
				key: item.key,
				value: item.text,
				userId: item.data.userId,
				avatarUrl: item.data.avatarUrl ?? "",
				children: [{ text: "" }],
			});
			editor.tf.move({ unit: "offset" });
		},
		[editor],
	);

	return (
		<PlateElement {...props} as="span">
			<InlineCombobox
				value={search}
				element={element}
				setValue={setSearch}
				showTrigger={false}
				trigger="@"
			>
				<span className="inline-block rounded-md bg-primary/10 px-1.5 py-0.5 align-baseline text-primary text-sm ring-ring focus-within:ring-2">
					<InlineComboboxInput />
				</span>

				<InlineComboboxContent className="my-1.5">
					<InlineComboboxEmpty>
						{users.length === 0 ? "Loading members..." : "No matching members"}
					</InlineComboboxEmpty>

					<InlineComboboxGroup>
						{users.map((item) => (
							<InlineComboboxItem
								key={item.key}
								value={item.text}
								onClick={() => handleSelect(item)}
							>
								<Avatar className="mr-2 size-5 text-[10px]">
									{item.data.avatarUrl && (
										<AvatarImage src={item.data.avatarUrl} alt={item.text} />
									)}
									<AvatarFallback className="bg-primary/20 text-primary text-[10px]">
										{getInitials(item.text)}
									</AvatarFallback>
								</Avatar>
								<span className="flex-1 truncate">{item.text}</span>
								{item.data.role && (
									<span className="ml-2 text-muted-foreground text-xs capitalize">
										{item.data.role}
									</span>
								)}
							</InlineComboboxItem>
						))}
					</InlineComboboxGroup>
				</InlineComboboxContent>
			</InlineCombobox>

			{props.children}
		</PlateElement>
	);
}
