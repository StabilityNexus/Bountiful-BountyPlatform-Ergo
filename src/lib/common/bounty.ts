// src/lib/common/bounty.ts
import { type contract_version } from "$lib/ergo/contract";
import { type Platform } from "./platform";
import type { Amount, Box } from "@fleet-sdk/core";

export interface TokenEIP4 {
    name: string;
    description: string;
    decimals: number;
    emissionAmount: number | null;
}

export interface BountyContent {
    raw: string;
    title: string;
    description: string;
    link: string | null;
    image: string | null;
    judges?: string[];  
}

export interface ConstantContent {
    raw?: string;
    creator: string;
    dev_addr?: string;
    dev_hash: string;
    dev_fee: number;
    token_id: string;
}

export interface Bounty {
    version: contract_version;
    platform: Platform;
    box: Box<Amount>;
    bounty_id: string;
    current_idt_amount: number,
    token_id: string,
    block_limit: number,
    min_submissions: number,
    max_submissions: number,
    value: number,  // Real exact value
    collected_value: number,  // Value collected
    current_value: number,  // Current value - contract reserves (ex: min box value on ergo)
    total_pft_amount: number,
    current_pft_amount: number,
    unsold_pft_amount: number,
    total_submissions: number,
    refund_counter: number,
    auxiliar_exchange_counter: number,
    exchange_rate: number, 
    token_details: TokenEIP4,
    content: BountyContent,
    constants: ConstantContent,
}

export async function is_ended(bounty: Bounty): Promise<boolean> {
    let height = await bounty.platform.get_current_height();
    return bounty.block_limit < height;
}

export async function min_submissions(bounty: Bounty): Promise<boolean> {
    return bounty.total_submissions >= bounty.min_submissions;
}

export async function max_submissions(bounty:Bounty): Promise<boolean> {
    return bounty.total_submissions == bounty.max_submissions;
}


// export async function can_withdraw_reward(bounty: Bounty): Promise<boolean> {
//     const hasAccepted = await has_accepted_submissions(bounty);
//     const minMet = await min_submissions_met(bounty);
//     return hasAccepted && minMet;
// }

// export async function is_refund_period(bounty: Bounty): Promise<boolean> {
//     const ended = await is_ended(bounty);
//     const noAcceptedSubmissions = bounty.accepted_submissions <= 0;
//     const minNotMet = bounty.total_submissions < bounty.min_submissions;
//     return ended && (noAcceptedSubmissions || minNotMet);
// }

export function getBountyContent(id: string, value: string): BountyContent {
    try {
        const parsed = JSON.parse(value);
        return {
            raw: value,
            title: parsed.title || 'Id ' + id,
            description: parsed.description || "No description provided.",
            link: parsed.link || null,
            image: parsed.image || null,
            judges: parsed.judges || []
        };
    } catch (error) {
        return {
            raw: value,
            title: 'Id ' + id,
            description: "No description provided.",
            link: null,
            image: null,
            judges: []
        };
    }
}

export function getConstantContent(value: string): ConstantContent | null {
    try {
        const parsed = JSON.parse(value);
        return {
            raw: value,
            creator: parsed.creator,
            dev_addr: parsed.dev_addr,
            dev_hash: parsed.dev_hash,
            dev_fee: parsed.dev_fee,
            token_id: parsed.token_id
        };
    } catch (error) {
        return null;
    }
}

// // Helper function to get judges from a bounty
// export function getBountyJudges(bounty: Bounty): string[] {
//     return bounty.content.judges || [];
// }

// // Helper function to check if a specific address is a judge for a bounty
// export function isJudgeForBounty(bounty: Bounty, address: string): boolean {
//     return (bounty.content.judges ?? []).includes(address);
// }