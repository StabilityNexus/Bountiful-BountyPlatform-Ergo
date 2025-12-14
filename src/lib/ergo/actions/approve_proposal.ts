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
import { explorer_uri } from '$lib/ergo/envs';
import { getReputationProofTemplateHash, getReputationProofErgoTreeHex } from '$lib/ergo/contract';
import { uint8ArrayToHex, hexToBytes } from '$lib/ergo/utils';
import { blake2b256 } from '@fleet-sdk/crypto';
import { ErgoAddress } from '@fleet-sdk/core';


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

    const inputs = [fleetCompatibleProposalBox, ...walletUtxos];
    const repOutputs: any[] = [];

    const ergo_tree_hash = getReputationProofTemplateHash();
    const proposerPKHex = proposalBox.R4;
    const proposerUserId = uint8ArrayToHex(blake2b256(hexToBytes(proposerPKHex)));
    const judgeAddress = creatorAddress;
    const judgeErgoTree = ErgoAddress.fromBase58(judgeAddress).ergoTree;
    const judgeUserId = uint8ArrayToHex(blake2b256(hexToBytes(judgeErgoTree)));

    const fetchRepBoxForUser = async (userId: string) => {
        const url = `${explorer_uri}/api/v1/boxes/unspent/search`;
        const body = {
            "ergoTreeTemplateHash": ergo_tree_hash,
            "registers": {
                "R5": userId
            }
        };
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) return null;
        const json_data = await response.json();
        if (!json_data.items || json_data.items.length === 0) return null;
        const box = json_data.items[0];
        return {
            boxId: box.boxId,
            ergoTree: box.ergoTree,
            value: box.value,
            assets: box.assets.map((a: any) => ({ tokenId: a.tokenId, amount: BigInt(a.amount) })),
            additionalRegisters: {
                R4: box.additionalRegisters.R4?.serializedValue,
                R5: box.additionalRegisters.R5?.serializedValue,
                R6: box.additionalRegisters.R6?.serializedValue,
                R7: box.additionalRegisters.R7?.serializedValue,
                R8: box.additionalRegisters.R8?.serializedValue,
                R9: box.additionalRegisters.R9?.serializedValue
            }
        };
    };

    const proposerRepBox = await fetchRepBoxForUser(proposerUserId);
    if (proposerRepBox) {
        inputs.push(proposerRepBox);
        const updatedAmount = BigInt(proposerRepBox.assets[0].amount) + 1n;
        const proposerRepOutput = new OutputBuilder(BigInt(proposerRepBox.value))
            .setErgoTree(proposerRepBox.ergoTree)
            .addTokens({ tokenId: proposerRepBox.assets[0].tokenId, amount: updatedAmount })
            .setAdditionalRegisters(proposerRepBox.additionalRegisters)
            .build();
        repOutputs.push(proposerRepOutput);
    }

    const judgeRepBox = walletUtxos.find((box: any) => box.ergoTree == getReputationProofErgoTreeHex() && box.additionalRegisters?.R5?.serializedValue == judgeUserId);
    if (judgeRepBox) {
        inputs.push(judgeRepBox);
        const updatedAmount = BigInt(judgeRepBox.assets[0].amount) + 1n;
        const judgeRepOutput = new OutputBuilder(BigInt(judgeRepBox.value))
            .setErgoTree(judgeRepBox.ergoTree)
            .addTokens({ tokenId: judgeRepBox.assets[0].tokenId, amount: updatedAmount })
            .setAdditionalRegisters(judgeRepBox.additionalRegisters)
            .build();
        repOutputs.push(judgeRepOutput);
    }

    // Replicate the proposal box, only changing the status in R8
    const updatedProposalBox = new OutputBuilder(
        BigInt(proposalBox.value),
        proposalBox.ergoTree
    );

    if (proposalBox.assets && proposalBox.assets.length > 0) {
        updatedProposalBox.addTokens(proposalBox.assets);
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
        .from(inputs)
        .dataInputs([fleetCompatibleProposalBox])
        .to([updatedProposalBox, ...repOutputs])
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
 * After a proposal is approved, this function is called to claim the bounty reward.
 * This is the second step of the two-step payout process.
 */
export async function claimBountyReward(
    bountyBox: BountyBox,
    approvedProposalBox: ProposalBox
): Promise<string | null> {
    if (!ergo) throw new Error("Ergo object is not available");

    const walletUtxos = (await ergo.get_utxos()) as Box<Amount>[];
    const changeAddress = await ergo.get_change_address();
    const height = await ergo.get_current_height();

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

    const bountyRegisters = (bountyBox as any).additionalRegisters || {};
    const proposalRegisters = (approvedProposalBox as any).additionalRegisters || {};

    console.log("Bounty registers:", bountyRegisters);
    console.log("Proposal registers:", proposalRegisters);

    // Verify proposal is approved
    const proposalStatus = proposalRegisters.R8?.renderedValue || 
                          getSerializedValue(proposalRegisters.R8);
    console.log("Proposal status:", proposalStatus);
    
    if (proposalStatus !== "1" && proposalStatus !== "0501") {
        throw new Error("Proposal must be approved (status = 1) before claiming reward");
    }

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

    const bountyValue = BigInt(bountyBox.value);
    const devFeePercent = BigInt(get_dev_fee());
    const minerFeeAmount = BigInt(RECOMMENDED_MIN_FEE_VALUE);
    const devFeeAmount = (bountyValue * devFeePercent) / 100n;
    const proposerReward = bountyValue - devFeeAmount - minerFeeAmount;

    console.log("Bounty value:", bountyValue.toString());
    console.log("Dev fee:", devFeeAmount.toString());
    console.log("Miner fee:", minerFeeAmount.toString());
    console.log("Proposer reward:", proposerReward.toString());

    const r4Value = getSerializedValue(proposalRegisters.R4);
    const proposerPubKeyHex = r4Value.substring(2);
    const proposerAddress = hexToErgoAddress(proposerPubKeyHex);
    
    console.log("Proposer address:", proposerAddress);

    const fleetCompatibleBountyBox = createFleetSdkBox(bountyBox);
    const fleetCompatibleProposalBox = createFleetSdkBox(approvedProposalBox);
    
    const outputs: OutputBuilder[] = [];
    
    // Check if bounty has tokens
    const hasTokens = bountyBox.assets && bountyBox.assets.length > 0;
    
    if (hasTokens) {
        console.log("Bounty has tokens, creating replicated bounty box at OUTPUTS(0)");
        // Must replicate the bounty box with tokens at OUTPUTS(0)
        const replicatedBounty = new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value since funds are being withdrawn
            bountyBox.ergoTree
        );
        
        // Add all tokens from original bounty
        replicatedBounty.addTokens(bountyBox.assets);
        
        // Preserve all registers
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
        
        // Output 1: Proposer reward
        outputs.push(new OutputBuilder(adjustedProposerReward, proposerAddress));
        
        console.log("- Output 0 (Replicated bounty):", SAFE_MIN_BOX_VALUE.toString(), "with", bountyBox.assets.length, "tokens");
        console.log("- Output 1 (Proposer):", adjustedProposerReward.toString(), "to", proposerAddress);
    } else {
        console.log("Bounty has no tokens, spending fully without replication");
        // No tokens, can spend fully without replication
        // Output 0: Proposer reward
        outputs.push(new OutputBuilder(proposerReward, proposerAddress));
        
        console.log("- Output 0 (Proposer):", proposerReward.toString(), "to", proposerAddress);
    }

    // Dev fee output 
    outputs.push(new OutputBuilder(devFeeAmount, get_dev_contract_address()));
    console.log(`- Output ${outputs.length - 1} (Dev fee):`, devFeeAmount.toString(), "to", get_dev_contract_address());
    
    console.log("Building transaction with:");
    console.log("- Inputs: bounty box + wallet UTXOs");
    console.log("- Data inputs:", [fleetCompatibleProposalBox.boxId]);
    
    const unsignedTransaction = new TransactionBuilder(height)
        .from([fleetCompatibleBountyBox, ...walletUtxos])
        .withDataFrom([fleetCompatibleProposalBox])
        .to(outputs)
        .sendChangeTo(changeAddress)
        .payFee(minerFeeAmount)
        .build()
        .toEIP12Object();

    console.log("Unsigned transaction outputs:", unsignedTransaction.outputs?.length);

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