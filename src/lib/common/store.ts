import { writable } from 'svelte/store';
import type { Bounty } from './bounty';

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