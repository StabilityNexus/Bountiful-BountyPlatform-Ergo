import type { Proposal } from "./proposal";
import { proposal_detail } from "./store";
import type { Platform } from "./platform";

export async function loadProposalsFromPlatform(platform: Platform): Promise<void> {
    try {
        console.log("Fetching proposals from platform...");
        const proposals: Proposal[] = await platform.fetchProposals();
        
        proposal_detail.set(proposals);
    } catch (error) {
        console.error(`Failed to load proposals: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}