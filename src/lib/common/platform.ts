import type { ErgoPlatform } from "$lib/ergo/platform";
import { type Bounty } from "../common/bounty";
import { type contract_version } from "../ergo/contract";

export interface Platform {
    id: string;  // ergo, ethereum ...
    main_token: string; // ERG, ETH ...
    icon: string;  // Icon path or url.
    time_per_block: number; // milliseconds
    last_version: contract_version;
    
    // Common methods
    connect(): Promise<void>;
    get_current_height(): Promise<number>;
    get_balance(id?: string): Promise<Map<string, number>>;
    
    // Bounty-specific methods
    submit(
        title: string,
        bountyContent: string, // Changed from description
        reward_token_id: string, // Added
        reward_amount: number,    // Changed from reward
        deadlineBlock: number,    // Changed from deadline
        min_submissions: number
        // creator: string, // Removed
        // metadata: string // Removed
    ): Promise<string | null>;
    
    submit_solution(
        bounty: Bounty,
        solutionData: string,
        submissionMetadata?: Record<string, unknown>
    ): Promise<string | null>;
    
    judge_submission(
        bounty: Bounty,
        submissionId: string, // Changed from number to string
        accepted: boolean
    ): Promise<string | null>;
    
    // withdraw(bounty: Bounty): Promise<string | null>; // Note: ErgoPlatform has (bounty, winnerAddress, submissionId)
    refund_bounty(bounty: Bounty): Promise<string | null>;
    fetch_bounties(): Promise<Bounty[]>; // Changed from Map<string, Bounty>
    getBountyById(id: string): Promise<Bounty | null>; // Changed return to Bounty | null to align with typical getById patterns
    
    // New/Deferred methods from user feedback, now optional
    claimBounty?(bounty: Bounty /* other relevant params */ ): Promise<string | null>;
    cancelBounty?(bounty: Bounty /* other relevant params */ ): Promise<string | null>;
}

export interface BountyMetadata {
    title: string;
    description: string;
    category: string;
    tags: string[];
    status: string;
    image?: string;
    attachments?: string[];
}