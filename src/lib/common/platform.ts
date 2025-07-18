// src/lib/common/platform.ts
import { type Bounty } from "../common/bounty";
import { type contract_version } from "../ergo/contract";
import { type Proposal } from "../common/proposal";

export interface Platform {
    id: string;  // ergo, ethereum ...
    main_token: string; // ERG, ETH ...
    icon: string;  // Icon path or url.
    time_per_block: number; // milliseconds
    last_version: contract_version;
    connect(): Promise<void>;
    get_current_height(): Promise<number>;
    get_balance(id?: string): Promise<Map<string, number>>;
    get_address(): Promise<string>; 
    withdraw(bounty: Bounty, amount: number): Promise<string | null>;
    buy_refund(bounty: Bounty, token_amount: number): Promise<string | null>;
    rebalance(bounty: Bounty, token_amount: number): Promise<string | null>;
    temp_exchange(bounty: Bounty, token_amount: number): Promise<string | null>;
    submit(
        version: contract_version,
        token_id: string,
        token_amount: number,
        blockLimit: number,
        exchangeRate: number,
        bountyLink: string,
        minimumSold: number,
        title: string,
        judgeAddresses: string[]
    ): Promise<string | null>;
    fetch(): Promise<Map<string, Bounty>>;
    fetchProposals(): Promise<Proposal[]>; 
}

