// src/lib/common/bounty.ts
import { type contract_version } from "$lib/ergo/contract";
import { type BountyMetadata, type Platform } from "./platform";
import type { Amount, Box } from "@fleet-sdk/core";

export interface TokenEIP4 {
    name: string;
    description: string;
    decimals: number;
    emissionAmount: number | null;
}

export interface BountyContent {
    raw?: string;
    title: string;
    description: string;
    link?: string | null;
    image?: string | null;
}

export interface ConstantContent {
    raw?: string;
    owner: string;
    dev_addr: string;
    dev_hash: string;
    dev_fee: number;
    token_id: string;
}

export function getBountyContent(id: string, rawContent: string): BountyContent {1
    try {
        const content = JSON.parse(rawContent);
        return {
            raw: rawContent,
            title: content.title || `Bounty ${id}`,
            description: content.description || '',
            link: content.link || null,
            image: content.image || null
        };
    } catch (e) {
        return {
            raw: rawContent,
            title: `Bounty ${id}`,
            description: ''
        };
    }
}

// Export as a standalone function
export function is_ended(bounty: Pick<Bounty, 'current_height' | 'deadline'>): boolean {
    return bounty.current_height !== undefined && 
           bounty.deadline !== undefined && 
           bounty.current_height >= bounty.deadline;
}

// Helper function to calculate if a user can submit to a bounty
export function can_submit(bounty: Bounty): boolean {
    // Can submit if:
    // 1. Deadline not passed
    // 2. Bounty is in 'open' status
    return !is_ended(bounty) && 
           (bounty.status === 'open' || bounty.status === undefined);
}

// Helper function to check if creator can judge submissions
export function can_judge(bounty: Bounty, address: string): boolean {
    // Can judge if:
    // 1. Is the bounty creator
    // 2. Has submissions to judge
    // 3. Bounty is still active or in judging period
    return bounty.creator === address && 
           (bounty.total_submissions || 0) > 0 && 
           !is_refund_period(bounty);
}

export function can_withdraw_reward(bounty: Bounty): boolean {
    const accepted = bounty.accepted_submissions || 0;
    const total = bounty.total_submissions || 0;
    const min = bounty.min_submissions || 0;
    return accepted > 0 && total >= min;
}

// Helper function to check if bounty is in refund period
export function is_refund_period(bounty: Bounty): boolean {
    // Refund period if:
    // 1. Deadline passed
    // 2. No accepted submissions OR minimum submissions not met
    const noAcceptedSubmissions = !bounty.accepted_submissions || bounty.accepted_submissions <= 0;
    const minNotMet = (bounty.total_submissions || 0) < (bounty.min_submissions || 0);
    
    return is_ended(bounty) && (noAcceptedSubmissions || minNotMet);
}

export interface Bounty {
    // Core properties
    metadata_root: string;
    submissions_root: string; 
    judgements_root?: string;
    creator_pub_key?: string;
    id: string;
    bounty_id: string;
    title: string;
    description: string;
    reward: number;
    status: 'open' | 'completed' | 'paid' | 'refunded';
    metadata?: string | BountyMetadata;
    creator?: string;
    contributors?: string[];
    
    // Bounty parameters
    deadline?: number;              // R4 - Block height deadline
    block_limit?: number;           // Additional field for UI display
    min_submissions?: number;       // R5 - Minimum submissions required
    reward_amount?: number;         // R7 - Reward amount in ERG
    
    // Submission stats
    total_submissions?: number;      // R6[0] - Total submissions
    accepted_submissions?: number;   // R6[1] - Accepted submissions
    rejected_submissions?: number;   // R6[2] - Rejected submissions
    
    // Content data
    content: {
        raw?: string;               // Full R9 data
        title: string;
        description: string;
        link?: string | null;
        image?: string | null;
        metadata?: {
            submissionsRoot?: string;  // First 32 bytes of R9
            judgmentsRoot?: string;    // Next 32 bytes of R9
            metadataRoot?: string;     // Next 32 bytes of R9
            version?: string;          // From metadata
            [key: string]: any;        // Additional metadata fields
        };
        submissions?: Record<string, any>;  // Submission details
        judgments?: Record<string, any>;    // Judgment details
    };
    
    // Platform integration
    platform: Platform;
    
    // Blockchain data
    current_height?: number;        // For deadline comparison
    token_details: {
        token_id?: string;          // Bounty token ID (from tokens(0)._1)
        amount?: number;            // Always 1 (from tokens(0)._2)
        name: string;               // Token name from metadata
        decimals: number;           // Token decimals from metadata
    };
    value?: number;                // Box value in nanoERG
    
    // The UTXO box containing the bounty
    box?: Box<Amount>;
    
    // Smart contract parameters
    constants: {
        raw?: string;              // Original R8 content
        owner: string;             // Owner wallet address
        dev_addr: string;          // Development fee wallet
        dev_hash: string;          // Development contract hash
        dev_fee: number;           // Development fee
        token_id: string;          // Token ID used for this bounty
        platform_fee_percent?: number; // Platform fee percentage (1% = 10)
        dispute_period?: number;    // Dispute period in blocks (~5 days = 720)
    };
    version?: 'v1_0' | 'v1_1' | contract_version;
    
    // Computed properties - these can be calculated using the helper functions
    is_ended?: boolean;            // Computed from current_height and deadline
    can_submit?: boolean;          // Deadline not passed and min submissions not reached
    can_judge?: boolean;           // Creator and has submissions
    can_withdraw?: boolean;        // Meets all withdrawal conditions
    can_refund?: boolean;          // Deadline passed and conditions met
}

// Utility function to extract the three roots from R9 data
export function extractRoots(r9Data: string | undefined): {
    submissionsRoot: string,
    judgmentsRoot: string,
    metadataRoot: string,
    contentData: string
} {
    if (!r9Data || r9Data.length < 96) {
        return {
            submissionsRoot: '0000000000000000000000000000000000000000000000000000000000000000',
            judgmentsRoot: '0000000000000000000000000000000000000000000000000000000000000000',
            metadataRoot: '0000000000000000000000000000000000000000000000000000000000000000',
            contentData: r9Data || ''
        };
    }
    
    return {
        submissionsRoot: r9Data.substring(0, 32),
        judgmentsRoot: r9Data.substring(32, 64),
        metadataRoot: r9Data.substring(64, 96),
        contentData: r9Data.substring(96)
    };
}

// Utility function to parse constants content from R8
export function parseConstants(constantsData: string): ConstantContent {
    try {
        const parsed = JSON.parse(constantsData);
        return {
            raw: constantsData,
            owner: parsed.owner || '',
            dev_addr: parsed.dev_addr || '',
            dev_hash: parsed.dev_hash || '',
            dev_fee: parsed.dev_fee || 0,
            token_id: parsed.token_id || ''
        };
    } catch (e) {
        console.error("Failed to parse constants data:", e);
        return {
            raw: constantsData,
            owner: '',
            dev_addr: '',
            dev_hash: '',
            dev_fee: 0,
            token_id: ''
        };
    }
}

// Utility function to fully populate all computed properties of a bounty
export function populateBountyProperties(bounty: Bounty, walletAddress?: string): Bounty {
    // Calculate if bounty is ended
    bounty.is_ended = is_ended(bounty);
    
    // Calculate if user can submit
    bounty.can_submit = can_submit(bounty);
    
    // Calculate if user can judge (if wallet address provided)
    if (walletAddress) {
        bounty.can_judge = can_judge(bounty, walletAddress);
    }
    
    // Calculate if bounty can be refunded
    bounty.can_refund = is_refund_period(bounty);
    
    // Calculate if reward can be withdrawn
    const hasAcceptedSubmissions = (bounty.accepted_submissions || 0) > 0;
    const minSubmissionsMet = (bounty.total_submissions || 0) >= (bounty.min_submissions || 0);
    bounty.can_withdraw = hasAcceptedSubmissions && minSubmissionsMet;
    
    return bounty;
}

// Utility function to build a bounty from box data
export function bountyFromBox(box: Box<Amount>, height: number, platform: Platform ): Bounty {
    // Extract register values
    const r4 = box.additionalRegisters.R4;  // Deadline
    const r5 = box.additionalRegisters.R5;  // Min submissions
    const r6 = box.additionalRegisters.R6;  // Stats
    const r7 = box.additionalRegisters.R7;  // Reward amount
    const r8 = box.additionalRegisters.R8;  // Constants
    const r9 = typeof box.additionalRegisters.R9 === 'string' ? box.additionalRegisters.R9 : undefined;  // Content
    
    // Parse register values
    const deadline = r4 ? parseInt(r4, 16) : undefined;
    const minSubmissions = r5 ? parseInt(r5, 16) : 0;
    
    // Parse stats from R6 (array of 3 values: [total, accepted, rejected])
    let totalSubmissions = 0;
    let acceptedSubmissions = 0;
    let rejectedSubmissions = 0;
    if (r6) {
        // Parse the array from the serialized value
        // This is a simplification; real implementation would decode SLong values
        const stats = [0, 0, 0]; // placeholder for decoded values
        totalSubmissions = stats[0];
        acceptedSubmissions = stats[1];
        rejectedSubmissions = stats[2];
    }
    
    // Parse reward amount
    const rewardAmount = r7 ? parseInt(r7, 16) : 0;
    
    // Parse constants
    const constants: ConstantContent = r8 ? parseConstants(r8) : {
        raw: '',
        owner: '',
        dev_addr: '',
        dev_hash: '',
        dev_fee: 0,
        token_id: ''
    };
    
    // Parse content and extract roots
    const { submissionsRoot, judgmentsRoot, metadataRoot, contentData } = extractRoots(r9);
    
    // Parse content data - in a real implementation, this would be a proper JSON parsing
    // For now, we'll just create placeholder data
    const contentJson = {
        title: "Bounty Title",
        description: "Bounty Description"
    };
    
    // Get token details
    const tokenId = box.assets && box.assets.length > 0 ? box.assets[0].tokenId : undefined;
    
    // Create the bounty object
    const bounty: Bounty = {
        metadata_root: metadataRoot, // Added metadata_root property
        submissions_root: submissionsRoot,
        id: box.boxId,
        bounty_id: tokenId || '',
        title: contentJson.title,
        description: contentJson.description,
        reward: rewardAmount,
        status: 'open',
        creator: constants.owner,
        
        deadline,
        min_submissions: minSubmissions,
        reward_amount: rewardAmount,
        
        total_submissions: totalSubmissions,
        accepted_submissions: acceptedSubmissions,
        rejected_submissions: rejectedSubmissions,
        
        content: {
            raw: r9,
            title: contentJson.title,
            description: contentJson.description,
            metadata: {
                submissionsRoot,
                judgmentsRoot,
                metadataRoot
            }
        },
        
        platform,
        
        current_height: height,
        token_details: {
            token_id: tokenId,
            amount: 1,
            name: contentJson.title + " Bounty Token",
            decimals: 0
        },
        
        value: Number(box.value),
        
        box,
        
        constants: {
            raw: r8,
            owner: constants.owner,
            dev_addr: constants.dev_addr,
            dev_hash: constants.dev_hash,
            dev_fee: constants.dev_fee,
            token_id: constants.token_id,
            platform_fee_percent: 10 // Default 1%
        }
    };
    
    // Populate computed properties
    return populateBountyProperties(bounty);
}