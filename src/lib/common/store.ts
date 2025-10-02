import { writable } from 'svelte/store';
import type { Bounty } from './bounty';
import type { Proposal } from './proposal';
import type { ReputationProof, TypeNFT } from '$lib/ergo/reputation/objects';
import type { ErgoPlatform } from '$lib/ergo/platform';

export const platform = writable<ErgoPlatform | null>(null);
export const address = writable<string|null>(null);
export const network = writable<string|null>(null);
export const connected = writable<boolean>(false);
export const balance = writable<number|null>(null);
export const temporal_token_amount = writable<number|null>(null);
export const bounty_token_amount = writable<string|null>(null);
export const bounty_detail = writable<Bounty|null>(null);
export const timer = writable<{countdownInterval: number, target: number}>({countdownInterval: 0, target: 0})
export const bounties = writable<Map<string, Bounty>>(new Map());
export const user_tokens = writable<Map<string, number>>(new Map());
export const proposal_detail = writable<Proposal[]>([]);

// Stores for the reputation system
export const types = writable<{ data: Map<string, TypeNFT>, last_fetch: number }>({ data: new Map(), last_fetch: 0 });
export const judges = writable<{ data: Map<string, ReputationProof>, last_fetch: number }>({ data: new Map(), last_fetch: 0 });
export const judge_detail = writable<ReputationProof | null>(null);