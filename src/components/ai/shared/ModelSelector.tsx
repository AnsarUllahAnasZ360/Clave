"use client";

import { memo } from "react";
import {
	PromptInputSelect,
	PromptInputSelectContent,
	PromptInputSelectItem,
	PromptInputSelectTrigger,
	PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";
import { AI_MODELS } from "@/lib/ai-models";

export interface ModelSelectorProps {
	value: string;
	onValueChange: (modelId: string) => void;
	disabled?: boolean;
}

export const ModelSelector = memo(function ModelSelector({
	value,
	onValueChange,
	disabled,
}: ModelSelectorProps) {
	return (
		<PromptInputSelect
			value={value}
			onValueChange={onValueChange}
			disabled={disabled}
		>
			<PromptInputSelectTrigger className="h-7 gap-1.5 px-2 text-xs w-auto min-w-0 rounded-md border border-transparent hover:border-border/50">
				<PromptInputSelectValue />
			</PromptInputSelectTrigger>
			<PromptInputSelectContent align="start">
				{AI_MODELS.map((model) => (
					<PromptInputSelectItem
						key={model.id}
						value={model.id}
						className="text-xs"
					>
						{model.label}
					</PromptInputSelectItem>
				))}
			</PromptInputSelectContent>
		</PromptInputSelect>
	);
});
