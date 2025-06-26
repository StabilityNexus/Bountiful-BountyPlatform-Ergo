import {
    OutputBuilder,
    TransactionBuilder
} from '@fleet-sdk/core';
import { get_dev_contract_address } from './dev_contract';
import { ErgoPlatform } from '../platform';

/**
 * Distributes funds collected from the Bountiful platform fees to stakeholders
 * 
 * @param box The fee box to distribute from
 * @param brunoAddress Bruno's wallet address
 * @param lgdAddress LGD's wallet address
 * @param jmAddress Jossemii's wallet address
 * @param orderAddress The Stable Order's wallet address
 * @param brunoShare Bruno's percentage share (out of 100)
 * @param lgdShare LGD's percentage share (out of 100)
 * @param jmShare Jossemii's percentage share (out of 100)
 * @param orderShare The Stable Order's percentage share (out of 100)
 * @param totalAmount Total amount in nanoERG to distribute
 * @returns Transaction ID if successful, null otherwise
 */
export async function distributeFunds(
    box: any,
    brunoAddress: string,
    lgdAddress: string,
    jmAddress: string,
    orderAddress: string,
    brunoShare: number,
    lgdShare: number,
    jmShare: number,
    orderShare: number,
    totalAmount: number
): Promise<string | null> {
    try {
        // Connect to the Ergo platform
        await (new ErgoPlatform).connect();
        
        // Set up inputs
        let inputs = [box];
        
        // Account for miner fee
        const minerFeeAmount = 1100000;
        const distributableAmount = totalAmount - minerFeeAmount;
        
        // Calculate individual shares
        const brunoAmount = Math.floor((brunoShare / 100) * distributableAmount);
        const lgdAmount = Math.floor((lgdShare / 100) * distributableAmount);
        const jmAmount = Math.floor((jmShare / 100) * distributableAmount);
        const orderAmount = Math.floor((orderShare / 100) * distributableAmount);
        
        // Verify total matches sum of shares (accounting for potential rounding errors)
        const calculatedTotal = brunoAmount + lgdAmount + jmAmount + orderAmount;
        
        // Log distribution for debugging
        console.log(`Distributing ${distributableAmount} nanoERG:`);
        console.log(`- Bruno (${brunoShare}%): ${brunoAmount} nanoERG`);
        console.log(`- LGD (${lgdShare}%): ${lgdAmount} nanoERG`);
        console.log(`- JM (${jmShare}%): ${jmAmount} nanoERG`);
        console.log(`- Order (${orderShare}%): ${orderAmount} nanoERG`);
        console.log(`Total allocated: ${calculatedTotal} nanoERG`);
        
        // Handle small rounding differences if present
        if (Math.abs(distributableAmount - calculatedTotal) > 4) {
            throw new Error(
                `Invalid shares: The distributable amount (${distributableAmount}) does not match the sum of calculated shares (${calculatedTotal}). ` +
                `Details: Bruno (${brunoAmount}), LGD (${lgdAmount}), JM (${jmAmount}), Order (${orderAmount}).`
            );
        }
        
        // Ensure valid distribution
        if (orderAmount < 0 || brunoAmount < 0 || lgdAmount < 0 || jmAmount < 0) {
            throw new Error("Invalid distribution: negative share amount calculated");
        }
        
        // Build outputs for each recipient
        const outputs = [
            new OutputBuilder(BigInt(brunoAmount), brunoAddress),
            new OutputBuilder(BigInt(lgdAmount), lgdAddress),
            new OutputBuilder(BigInt(jmAmount), jmAddress),
            new OutputBuilder(BigInt(orderAmount), orderAddress)
        ];
        
        // Build and sign the transaction
        const unsignedTransaction = await new TransactionBuilder(await (window as any).ergo.get_current_height())
            .from(inputs)
            .to(outputs)
            .payFee(BigInt(minerFeeAmount))
            .sendChangeTo(get_dev_contract_address()) // Any dust/change goes back to contract
            .build()
            .toEIP12Object();
            
        // Ensure 'ergo' is defined or imported before using it
                const signedTransaction = await (window as any).ergo.sign_tx(unsignedTransaction);
        
        // Submit the transaction
        // Ensure 'ergo' is defined or imported before using it
                const transactionId = await (window as any).ergo.submit_tx(signedTransaction);
        console.log("Fee distribution transaction ID:", transactionId);
        return transactionId;
    } catch (error) {
        console.error("Error distributing Bountiful platform fees:", error);
        return null;
    }
}