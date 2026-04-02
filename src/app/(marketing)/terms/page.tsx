import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Terms of Service — Clave",
	description:
		"Clave terms of service. Rules and guidelines for using the platform.",
};

export default function TermsOfServicePage() {
	return (
		<div className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
			<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
				Terms of Service
			</h1>
			<p className="mt-2 text-sm text-neutral-500">
				Last updated: April 1, 2026
			</p>

			<div className="mt-10 space-y-8 text-neutral-700 dark:text-neutral-300 leading-relaxed">
				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						1. Acceptance of terms
					</h2>
					<p className="mt-2">
						By accessing or using Clave ("the Service"), operated by Z360 ("we",
						"us", "our"), you agree to be bound by these Terms of Service. If
						you do not agree, do not use the Service.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						2. Description of service
					</h2>
					<p className="mt-2">
						Clave is an AI-powered project management and collaboration
						platform. The Service includes the web application at
						clave.z360.biz, the Clave bot for Google Chat, and related APIs and
						integrations.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						3. Accounts and access
					</h2>
					<ul className="mt-2 list-disc pl-6 space-y-1">
						<li>
							You must provide accurate information when creating an account
						</li>
						<li>
							You are responsible for maintaining the security of your account
							credentials
						</li>
						<li>You must be at least 18 years old to use the Service</li>
						<li>
							One person or organization may maintain multiple workspaces, but
							each workspace must have a designated owner
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						4. Acceptable use
					</h2>
					<p className="mt-2">You agree not to:</p>
					<ul className="mt-2 list-disc pl-6 space-y-1">
						<li>
							Use the Service for any unlawful purpose or in violation of any
							applicable laws
						</li>
						<li>
							Attempt to gain unauthorized access to the Service or its related
							systems
						</li>
						<li>
							Interfere with or disrupt the integrity or performance of the
							Service
						</li>
						<li>Upload or transmit malicious code, viruses, or harmful data</li>
						<li>Use the Service to send spam or unsolicited communications</li>
						<li>
							Reverse engineer, decompile, or disassemble any part of the
							Service
						</li>
						<li>
							Resell or redistribute the Service without our written consent
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						5. Your content
					</h2>
					<p className="mt-2">
						You retain ownership of all content you create within Clave,
						including projects, issues, documents, and comments ("Your
						Content"). By using the Service, you grant us a limited license to
						store, process, and display Your Content as necessary to operate the
						Service and provide AI-powered features.
					</p>
					<p className="mt-2">
						You are responsible for ensuring you have the right to upload and
						share any content you add to the Service.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						6. Google Chat integration
					</h2>
					<p className="mt-2">
						When you install and use the Clave bot for Google Chat:
					</p>
					<ul className="mt-2 list-disc pl-6 space-y-1">
						<li>
							The bot processes messages directed to it (mentions and direct
							messages) to provide workspace functionality
						</li>
						<li>A workspace administrator must authorize the integration</li>
						<li>
							You may disconnect the integration at any time from your workspace
							settings
						</li>
						<li>
							Use of Google Chat is subject to Google's own terms of service
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						7. AI features
					</h2>
					<p className="mt-2">
						Clave includes AI-powered features for search, triage,
						summarization, and content generation. AI outputs are provided as
						suggestions and may not always be accurate. You are responsible for
						reviewing and validating any AI-generated content before acting on
						it.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						8. Billing and payments
					</h2>
					<p className="mt-2">
						Some features of the Service require a paid subscription. Payment
						terms are presented at the time of purchase. Subscriptions renew
						automatically unless cancelled before the renewal date. Refunds are
						handled on a case-by-case basis.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						9. Service availability
					</h2>
					<p className="mt-2">
						We strive to maintain high availability but do not guarantee
						uninterrupted access. The Service may be temporarily unavailable for
						maintenance, updates, or circumstances beyond our control. We are
						not liable for any loss or damage resulting from service
						interruptions.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						10. Limitation of liability
					</h2>
					<p className="mt-2">
						To the maximum extent permitted by law, Clave and its operators
						shall not be liable for any indirect, incidental, special,
						consequential, or punitive damages, or any loss of profits or
						revenue, whether incurred directly or indirectly, or any loss of
						data, use, or goodwill.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						11. Termination
					</h2>
					<p className="mt-2">
						We may suspend or terminate your access to the Service at any time
						for violation of these terms or for any other reason with reasonable
						notice. You may terminate your account at any time by contacting us.
						Upon termination, your right to use the Service ceases immediately.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						12. Changes to these terms
					</h2>
					<p className="mt-2">
						We may modify these terms at any time. We will notify you of
						material changes by posting the updated terms on this page.
						Continued use of the Service after changes constitutes acceptance of
						the new terms.
					</p>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						13. Contact us
					</h2>
					<p className="mt-2">
						If you have questions about these Terms of Service, contact us at{" "}
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
