import {
	ArrowRight,
	Brain,
	CheckCircle2,
	ChevronDown,
	Circle,
	Clock,
	FileText,
	Filter,
	GitBranch,
	Layers,
	LayoutGrid,
	MessageSquare,
	Plus,
	Search,
	Settings,
	Tag,
	Users,
	Zap,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Clave — Brand Guidelines",
	description:
		"Brand guidelines for Clave, an AI-native project management platform.",
};

// ---------------------------------------------------------------------------
// Pixel Logo Data — 5×7 grid per character
// ---------------------------------------------------------------------------
const PIXEL_LETTERS: Record<string, number[][]> = {
	c: [
		[0, 1, 1, 1, 0],
		[1, 0, 0, 0, 1],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 1],
		[0, 1, 1, 1, 0],
	],
	l: [
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 1, 1, 1, 1],
	],
	a: [
		[0, 1, 1, 1, 0],
		[1, 0, 0, 0, 1],
		[1, 0, 0, 0, 1],
		[1, 1, 1, 1, 1],
		[1, 0, 0, 0, 1],
		[1, 0, 0, 0, 1],
		[1, 0, 0, 0, 1],
	],
	v: [
		[1, 0, 0, 0, 1],
		[1, 0, 0, 0, 1],
		[1, 0, 0, 0, 1],
		[1, 0, 0, 0, 1],
		[0, 1, 0, 1, 0],
		[0, 1, 0, 1, 0],
		[0, 0, 1, 0, 0],
	],
	e: [
		[1, 1, 1, 1, 1],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 1, 1, 1, 0],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 1, 1, 1, 1],
	],
};

function PixelLogo({
	color = "#FAFAFA",
	cellSize = 6,
	gap = 2,
}: {
	color?: string;
	cellSize?: number;
	gap?: number;
}) {
	const word = "clave";
	const letterGap = cellSize + gap;
	return (
		<div className="flex items-end" style={{ gap: letterGap * 1.5 }}>
			{word.split("").map((char) => {
				const grid = PIXEL_LETTERS[char];
				if (!grid) return null;
				return (
					<div
						key={char}
						className="grid"
						style={{
							gridTemplateColumns: `repeat(5, ${cellSize}px)`,
							gridTemplateRows: `repeat(7, ${cellSize}px)`,
							gap,
						}}
					>
						{grid.flat().map((on, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: pixel grid cells are static
								key={i}
								style={{
									width: cellSize,
									height: cellSize,
									borderRadius: 1,
									backgroundColor: on ? color : "transparent",
								}}
							/>
						))}
					</div>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------
function Section({
	id,
	number,
	title,
	children,
}: {
	id: string;
	number: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section id={id} className="border-t border-[#1F1F1F] py-20 md:py-28">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mb-12 flex items-center gap-4">
					<span
						className="font-mono text-xs text-[#737373]"
						style={{ letterSpacing: "0.05em" }}
					>
						{number}
					</span>
					<div className="h-px w-8 bg-sienna-500" />
					<h2
						className="text-2xl font-semibold text-[#FAFAFA]"
						style={{ letterSpacing: "-0.02em" }}
					>
						{title}
					</h2>
				</div>
				{children}
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Swatch helpers
// ---------------------------------------------------------------------------
function Swatch({
	color,
	label,
	hex,
	large,
	highlight,
	textDark,
}: {
	color: string;
	label: string;
	hex: string;
	large?: boolean;
	highlight?: boolean;
	textDark?: boolean;
}) {
	return (
		<div className={large ? "flex-1 min-w-[120px]" : "flex-1 min-w-[48px]"}>
			<div
				className={`${large ? "h-24" : "h-14"} w-full rounded-lg ${highlight ? "ring-2 ring-sienna-400 ring-offset-2 ring-offset-[#0A0A0A]" : ""}`}
				style={{ backgroundColor: color }}
			/>
			<p
				className={`mt-2 font-mono text-xs ${textDark ? "text-[#171717]" : "text-[#A3A3A3]"}`}
			>
				{label}
			</p>
			<p className="font-mono text-[11px] text-[#737373]">{hex}</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Nav links
// ---------------------------------------------------------------------------
const NAV_ITEMS = [
	{ href: "#hero", label: "Intro" },
	{ href: "#logo", label: "Logo" },
	{ href: "#color", label: "Color" },
	{ href: "#typography", label: "Type" },
	{ href: "#iconography", label: "Icons" },
	{ href: "#surfaces", label: "Surfaces" },
	{ href: "#components", label: "Components" },
	{ href: "#voice", label: "Voice" },
	{ href: "#dark-mode", label: "Dark mode" },
	{ href: "#in-context", label: "In context" },
];

// ---------------------------------------------------------------------------
// Color data
// ---------------------------------------------------------------------------
const SIENNA_SCALE = [
	{ label: "50", hex: "#FDF5F0" },
	{ label: "100", hex: "#FBE9DD" },
	{ label: "200", hex: "#F5CFB5" },
	{ label: "300", hex: "#EDB088" },
	{ label: "400", hex: "#E08C5A" },
	{ label: "500", hex: "#C26A3A" },
	{ label: "600", hex: "#A8552B" },
	{ label: "700", hex: "#8B4323" },
	{ label: "800", hex: "#71371E" },
	{ label: "900", hex: "#5C2E1A" },
	{ label: "950", hex: "#331510" },
];

const NEUTRAL_SCALE = [
	{ label: "50", hex: "#FAFAFA" },
	{ label: "100", hex: "#F5F5F5" },
	{ label: "200", hex: "#E5E5E5" },
	{ label: "300", hex: "#D4D4D4" },
	{ label: "400", hex: "#A3A3A3" },
	{ label: "500", hex: "#737373" },
	{ label: "600", hex: "#525252" },
	{ label: "700", hex: "#404040" },
	{ label: "800", hex: "#262626" },
	{ label: "900", hex: "#171717" },
	{ label: "950", hex: "#0A0A0A" },
];

const SEMANTIC_COLORS = [
	{ label: "Success", hex: "#17B169" },
	{ label: "Error", hex: "#E5484D" },
	{ label: "Warning", hex: "#F5A623" },
	{ label: "Info", hex: "#0091FF" },
];

// ---------------------------------------------------------------------------
// Icon grid
// ---------------------------------------------------------------------------
const ICON_SET = [
	{ name: "Layers", Icon: Layers },
	{ name: "CheckCircle2", Icon: CheckCircle2 },
	{ name: "Brain", Icon: Brain },
	{ name: "Circle", Icon: Circle },
	{ name: "Plus", Icon: Plus },
	{ name: "Search", Icon: Search },
	{ name: "Settings", Icon: Settings },
	{ name: "Filter", Icon: Filter },
	{ name: "ArrowRight", Icon: ArrowRight },
	{ name: "ChevronDown", Icon: ChevronDown },
	{ name: "LayoutGrid", Icon: LayoutGrid },
	{ name: "MessageSquare", Icon: MessageSquare },
	{ name: "FileText", Icon: FileText },
	{ name: "Users", Icon: Users },
	{ name: "Zap", Icon: Zap },
	{ name: "Clock", Icon: Clock },
	{ name: "Tag", Icon: Tag },
	{ name: "GitBranch", Icon: GitBranch },
];

// ---------------------------------------------------------------------------
// Issue list data
// ---------------------------------------------------------------------------
const ISSUES = [
	{
		id: "CLV-198",
		title: "Fix authentication timeout on mobile",
		priority: "Urgent",
		priorityColor: "#E5484D",
		status: "In Progress",
		statusColor: "#C26A3A",
		avatar: "AK",
		time: "2h ago",
	},
	{
		id: "CLV-197",
		title: "Add batch export for board data",
		priority: "High",
		priorityColor: "#F5A623",
		status: "In Review",
		statusColor: "#0091FF",
		avatar: "SM",
		time: "4h ago",
	},
	{
		id: "CLV-195",
		title: "Implement keyboard shortcuts",
		priority: "Medium",
		priorityColor: "#E08C5A",
		status: "Todo",
		statusColor: "#525252",
		avatar: "JD",
		time: "1d ago",
	},
	{
		id: "CLV-192",
		title: "Migrate to edge runtime",
		priority: "Medium",
		priorityColor: "#E08C5A",
		status: "In Progress",
		statusColor: "#C26A3A",
		avatar: "RK",
		time: "2d ago",
	},
	{
		id: "CLV-189",
		title: "Update onboarding copy",
		priority: "Low",
		priorityColor: "#A3A3A3",
		status: "Backlog",
		statusColor: "#404040",
		avatar: "LM",
		time: "3d ago",
	},
	{
		id: "CLV-186",
		title: "Research caching strategies",
		priority: "None",
		priorityColor: "#525252",
		status: "Done",
		statusColor: "#17B169",
		avatar: "AK",
		time: "5d ago",
	},
];

// ===========================================================================
// PAGE
// ===========================================================================
export default function BrandPage() {
	return (
		<div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA]">
			{/* ---------------------------------------------------------------- */}
			{/* STICKY NAV */}
			{/* ---------------------------------------------------------------- */}
			<nav className="sticky top-0 z-50 border-b border-[#1F1F1F] bg-[#0A0A0A]/90 backdrop-blur-md">
				<div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-6 py-3">
					<a href="#hero" className="mr-4 shrink-0">
						<PixelLogo cellSize={3} gap={1} color="#E08C5A" />
					</a>
					{NAV_ITEMS.map((item) => (
						<a
							key={item.href}
							href={item.href}
							className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-[#A3A3A3] transition-colors hover:bg-[#171717] hover:text-[#FAFAFA]"
						>
							{item.label}
						</a>
					))}
				</div>
			</nav>

			{/* ================================================================ */}
			{/* 01 · HERO */}
			{/* ================================================================ */}
			<section
				id="hero"
				className="flex flex-col items-center justify-center px-6 pb-20 pt-28 md:pt-32 md:pb-24"
			>
				<PixelLogo cellSize={8} gap={2} />
				<p
					className="mt-10 text-2xl font-semibold text-[#FAFAFA]"
					style={{ letterSpacing: "-0.01em" }}
				>
					Build in sync.
				</p>
				<p
					className="mt-3 text-[13px] font-medium uppercase text-[#A3A3A3]"
					style={{ letterSpacing: "0.05em" }}
				>
					Brand guidelines
				</p>
			</section>

			{/* ================================================================ */}
			{/* 02 · LOGO */}
			{/* ================================================================ */}
			<Section id="logo" number="01" title="Logo">
				{/* Three backgrounds */}
				<p className="mb-6 text-sm text-[#A3A3A3]">
					The Clave wordmark in pixel-grid form. Use on dark, light, or branded
					surfaces.
				</p>
				<div className="grid gap-4 sm:grid-cols-3">
					<div className="flex h-40 items-center justify-center rounded-xl border border-[#262626] bg-[#0A0A0A]">
						<PixelLogo cellSize={6} gap={2} color="#FAFAFA" />
					</div>
					<div className="flex h-40 items-center justify-center rounded-xl border border-[#E5E5E5] bg-[#FAFAFA]">
						<PixelLogo cellSize={6} gap={2} color="#0A0A0A" />
					</div>
					<div className="flex h-40 items-center justify-center rounded-xl bg-[#C26A3A]">
						<PixelLogo cellSize={6} gap={2} color="#FFFFFF" />
					</div>
				</div>

				{/* Clear space */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Clear space
				</h3>
				<p className="mb-6 text-sm text-[#737373]">
					Maintain a minimum clear space equal to the height of the logo on all
					sides.
				</p>
				<div className="flex justify-center">
					<div className="inline-flex items-center justify-center rounded border border-dashed border-[#525252] p-10">
						<PixelLogo cellSize={5} gap={2} />
					</div>
				</div>

				{/* Minimum size */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Minimum size
				</h3>
				<div className="flex items-end gap-6">
					<PixelLogo cellSize={3} gap={1} />
					<span className="text-xs text-[#737373]">24px height minimum</span>
				</div>

				{/* Don'ts */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Don&apos;ts
				</h3>
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
					{[
						{ label: "Don't stretch", transform: "scaleX(1.5)" },
						{ label: "Don't rotate", transform: "rotate(15deg)" },
						{ label: "Don't recolor", color: "#6366F1" },
						{ label: "Don't add effects", filter: "blur(1.5px)" },
					].map((dont) => (
						<div
							key={dont.label}
							className="relative flex h-28 flex-col items-center justify-center rounded-xl border border-[#262626] bg-[#171717]"
						>
							<div
								style={{
									transform: dont.transform,
									filter: dont.filter,
								}}
							>
								<PixelLogo
									cellSize={4}
									gap={1}
									color={dont.color ?? "#FAFAFA"}
								/>
							</div>
							{/* Red X */}
							<div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#E5484D]">
								<span className="text-[10px] font-bold text-white">✕</span>
							</div>
							<p className="mt-3 text-[11px] text-[#737373]">{dont.label}</p>
						</div>
					))}
				</div>
			</Section>

			{/* ================================================================ */}
			{/* 03 · COLOR */}
			{/* ================================================================ */}
			<Section id="color" number="02" title="Color">
				<p className="mb-10 max-w-2xl text-sm leading-relaxed text-[#A3A3A3]">
					Most tech products use cold blues and purples. Clave uses sienna —
					warm, earthy, human. In a product about human+AI collaboration, the
					warmth is the statement.
				</p>

				{/* Primary triad */}
				<h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">Primary</h3>
				<div className="flex gap-4">
					<Swatch color="#000000" label="Black" hex="#000000" large />
					<Swatch color="#FFFFFF" label="White" hex="#FFFFFF" large textDark />
					<Swatch color="#C26A3A" label="Sienna" hex="#C26A3A" large />
				</div>

				{/* Sienna scale */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Sienna scale
				</h3>
				<div className="flex gap-2">
					{SIENNA_SCALE.map((s) => (
						<Swatch
							key={s.label}
							color={s.hex}
							label={s.label}
							hex={s.hex}
							highlight={s.label === "500"}
						/>
					))}
				</div>

				{/* Neutral scale */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Neutral scale
				</h3>
				<div className="flex gap-2">
					{NEUTRAL_SCALE.map((s) => (
						<Swatch key={s.label} color={s.hex} label={s.label} hex={s.hex} />
					))}
				</div>

				{/* Semantic */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Semantic
				</h3>
				<div className="flex gap-4">
					{SEMANTIC_COLORS.map((s) => (
						<Swatch
							key={s.label}
							color={s.hex}
							label={s.label}
							hex={s.hex}
							large
						/>
					))}
				</div>
			</Section>

			{/* ================================================================ */}
			{/* 04 · TYPOGRAPHY */}
			{/* ================================================================ */}
			<Section id="typography" number="03" title="Typography">
				{/* Font families */}
				<div className="mb-14 grid gap-6 sm:grid-cols-3">
					<div className="rounded-xl border border-[#262626] bg-[#171717] p-6">
						<p className="text-3xl font-semibold text-[#FAFAFA]">Ag</p>
						<p className="mt-2 text-sm font-medium text-[#A3A3A3]">
							Geist Sans
						</p>
						<p className="text-xs text-[#737373]">Primary typeface</p>
					</div>
					<div className="rounded-xl border border-[#262626] bg-[#171717] p-6">
						<p className="font-mono text-3xl font-semibold text-[#FAFAFA]">
							Ag
						</p>
						<p className="mt-2 text-sm font-medium text-[#A3A3A3]">
							Geist Mono
						</p>
						<p className="text-xs text-[#737373]">Code &amp; data</p>
					</div>
					<div className="rounded-xl border border-[#262626] bg-[#171717] p-6">
						<div className="h-[36px] flex items-center">
							<PixelLogo cellSize={4} gap={1} color="#FAFAFA" />
						</div>
						<p className="mt-2 text-sm font-medium text-[#A3A3A3]">
							Geist Pixel Square
						</p>
						<p className="text-xs text-[#737373]">Logo only</p>
					</div>
				</div>

				{/* Type scale */}
				<h3 className="mb-6 text-sm font-semibold text-[#FAFAFA]">
					Type scale
				</h3>
				<div className="space-y-6 rounded-xl border border-[#262626] bg-[#171717] p-6 md:p-8">
					{[
						{
							label: "Hero — 48px / Bold / -0.03em",
							style: {
								fontSize: 48,
								fontWeight: 700,
								letterSpacing: "-0.03em",
							},
							text: "Build in sync.",
						},
						{
							label: "Page title — 32px / Semibold / -0.02em",
							style: {
								fontSize: 32,
								fontWeight: 600,
								letterSpacing: "-0.02em",
							},
							text: "Project overview",
						},
						{
							label: "Section — 24px / Semibold / -0.02em",
							style: {
								fontSize: 24,
								fontWeight: 600,
								letterSpacing: "-0.02em",
							},
							text: "Active issues",
						},
						{
							label: "Card title — 20px / Semibold / -0.01em",
							style: {
								fontSize: 20,
								fontWeight: 600,
								letterSpacing: "-0.01em",
							},
							text: "Implement auth flow",
						},
						{
							label: "Body large — 16px / Regular / 1.6lh",
							style: { fontSize: 16, fontWeight: 400, lineHeight: 1.6 },
							text: "Clave brings human intent and AI capability into a shared workspace, keeping every project moving.",
						},
						{
							label: "Body default — 14px / Regular / 1.5lh",
							style: { fontSize: 14, fontWeight: 400, lineHeight: 1.5 },
							text: "Each issue tracks what needs to happen, who's responsible, and how AI can accelerate it.",
						},
						{
							label: "Label — 13px / Medium",
							style: { fontSize: 13, fontWeight: 500 },
							text: "Status",
						},
						{
							label: "Caption — 12px / Medium / Uppercase / 0.05em",
							style: {
								fontSize: 12,
								fontWeight: 500,
								textTransform: "uppercase" as const,
								letterSpacing: "0.05em",
							},
							text: "IN PROGRESS",
						},
					].map((specimen) => (
						<div
							key={specimen.label}
							className="border-b border-[#1F1F1F] pb-6 last:border-0 last:pb-0"
						>
							<p className="mb-2 font-mono text-[11px] text-[#525252]">
								{specimen.label}
							</p>
							<p className="text-[#FAFAFA]" style={specimen.style}>
								{specimen.text}
							</p>
						</div>
					))}
					{/* Mono inline */}
					<div>
						<p className="mb-2 font-mono text-[11px] text-[#525252]">
							Mono inline — 13px Mono
						</p>
						<p className="font-mono text-[13px] text-[#FAFAFA]">
							CLV-123{"  "}main{"  "}2m ago
						</p>
					</div>
				</div>

				{/* Weight specimens */}
				<h3 className="mt-14 mb-6 text-sm font-semibold text-[#FAFAFA]">
					Weights
				</h3>
				<div className="flex gap-8">
					{[
						{ weight: 400, label: "Regular" },
						{ weight: 500, label: "Medium" },
						{ weight: 600, label: "Semibold" },
						{ weight: 700, label: "Bold" },
					].map((w) => (
						<div key={w.weight} className="text-center">
							<p
								className="text-5xl text-[#FAFAFA]"
								style={{ fontWeight: w.weight }}
							>
								Aa
							</p>
							<p className="mt-2 text-xs text-[#737373]">
								{w.weight} · {w.label}
							</p>
						</div>
					))}
				</div>
			</Section>

			{/* ================================================================ */}
			{/* 05 · ICONOGRAPHY */}
			{/* ================================================================ */}
			<Section id="iconography" number="04" title="Iconography">
				<p className="mb-8 text-sm text-[#A3A3A3]">
					2px stroke, round caps, round joins. Color inherits from text.
				</p>

				{/* Icon grid */}
				<div className="grid grid-cols-6 gap-4 sm:grid-cols-9">
					{ICON_SET.map(({ name, Icon }) => (
						<div
							key={name}
							className="flex flex-col items-center gap-2 rounded-lg border border-[#262626] bg-[#171717] p-4"
						>
							<Icon size={20} strokeWidth={2} className="text-[#FAFAFA]" />
							<span className="font-mono text-[10px] text-[#525252]">
								{name}
							</span>
						</div>
					))}
				</div>

				{/* Size comparison */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Sizes
				</h3>
				<div className="flex items-end gap-8">
					{[16, 18, 20, 24].map((size) => (
						<div key={size} className="flex flex-col items-center gap-2">
							<Layers size={size} strokeWidth={2} className="text-[#FAFAFA]" />
							<span className="font-mono text-[11px] text-[#737373]">
								{size}px
							</span>
						</div>
					))}
				</div>
			</Section>

			{/* ================================================================ */}
			{/* 06 · SURFACES */}
			{/* ================================================================ */}
			<Section id="surfaces" number="05" title="Surfaces">
				<h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">Cards</h3>
				<div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
					{[
						{ label: "Base", radius: 6, shadow: "none" },
						{ label: "Small", radius: 6, shadow: "0 1px 3px rgba(0,0,0,0.3)" },
						{
							label: "Medium",
							radius: 12,
							shadow: "0 4px 12px rgba(0,0,0,0.35)",
						},
						{
							label: "Large",
							radius: 12,
							shadow: "0 8px 24px rgba(0,0,0,0.4)",
						},
					].map((surface) => (
						<div
							key={surface.label}
							className="flex h-32 flex-col items-center justify-center border border-[#262626] bg-[#171717]"
							style={{
								borderRadius: surface.radius,
								boxShadow: surface.shadow,
							}}
						>
							<p className="text-sm font-medium text-[#FAFAFA]">
								{surface.label}
							</p>
							<p className="mt-1 font-mono text-[11px] text-[#525252]">
								{surface.radius}px radius
							</p>
						</div>
					))}
				</div>

				{/* Floating materials */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Floating
				</h3>
				<div className="grid gap-4 sm:grid-cols-3">
					{[
						{ label: "Menu", radius: 12, shadow: "0 4px 16px rgba(0,0,0,0.4)" },
						{
							label: "Modal",
							radius: 12,
							shadow: "0 8px 32px rgba(0,0,0,0.5)",
						},
						{
							label: "Fullscreen",
							radius: 16,
							shadow: "0 16px 48px rgba(0,0,0,0.6)",
						},
					].map((f) => (
						<div
							key={f.label}
							className="flex h-28 flex-col items-center justify-center border border-[#262626] bg-[#1C1C1C]"
							style={{ borderRadius: f.radius, boxShadow: f.shadow }}
						>
							<p className="text-sm font-medium text-[#FAFAFA]">{f.label}</p>
							<p className="mt-1 font-mono text-[11px] text-[#525252]">
								{f.radius}px radius
							</p>
						</div>
					))}
				</div>
			</Section>

			{/* ================================================================ */}
			{/* 07 · COMPONENTS */}
			{/* ================================================================ */}
			<Section id="components" number="06" title="Components">
				{/* Buttons */}
				<h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">Buttons</h3>
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						className="rounded-md bg-sienna-500 px-4 py-2 text-sm font-medium text-white"
					>
						Primary
					</button>
					<button
						type="button"
						className="rounded-md border border-[#262626] bg-transparent px-4 py-2 text-sm font-medium text-[#FAFAFA]"
					>
						Secondary
					</button>
					<button
						type="button"
						className="rounded-md px-4 py-2 text-sm font-medium text-[#A3A3A3]"
					>
						Ghost
					</button>
					<button
						type="button"
						className="rounded-md bg-[#E5484D] px-4 py-2 text-sm font-medium text-white"
					>
						Destructive
					</button>
				</div>

				{/* Input */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Input
				</h3>
				<div className="max-w-sm">
					<div className="flex items-center gap-2 rounded-lg border border-[#262626] bg-[#171717] px-3 py-2">
						<Search size={14} className="text-[#525252]" />
						<span className="text-sm text-[#525252]">Search issues...</span>
					</div>
				</div>

				{/* Issue card */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Issue card
				</h3>
				<div className="max-w-md rounded-xl border border-[#262626] bg-[#171717] p-4">
					<div className="flex items-center gap-3">
						<div className="h-2 w-2 rounded-full bg-[#F5A623]" />
						<span className="font-mono text-xs text-[#737373]">CLV-142</span>
					</div>
					<p className="mt-2 text-sm font-semibold text-[#FAFAFA]">
						Implement OAuth2 flow
					</p>
					<div className="mt-3 flex items-center gap-3">
						<span className="rounded-full bg-sienna-500/15 px-2.5 py-0.5 text-xs font-medium text-sienna-400">
							In Progress
						</span>
						<div className="flex items-center gap-2 ml-auto">
							<div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#262626] text-[10px] font-medium text-[#A3A3A3]">
								AK
							</div>
							<span className="font-mono text-[11px] text-[#525252]">
								2h ago
							</span>
						</div>
					</div>
				</div>

				{/* Badges */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Badges
				</h3>
				<div className="flex flex-wrap gap-2">
					{[
						{ label: "Backlog", bg: "bg-[#262626]", text: "text-[#A3A3A3]" },
						{ label: "Todo", bg: "bg-[#404040]", text: "text-[#D4D4D4]" },
						{
							label: "In Progress",
							bg: "bg-sienna-500/15",
							text: "text-sienna-400",
						},
						{ label: "Done", bg: "bg-[#17B169]/15", text: "text-[#17B169]" },
						{
							label: "Canceled",
							bg: "bg-[#E5484D]/15",
							text: "text-[#E5484D]",
						},
					].map((badge) => (
						<span
							key={badge.label}
							className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}
						>
							{badge.label}
						</span>
					))}
				</div>
			</Section>

			{/* ================================================================ */}
			{/* 08 · VOICE */}
			{/* ================================================================ */}
			<Section id="voice" number="07" title="Voice">
				<div className="grid gap-6 md:grid-cols-2">
					{/* Do column */}
					<div>
						<div className="mb-4 flex items-center gap-2">
							<div className="h-2 w-2 rounded-full bg-[#17B169]" />
							<span className="text-sm font-semibold text-[#FAFAFA]">Do</span>
						</div>
						<div className="space-y-3">
							{[
								"No issues yet. Create one to get started.",
								"AI is working on this issue.",
								"Failed to save. Check your connection.",
								"Start building",
							].map((text) => (
								<div
									key={text}
									className="rounded-lg border border-[#17B169]/20 bg-[#17B169]/5 px-4 py-3 text-sm text-[#FAFAFA]"
								>
									{text}
								</div>
							))}
						</div>
					</div>

					{/* Don't column */}
					<div>
						<div className="mb-4 flex items-center gap-2">
							<div className="h-2 w-2 rounded-full bg-[#E5484D]" />
							<span className="text-sm font-semibold text-[#FAFAFA]">
								Don&apos;t
							</span>
						</div>
						<div className="space-y-3">
							{[
								"It looks like you haven't created any issues! Why not get started?",
								"Your AI teammate is hard at work!",
								"Oops! Something went wrong. We're really sorry about that!",
								"Get started for free today!",
							].map((text) => (
								<div
									key={text}
									className="rounded-lg border border-[#E5484D]/20 bg-[#E5484D]/5 px-4 py-3 text-sm text-[#A3A3A3]"
								>
									{text}
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Copy rules */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Copy rules
				</h3>
				<div className="flex flex-wrap gap-3">
					{[
						"Sentence case",
						"No emojis",
						"Short labels",
						"Verb-first actions",
					].map((rule) => (
						<span
							key={rule}
							className="rounded-full border border-[#262626] px-3 py-1 text-xs font-medium text-[#A3A3A3]"
						>
							{rule}
						</span>
					))}
				</div>
			</Section>

			{/* ================================================================ */}
			{/* 09 · DARK MODE */}
			{/* ================================================================ */}
			<Section id="dark-mode" number="08" title="Dark mode">
				<p className="mb-8 text-sm text-[#A3A3A3]">
					Clave is dark-mode first. All surfaces, text, and interactive states
					are designed for dark backgrounds by default.
				</p>

				{/* Color mapping table */}
				<h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
					Color mapping
				</h3>
				<div className="overflow-hidden rounded-xl border border-[#262626]">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-[#262626] bg-[#171717]">
								<th className="px-4 py-3 font-medium text-[#A3A3A3]">Token</th>
								<th className="px-4 py-3 font-medium text-[#A3A3A3]">Light</th>
								<th className="px-4 py-3 font-medium text-[#A3A3A3]">Dark</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[#1F1F1F]">
							{[
								{ token: "Background", light: "#FFFFFF", dark: "#0A0A0A" },
								{ token: "Surface", light: "#F5F5F5", dark: "#171717" },
								{ token: "Elevated", light: "#FFFFFF", dark: "#1C1C1C" },
								{ token: "Border", light: "#E5E5E5", dark: "#262626" },
								{ token: "Text primary", light: "#0A0A0A", dark: "#FAFAFA" },
								{ token: "Text secondary", light: "#525252", dark: "#A3A3A3" },
								{ token: "Text tertiary", light: "#A3A3A3", dark: "#737373" },
							].map((row) => (
								<tr key={row.token} className="bg-[#0A0A0A]">
									<td className="px-4 py-3 font-medium text-[#FAFAFA]">
										{row.token}
									</td>
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<div
												className="h-4 w-4 rounded border border-[#262626]"
												style={{ backgroundColor: row.light }}
											/>
											<span className="font-mono text-xs text-[#737373]">
												{row.light}
											</span>
										</div>
									</td>
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<div
												className="h-4 w-4 rounded border border-[#262626]"
												style={{ backgroundColor: row.dark }}
											/>
											<span className="font-mono text-xs text-[#737373]">
												{row.dark}
											</span>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/* Side-by-side preview */}
				<h3 className="mt-14 mb-4 text-sm font-semibold text-[#FAFAFA]">
					Preview
				</h3>
				<div className="grid gap-4 md:grid-cols-2">
					{/* Light card */}
					<div className="rounded-xl border border-[#E5E5E5] bg-[#FFFFFF] p-4">
						<p
							className="text-xs font-medium text-[#A3A3A3]"
							style={{ letterSpacing: "0.05em" }}
						>
							LIGHT
						</p>
						<div className="mt-3 rounded-lg border border-[#E5E5E5] bg-[#F5F5F5] p-3">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-[#E08C5A]" />
								<span className="font-mono text-xs text-[#A3A3A3]">
									CLV-142
								</span>
							</div>
							<p className="mt-1.5 text-sm font-semibold text-[#0A0A0A]">
								Implement OAuth2 flow
							</p>
							<span className="mt-2 inline-block rounded-full bg-[#C26A3A]/10 px-2 py-0.5 text-xs font-medium text-[#C26A3A]">
								In Progress
							</span>
						</div>
					</div>

					{/* Dark card */}
					<div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-4">
						<p
							className="text-xs font-medium text-[#737373]"
							style={{ letterSpacing: "0.05em" }}
						>
							DARK
						</p>
						<div className="mt-3 rounded-lg border border-[#262626] bg-[#171717] p-3">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-[#E08C5A]" />
								<span className="font-mono text-xs text-[#737373]">
									CLV-142
								</span>
							</div>
							<p className="mt-1.5 text-sm font-semibold text-[#FAFAFA]">
								Implement OAuth2 flow
							</p>
							<span className="mt-2 inline-block rounded-full bg-sienna-500/15 px-2 py-0.5 text-xs font-medium text-sienna-400">
								In Progress
							</span>
						</div>
					</div>
				</div>
			</Section>

			{/* ================================================================ */}
			{/* 10 · IN CONTEXT */}
			{/* ================================================================ */}
			<Section id="in-context" number="09" title="In context">
				<p className="mb-8 text-sm text-[#A3A3A3]">
					A realistic issue list demonstrating typography, color, spacing, and
					component patterns in context.
				</p>

				<div className="overflow-hidden rounded-xl border border-[#262626] bg-[#171717]">
					{/* Toolbar */}
					<div className="flex items-center gap-3 border-b border-[#262626] px-4 py-3">
						<div className="flex flex-1 items-center gap-2 rounded-lg border border-[#262626] bg-[#0A0A0A] px-3 py-1.5">
							<Search size={14} className="text-[#525252]" />
							<span className="text-sm text-[#525252]">Search issues...</span>
						</div>
						<button
							type="button"
							className="flex items-center gap-1.5 rounded-lg border border-[#262626] px-3 py-1.5 text-sm text-[#A3A3A3]"
						>
							<Filter size={14} />
							Filter
						</button>
						<button
							type="button"
							className="flex items-center gap-1.5 rounded-lg border border-[#262626] px-3 py-1.5 text-sm text-[#A3A3A3]"
						>
							<LayoutGrid size={14} />
							View
							<ChevronDown size={12} />
						</button>
					</div>

					{/* Issue rows */}
					<div className="divide-y divide-[#1F1F1F]">
						{ISSUES.map((issue) => (
							<div
								key={issue.id}
								className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[#1C1C1C]"
							>
								{/* Checkbox */}
								<div className="h-4 w-4 shrink-0 rounded border border-[#404040]" />
								{/* Priority */}
								<div
									className="h-2.5 w-2.5 shrink-0 rounded-full"
									style={{ backgroundColor: issue.priorityColor }}
									title={issue.priority}
								/>
								{/* ID */}
								<span className="w-[72px] shrink-0 font-mono text-xs text-[#737373]">
									{issue.id}
								</span>
								{/* Title */}
								<span className="flex-1 truncate text-sm text-[#FAFAFA]">
									{issue.title}
								</span>
								{/* Status badge */}
								<span
									className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
									style={{
										backgroundColor: `${issue.statusColor}20`,
										color: issue.statusColor,
									}}
								>
									{issue.status}
								</span>
								{/* Avatar */}
								<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#262626] text-[10px] font-medium text-[#A3A3A3]">
									{issue.avatar}
								</div>
								{/* Time */}
								<span className="w-[48px] shrink-0 text-right font-mono text-[11px] text-[#525252]">
									{issue.time}
								</span>
							</div>
						))}
					</div>
				</div>
			</Section>

			{/* ================================================================ */}
			{/* FOOTER */}
			{/* ================================================================ */}
			<footer className="border-t border-[#1F1F1F] py-16">
				<div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6">
					<PixelLogo cellSize={4} gap={1} color="#525252" />
					<p className="text-xs text-[#525252]">
						Clave Brand Guidelines — {new Date().getFullYear()}
					</p>
				</div>
			</footer>
		</div>
	);
}
