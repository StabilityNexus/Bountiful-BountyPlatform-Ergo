import { type Platform } from "./platform";
import { type Bounty } from "./bounty";
import { bounty_detail } from "./store";

export async function loadBountyById(bountyId: string, platform: Platform): Promise<Bounty | null> {
    try {
        // First try to get bounty directly by ID if the platform supports it
        if (platform.getBountyById) {
            const bounty = await platform.getBountyById(bountyId);
            if (bounty) {
                bounty_detail.set(bounty);
                return bounty;
            }
        }

        // Fallback to fetching all bounties and searching
        const bounties: Map<string, Bounty> = await platform.fetch_bounties();
        const bounty = bounties.get(bountyId);
        
        if (!bounty) {
            console.warn(`Bounty with ID ${bountyId} not found.`);
            return null;
        }
        
        bounty_detail.set(bounty);
        return bounty;
    } catch (error) {
        console.error(`Failed to load bounty: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error; // Re-throw to allow calling code to handle the error
    }
}