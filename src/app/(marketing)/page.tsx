import { AnimatedHero } from "@/components/marketing/animated-hero";
import { CtaSection } from "@/components/marketing/cta-section";
import { FeaturesSection } from "@/components/marketing/features-section";
import { Hero } from "@/components/marketing/hero";
import { SocialProof } from "@/components/marketing/social-proof";

export default function MarketingPage() {
	return (
		<>
			<AnimatedHero>
				<Hero />
			</AnimatedHero>
			<FeaturesSection />
			<SocialProof />
			<CtaSection />
		</>
	);
}
