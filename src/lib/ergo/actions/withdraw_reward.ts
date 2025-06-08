// src/lib/ergo/actions/withdraw_reward.ts
import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { type Bounty } from '$lib/common/bounty';

declare const ergo: any;

/**
 * Withdraw reward for a successful submission.
 * Note: This function can be called by any wallet. The `walletPk` of the caller
 * is used for paying transaction fees and receiving change. The actual `winnerAddress`
 * is passed as a parameter.
 */
export async function withdraw(
    bounty: Bounty,
    winnerAddress: string,
    submissionId: string
): Promise<string|null> {
    
    // Verify there's an accepted submission
    if (!bounty.accepted_submissions || bounty.accepted_submissions <= 0) {
        alert("No accepted submissions for this bounty");
        return null;
    }
    
    // Verify minimum submissions requirement is met
    if ((bounty.total_submissions ?? 0) < (bounty.min_submissions || 0)) {
        alert("Minimum submission requirement not met");
        return null;
    }
    
    // Get the wallet address (caller address, used for fees and change)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    // Platform fee calculation
    const platformFeePercent = bounty.constants.platform_fee_percent || 10; // e.g., 10 for 1%
    const calculatedPlatformFee = Math.floor(((bounty.reward_amount || 0) * platformFeePercent) / 1000);

    // Pre-calculation check for reward sufficiency
    if ((bounty.reward_amount || 0) < calculatedPlatformFee + RECOMMENDED_MIN_FEE_VALUE) {
        alert("Bounty reward amount is too small to cover platform and miner fees.");
        return null;
    }
    
    // Winner amount calculation
    const winnerAmount = (bounty.reward_amount || 0) - calculatedPlatformFee - RECOMMENDED_MIN_FEE_VALUE;
    
    // Output value checks (prevent dust outputs)
    if (winnerAmount < SAFE_MIN_BOX_VALUE) {
        alert(`Calculated winner amount (${winnerAmount} nanoERG) is below the minimum box value. Bounty reward might be too low after fees.`);
        return null;
    }

    if (calculatedPlatformFee > 0 && calculatedPlatformFee < SAFE_MIN_BOX_VALUE) {
        alert(`Calculated platform fee (${calculatedPlatformFee} nanoERG) is non-zero but below the minimum box value. This transaction cannot proceed.`);
        return null;
    }
    
    // Outputs for the transaction
    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            BigInt(winnerAmount),
            winnerAddress
        )
    ];

    if (calculatedPlatformFee >= SAFE_MIN_BOX_VALUE) { // Only add platform fee output if it's substantial enough
        outputs.push(
            new OutputBuilder(
                BigInt(calculatedPlatformFee),
                bounty.constants.dev_addr || ''
            )
        );
    }
    // Note: If calculatedPlatformFee > 0 but < SAFE_MIN_BOX_VALUE, the earlier check prevents reaching here.
    // If calculatedPlatformFee is 0, it's simply not added, which is fine.

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // Use RECOMMENDED_MIN_FEE_VALUE
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