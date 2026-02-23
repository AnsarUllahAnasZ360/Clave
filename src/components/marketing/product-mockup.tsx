// ---------------------------------------------------------------------------
// Product mockup — a realistic dark Kanban board UI for the hero section
// Server Component — no interactivity needed
// ---------------------------------------------------------------------------

const COLUMNS = [
	{
		title: "Backlog",
		color: "#404040",
		cards: [
			{
				id: "CLV-241",
				title: "Research caching strategies",
				priority: "#A3A3A3",
				avatar: "LM",
			},
			{
				id: "CLV-238",
				title: "Update onboarding copy",
				priority: "#A3A3A3",
				avatar: "JD",
			},
		],
	},
	{
		title: "Todo",
		color: "#525252",
		cards: [
			{
				id: "CLV-237",
				title: "Add keyboard shortcuts guide",
				priority: "#E08C5A",
				avatar: "SM",
			},
			{
				id: "CLV-235",
				title: "Implement file preview modal",
				priority: "#F5A623",
				avatar: "AK",
			},
			{
				id: "CLV-233",
				title: "Add batch export for board data",
				priority: "#A3A3A3",
				avatar: "RK",
			},
		],
	},
	{
		title: "In progress",
		color: "#C26A3A",
		cards: [
			{
				id: "CLV-232",
				title: "Fix authentication timeout on mobile",
				priority: "#E5484D",
				avatar: "AK",
			},
			{
				id: "CLV-229",
				title: "Migrate to edge runtime",
				priority: "#F5A623",
				avatar: "SM",
			},
		],
	},
	{
		title: "Done",
		color: "#17B169",
		cards: [
			{
				id: "CLV-228",
				title: "Setup real-time sync",
				priority: "#E08C5A",
				avatar: "JD",
			},
			{
				id: "CLV-225",
				title: "Implement OAuth2 flow",
				priority: "#F5A623",
				avatar: "LM",
			},
		],
	},
];

function MockCard({
	id,
	title,
	priority,
	avatar,
}: {
	id: string;
	title: string;
	priority: string;
	avatar: string;
}) {
	return (
		<div className="rounded-lg border border-[#262626] bg-[#171717] p-3">
			<div className="flex items-center gap-2">
				<div
					className="h-2 w-2 shrink-0 rounded-full"
					style={{ backgroundColor: priority }}
				/>
				<span className="font-mono text-[10px] text-[#525252]">{id}</span>
			</div>
			<p className="mt-1.5 text-xs font-medium leading-snug text-[#E5E5E5]">
				{title}
			</p>
			<div className="mt-2 flex items-center justify-end">
				<div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#262626] text-[8px] font-medium text-[#737373]">
					{avatar}
				</div>
			</div>
		</div>
	);
}

function MockColumn({
	title,
	color,
	cards,
}: {
	title: string;
	color: string;
	cards: Array<{
		id: string;
		title: string;
		priority: string;
		avatar: string;
	}>;
}) {
	return (
		<div className="flex w-56 shrink-0 flex-col gap-2 lg:w-auto lg:flex-1">
			<div className="mb-1 flex items-center gap-2 px-1">
				<div
					className="h-2 w-2 rounded-full"
					style={{ backgroundColor: color }}
				/>
				<span className="text-xs font-medium text-[#A3A3A3]">{title}</span>
				<span className="font-mono text-[10px] text-[#525252]">
					{cards.length}
				</span>
			</div>
			<div className="flex flex-col gap-2">
				{cards.map((card) => (
					<MockCard key={card.id} {...card} />
				))}
			</div>
		</div>
	);
}

export function ProductMockup() {
	return (
		<div className="overflow-hidden rounded-xl border border-[#262626] bg-[#0E0E0E] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
			{/* Window chrome */}
			<div className="flex items-center gap-2 border-b border-[#1F1F1F] px-4 py-3">
				<div className="flex gap-1.5">
					<div className="h-2.5 w-2.5 rounded-full bg-[#E5484D]/60" />
					<div className="h-2.5 w-2.5 rounded-full bg-[#F5A623]/60" />
					<div className="h-2.5 w-2.5 rounded-full bg-[#17B169]/60" />
				</div>
				<div className="mx-auto flex items-center gap-2">
					<span className="font-mono text-[10px] text-[#525252]">
						Sprint 4 / API Integration
					</span>
				</div>
			</div>

			{/* Content area */}
			<div className="flex">
				{/* Sidebar stub */}
				<div className="hidden w-48 shrink-0 border-r border-[#1F1F1F] bg-[#0A0A0A] p-3 lg:block">
					<div className="mb-4 flex items-center gap-2 px-2">
						<div className="h-5 w-5 rounded bg-sienna-500/20 flex items-center justify-center">
							<span className="text-[8px] font-bold text-sienna-400">C</span>
						</div>
						<span className="text-xs font-medium text-[#E5E5E5]">
							Acme Corp
						</span>
					</div>
					<div className="flex flex-col gap-0.5">
						{[
							{ label: "Projects", active: true },
							{ label: "My tasks", active: false },
							{ label: "Inbox", active: false },
							{ label: "Clients", active: false },
							{ label: "Notes", active: false },
							{ label: "Analytics", active: false },
						].map((item) => (
							<div
								key={item.label}
								className={`rounded-md px-2 py-1.5 text-[11px] ${
									item.active
										? "bg-[#1C1C1C] font-medium text-[#FAFAFA]"
										: "text-[#737373]"
								}`}
							>
								{item.label}
							</div>
						))}
					</div>
				</div>

				{/* Board area */}
				<div className="flex-1 overflow-x-auto p-4">
					<div className="flex gap-3">
						{COLUMNS.map((col) => (
							<MockColumn key={col.title} {...col} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
