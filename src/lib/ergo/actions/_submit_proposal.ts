import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    ErgoAddress
} from '@fleet-sdk/core';
import { SColl, SByte, SGroupElement } from '@fleet-sdk/serializer';
import { type proposal_contract_version, get_proposal_contract_details } from '../proposal_contract';

declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<any[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: unknown): Promise<unknown>;
    submit_tx(tx: unknown): Promise<string>;
};

function stringToBytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

/**
 * Submit a proposal to a bounty
 * @param bountyId Token ID of the bounty
 * @param version Proposal contract version (e.g., "v1_0")
 * @param proposerAddress Wallet address of the proposer
 * @param submission Metadata for proposal (title, url)
 * @returns transaction ID
 */
export async function submit_proposal(
    bountyId: string,
    version: proposal_contract_version,
    proposerAddress: string,
    submission: {
        title: string;
        url: string;
    }
): Promise<string> {
    if (!ergo) throw new Error("Ergo object is not available");

    const changeAddress = await ergo.get_change_address();
    const utxos = await ergo.get_utxos();
    const height = await ergo.get_current_height();

    const { address: proposalAddress } = get_proposal_contract_details(version);

    // Serialize metadata JSON
    const metadata = JSON.stringify({
        title: submission.title,
        url: submission.url,
        cost: 0 // Optional
    });

    // Extract proposer's public key
    const pubkeyBytes = ErgoAddress.fromBase58(proposerAddress).getPublicKeys()?.[0];
    if (!pubkeyBytes) {
        throw new Error("Failed to extract public key from proposer address");
    }

    // Build proposal output box
    const proposalBox = new OutputBuilder(SAFE_MIN_BOX_VALUE, proposalAddress)
        .setAdditionalRegisters({
            R4: SGroupElement(pubkeyBytes).toHex(),                     // Public key (GroupElement)
            R5: SColl(SByte, stringToBytes(bountyId)).toHex(),         // bountyId as Coll[Byte]
            R6: SColl(SByte, stringToBytes(metadata)).toHex()          // metadata JSON as Coll[Byte]
        });

    // Build transaction
    const unsignedTx = await new TransactionBuilder(height)
        .from(utxos)
        .to(proposalBox)
        .sendChangeTo(changeAddress)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();

    console.log("Unsigned proposal transaction:", unsignedTx);

    const signedTx = await ergo.sign_tx(unsignedTx);
    const txId = await ergo.submit_tx(signedTx);

    console.log("Proposal submitted with TX ID:", txId);
    return txId;
}
