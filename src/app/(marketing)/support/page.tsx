import { Mail } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Support — Clave",
	description:
		"Get help with Clave. Contact our team for technical support, bug reports, or feature requests.",
};

export default function SupportPage() {
	return (
		<div className="mx-auto max-w-2xl px-6 py-24 sm:py-32">
			<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Support</h1>
			<p className="mt-4 text-lg text-neutral-600 dark:text-neutral-400">
				We're here to help. Reach out to our team for any questions, bug
				reports, or feature requests.
			</p>

			<div className="mt-12 space-y-10">
				<section>
					<h2 className="text-xl font-semibold">Contact us</h2>
					<p className="mt-2 text-neutral-600 dark:text-neutral-400">
						Email our support team directly and we'll get back to you as soon as
						possible.
					</p>
					<a
						href="mailto:support@z360.biz"
						className="mt-4 inline-flex items-center gap-2 rounded-md bg-sienna-500 px-4 py-2 text-sm font-medium text-white hover:bg-sienna-600 transition-colors"
					>
						<Mail className="h-4 w-4" />
						support@z360.biz
					</a>
				</section>

				<section>
					<h2 className="text-xl font-semibold">Google Chat integration</h2>
					<p className="mt-2 text-neutral-600 dark:text-neutral-400">
						For help with the Clave bot for Google Chat, including setup,
						configuration, or troubleshooting:
					</p>
					<ul className="mt-3 list-disc pl-6 space-y-1 text-neutral-600 dark:text-neutral-400">
						<li>
							Type <code className="text-sm">/help</code> in any conversation
							with the Clave bot
						</li>
						<li>Visit your workspace settings to manage the integration</li>
						<li>
							Email{" "}
							<a
								href="mailto:support@z360.biz"
								className="text-sienna-500 hover:text-sienna-600 underline"
							>
								support@z360.biz
							</a>{" "}
							for technical issues
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-xl font-semibold">Bug reports</h2>
					<p className="mt-2 text-neutral-600 dark:text-neutral-400">
						Found a bug? Please include steps to reproduce, expected behavior,
						and any error messages when contacting us. This helps us resolve
						issues faster.
					</p>
				</section>
			</div>
		</div>
	);
}
