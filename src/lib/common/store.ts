import { writable } from 'svelte/store';
import type { Bounty } from './bounty'; // You'll need to create this type

// Wallet related stores
export const address = writable<string|null>(null);
export const network = writable<string|null>(null);
export const connected = writable<boolean>(false);
export const balance = writable<number|null>(null);

// Token related stores
export const temporal_token_amount = writable<number|null>(null);
export const bounty_token_amount = writable<string|null>(null);
export const user_tokens = writable<Map<string, number>>(new Map());

// Bounty related stores
export const bounty_detail = writable<Bounty|null>(null);
export const bounties = writable<Map<string, Bounty>>(new Map());
export const timer = writable<{countdownInterval: number, target: number}>({countdownInterval: 0, target: 0});

// New stores based on the bounty contract description
export const bounty_contract_address = writable<string|null>(null);
export const bounty_contract_connected = writable<boolean>(false);
export const bounty_contract_balance = writable<number|null>(null);

// Bounty contract specific data
export const current_bounty_id = writable<string|null>(null);
export const bounty_deadline = writable<number|null>(null);
export const min_submissions = writable<number|null>(null);
export const submission_stats = writable<{
  total: number,
  accepted: number,
  rejected: number
}>({ total: 0, accepted: 0, rejected: 0 });
export const reward_amount = writable<number|null>(null);
export const creator_pubkey = writable<string|null>(null);
export const bounty_metadata = writable<{
  submissionsRoot: string,
  judgmentsRoot: string,
  metadataRoot: string,
  version: string,
  title?: string,
  description?: string,
  // Add other metadata fields as needed
}|null>(null);

// Bounty interaction states
export const submission_state = writable<{
  submitting: boolean,
  error: string|null
}>({ submitting: false, error: null });

export const judgment_state = writable<{
  judging: boolean,
  decision: 'accept'|'reject'|null,
  error: string|null
}>({ judging: false, decision: null, error: null });

export const reward_state = writable<{
  withdrawing: boolean,
  error: string|null
}>({ withdrawing: false, error: null });

export const refund_state = writable<{
  refunding: boolean,
  error: string|null
}>({ refunding: false, error: null });

// Bounty management states
export const funding_state = writable<{
  adding: boolean,
  amount: number|null,
  error: string|null
}>({ adding: false, amount: null, error: null });

export const deadline_extension_state = writable<{
  extending: boolean,
  new_deadline: number|null,
  error: string|null
}>({ extending: false, new_deadline: null, error: null });

export const metadata_update_state = writable<{
  updating: boolean,
  new_metadata: any|null,
  error: string|null
}>({ updating: false, new_metadata: null, error: null });

// Platform fee information
export const platform_fee = writable<{
  percentage: number,
  dev_wallet: string
}>({ 
  percentage: 1, // 1% as per contract
  dev_wallet: "$dev_wallet_address" // Replace with actual dev wallet address
});