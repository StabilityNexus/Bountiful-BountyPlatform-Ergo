// src/lib/ergo/actions/refund_bounty.ts
import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { type Bounty } from '$lib/common/bounty';
declare const ergo: any;
/**
 * Refund a bounty to the creator if conditions are met (e.g., deadline passed and
 * minimum submissions not met).
 * Note: This function can be called by any wallet. The `walletPk` of the caller
 * is used for paying transaction fees and receiving change. The refund always
 * goes to the `bounty.constants.creator`.
 */
export async function refund_bounty(
    bounty: Bounty
): Promise<string|null> {
    
    const current_height = await ergo.get_current_height();

    // Verify deadline has passed
    if (current_height <= bounty.block_limit) {
        alert("Cannot refund before deadline");
        return null;
    }
    
    // Verify refund conditions (minimum not met)
    const minNotMet = (bounty.total_submissions ?? 0) < (bounty.min_submissions || 0);
    
    if (!minNotMet) {
        alert("Refund conditions not met. Minimum submissions were met.");
        return null;
    }
    
    // Get the wallet address (caller address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    if ((bounty.current_value || 0) < SAFE_MIN_BOX_VALUE) {
        alert("Bounty reward amount is less than the minimum box value, cannot process refund as a valid output.");
        return null;
    }

    // Output for the transaction (refund to creator)
    let outputs = [
        new OutputBuilder(
            BigInt(bounty.current_value || 0), // Value checked against SAFE_MIN_BOX_VALUE above
            bounty.constants.creator || ''
        )
    ];

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();

    try {
        // Sign the transaction
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);

        // Send the transaction to the Ergo network
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Transaction id -> ", transactionId);
        return transactionId;
    } catch (e) {
        console.log(e);
        return null;
    }
}