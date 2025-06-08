// src/lib/ergo/actions/extend_deadline.ts
import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';

// Declare the global `ergo` object
declare const ergo: any;
import { SString } from '../utils';
import { type Bounty } from '$lib/common/bounty';
import { get_address } from '../contract';
import { SColl } from '@fleet-sdk/serializer';

/**
 * Extend the deadline of an existing bounty
 */
export async function extend_deadline(
    bounty: Bounty,
    newDeadline: number
): Promise<string|null> {
    
    // Verify new deadline is after the current one
    if (newDeadline <= (bounty.deadline || 0)) {
        alert("New deadline must be after the current one");
        return null;
    }
    
    // Verify current height is before current deadline
    // Note: bounty.current_height is expected to be populated by the calling application
    // with the current blockchain height at the time of forming the transaction.
    if (bounty.current_height && bounty.deadline && bounty.current_height > bounty.deadline) {
        alert("Cannot extend deadline after it has passed");
        return null;
    }
    
    // Only the creator can extend the deadline
    const walletPk = await ergo.get_change_address();
    
    // Verify the caller is the bounty creator
    if (walletPk !== bounty.creator) {
        alert("Only the bounty creator can extend the deadline");
        return null;
    }
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    const addressContent = {
        ...bounty.constants,
        creator: bounty.creator || bounty.constants.owner // Use bounty.creator or fall back to owner
    };

    // Building the updated bounty output
    let contractOutput = new OutputBuilder(
        BigInt(bounty.value || 0),
        get_address(addressContent, (bounty.version || 'v1') as contract_version /* TODO: Ensure bounty.version is reliably populated */)
    )
    .addTokens({
        tokenId: bounty.token_details.token_id || '',
        amount: BigInt(1) // Always 1 bounty token
    });

    contractOutput.setAdditionalRegisters({
        R4: SInt(newDeadline).toHex(), // Updated deadline
        R5: SLong(BigInt(bounty.min_submissions || 0)).toHex(),
        R6: SColl(SLong, [
            BigInt(bounty.total_submissions || 0),
            BigInt(bounty.accepted_submissions || 0),
            BigInt(bounty.rejected_submissions || 0)
        ]).toHex(),
        R7: SLong(BigInt(bounty.reward_amount || 0)).toHex(),
        R8: SString(bounty.constants.raw || ''),
        R9: SString(bounty.content.raw || '')
    });

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to([contractOutput])
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