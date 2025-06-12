// src/ergo/platform.ts
import type { Platform } from '../common/platform';
import type { Bounty } from '../common/bounty';
import { fetch_bounties } from './fetch'; // Aliased import
import { submit_bounty } from './actions/submit';
import { withdraw } from './actions/withdraw';
import { buy_refund } from './actions/buy_refund';
import { rebalance } from './actions/rebalance';
import { temp_exchange } from './actions/temp_exchange';
import { explorer_uri, network_id } from './envs';
import { address, connected, network, balance } from "../common/store";
import { type contract_version } from './contract';

declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<any[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: any): Promise<any>;
    submit_tx(tx: any): Promise<string>;
};

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
  last_version: contract_version = "v1_0";

  // --- Wallet Connection ---
    async connect(): Promise<void> {
        if (typeof window.ergoConnector !== 'undefined') {
            const nautilus = window.ergoConnector.nautilus;
            if (nautilus) {
                if (await nautilus.connect()) {
                    console.log('Connected!');
                    address.set(await ergo.get_change_address());
                    network.set((network_id == "mainnet") ? "ergo-mainnet" : "ergo-testnet");
                    await this.get_balance();
                    connected.set(true);
                } else {
                    alert('Not connected!');
                }
            } else {
                alert('Nautilus Wallet is not active');
            }
            } /*else {
                alert('No wallet available');
            } */
    }

    async get_current_height(): Promise<number> {
        try {
            // If connected to the Ergo wallet, get the current height directly
            return await ergo.get_current_height();
        } catch {
            // Fallback to fetching the current height from the Ergo API
            try {
                const response = await fetch(explorer_uri+'/api/v1/networkState');
                if (!response.ok) {
                    throw new Error(`API request failed with status: ${response.status}`);
                }
    
                const data = await response.json();
                return data.height; // Extract and return the height
            } catch (error) {
                console.error("Failed to fetch network height from API:", error);
                throw new Error("Unable to get current height.");
            }
        }
    }

  async get_balance(id?: string): Promise<Map<string, number>> {
    const balanceMap = new Map<string, number>();
    const addr = await ergo.get_change_address();

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

  async buy_refund(bounty: Bounty, token_amount: number): Promise<string | null> {
        return await buy_refund(bounty, token_amount);
    }

    async rebalance(bounty: Bounty, token_amount: number): Promise<string | null> {
        return await rebalance(bounty, token_amount);
    }

  // --- Core Bounty Management ---
async submit(
        version: contract_version,
        token_id: string,
        token_amount: number,
        blockLimit: number,
        exchangeRate: number,
        bountyContent: string,
        minimumSold: number,
        title: string
    ): Promise<string | null> {
        return await submit_bounty(
            version,
            token_id,
            token_amount,
            blockLimit,
            exchangeRate,
            bountyContent,
            minimumSold,
            title
        );
    }

    async withdraw(bounty:Bounty, amount: number): Promise<string | null> {
        return await withdraw(bounty, amount);
    }

    async temp_exchange(bounty:Bounty, token_amount: number): Promise<string | null> {
        return await temp_exchange(bounty, token_amount);
    }

    async fetch(offset: number = 0): Promise<Map<string, Bounty>> {
        
        return await fetch_bounties(offset);
    }
  }


  // // Keep the original method for backward compatibility
  // async withdraw_bounty(bounty: Bounty, winnerAddress: string, submissionId: string): Promise<string | null> {
  //   try {
  //     return await withdraw(bounty, winnerAddress, submissionId);
  //   } catch (error) {
  //     console.error('Failed to withdraw bounty reward:', error);
  //     return null;
  //   }
  // }

  // async refund_bounty(bounty: Bounty): Promise<string | null> {
  //   try {
  //     return await refund_bounty(bounty);
  //   } catch (error) {
  //     console.error('Failed to refund bounty:', error);
  //     return null;
  //   }
  // }

  // async fetch_bounties(): Promise<Bounty[]> {
  //   try {
  //     const bountyMap: Map<string, Bounty> = await fetchBountiesFromExplorer();
  //     const bountiesArray: Bounty[] = Array.from(bountyMap.values());
  //     return bountiesArray;
  //   } catch (error) {
  //     console.error('Failed to fetch bounties in ErgoPlatform:', error);
  //     return [];
  //   }
  // }

  // async getBountyById(id: string): Promise<Bounty | null> {
  //   try {
  //     const bountiesArray = await this.fetch_bounties();
  //     return bountiesArray.find(bounty => bounty.bounty_id === id) || null;
  //   } catch (error) {
  //     console.error('Failed to get bounty by ID:', error);
  //     return null;
  //   }
  // }

  // // --- Extended Bounty Management ---
  // async addMoreFunds(bounty: Bounty, additionalAmount: number): Promise<string | null> {
  //   try {
  //     return await add_funds(bounty, additionalAmount);
  //   } catch (error) {
  //     console.error('Failed to add funds:', error);
  //     return null;
  //   }
  // }

  // async extendDeadline(bounty: Bounty, newDeadlineBlock: number): Promise<string | null> {
  //   try {
  //     return await extend_deadline(bounty, newDeadlineBlock);
  //   } catch (error) {
  //     console.error('Failed to extend deadline:', error);
  //     return null;
  //   }
  // }

  // async updateMetadata(bounty: Bounty, newMetadata: string): Promise<string | null> {
  //   try {
  //     return await update_metadata(bounty, this._serializeMetadata(newMetadata));
  //   } catch (error) {
  //     console.error('Failed to update metadata:', error);
  //     return null;
  //   }
  // }

  // // --- Submission Management ---
  // async submit_solution(bounty: Bounty, solution: string): Promise<string | null> {
  //   try {
  //     return await submit_solution(bounty, solution);
  //   } catch (error) {
  //     console.error('Failed to submit solution:', error);
  //     return null;
  //   }
  // }

  // async submitSolution(bounty: Bounty, solution: string): Promise<string | null> {
  //   return this.submit_solution(bounty, solution);
  // }

  // async judge_submission(bounty: Bounty, submissionId: string, accepted: boolean): Promise<string | null> {
  //   try {
  //     const judgmentData = JSON.stringify({
  //       submissionId,
  //       accepted,
  //       timestamp: Date.now(),
  //       judgedBy: this.creatorAddress
  //     });

  //     return await judge_submission(bounty, submissionId, accepted, judgmentData);
  //   } catch (error) {
  //     console.error('Failed to judge submission:', error);
  //     return null;
  //   }
  // }

  // async judgeSubmission(bounty: Bounty, submissionId: string, accepted: boolean): Promise<string | null> {
  //   return this.judge_submission(bounty, submissionId, accepted);
  // }

  // async getAllBounties(): Promise<Bounty[]> {
  //   try {
  //     return await this.fetch_bounties();
  //   } catch (error) {
  //     console.error('Failed to get all bounties in ErgoPlatform:', error);
  //     return [];
  //   }
  // }

  // async getSubmissions(bountyId: string): Promise<any[]> {
  //   try {
  //     console.warn('getSubmissions not yet implemented for Ergo platform');
  //     return [];
  //   } catch (error) {
  //     console.error('Failed to get submissions:', error);
  //     return [];
  //   }
  // }

  // // --- Utility Methods ---
  // private _serializeMetadata(metadata: string): string {
  //   try {
  //     const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
  //     const encoder = new TextEncoder();
  //     const metadataBytes = encoder.encode(JSON.stringify(metadataObj));
  //     const metadataHash = this._simpleHash(metadataBytes);
  //     const emptyRoot = new Uint8Array(32).fill(0);
  //     const combined = new Uint8Array(96);
  //     combined.set(emptyRoot, 0);
  //     combined.set(emptyRoot, 32);
  //     combined.set(metadataHash, 64);
  //     return Array.from(combined)
  //       .map(b => b.toString(16).padStart(2, '0'))
  //       .join('');
  //   } catch (error) {
  //     console.error('Failed to serialize metadata:', error);
  //     throw new Error('Invalid metadata format');
  //   }
  // }

  // private _simpleHash(data: Uint8Array): Uint8Array {
  //   const hash = new Uint8Array(32);
  //   for (let i = 0; i < data.length; i++) {
  //     hash[i % 32] ^= data[i];
  //   }
  //   return hash;
  // }

  // // --- Validation Methods ---
  // async isValidBounty(bounty: Bounty): Promise<boolean> {
  //   try {
  //     const currentHeight = await this.get_current_height();
  //     const deadline = bounty.deadline ?? 0;
  //     // const reward = bounty.reward_amount ?? 0;
  //     return deadline > currentHeight && reward > 0;
  //   } catch {
  //     return false;
  //   }
  // }

  // async canRefund(bounty: Bounty): Promise<boolean> {
  //   try {
  //     const currentHeight = await this.get_current_height();
  //     const deadline = bounty.block_limit ?? 0;
  //     const totalSubmissions = bounty.total_submissions ?? 0;
  //     const minSubmissions = bounty.min_submissions ?? 0;
  //     // const acceptedSubmissions = bounty.accepted_submissions ?? 0;

  //     return (
  //       currentHeight > deadline &&
  //       (totalSubmissions < minSubmissions || acceptedSubmissions === 0)
  //     );
  //   } catch {
  //     return false;
  //   }
  // }

  // async canWithdraw(bounty: Bounty): Promise<boolean> {
  //   try {
  //     const totalSubmissions = bounty.total_submissions ?? 0;
  //     const minSubmissions = bounty.min_submissions ?? 0;
  //     const acceptedSubmissions = bounty.accepted_submissions ?? 0;

  //     return (
  //       acceptedSubmissions > 0 &&
  //       totalSubmissions >= minSubmissions
  //     );
  //   } catch {
  //     return false;
  //   }
  // }

  // // --- Getters ---
  // getCreatorAddress(): string {
  //   return this.creatorAddress;
  // }

  // isConnected(): boolean {
  //   return this.creatorAddress !== '';
  // }

  // async claimBounty(bounty: Bounty): Promise<string | null> {
  //   console.warn("claimBounty is not yet implemented for ErgoPlatform.");
  //   return null;
  // }

  // async cancelBounty(bounty: Bounty): Promise<string | null> {
  //   console.warn("cancelBounty is not yet implemented for ErgoPlatform.");
  //   return null;
  // }
