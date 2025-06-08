// src/services/wallet/ergoPlatform.ts

import { derived, writable } from 'svelte/store';

// Extend the Window interface to include ergoConnector
declare global {
  interface Window {
    ergoConnector?: any;
  }
}

// Types
export interface WalletAPI {
  // Common interface for interaction with the wallet
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  getAddress(): Promise<string>;
  getBalance(): Promise<bigint>;
  getUnspentBoxes(): Promise<any[]>;
  signTransaction(tx: any): Promise<any>;
  submitTransaction(tx: any): Promise<string>;
  getCurrentHeight(): Promise<number>;
}

// Stores for wallet state management
export const connected = writable<boolean>(false);
export const address = writable<string>('');
export const balance = writable<bigint>(BigInt(0));
export const mainTokenName = writable<string>('ERG');
export const unspentBoxes = writable<any[]>([]);
export const transactionHistory = writable<any[]>([]);

// Derived store for human-readable balance
export const formattedBalance = derived(
  balance,
  $balance => Number($balance) / 1_000_000_000
);

/**
 * ErgoPlatform class implements the wallet API for Ergo blockchain
 * Compatible with Nautilus and similar Ergo wallets
 */
export class ErgoPlatform implements WalletAPI {
  private ergoConnector: any;
  private walletInstance: any;
  public id: string = 'ergo';
  public main_token: string = 'ERG';
  
  constructor() {
    // Initialization logic happens here
    // Will be called when the class is instantiated
    this.init();
  }
    async getBalance(): Promise<bigint> {
        if (!this.walletInstance) {
            throw new Error('Wallet not connected');
        }

        try {
            const balanceResult = await this.walletInstance.getBalance();
            const nanoErgs = BigInt(balanceResult);
            balance.set(nanoErgs);
            return nanoErgs;
        } catch (error) {
            console.error('Error getting balance:', error);
            throw error;
        }
    }
    getCurrentHeight(): Promise<number> {
        throw new Error('Method not implemented.');
    }

  private async init() {
    if (typeof window !== 'undefined') {
      // Wait for the window to load and ergo connector to be available
      if (window.ergoConnector) {
        this.ergoConnector = window.ergoConnector;
      } else {
        console.warn('Ergo Connector not found. Please install Nautilus wallet.');
      }
    }
  }

  /**
   * Connect to the wallet
   */
  public async connect(): Promise<boolean> {
    try {
      // Check if ergoConnector is available
      if (!this.ergoConnector) {
        console.error('Ergo Connector not found');
        return false;
      }

      // Try to connect to Nautilus wallet
      const nautilus = this.ergoConnector.nautilus;
      if (nautilus) {
        const isConnected = await nautilus.connect();
        
        if (isConnected) {
          this.walletInstance = nautilus;
          
          // Get address and update store
          const addresses = await this.walletInstance.getUsedAddresses();
          if (addresses && addresses.length > 0) {
            address.set(addresses[0]);
          }
          
          // Get balance
          await this.get_balance();
          
          // Update connected status
          connected.set(true);
          
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      return false;
    }
  }

  /**
   * Disconnect from wallet
   */
  public async disconnect(): Promise<void> {
    if (this.walletInstance) {
      // Not all wallets have disconnect method
      if (this.walletInstance.disconnect) {
        await this.walletInstance.disconnect();
      }
      
      // Reset wallet state
      this.walletInstance = null;
      connected.set(false);
      address.set('');
      balance.set(BigInt(0));
    }
  }

  /**
   * Get the current wallet address
   */
  public async getAddress(): Promise<string> {
    if (!this.walletInstance) {
      throw new Error('Wallet not connected');
    }
    
    const addresses = await this.walletInstance.getUsedAddresses();
    if (addresses && addresses.length > 0) {
      const currentAddress = addresses[0];
      address.set(currentAddress);
      return currentAddress;
    }
    
    throw new Error('No wallet address found');
  }

  /**
   * Get the wallet balance
   */
  public async get_balance(): Promise<bigint> {
    if (!this.walletInstance) {
      throw new Error('Wallet not connected');
    }
    
    try {
      const balanceResult = await this.walletInstance.getBalance();
      const nanoErgs = BigInt(balanceResult);
      balance.set(nanoErgs);
      return nanoErgs;
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  /**
   * Get current blockchain height
   */
  public async get_current_height(): Promise<number> {
    if (!this.walletInstance) {
      throw new Error('Wallet not connected');
    }
    
    try {
      // Get current height from the blockchain
      // This may vary depending on wallet implementation
      const networkContext = await this.walletInstance.getNetworkContext();
      return networkContext.height;
    } catch (error) {
      console.error('Failed to get current height:', error);
      throw error;
    }
  }

  /**
   * Get unspent boxes from wallet
   */
  public async getUnspentBoxes(): Promise<any[]> {
    if (!this.walletInstance) {
      throw new Error('Wallet not connected');
    }
    
    try {
      const boxes = await this.walletInstance.getUtxos();
      unspentBoxes.set(boxes);
      return boxes;
    } catch (error) {
      console.error('Error getting unspent boxes:', error);
      throw error;
    }
  }

  /**
   * Sign a transaction
   */
  public async signTransaction(tx: any): Promise<any> {
    if (!this.walletInstance) {
      throw new Error('Wallet not connected');
    }
    
    try {
      const signedTx = await this.walletInstance.signTx(tx);
      return signedTx;
    } catch (error) {
      console.error('Error signing transaction:', error);
      throw error;
    }
  }

  /**
   * Submit a signed transaction to the blockchain
   */
  public async submitTransaction(signedTx: any): Promise<string> {
    if (!this.walletInstance) {
      throw new Error('Wallet not connected');
    }
    
    try {
      const txId = await this.walletInstance.submitTx(signedTx);
      return txId;
    } catch (error) {
      console.error('Error submitting transaction:', error);
      throw error;
    }
  }

  /**
   * Create a new bounty
   * @param title Bounty title
   * @param description Bounty description
   * @param rewardAmount Reward amount in nanoERGs
   * @param deadline Deadline as block height
   * @param minSubmissions Minimum number of submissions required
   */
  public async createBounty(
    title: string,
    description: string,
    rewardAmount: bigint,
    deadline: number,
    minSubmissions: number
  ): Promise<string> {
    if (!this.walletInstance) {
      throw new Error('Wallet not connected');
    }
    
    // Implementation depends on specific bounty contract logic
    // This is a simplified example
    try {
      // 1. Create metadata for the bounty
      const metadata = {
        title,
        description,
        version: 1,
        createdAt: Date.now()
      };

      // 2. Create the contract transaction
      // This would involve creating the actual Ergo transaction to create a bounty
      // Specific details would depend on the actual smart contract implementation
      
      // 3. Sign and submit the transaction
      // Return the transaction ID
      return "tx_placeholder"; // Placeholder - actual implementation needed
    } catch (error) {
      console.error('Error creating bounty:', error);
      throw error;
    }
  }

  /**
   * Submit a solution to a bounty
   * @param bountyId The ID of the bounty
   * @param submissionData The submission data
   */
  public async submitSolution(
    bountyId: string,
    submissionData: string
  ): Promise<string> {
    if (!this.walletInstance) {
      throw new Error('Wallet not connected');
    }
    
    // Implementation depends on specific bounty contract logic
    try {
      // Logic to submit solution to bounty contract
      return "submission_tx_placeholder"; // Placeholder
    } catch (error) {
      console.error('Error submitting solution:', error);
      throw error;
    }
  }

  /**
   * Judge a submission (only for bounty creator)
   * @param bountyId The ID of the bounty
   * @param submissionId The ID of the submission
   * @param decision Accept or reject decision
   * @param reason Reason for the decision
   */
  public async judgeSubmission(
    bountyId: string,
    submissionId: string,
    decision: boolean,
    reason: string
  ): Promise<string> {
    if (!this.walletInstance) {
      throw new Error('Wallet not connected');
    }
    
    // Implementation depends on specific bounty contract logic
    try {
      // Logic to submit judgment to bounty contract
      return "judgment_tx_placeholder"; // Placeholder
    } catch (error) {
      console.error('Error judging submission:', error);
      throw error;
    }
  }
}

// Create a global instance for use across the app
const ergoPlatform = new ErgoPlatform();
export default ergoPlatform;