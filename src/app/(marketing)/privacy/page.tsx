import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Privacy Policy — Clave",
	description:
		"Clave privacy policy. How we collect, use, and protect your data.",
};

export default function PrivacyPolicyPage() {
	return (
		<div className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
			<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
				Privacy Policy
			</h1>
			<p className="mt-2 text-sm text-neutral-500">
				Last updated: April 1, 2026
			</p>

			<div className="mt-10 space-y-8 text-neutral-700 dark:text-neutral-300 leading-relaxed">
				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						1. Introduction
					</h2>
					<p className="mt-2">
						Clave ("we", "us", "our") operates the Clave platform at
						clave.z360.biz and related services, including the Clave bot for
						Google Chat. This Privacy Policy explains how we collect, use,
						disclose, and safeguard your information when you use our services.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						2. Information we collect
					</h2>
					<h3 className="mt-3 font-medium">Account information</h3>
					<p className="mt-1">
						When you create an account, we collect your name, email address, and
						authentication credentials (via Google OAuth). We do not store
						passwords directly.
					</p>
					<h3 className="mt-3 font-medium">Workspace data</h3>
					<p className="mt-1">
						Content you create within Clave, including projects, issues,
						documents, whiteboards, notes, and comments. This data is stored in
						your workspace and is only accessible to members of that workspace.
					</p>
					<h3 className="mt-3 font-medium">Google Chat integration data</h3>
					<p className="mt-1">
						When you use the Clave bot for Google Chat, we process messages sent
						to or mentioning the bot to provide responses. We store conversation
						thread metadata to maintain context. We do not read or store
						messages in Google Chat spaces unless they are directed at the Clave
						bot.
					</p>
					<h3 className="mt-3 font-medium">Usage data</h3>
					<p className="mt-1">
						We collect anonymized usage analytics to improve the service,
						including page views, feature usage, and performance metrics.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						3. How we use your information
					</h2>
					<ul className="mt-2 list-disc pl-6 space-y-1">
						<li>Provide, operate, and maintain the Clave platform</li>
						<li>
							Process and respond to your messages via the Google Chat
							integration
						</li>
						<li>
							Send notifications you have opted into (issue assignments,
							mentions, status changes)
						</li>
						<li>Improve and personalize your experience</li>
						<li>
							Provide AI-powered features (issue triage, search, summaries)
							using your workspace data
						</li>
						<li>Comply with legal obligations and enforce our terms</li>
					</ul>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						4. Data sharing and disclosure
					</h2>
					<p className="mt-2">
						We do not sell your personal information. We may share data with:
					</p>
					<ul className="mt-2 list-disc pl-6 space-y-1">
						<li>
							<strong>Service providers:</strong> Third-party services that help
							us operate the platform (hosting, authentication, payment
							processing, AI inference)
						</li>
						<li>
							<strong>Workspace members:</strong> Data within a workspace is
							shared among its members according to their roles and permissions
						</li>
						<li>
							<strong>Legal requirements:</strong> When required by law,
							regulation, or legal process
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						5. Data storage and security
					</h2>
					<p className="mt-2">
						Your data is stored securely using Convex (backend database) and
						Vercel (frontend hosting). We use encryption in transit (TLS) and at
						rest. Service account credentials for integrations are encrypted
						using AES-256-GCM before storage.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						6. Data retention
					</h2>
					<p className="mt-2">
						We retain your data for as long as your account is active or as
						needed to provide services. When you delete your account or
						disconnect an integration, associated data is removed within 30
						days. You can request data deletion at any time by contacting us.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						7. Your rights
					</h2>
					<p className="mt-2">
						Depending on your jurisdiction, you may have the right to:
					</p>
					<ul className="mt-2 list-disc pl-6 space-y-1">
						<li>Access the personal data we hold about you</li>
						<li>Request correction of inaccurate data</li>
						<li>Request deletion of your data</li>
						<li>Export your data in a portable format</li>
						<li>Object to or restrict certain processing activities</li>
					</ul>
					<p className="mt-2">
						To exercise these rights, contact us at{" "}
						<a
							href="mailto:support@z360.biz"
							className="text-sienna-500 hover:text-sienna-600 underline"
						>
							support@z360.biz
						</a>
						.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						8. Google API Services
					</h2>
					<p className="mt-2">
						Clave's use and transfer to any other app of information received
						from Google APIs will adhere to the{" "}
						<a
							href="https://developers.google.com/terms/api-services-user-data-policy"
							target="_blank"
							rel="noopener noreferrer"
							className="text-sienna-500 hover:text-sienna-600 underline"
						>
							Google API Services User Data Policy
						</a>
						, including the Limited Use requirements.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						9. Changes to this policy
					</h2>
					<p className="mt-2">
						We may update this Privacy Policy from time to time. We will notify
						you of material changes by posting the new policy on this page and
						updating the "Last updated" date.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						10. Contact us
					</h2>
					<p className="mt-2">
						If you have questions about this Privacy Policy, contact us at{" "}
						<a
							href="mailto:support@z360.biz"
							className="text-sienna-500 hover:text-sienna-600 underline"
						>
							support@z360.biz
						</a>
						.
					</p>
				</section>
			</div>
		</div>
	);
}
