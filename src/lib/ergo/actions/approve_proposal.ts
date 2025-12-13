import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    type Box,
    type Amount
} from '@fleet-sdk/core';
import { type contract_version } from '../contract';
import { get_dev_contract_address, get_dev_fee } from '../dev/dev_contract';
import { hexToErgoAddress } from '../../common/proposal'; // Import the utility
import { SGroupElement, SColl, SByte, SSigmaProp, SInt } from '@fleet-sdk/serializer';


export interface BountyBox extends Box<Amount> {
    tokens: { tokenId: string; amount: bigint }[];
    R4: string; // Int - block limit
    R5: string; // Long - minimum contribution
    R6: string; // Coll[Long] - counters [contributed, refunded, exchanged]
    R7: string; // Long - exchange rate
    R8: string; // Coll[Byte] - creator details JSON (contains creator address)
    R9: string; // Coll[Byte] - bounty metadata JSON
}


export interface ProposalBox extends Box<Amount> {
    tokens: { tokenId: string; amount: bigint }[];
    R4: string; // GroupElement - proposerPubKey (hex encoded)
    R5: string; // Coll[Byte] - bountyId (hex encoded)
    R6: string; // Coll[Byte] - metadataJson (hex encoded)
    R7: string; // SigmaProp - bountyCreatorProp (hex encoded)
    R8: string; // Int - status (0: Pending, 1: Approved, 2: Rejected, 3: Disputed)
}


declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<Box<Amount>[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: unknown): Promise<unknown>;
    submit_tx(tx: unknown): Promise<string>;
} | undefined;


function safeRegisterToHex(registerValue: any): string {
    if (registerValue && typeof registerValue.serializedValue === 'string') {
        return registerValue.serializedValue;
    }
    if (typeof registerValue === 'string') {
        return registerValue;
    }
    // Add more checks if other formats are possible
    throw new Error(`Cannot convert register to hex: ${JSON.stringify(registerValue)}`);
}

function createFleetSdkBox(proposalBox: any): Box<Amount> {
    const registers = proposalBox.additionalRegisters;
    const convertedRegisters: { [key: string]: string } = {};

    Object.keys(registers).forEach(key => {
        convertedRegisters[key] = safeRegisterToHex(registers[key]);
    });

    return {
        boxId: proposalBox.boxId,
        transactionId: proposalBox.transactionId,
        index: proposalBox.index,
        ergoTree: proposalBox.ergoTree,
        creationHeight: proposalBox.creationHeight,
        value: proposalBox.value.toString(),
        assets: proposalBox.assets || [],
        additionalRegisters: convertedRegisters
    };
}

function getSerializedValue(register: any): string {
    if (register && typeof register.serializedValue === 'string') {
        return register.serializedValue;
    }
    if (typeof register === 'string') {
        return register;
    }
    throw new Error(`Invalid register format: ${JSON.stringify(register)}`);
}

/**
 * Validates that a proposal is eligible for bounty closing.
 * 
 * @param proposalBox - The proposal box to validate
 * @param bountyId - The bounty ID to match against
 * @returns Object with isValid flag and error message if invalid
 */
export function validateProposalForClosing(
    proposalBox: ProposalBox,
    bountyId: string
): { isValid: boolean; error?: string } {
    try {
        const proposalRegisters = (proposalBox as any).additionalRegisters || {};
        
        // Check proposal status
        const proposalStatusSerialized = getSerializedValue(proposalRegisters.R8);
        let proposalStatus: number;
        if (proposalStatusSerialized.startsWith('05')) {
            const statusHex = proposalStatusSerialized.substring(2);
            proposalStatus = parseInt(statusHex, 16);
        } else if (proposalRegisters.R8?.renderedValue) {
            proposalStatus = parseInt(proposalRegisters.R8.renderedValue, 10);
        } else {
            return { isValid: false, error: "Cannot parse proposal status" };
        }
        
        if (proposalStatus !== 1) {
            return { 
                isValid: false, 
                error: `Proposal must be approved (status = 1). Current status: ${proposalStatus}` 
            };
        }
        
        // Check bounty ID match
        const proposalBountyIdSerialized = getSerializedValue(proposalRegisters.R5);
        function hexToUtf8(hex: string): string {
            let hexString = hex;
            if (hexString.startsWith('0e')) {
                hexString = hexString.substring(2);
                const firstByte = parseInt(hexString.substring(0, 2), 16);
                if (firstByte < 128) {
                    hexString = hexString.substring(2);
                } else {
                    hexString = hexString.substring(4);
                }
            }
            let str = '';
            for (let i = 0; i < hexString.length; i += 2) {
                const charCode = parseInt(hexString.substr(i, 2), 16);
                if (charCode > 0) {
                    str += String.fromCharCode(charCode);
                }
            }
            return str;
        }
        const proposalBountyId = hexToUtf8(proposalBountyIdSerialized);
        
        if (proposalBountyId !== bountyId) {
            return { 
                isValid: false, 
                error: `Proposal bounty ID mismatch. Expected: ${bountyId}, Got: ${proposalBountyId}` 
            };
        }
        
        // Check proposer address exists
        const r4Value = getSerializedValue(proposalRegisters.R4);
        if (!r4Value || r4Value.length < 2) {
            return { isValid: false, error: "Proposal R4 (proposer address) is missing or invalid" };
        }
        
        return { isValid: true };
    } catch (error) {
        return { 
            isValid: false, 
            error: `Validation error: ${error instanceof Error ? error.message : String(error)}` 
        };
    }
}

/**
 * Creator approves a proposal by changing its status to 1.
 * This is the first step in the two-step payout process.
 */
export async function creatorApproveProposal(
    proposalBox: ProposalBox,
    creatorAddress: string
): Promise<string | null> {
    if (!ergo) throw new Error("Ergo object is not available");

    const walletUtxos = (await ergo.get_utxos()) as Box<Amount>[];
    const changeAddress = await ergo.get_change_address();
    const height = await ergo.get_current_height();

    const fleetCompatibleProposalBox = createFleetSdkBox(proposalBox);

    // Replicate the proposal box, only changing the status in R8
    const proposalBoxAsBox = proposalBox as Box<Amount>;
    const proposalValue = typeof proposalBoxAsBox.value === 'string' 
        ? BigInt(proposalBoxAsBox.value) 
        : BigInt(proposalBoxAsBox.value);
    const updatedProposalBox = new OutputBuilder(
        proposalValue,
        proposalBoxAsBox.ergoTree
    );

    const proposalAssets = (proposalBox as Box<Amount>).assets;
    if (proposalAssets && proposalAssets.length > 0) {
        updatedProposalBox.addTokens(proposalAssets);
    }

    const registers = (proposalBox as any).additionalRegisters;

    updatedProposalBox.setAdditionalRegisters({
        R4: getSerializedValue(registers.R4),
        R5: getSerializedValue(registers.R5),
        R6: getSerializedValue(registers.R6),
        R7: getSerializedValue(registers.R7),
        R8: SInt(1).toHex(), // Status 1: Approved
    });

    const unsignedTransaction = new TransactionBuilder(height)
        .from([fleetCompatibleProposalBox, ...walletUtxos])
        .to(updatedProposalBox)
        .sendChangeTo(changeAddress)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();

    try {
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);
        console.log("Approval transaction submitted:", transactionId);
        return transactionId;
    } catch (error) {
        console.error("Failed to approve proposal:", error);
        throw error;
    }
}

/**
 * Closes a bounty by selecting an approved proposal and distributing rewards.
 * 
 * This function enforces the correct on-chain flow:
 * 1. Validates that the proposal status is APPROVED (R8 == 1)
 * 2. Verifies that the proposal's bounty ID matches the bounty box
 * 3. Uses the proposal box as a DataInput (not spent)
 * 4. Distributes funds to:
 *    - Proposer (from proposal R4 register)
 *    - Dev fee address
 *    - Preserves remaining tokens if required
 * 
 * @param bountyBox - The bounty contract box to be closed
 * @param approvedProposalBox - The approved proposal box (status == 1) to be used as DataInput
 * @returns Transaction ID if successful, null otherwise
 * @throws Error if validation fails (proposal not approved, bounty ID mismatch, etc.)
 */
export async function claimBountyReward(
    bountyBox: BountyBox,
    approvedProposalBox: ProposalBox
): Promise<string | null> {
    if (!ergo) throw new Error("Ergo object is not available");

    const walletUtxos = (await ergo.get_utxos()) as Box<Amount>[];
    const changeAddress = await ergo.get_change_address();
    const height = await ergo.get_current_height();

    // Helper function to decode hex to UTF-8 string
    const hexToUtf8 = (hex: string): string => {
        let hexString = hex;
        if (hexString.startsWith('0e')) {
            hexString = hexString.substring(2);
            const firstByte = parseInt(hexString.substring(0, 2), 16);
            if (firstByte < 128) {
                hexString = hexString.substring(2);
            } else {
                hexString = hexString.substring(4);
            }
        }
        
        let str = '';
        for (let i = 0; i < hexString.length; i += 2) {
            const charCode = parseInt(hexString.substr(i, 2), 16);
            if (charCode > 0) {
                str += String.fromCharCode(charCode);
            }
        }
        return str;
    };

    const bountyRegisters = (bountyBox as any).additionalRegisters || {};
    const proposalRegisters = (approvedProposalBox as any).additionalRegisters || {};

    console.log("Bounty registers:", bountyRegisters);
    console.log("Proposal registers:", proposalRegisters);

    // ===== VALIDATION 1: Verify proposal status is APPROVED (R8 == 1) =====
    const proposalStatusSerialized = getSerializedValue(proposalRegisters.R8);
    // Parse the status: SInt serialized format is "05" + hex value
    // For status 1, it should be "0501" (05 = Int type, 01 = value 1)
    let proposalStatus: number;
    if (proposalStatusSerialized.startsWith('05')) {
        // Extract the hex value after the type byte
        const statusHex = proposalStatusSerialized.substring(2);
        proposalStatus = parseInt(statusHex, 16);
    } else if (proposalRegisters.R8?.renderedValue) {
        // Fallback to rendered value if available
        proposalStatus = parseInt(proposalRegisters.R8.renderedValue, 10);
    } else {
        throw new Error("Cannot parse proposal status from register R8");
    }
    
    console.log("Proposal status (parsed):", proposalStatus);
    
    if (proposalStatus !== 1) {
        throw new Error(
            `Proposal must be approved (status = 1) before claiming reward. Current status: ${proposalStatus}`
        );
    }

    // ===== VALIDATION 2: Verify proposal bounty ID matches bounty box =====
    // Extract bounty ID from proposal R5 register
    const proposalBountyIdSerialized = getSerializedValue(proposalRegisters.R5);
    // R5 is Coll[Byte], so we need to decode it
    const proposalBountyId = hexToUtf8(proposalBountyIdSerialized);
    
    // Extract bounty ID from bounty box (first token ID)
    const bountyBoxAsBox = bountyBox as Box<Amount>;
    const bountyAssetsForId = bountyBoxAsBox.assets;
    const bountyId = bountyAssetsForId && bountyAssetsForId.length > 0 
        ? bountyAssetsForId[0].tokenId 
        : null;
    
    if (!bountyId) {
        throw new Error("Bounty box does not contain a bounty ID token");
    }
    
    console.log("Proposal bounty ID:", proposalBountyId);
    console.log("Bounty box ID:", bountyId);
    
    // Compare the decoded proposal bounty ID with the bounty box token ID
    if (proposalBountyId !== bountyId) {
        throw new Error(
            `Proposal bounty ID mismatch. Proposal references: ${proposalBountyId}, Bounty ID: ${bountyId}`
        );
    }

    // ===== VALIDATION 3: Extract and validate creator address =====
    let creatorAddress: string;
    try {
        const r8Value = getSerializedValue(bountyRegisters.R8);
        const decodedString = hexToUtf8(r8Value);
        const creatorDetails = JSON.parse(decodedString);
        creatorAddress = creatorDetails.creator;
        console.log("Decoded creator address:", creatorAddress);
    } catch (e) {
        console.error("Failed to decode creator from R8:", e);
        throw new Error("Could not extract creator address from bounty box");
    }

    // ===== CALCULATE REWARD DISTRIBUTION =====
    const bountyBoxAsBoxForValue = bountyBox as Box<Amount>;
    const bountyValueRaw = typeof bountyBoxAsBoxForValue.value === 'string' 
        ? bountyBoxAsBoxForValue.value 
        : String(bountyBoxAsBoxForValue.value);
    const bountyValue = BigInt(bountyValueRaw);
    const devFeePercent = BigInt(get_dev_fee());
    const minerFeeAmount = BigInt(RECOMMENDED_MIN_FEE_VALUE);
    const devFeeAmount = (bountyValue * devFeePercent) / BigInt(100);
    const proposerReward = bountyValue - devFeeAmount - minerFeeAmount;

    console.log("Bounty value:", bountyValue.toString());
    console.log("Dev fee:", devFeeAmount.toString());
    console.log("Miner fee:", minerFeeAmount.toString());
    console.log("Proposer reward:", proposerReward.toString());

    // ===== EXTRACT PROPOSER ADDRESS FROM PROPOSAL R4 =====
    // R4 contains the proposer's public key as GroupElement
    const r4Value = getSerializedValue(proposalRegisters.R4);
    // GroupElement serialization: "07" prefix + 64 hex chars (32 bytes)
    const proposerPubKeyHex = r4Value.startsWith('07') ? r4Value.substring(2) : r4Value;
    const proposerAddress = hexToErgoAddress(proposerPubKeyHex);
    
    console.log("Proposer address (from R4):", proposerAddress);

    // ===== PREPARE BOXES FOR TRANSACTION =====
    // Convert boxes to Fleet SDK compatible format
    const fleetCompatibleBountyBox = createFleetSdkBox(bountyBox);
    const fleetCompatibleProposalBox = createFleetSdkBox(approvedProposalBox);
    
    // ===== BUILD TRANSACTION OUTPUTS =====
    const outputs: OutputBuilder[] = [];
    
    // Check if bounty has tokens that need to be preserved
    const bountyBoxAsBoxForAssets = bountyBox as Box<Amount>;
    const bountyAssetsForOutputs = bountyBoxAsBoxForAssets.assets;
    const hasTokens = bountyAssetsForOutputs && bountyAssetsForOutputs.length > 0;
    
    if (hasTokens) {
        console.log("Bounty has tokens, creating replicated bounty box at OUTPUTS(0)");
        // Must replicate the bounty box with tokens at OUTPUTS(0)
        // This is required by the contract when tokens are present
        const replicatedBounty = new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value since funds are being withdrawn
            (bountyBox as Box<Amount>).ergoTree
        );
        
        // Add all tokens from original bounty (preserve them)
        replicatedBounty.addTokens(bountyAssetsForOutputs);
        
        // Preserve all registers exactly as they were
        replicatedBounty.setAdditionalRegisters({
            R4: getSerializedValue(bountyRegisters.R4),
            R5: getSerializedValue(bountyRegisters.R5),
            R6: getSerializedValue(bountyRegisters.R6),
            R7: getSerializedValue(bountyRegisters.R7),
            R8: getSerializedValue(bountyRegisters.R8),
            R9: getSerializedValue(bountyRegisters.R9),
        });
        
        outputs.push(replicatedBounty);
        
        // Adjust proposer reward to account for the minimum value in replicated box
        const adjustedProposerReward = proposerReward - SAFE_MIN_BOX_VALUE;
        
        // Output 1: Proposer reward (sent to address from proposal R4)
        outputs.push(new OutputBuilder(adjustedProposerReward, proposerAddress));
        
        console.log("- Output 0 (Replicated bounty):", SAFE_MIN_BOX_VALUE.toString(), "with", bountyAssetsForOutputs.length, "tokens");
        console.log("- Output 1 (Proposer):", adjustedProposerReward.toString(), "to", proposerAddress);
    } else {
        console.log("Bounty has no tokens, spending fully without replication");
        // No tokens, can spend fully without replication
        // Output 0: Proposer reward (sent to address from proposal R4)
        outputs.push(new OutputBuilder(proposerReward, proposerAddress));
        
        console.log("- Output 0 (Proposer):", proposerReward.toString(), "to", proposerAddress);
    }

    // Output N: Dev fee (always last output)
    outputs.push(new OutputBuilder(devFeeAmount, get_dev_contract_address()));
    console.log(`- Output ${outputs.length - 1} (Dev fee):`, devFeeAmount.toString(), "to", get_dev_contract_address());
    
    // ===== BUILD TRANSACTION =====
    // CRITICAL: The proposal box MUST be used as DataInput (not spent)
    // This allows the contract to verify the proposal without consuming it
    console.log("Building transaction with:");
    console.log("- Inputs: bounty box (spent) + wallet UTXOs");
    console.log("- Data inputs: proposal box (NOT spent, used for verification)");
    console.log("- Proposal box ID:", fleetCompatibleProposalBox.boxId);
    
    const unsignedTransaction = new TransactionBuilder(height)
        .from([fleetCompatibleBountyBox, ...walletUtxos])  // Bounty box is spent
        .withDataFrom([fleetCompatibleProposalBox])        // Proposal box is DataInput (NOT spent)
        .to(outputs)
        .sendChangeTo(changeAddress)
        .payFee(minerFeeAmount)
        .build()
        .toEIP12Object();

    // ===== VERIFY TRANSACTION STRUCTURE =====
    console.log("Unsigned transaction structure:");
    console.log("- Inputs count:", unsignedTransaction.inputs?.length || 0);
    console.log("- Data inputs count:", unsignedTransaction.dataInputs?.length || 0);
    console.log("- Outputs count:", unsignedTransaction.outputs?.length || 0);
    
    // Verify DataInput is present
    if (!unsignedTransaction.dataInputs || unsignedTransaction.dataInputs.length === 0) {
        throw new Error("Transaction must include proposal box as DataInput");
    }
    
    // Verify DataInput matches our proposal box
    const dataInputBoxId = unsignedTransaction.dataInputs[0]?.boxId || 
                          (unsignedTransaction.dataInputs[0] as any)?.box?.boxId;
    if (dataInputBoxId !== fleetCompatibleProposalBox.boxId) {
        throw new Error("DataInput box ID does not match proposal box ID");
    }

    try {
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);
        console.log("Bounty claim transaction submitted:", transactionId);
        return transactionId;
    } catch (error) {
        console.error("Failed to claim bounty reward:", error);
        console.error("Full error details:", JSON.stringify(error, null, 2));
        throw error;
    }
}