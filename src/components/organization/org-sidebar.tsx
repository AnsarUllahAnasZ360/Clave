"use client";

import { Buildings } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserFooterMenu } from "@/components/shared/user-footer-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

export function OrgSidebar() {
	const pathname = usePathname();
	const isOrgsActive = pathname.startsWith("/organizations");

	return (
		<Sidebar
			collapsible="icon"
			className="border-border/40 border-r-0 shadow-none border-none"
		>
			<SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
				<Link
					href="/organizations"
					prefetch={false}
					className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center"
				>
					<span className="text-lg font-semibold group-data-[collapsible=icon]:text-sm">
						Clave
					</span>
				</Link>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									asChild
									isActive={isOrgsActive}
									tooltip="Organizations"
								>
									<Link href="/organizations" prefetch={false}>
										<Buildings className="h-4 w-4" />
										<span>Organizations</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<UserFooterMenu settingsHref="/organizations" />
		</Sidebar>
	);
}
