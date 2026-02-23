import { AnimatedFeatures } from "@/components/marketing/animated-features";
import { AnimatedHero } from "@/components/marketing/animated-hero";
import { AnimatedSocialProof } from "@/components/marketing/animated-social-proof";
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
			<AnimatedFeatures>
				<FeaturesSection />
			</AnimatedFeatures>
			<AnimatedSocialProof>
				<SocialProof />
			</AnimatedSocialProof>
			<AnimatedSocialProof>
				<CtaSection />
			</AnimatedSocialProof>
		</>
	);
}
