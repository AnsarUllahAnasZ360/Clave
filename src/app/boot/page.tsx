import { redirect } from "next/navigation";

// Legacy route — all post-login routing now happens via AuthRedirect
// on the marketing layout (/).
export default function BootPage() {
	redirect("/");
}
