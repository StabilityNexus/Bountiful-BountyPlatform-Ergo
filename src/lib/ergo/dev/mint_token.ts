import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    SAFE_MIN_BOX_VALUE,
    TransactionBuilder
} from '@fleet-sdk/core';
import { ErgoPlatform } from '../platform';

// Declare ergo object with TypeScript typings
declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<any[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: any): Promise<any>;
    submit_tx(tx: any): Promise<string>;
};

/**
 * Mints a token for the Bountiful platform
 * 
 * @param amount The number of tokens to mint (without decimal places)
 * @param name The name of the token (e.g., "BountifulBountyToken")
 * @param decimals The number of decimal places for the token
 * @param description Optional description for the token
 * @returns Transaction ID if successful, undefined otherwise
 */
export async function mint_token(
    amount: number, 
    name: string, 
    decimals: number,
    description: string = "Bountiful Bounty Platform Token"
): Promise<string | undefined> {
    try {
        // Connect to the Ergo platform
        await (new ErgoPlatform).connect();
        
        console.log(`Minting ${amount} ${name} tokens with ${decimals} decimals...`);
        
        // Get wallet change address
        const changeAddress = await ergo.get_change_address();
        
        // Build the transaction with token minting
        const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
            .from(await ergo.get_utxos())
            .to(
                new OutputBuilder(SAFE_MIN_BOX_VALUE, changeAddress)
                  .mintToken({ 
                    amount: amount.toString(),  // Amount of tokens being minted
                    name: name,                 // Token name
                    decimals: decimals,         // Decimal places
                    description: description    // Token description
                  }) 
            )
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .sendChangeTo(changeAddress)
            .build()
            .toEIP12Object();
            
        // Sign the transaction
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        
        // Submit the transaction
        const transactionId = await ergo.submit_tx(signedTransaction);
        console.log(`Token minting transaction ID: ${transactionId}`);
        console.log(`Minted ${amount} ${name} tokens with token ID: ${transactionId.substring(0, 64)}`);
        
        return transactionId;
    } catch (error) {
        console.error("Error minting token:", error);
        return undefined;
    }
}

/**
 * Mints a Bountiful Bounty Token (BBT)
 * 
 * Creates a single token to identify and manage a bounty
 * 
 * @returns Transaction ID if successful, undefined otherwise
 */
export async function mint_bounty_token(): Promise<string | undefined> {
    // For bounties, we only need 1 token (as specified in the contract)
    return mint_token(
        1,                           // Amount: 1 (as per contract requirement)
        "APT",                       // Name: Bountiful Bounty Token
        0,                           // Decimals: 0 (non-divisible)
        "Bountiful Bounty Platform Token - Identifies and manages a single bounty"
    );
}