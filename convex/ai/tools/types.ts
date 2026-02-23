/**
 * Centralized type definitions for AI tools.
 *
 * All tool files import shared types from here to keep
 * the type surface consistent across read and write tools.
 */
import type { ToolCtx } from "@convex-dev/agent";
import type { DataModel } from "../../_generated/dataModel";

/** Tool execution context — extends GenericActionCtx with agent metadata. */
export type ToolContext = ToolCtx<DataModel>;

/** Standard success envelope returned by tools. */
export type ToolResult<T> = T;

/** Tool categories used for registry grouping. */
export type ToolCategory = "read" | "write";

/** Metadata describing a registered tool (for logging/UI display). */
export interface ToolMetadata {
	name: string;
	description: string;
	category: ToolCategory;
	needsApproval: boolean;
}

/** Common error shape returned by tools when an operation fails. */
export interface ToolError {
	error: string;
}
