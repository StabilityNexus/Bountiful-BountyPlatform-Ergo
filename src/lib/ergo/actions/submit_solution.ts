// src/lib/ergo/actions/submit_solution.ts
import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { SString } from '../utils';
import { type Bounty } from '$lib/common/bounty';
import { get_address } from '../contract';
import { SColl } from '@fleet-sdk/serializer';

declare const ergo: any;

/**
 * Submit a solution to a bounty
 */
export async function submit_solution(
    bounty: Bounty,
    solutionContent: string
): Promise<string|null> {

    // Get the wallet address (submitter address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    // Extract existing roots from bounty data
    const submissionsRoot = bounty.content.metadata?.submissionsRoot || '';
    const judgmentsRoot = bounty.content.metadata?.judgmentsRoot || '';
    const metadataRoot = bounty.content.metadata?.metadataRoot || '';
    
    // In a real implementation, this would update the submissions root
    // based on adding the new submission to a Merkle tree
    const newSubmissionsRoot = '11111111111111111111111111111111'; // This is just a placeholder, should be a 32-byte hex string (64 chars)
    
    const addressContent = {
        ...bounty.constants,
        creator: bounty.creator || bounty.constants.owner // Use bounty.creator or fall back to owner
    };

    // R9 is structured as: submissionsRootHex (64 chars) + judgmentsRootHex (64 chars) + metadataRootHex (64 chars) + actualBountyContentJsonString
    // To get the originalBountyContent, we need to strip off these three roots.
    const LENGTH_OF_THREE_ROOTS_HEX = 64 * 3; // 192 characters
    const originalBountyContent = bounty.content.raw?.substring(LENGTH_OF_THREE_ROOTS_HEX) || '';
    
    // Combine the updated roots with the original content
    const updatedBountyData = newSubmissionsRoot + judgmentsRoot + metadataRoot + originalBountyContent;

    // Building the updated bounty output
    let contractOutput = new OutputBuilder(
        BigInt(bounty.value || 0),
        get_address(addressContent, (bounty.version || 'v1') as contract_version /* TODO: Ensure bounty.version is reliably populated */)
    )
    .addTokens({
        tokenId: bounty.token_details.token_id || '',
        amount: BigInt(1) // Always 1 bounty token
    });

    // Update the submission stats (increase total submissions by 1)
    const total = BigInt((bounty.total_submissions || 0) + 1);
    const accepted = BigInt(bounty.accepted_submissions || 0);
    const rejected = BigInt(bounty.rejected_submissions || 0);

    contractOutput.setAdditionalRegisters({
        R4: SInt(bounty.deadline || 0).toHex(),
        R5: SLong(BigInt(bounty.min_submissions || 0)).toHex(),
        R6: SColl(SLong, [total, accepted, rejected]).toHex(),
        R7: SLong(BigInt(bounty.reward_amount || 0)).toHex(),
        R8: SString(bounty.constants.raw || ''),
        R9: SString(updatedBountyData)
    });

    // Off-chain storage of the actual solution
    // In a real implementation, this would be stored in a database or IPFS
    console.log("Solution content:", solutionContent);

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