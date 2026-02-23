import { redirect } from "next/navigation";

export default function LegacyAdminPathRedirectPage() {
	redirect("/admin");
}
