// src/ergo/platform.ts
import type { Platform } from '../common/platform';
import type { Bounty } from '../common/bounty';
import { fetch_bounties as fetchBountiesFromExplorer } from './fetch'; // Aliased import
import { submit_bounty } from './actions/submit_bounty';
import { withdraw } from './actions/withdraw_reward';
import { refund_bounty } from './actions/refund_bounty';
import { add_funds } from './actions/add_funds';
import { extend_deadline } from './actions/extend_deadline';
import { update_metadata } from './actions/update_metadata';
import { submit_solution } from './actions/submit_solution';
import { judge_submission } from './actions/judge_submission';
import { explorer_uri, network_id } from './envs';
import { address, connected, network, balance } from "../common/store";
import { type contract_version } from './contract';

// Type declarations for Ergo globals - Updated to match types.d.ts
declare global {
  interface Window {
    ergoConnector?: {
      nautilus?: {
        connect(): Promise<boolean>;
        isConnected(): Promise<boolean>;
      };
    };
    ergo?: {
      get_change_address(): Promise<string>;
      get_utxos(): Promise<any[]>;
      get_current_height(): Promise<number>;
      sign_tx(tx: any): Promise<any>;
      submit_tx(tx: any): Promise<string>;
    };
  }
}

export class ErgoPlatform implements Platform {
  id = "ergo";
  main_token = "ERG";
  icon = ""; // Add proper icon
  time_per_block = 2 * 60 * 1000; // 2 minutes per block
  last_version: contract_version = "v1_1";
  private creatorAddress: string = '';

  // --- Wallet Connection ---
  async connect(): Promise<void> {
    if (typeof window !== 'undefined' && window.ergoConnector) {
      const nautilus = window.ergoConnector.nautilus;
      if (nautilus) {
        if (await nautilus.connect()) {
          console.log('Connected!');
          if (window.ergo) {
            const userAddress = await window.ergo.get_change_address();
            address.set(userAddress);
            this.creatorAddress = userAddress;
            network.set((network_id == "mainnet") ? "ergo-mainnet" : "ergo-testnet");
            await this.get_balance();
            connected.set(true);
          } else {
            throw new Error('Ergo API not available');
          }
        } else {
          throw new Error('Failed to connect to wallet');
        }
      } else {
        throw new Error('Nautilus Wallet is not active');
      }
    } else {
      throw new Error('No wallet connector available');
    }
  }

  async disconnect(): Promise<void> {
    connected.set(false);
    address.set('');
    balance.set(0);
    this.creatorAddress = '';
  }

  async get_current_height(): Promise<number> {
    try {
      // If connected to the Ergo wallet, get the current height directly
      if (window.ergo) {
        return await window.ergo.get_current_height();
      }
      throw new Error('Ergo API not available');
    } catch {
      // Fallback to fetching the current height from the Ergo API
      try {
        const response = await fetch(explorer_uri + '/api/v1/networkState');
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}`);
        }

        const data = await response.json();
        return data.height;
      } catch (error) {
        console.error("Failed to fetch network height from API:", error);
        throw new Error("Unable to get current height.");
      }
    }
  }

  async get_balance(id?: string): Promise<Map<string, number>> {
    const balanceMap = new Map<string, number>();

    if (!window.ergo) {
      throw new Error('Ergo API not available');
    }

    const addr = await window.ergo.get_change_address();

    if (addr) {
      try {
        const response = await fetch(explorer_uri + `/api/v1/addresses/${addr}/balance/confirmed`);
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}`);
        }

        const data = await response.json();

        // Add nanoErgs balance to the map
        balanceMap.set("ERG", data.nanoErgs);
        balance.set(data.nanoErgs);

        // Add tokens balances to the map
        data.tokens.forEach((token: { tokenId: string; amount: number }) => {
          balanceMap.set(token.tokenId, token.amount);
        });
      } catch (error) {
        console.error(`Failed to fetch balance for address ${addr} from API:`, error);
        throw new Error("Unable to fetch balance.");
      }
    } else {
      throw new Error("Address is required to fetch balance.");
    }

    return balanceMap;
  }

  // --- Core Bounty Management ---
 async submit(
  title: string,                 // Bounty Title
  bountyContent: string,         // Main description/JSON metadata for the bounty
  reward_token_id: string,       // ID of the reward token (empty for ERG)
  reward_amount: number,         // Reward amount in nanoERG (if ERG reward) or smallest unit (if token reward)
  deadlineBlock: number,         // Deadline as a block height
  min_submissions: number       // Minimum number of submissions required
): Promise<string | null> {
  console.log("[platform.ts] submit: Start", { title, bountyContent, reward_token_id, reward_amount, deadlineBlock, min_submissions });
  try {
    console.log("[platform.ts] submit: Before submit_bounty()");
    const result = await submit_bounty(
      this.last_version,
      reward_token_id,      // contract_version from contract.ts (e.g. "v1_0" or "v1_1")
      deadlineBlock,
      reward_amount,          // Reward amount in ERG (same as reward_amount for ERG rewards)
      bountyContent,          // bountyContent is passed directly
      min_submissions,        // Minimum participants required
      title
    );
    console.log("[platform.ts] submit: After submit_bounty()", { result });
    return result;
  } catch (error) {
    console.log("[platform.ts] submit: Catch block", { error });
    console.error('Failed to submit bounty via ErgoPlatform:', error);
    
    // Handle different error types properly
    if (error && typeof error === 'object') {
      // If it's an error object with specific properties (like the Ergo wallet error)
      if ('code' in error && 'info' in error) {
        const ergoError = error as { code: number; info: string };
        throw new Error(`Ergo transaction error (code: ${ergoError.code}): ${ergoError.info}`);
      }
      // If it's a standard Error object
      if (error instanceof Error) {
        throw error; // Re-throw the original error
      }
      // If it's some other object, try to extract meaningful info
      const errorMessage = (error as any).message || JSON.stringify(error);
      throw new Error(`Transaction failed: ${errorMessage}`);
    }
    
    // If it's a string error
    if (typeof error === 'string') {
      throw new Error(`Transaction failed: ${error}`);
    }
    
    // Last resort fallback
    throw new Error('Unknown transaction error occurred');
  }
}

  // Keep the original method for backward compatibility
  async withdraw(bounty: Bounty, winnerAddress: string, submissionId: string): Promise<string | null> {
    try {
      return await withdraw(bounty, winnerAddress, submissionId);
    } catch (error) {
      console.error('Failed to withdraw bounty reward:', error);
      return null;
    }
  }

  async refund_bounty(bounty: Bounty): Promise<string | null> {
    try {
      return await refund_bounty(bounty);
    } catch (error) {
      console.error('Failed to refund bounty:', error);
      return null;
    }
  }

  async fetch_bounties(): Promise<Bounty[]> {
    try {
      const bountyMap: Map<string, Bounty> = await fetchBountiesFromExplorer();
      const bountiesArray: Bounty[] = Array.from(bountyMap.values());
      return bountiesArray;
    } catch (error) {
      console.error('Failed to fetch bounties in ErgoPlatform:', error);
      return [];
    }
  }

  async getBountyById(id: string): Promise<Bounty | null> {
    try {
      const bountiesArray = await this.fetch_bounties();
      return bountiesArray.find(bounty => bounty.id === id) || null;
    } catch (error) {
      console.error('Failed to get bounty by ID:', error);
      return null;
    }
  }

  // --- Extended Bounty Management ---
  async addMoreFunds(bounty: Bounty, additionalAmount: number): Promise<string | null> {
    try {
      return await add_funds(bounty, additionalAmount);
    } catch (error) {
      console.error('Failed to add funds:', error);
      return null;
    }
  }

  async extendDeadline(bounty: Bounty, newDeadlineBlock: number): Promise<string | null> {
    try {
      return await extend_deadline(bounty, newDeadlineBlock);
    } catch (error) {
      console.error('Failed to extend deadline:', error);
      return null;
    }
  }

  async updateMetadata(bounty: Bounty, newMetadata: string): Promise<string | null> {
    try {
      return await update_metadata(bounty, this._serializeMetadata(newMetadata));
    } catch (error) {
      console.error('Failed to update metadata:', error);
      return null;
    }
  }

  // --- Submission Management ---
  async submit_solution(bounty: Bounty, solution: string): Promise<string | null> {
    try {
      return await submit_solution(bounty, solution);
    } catch (error) {
      console.error('Failed to submit solution:', error);
      return null;
    }
  }

  async submitSolution(bounty: Bounty, solution: string): Promise<string | null> {
    return this.submit_solution(bounty, solution);
  }

  async judge_submission(bounty: Bounty, submissionId: string, accepted: boolean): Promise<string | null> {
    try {
      const judgmentData = JSON.stringify({
        submissionId,
        accepted,
        timestamp: Date.now(),
        judgedBy: this.creatorAddress
      });

      return await judge_submission(bounty, submissionId, accepted, judgmentData);
    } catch (error) {
      console.error('Failed to judge submission:', error);
      return null;
    }
  }

  async judgeSubmission(bounty: Bounty, submissionId: string, accepted: boolean): Promise<string | null> {
    return this.judge_submission(bounty, submissionId, accepted);
  }

  async getAllBounties(): Promise<Bounty[]> {
    try {
      return await this.fetch_bounties();
    } catch (error) {
      console.error('Failed to get all bounties in ErgoPlatform:', error);
      return [];
    }
  }

  async getSubmissions(bountyId: string): Promise<any[]> {
    try {
      console.warn('getSubmissions not yet implemented for Ergo platform');
      return [];
    } catch (error) {
      console.error('Failed to get submissions:', error);
      return [];
    }
  }

  // --- Utility Methods ---
  private _serializeMetadata(metadata: string): string {
    try {
      const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      const encoder = new TextEncoder();
      const metadataBytes = encoder.encode(JSON.stringify(metadataObj));
      const metadataHash = this._simpleHash(metadataBytes);
      const emptyRoot = new Uint8Array(32).fill(0);
      const combined = new Uint8Array(96);
      combined.set(emptyRoot, 0);
      combined.set(emptyRoot, 32);
      combined.set(metadataHash, 64);
      return Array.from(combined)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      console.error('Failed to serialize metadata:', error);
      throw new Error('Invalid metadata format');
    }
  }

  private _simpleHash(data: Uint8Array): Uint8Array {
    const hash = new Uint8Array(32);
    for (let i = 0; i < data.length; i++) {
      hash[i % 32] ^= data[i];
    }
    return hash;
  }

  // --- Validation Methods ---
  async isValidBounty(bounty: Bounty): Promise<boolean> {
    try {
      const currentHeight = await this.get_current_height();
      const deadline = bounty.deadline ?? 0;
      const reward = bounty.reward ?? 0;
      return deadline > currentHeight && reward > 0;
    } catch {
      return false;
    }
  }

  async canRefund(bounty: Bounty): Promise<boolean> {
    try {
      const currentHeight = await this.get_current_height();
      const deadline = bounty.deadline ?? 0;
      const totalSubmissions = bounty.total_submissions ?? 0;
      const minSubmissions = bounty.min_submissions ?? 0;
      const acceptedSubmissions = bounty.accepted_submissions ?? 0;

      return (
        currentHeight > deadline &&
        (totalSubmissions < minSubmissions || acceptedSubmissions === 0)
      );
    } catch {
      return false;
    }
  }

  async canWithdraw(bounty: Bounty): Promise<boolean> {
    try {
      const totalSubmissions = bounty.total_submissions ?? 0;
      const minSubmissions = bounty.min_submissions ?? 0;
      const acceptedSubmissions = bounty.accepted_submissions ?? 0;

      return (
        acceptedSubmissions > 0 &&
        totalSubmissions >= minSubmissions
      );
    } catch {
      return false;
    }
  }

  // --- Getters ---
  getCreatorAddress(): string {
    return this.creatorAddress;
  }

  isConnected(): boolean {
    return this.creatorAddress !== '';
  }

  async claimBounty(bounty: Bounty): Promise<string | null> {
    console.warn("claimBounty is not yet implemented for ErgoPlatform.");
    return null;
  }

  async cancelBounty(bounty: Bounty): Promise<string | null> {
    console.warn("cancelBounty is not yet implemented for ErgoPlatform.");
    return null;
  }
}