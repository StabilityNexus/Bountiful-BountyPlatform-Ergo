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
 * no accepted submissions or minimum submissions not met).
 * Note: This function can be called by any wallet. The `walletPk` of the caller
 * is used for paying transaction fees and receiving change. The refund always
 * goes to the `bounty.creator`.
 */
export async function refund_bounty(
    bounty: Bounty
): Promise<string|null> {
    
    // Verify deadline has passed
    // Note: bounty.current_height is expected to be populated by the calling application
    // with the current blockchain height at the time of forming the transaction.
    if (bounty.current_height && bounty.deadline && bounty.current_height <= bounty.deadline) {
        alert("Cannot refund before deadline");
        return null;
    }
    
    // Verify refund conditions (no accepted submissions or minimum not met)
    const noAcceptedSubmissions = !bounty.accepted_submissions || bounty.accepted_submissions <= 0;
    const minNotMet = (bounty.total_submissions ?? 0) < (bounty.min_submissions || 0);
    
    if (!noAcceptedSubmissions && !minNotMet) {
        alert("Refund conditions not met");
        return null;
    }
    
    // Get the wallet address (caller address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    if ((bounty.reward_amount || 0) < SAFE_MIN_BOX_VALUE) {
        alert("Bounty reward amount is less than the minimum box value, cannot process refund as a valid output.");
        return null;
    }

    // Output for the transaction (refund to creator)
    let outputs = [
        new OutputBuilder(
            BigInt(bounty.reward_amount || 0), // Value checked against SAFE_MIN_BOX_VALUE above
            bounty.creator || ''
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