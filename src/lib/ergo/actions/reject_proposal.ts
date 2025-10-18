import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    type Box,
    type Amount
} from '@fleet-sdk/core';
import { type contract_version } from '../contract';
import type { ProposalBox, BountyBox } from './approve_proposal'; // Assuming ProposalBox is exported from here
import { SGroupElement, SColl, SByte, SSigmaProp, SConstant, SInt } from '@fleet-sdk/serializer';

declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<Box<Amount>[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: unknown): Promise<unknown>;
    submit_tx(tx: unknown): Promise<string>;
} | undefined;

export async function rejectProposal(
    version: contract_version,
    bountyBox: BountyBox,
    proposalBox: ProposalBox,
    creatorAddress: string
): Promise<string | null> {
    if (!ergo) throw new Error("Ergo object is not available");

    const walletUtxos = (await ergo.get_utxos()) as Box<Amount>[];
    const changeAddress = await ergo.get_change_address();

    // Create the output box with the updated status
    const updatedProposalBox = new OutputBuilder(
        BigInt(proposalBox.value),
        proposalBox.ergoTree
    ).addTokens(proposalBox.tokens || (proposalBox as any).assets || []);

    const r = (proposalBox as any).additionalRegisters;
    updatedProposalBox.setAdditionalRegisters({
        R4: r.R4.serializedValue,
        R5: r.R5.serializedValue,
        R6: r.R6.serializedValue,
        R7: r.R7.serializedValue,
        R8: '0404' // Status 2 (Rejected) as Int
    });

    const transactionBuilder = new TransactionBuilder(await ergo.get_current_height())
        .from([proposalBox, ...walletUtxos])
        .to(updatedProposalBox)
        .withDataFrom([bountyBox])
        .sendChangeTo(changeAddress)
        .payFee(RECOMMENDED_MIN_FEE_VALUE);

    const unsignedTransaction = await transactionBuilder.build().toEIP12Object();

    try {
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Reject proposal transaction ID:", transactionId);
        return transactionId;
    } catch (error) {
        console.error("Failed to reject proposal:", error);
        throw error;
    }
}
