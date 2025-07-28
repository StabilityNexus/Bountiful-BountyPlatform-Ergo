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
import { type Proposal } from "../common/proposal";
import { type proposal_contract_version } from "./proposal_contract";
import { fetch_proposals } from './fetch';

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

  async get_address(): Promise<string> {
    try {
      return await ergo.get_change_address();
    } catch (error) {
      console.error("Failed to get current address:", error);
      throw new Error("Unable to get current address");
    }
  }

  async get_current_height(): Promise<number> {
    try {
      // If connected to the Ergo wallet, get the current height directly
      return await ergo.get_current_height();
    } catch {
      // Fallback to fetching the current height from the Ergo API
      try {
        const response = await fetch(explorer_uri + '/api/v1/networkState');
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
    title: string,
    judgeAddresses: string[]
  ): Promise<string | null> {
    return await submit_bounty(
      version,
      token_id,
      token_amount,
      blockLimit,
      exchangeRate,
      bountyContent,
      minimumSold,
      title,
      judgeAddresses
    );
  }

  async withdraw(bounty: Bounty, amount: number): Promise<string | null> {
    return await withdraw(bounty, amount);
  }

  async temp_exchange(bounty: Bounty, token_amount: number): Promise<string | null> {
    return await temp_exchange(bounty, token_amount);
  }

  async fetch(offset: number = 0): Promise<Map<string, Bounty>> {

    return await fetch_bounties(offset);
  }

  // Method to get current height and calculate genesis timestamp dynamically
  private async calculateGenesisTimestamp(): Promise<number> {
    try {
      const currentHeight = await this.get_current_height();
      const currentTime = Date.now();

      // Calculate genesis timestamp: current_time - (current_height * time_per_block)
      const calculatedGenesis = currentTime - (currentHeight * this.time_per_block);

      return calculatedGenesis;
    } catch (error) {
      console.error("Failed to calculate genesis timestamp, using fallback:", error);
      // Fallback to July 1, 2019 00:00:00 UTC
      return 1561939200000;
    }
  }

  private async blockHeightToDate(height: number): Promise<Date> {
    if (height <= 0) {
      console.warn(`Invalid block height: ${height}, using current time`);
      return new Date();
    }

    const genesisTimestamp = await this.calculateGenesisTimestamp();
    const calculatedTime = genesisTimestamp + (height * this.time_per_block);
    return new Date(calculatedTime);
  }

  async fetchProposals(): Promise<Proposal[]> {
    const version: proposal_contract_version = "v1_0";
    const boxesWithParsed = await fetch_proposals(version);

    return Promise.all(boxesWithParsed.map(async (box) => ({
      id: box.boxId,
      proposer: box.parsed.proposer,
      bountyId: box.parsed.bountyId,
      title: box.parsed.title,
      url: box.parsed.url,
      cost: box.parsed.cost,
      platform: box.platform,
      box: box,
      developer: box.parsed.proposer,
      summary: box.parsed.title,
      status: "pending",
      submittedAt: await this.blockHeightToDate(box.creationHeight),
      boxId: box.boxId,
      rawContent: JSON.stringify(box.additionalRegisters),
      registers: box.additionalRegisters,
    })));
  }
}
