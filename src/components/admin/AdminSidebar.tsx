"use client";

import {
	ArrowLeft,
	Buildings,
	ChartBar,
	House,
	UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { PixelLogo } from "@/components/marketing/pixel-logo";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";

const adminNavItems = [
	{
		title: "Dashboard",
		url: "/admin",
		icon: House,
	},
	{
		title: "Organizations",
		url: "/admin/organizations",
		icon: Buildings,
	},
	{
		title: "Users",
		url: "/admin/users",
		icon: UsersThree,
	},
	{
		title: "Analytics",
		url: "/admin/analytics",
		icon: ChartBar,
	},
];

export function AdminSidebar() {
	const pathname = usePathname();

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="p-3 group-data-[collapsible=icon]:p-2">
				<div className="hidden h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-100 group-data-[collapsible=icon]:flex">
					<span className="text-[11px] font-semibold tracking-[0.18em]">
						CL
					</span>
				</div>
				<div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 px-3 py-2 text-zinc-100 shadow-sm group-data-[collapsible=icon]:hidden">
					<PixelLogo color="#fafafa" cellSize={2} gap={1} />
					<p className="mt-2 text-[10px] uppercase tracking-[0.24em] text-zinc-400">
						build-in-sync
					</p>
				</div>
			</SidebarHeader>

			<SidebarContent className="overflow-x-hidden">
				<SidebarGroup>
					<SidebarGroupLabel>Platform</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{adminNavItems.map((item) => {
								const isActive =
									item.url === "/admin"
										? pathname === "/admin"
										: pathname.startsWith(item.url);
								return (
									<SidebarMenuItem key={item.title}>
										<SidebarMenuButton
											asChild
											tooltip={item.title}
											isActive={isActive}
										>
											<Link href={item.url as LinkProps<string>["href"]}>
												<item.icon className="h-[18px] w-[18px]" />
												<span>{item.title}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className="border-t border-border/40 p-2">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip="Back to App">
							<Link href={"/" as LinkProps<string>["href"]}>
								<ArrowLeft className="h-[18px] w-[18px]" />
								<span>Back to App</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
