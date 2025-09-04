import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    type Box,
    type Amount
} from '@fleet-sdk/core';
import { type contract_version } from '../contract';
import type { ProposalBox, BountyBox } from './approve_proposal';
import { SGroupElement, SColl, SByte, SSigmaProp, SConstant, SInt } from '@fleet-sdk/serializer';
import { get_proposal_contract_ergo_tree, get_proposal_contract_details } from '../proposal_contract';
declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<Box<Amount>[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: unknown): Promise<unknown>;
    submit_tx(tx: unknown): Promise<string>;
} | undefined;

/**
 * Safely converts register values to hex strings
 */
function safeRegisterToHex(registerValue: any): string {
    if (registerValue && 'serializedValue' in registerValue) {
        const serializedValue = registerValue.serializedValue;
        if (typeof serializedValue === 'string') {
            return serializedValue;
        }
    }

    if (typeof registerValue === 'string') {
        return registerValue;
    }

    throw new Error(`Cannot convert register to hex: ${JSON.stringify(registerValue)}`);
}

/**
 * Creates a Fleet SDK compatible box from a proposalBox with object registers
 */
function createFleetSdkBox(proposalBox: any): Box<Amount> {
    const registers = proposalBox.additionalRegisters;
    const convertedRegisters: { [key: string]: string } = {};

    // Convert all object registers to hex strings
    Object.keys(registers).forEach(key => {
        convertedRegisters[key] = safeRegisterToHex(registers[key]);
    });

    // Create a Fleet SDK compatible box object
    const fleetBox: Box<Amount> = {
        boxId: proposalBox.boxId,
        transactionId: proposalBox.transactionId,
        index: proposalBox.index,
        ergoTree: proposalBox.ergoTree,
        creationHeight: proposalBox.creationHeight,
        value: proposalBox.value.toString(),
        assets: proposalBox.assets || [],
        additionalRegisters: convertedRegisters
    };

    return fleetBox;
}

/**
 * Extract public key from register hex (handles both GroupElement and SigmaProp formats)
 */
function extractPublicKey(registerHex: string): string {
    // R4 format: 07 (SColl[SByte]) + 21 (length) + public key bytes
    // R7 format: 08cd (SSigmaProp) + public key bytes

    if (registerHex.startsWith('07')) {
        // GroupElement in SColl[SByte] format: 07 + length + pubkey
        return registerHex.substring(4); // Skip 07 + length byte
    } else if (registerHex.startsWith('08cd')) {
        // SSigmaProp format: 08cd + pubkey  
        return registerHex.substring(4); // Skip 08cd
    }

    return registerHex;
}

export async function disputeProposal(
    version: contract_version,
    bountyBox: BountyBox,
    proposalBox: ProposalBox,
    disputerAddress: string
): Promise<string | null> {
    if (!ergo) throw new Error("Ergo object is not available");

    console.log("=== CONTRACT VERSION VERIFICATION ===");
    
    // Test contract compilation
    try {
        const testContract = get_proposal_contract_details("v1_0");
        console.log("Fixed contract compiles successfully");
        console.log("Fixed contract address:", testContract.address);
    } catch (error) {
        console.error("Contract compilation failed:", error);
        throw new Error("Contract has compilation issues: ");
    }
    
    // Check if this proposal uses the fixed contract
    const fixedContractTree = get_proposal_contract_ergo_tree("v1_0");
    const proposalContractTree = proposalBox.ergoTree;
    
    console.log("Contract verification:");
    console.log("- Fixed contract length:", fixedContractTree.length);
    console.log("- Proposal contract length:", proposalContractTree.length);
    console.log("- Contracts match:", fixedContractTree === proposalContractTree);
    
    if (fixedContractTree !== proposalContractTree) {
        console.error("This proposal still uses the OLD contract!");
        console.error("You need to create a NEW proposal with the fixed contract.");
        throw new Error("Proposal uses old contract version");
    }
    
    console.log("Proposal confirmed to use FIXED contract");
    const walletUtxos = (await ergo.get_utxos()) as Box<Amount>[];
    const changeAddress = await ergo.get_change_address();

    console.log("=== TESTING ACTUAL DISPUTE FUNCTIONALITY ===");
    console.log("Using FIXED contract - testing real dispute path");

    const registers = (proposalBox as any).additionalRegisters;
    const fleetCompatibleProposalBox = createFleetSdkBox(proposalBox);
    
    const updatedProposalBox = new OutputBuilder(
        BigInt(proposalBox.value),
        proposalBox.ergoTree
    );
    
    if (proposalBox.assets && proposalBox.assets.length > 0) {
        updatedProposalBox.addTokens(proposalBox.assets);
    }

    const outputRegisters = {
        R4: safeRegisterToHex(registers.R4),
        R5: safeRegisterToHex(registers.R5), 
        R6: safeRegisterToHex(registers.R6), // Keep original metadata
        R7: safeRegisterToHex(registers.R7),
        R8: '0406' // Status 3 (Disputed) - this is the real test!
    };

    console.log("Setting status to DISPUTED (3)");
    console.log("This will test the actual dispute validation path");
    updatedProposalBox.setAdditionalRegisters(outputRegisters);

    const transactionBuilder = new TransactionBuilder(await ergo.get_current_height())
        .from([fleetCompatibleProposalBox, ...walletUtxos])
        .to(updatedProposalBox)
        .withDataFrom([bountyBox]) 
        .sendChangeTo(changeAddress)
        .payFee(RECOMMENDED_MIN_FEE_VALUE);

    try {
        console.log("Building dispute transaction...");
        const unsignedTransaction = await transactionBuilder.build().toEIP12Object();
        console.log("Transaction built successfully!");
        
        console.log("Signing transaction...");
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        console.log("Transaction signed successfully!");
        
        console.log("Submitting dispute transaction...");
        const transactionId = await ergo.submit_tx(signedTransaction);
        
        console.log("SUCCESS! Dispute proposal transaction ID:", transactionId);
        console.log("The contract fix worked! Proposal status changed to Disputed.");
        return transactionId;
        
    } catch (error: any) {
        console.error("Actual dispute failed:", error);
        console.error("This means there might still be an issue with the contract fix");
        throw error;
    }
}
