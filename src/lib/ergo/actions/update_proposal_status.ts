import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    type Box,
    type Amount,
    SConstant,
    SInt
} from '@fleet-sdk/core';
import type { ProposalBox } from './approve_proposal'; 

declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<Box<Amount>[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: unknown): Promise<unknown>;
    submit_tx(tx: unknown): Promise<string>;
} | undefined;

// Helper function to get serialized value from a register
function getSerializedValue(register: any): string {
    if (typeof register === 'string') {
        return register;
    }
    if (register && typeof register.serializedValue === 'string') {
        return register.serializedValue;
    }
    // Fallback for unexpected structures, might need adjustment
    return '';
}

/**
 * Updates the status of a proposal.
 * This is used by the bounty creator to mark a proposal as "Disputed" or to resolve a dispute.
 * @param proposalBox The proposal box to update.
 * @param newStatus The new status code (0 for Pending, 3 for Disputed).
 * @param creatorAddress The address of the bounty creator.
 */
export async function updateProposalStatus(
    proposalBox: ProposalBox,
    newStatus: 0 | 3,
    creatorAddress: string
): Promise<string | null> {
    if (!ergo) throw new Error("Ergo object is not available");

    const walletUtxos = (await ergo.get_utxos()) as Box<Amount>[];
    const changeAddress = await ergo.get_change_address();
    const currentHeight = await ergo.get_current_height();

    // Recreate the proposal box with the new status in R8
    const updatedProposalBox = new OutputBuilder(
        BigInt(proposalBox.value),
        proposalBox.ergoTree
    );

    // Copy assets
    if (proposalBox.assets && proposalBox.assets.length > 0) {
        updatedProposalBox.addTokens(proposalBox.assets);
    }

    // Copy existing registers and update R8
    const registers = (proposalBox as any).additionalRegisters || {};
    updatedProposalBox.setAdditionalRegisters({
        R4: getSerializedValue(registers.R4),
        R5: getSerializedValue(registers.R5),
        R6: getSerializedValue(registers.R6),
        R7: getSerializedValue(registers.R7),
        R8: SConstant(SInt(newStatus)), 
    });

    const transactionBuilder = new TransactionBuilder(currentHeight)
        .from([...walletUtxos, proposalBox])
        .to(updatedProposalBox)
        .sendChangeTo(changeAddress)
        .payFee(RECOMMENDED_MIN_FEE_VALUE);

    const unsignedTransaction = await transactionBuilder.build().toEIP12Object();

    try {
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Update proposal status transaction ID:", transactionId);
        return transactionId;
    } catch (error) {
        console.error("Failed to update proposal status:", error);
        throw error;
    }
}
