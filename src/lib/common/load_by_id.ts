import { type Platform } from "./platform";
import { type Bounty } from "./bounty";
import { bounty_detail } from "./store";

export async function loadBountyById(bountyId: string, platform: Platform) {
    try {
        const bounties: Map<string, Bounty> = await platform.fetch();
        const bounty = bounties.get(bountyId);
        
        if (!bounty) {
            throw new Error(`Project with ID ${bountyId} not found.`);
        }
        
        bounty_detail.set(bounty);
    } catch (error) {
        console.error(`Failed to load project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}