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

// Extended interfaces to match contract structure
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
    R4: string; // GroupElement - proposerPubKey (hex encoded)
    R5: string; // Coll[Byte] - bountyId (hex encoded)
    R6: string; // Coll[Byte] - metadataJson (hex encoded)
    R7: string; // SigmaProp - bountyCreatorProp (hex encoded)
}

declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<Box<Amount>[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: unknown): Promise<unknown>;
    submit_tx(tx: unknown): Promise<string>;
} | undefined;

// Helper function to safely decode creator details from bounty box
function decodeCreatorDetails(bountyBox: BountyBox): { address: string } {
    console.log("Full bounty box for creator extraction:", bountyBox);
    console.log("BountyBox registers:", {
        R4: bountyBox.R4,
        R5: bountyBox.R5,
        R6: bountyBox.R6,
        R7: bountyBox.R7,
        R8: bountyBox.R8,
        R9: bountyBox.R9
    });
    
    // Try R8 first (as per interface)
    if (bountyBox.R8) {
        console.log("Trying to decode from R8:", bountyBox.R8);
        const result = tryDecodeCreatorFromData(bountyBox.R8);
        if (result) return result;
    }
    
    // Try other registers in case creator is stored elsewhere
    const registersToTry = ['R9', 'R7', 'R6', 'R5', 'R4'];
    for (const reg of registersToTry) {
        const data = (bountyBox as any)[reg];
        if (data) {
            console.log(`Trying to decode creator from ${reg}:`, data);
            const result = tryDecodeCreatorFromData(data);
            if (result) {
                console.log(`Successfully decoded creator from ${reg}:`, result);
                return result;
            }
        }
    }
    
    // Try additionalRegisters if they exist
    if ((bountyBox as any).additionalRegisters) {
        console.log("Checking additionalRegisters:", (bountyBox as any).additionalRegisters);
        for (const [key, value] of Object.entries((bountyBox as any).additionalRegisters)) {
            if (value && typeof value === 'string') {
                console.log(`Trying to decode creator from additionalRegisters.${key}:`, value);
                const result = tryDecodeCreatorFromData(value);
                if (result) {
                    console.log(`Successfully decoded creator from additionalRegisters.${key}:`, result);
                    return result;
                }
            }
        }
    }
    
    throw new Error("Creator details not found in any register of the bounty box");
}

function analyzeProposalBox(proposalBox: any): void {
    console.log("=== PROPOSAL BOX ANALYSIS ===");
    console.log("Box type:", typeof proposalBox);
    console.log("Box keys:", Object.keys(proposalBox));
    
    // Check main properties
    if (proposalBox.additionalRegisters) {
        console.log("additionalRegisters found:", Object.keys(proposalBox.additionalRegisters));
        Object.entries(proposalBox.additionalRegisters).forEach(([key, value]) => {
            console.log(`  ${key}:`, typeof value, value);
        });
    }
    
    if (proposalBox.registers) {
        console.log("registers found:", Object.keys(proposalBox.registers));
        Object.entries(proposalBox.registers).forEach(([key, value]) => {
            console.log(`  ${key}:`, typeof value, value);
        });
    }
    
    // Check direct R4-R9 properties
    ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'].forEach(reg => {
        if (proposalBox[reg]) {
            console.log(`Direct ${reg}:`, typeof proposalBox[reg], proposalBox[reg]);
        }
    });
    
    console.log("=== END ANALYSIS ===");
}

function decodeProposalBountyId(proposalBox: ProposalBox | any): string {
    console.log("=== PROPOSAL BOX ANALYSIS ===");
    console.log("Box type:", typeof proposalBox);
    console.log("Box constructor:", proposalBox.constructor?.name);
    console.log("Box keys (first 10):", Object.keys(proposalBox).slice(0, 10), "... (truncated)");
    
    // Check if proposal box has additionalRegisters structure
    let r5Data: any = null;
    
    // FIRST: Check if it's the correct object structure with direct R5 access
    if (proposalBox.R5 && typeof proposalBox.R5 === 'object') {
        console.log("Found direct R5 object property");
        r5Data = proposalBox.R5;
        console.log("Direct R5:", r5Data);
    }
    
    // SECOND: Try additionalRegisters structure  
    else if ((proposalBox as any).additionalRegisters?.R5) {
        console.log("Found additionalRegisters, checking R5...");
        r5Data = (proposalBox as any).additionalRegisters.R5;
        console.log("additionalRegisters.R5:", r5Data);
    }
    
    // THIRD: Check if registers are stored differently
    else if ((proposalBox as any).registers?.R5) {
        console.log("Checking registers object");
        r5Data = (proposalBox as any).registers.R5;
    }
    
    // FOURTH: Check if the box is array-like but has numeric string keys
    else if (typeof proposalBox === 'object' && Object.keys(proposalBox).every(k => !isNaN(Number(k)))) {
        console.log("Detected array-like object, trying to reconstruct registers...");
        
        console.log("Array-like object sample:", Object.fromEntries(
            Object.entries(proposalBox).slice(0, 20)
        ));
        
        // Cannot easily recover from this format - need to prevent the conversion
        throw new Error(
            "Proposal box appears to have been converted to array-like format. " +
            "Original register structure lost. Check how proposalBox is being passed to this function."
        );
    }
    
    // FIFTH: Try direct string property access (legacy format)
    else if (typeof proposalBox.R5 === 'string') {
        console.log("Found direct R5 string property");
        r5Data = proposalBox.R5;
    }
    
    console.log("Final R5 data found:", r5Data);
    console.log("=== END ANALYSIS ===");
    
    if (!r5Data) {
        // Get available keys for debugging
        const availableKeys = Object.keys(proposalBox);
        const registerKeys = (proposalBox as any).additionalRegisters ? 
            Object.keys((proposalBox as any).additionalRegisters) : [];
        
        throw new Error(
            `R5 register not found in proposal box. ` +
            `Available box keys: ${availableKeys.slice(0, 5).join(', ')}... ` +
            `Available register keys: ${registerKeys.join(', ')}`
        );
    }
    
    // Handle serializedValue format
    if (typeof r5Data === 'object' && r5Data.serializedValue) {
        console.log("Processing serializedValue:", r5Data.serializedValue);
        const serialized = r5Data.serializedValue;
        
        if (serialized.startsWith('0e')) {
            // Extract length (next 2 chars after 0e)
            const lengthHex = serialized.substring(2, 4);
            const length = parseInt(lengthHex, 16);
            console.log("Decoded length:", length, "bytes");
            
            // Extract the actual hex data
            const dataHex = serialized.substring(4, 4 + (length * 2));
            console.log("Extracted hex data:", dataHex);
            
            // Convert hex to string (bounty ID was stored as string bytes)
            try {
                const bountyId = dataHex.match(/.{2}/g)?.map(byte => 
                    String.fromCharCode(parseInt(byte, 16))
                ).join('') || '';
                
                console.log("Decoded bounty ID:", bountyId);
                
                // Validate it looks like a token ID (64 hex characters)
                if (bountyId.length === 64 && /^[0-9a-fA-F]+$/i.test(bountyId)) {
                    return bountyId.toLowerCase();
                } else {
                    console.warn("Decoded bounty ID doesn't look like token ID:", bountyId);
                    // Return the hex data itself as fallback
                    return dataHex.toLowerCase();
                }
            } catch (e) {
                console.error("Failed to decode hex to string:", e);
                // Return raw hex data
                return dataHex.toLowerCase();
            }
        }
    }
    
    // Handle renderedValue format
    if (typeof r5Data === 'object' && r5Data.renderedValue) {
        console.log("Using renderedValue:", r5Data.renderedValue);
        const rendered = r5Data.renderedValue;
        
        // If rendered value is already the bounty ID
        if (typeof rendered === 'string') {
            if (rendered.length === 64 && /^[0-9a-fA-F]+$/i.test(rendered)) {
                return rendered.toLowerCase();
            } else {
                // Try hex decoding if it's hex-encoded string
                try {
                    const decoded = rendered.match(/.{2}/g)?.map(byte => 
                        String.fromCharCode(parseInt(byte, 16))
                    ).join('') || '';
                    
                    if (decoded.length === 64 && /^[0-9a-fA-F]+$/i.test(decoded)) {
                        return decoded.toLowerCase();
                    }
                } catch (e) {
                    console.warn("Failed to decode rendered value as hex:", e);
                }
                
                // Return as-is if no other decoding works
                return rendered;
            }
        }
    }
    
    // Handle direct string value
    if (typeof r5Data === 'string') {
        console.log("Processing direct string R5:", r5Data);
        
        // Check if it's already a token ID
        if (r5Data.length === 64 && /^[0-9a-fA-F]+$/i.test(r5Data)) {
            return r5Data.toLowerCase();
        }
        
        // Check if it's hex-encoded with prefix (like the serializedValue case)
        if (r5Data.startsWith('0e') && r5Data.length > 4) {
            const lengthHex = r5Data.substring(2, 4);
            const length = parseInt(lengthHex, 16);
            const dataHex = r5Data.substring(4, 4 + (length * 2));
            
            try {
                const decoded = dataHex.match(/.{2}/g)?.map(byte => 
                    String.fromCharCode(parseInt(byte, 16))
                ).join('') || '';
                
                if (decoded.length === 64 && /^[0-9a-fA-F]+$/i.test(decoded)) {
                    return decoded.toLowerCase();
                }
                
                // Return hex data as fallback
                return dataHex.toLowerCase();
            } catch (e) {
                console.error("Failed to decode string hex:", e);
                return r5Data;
            }
        }
        
        // Return as-is
        return r5Data;
    }
    
    throw new Error(`Could not decode bounty ID from R5 data: ${JSON.stringify(r5Data)}`);
}

// Helper function to try decoding creator data from a string
function tryDecodeCreatorFromData(data: string): { address: string } | null {
    if (!data) return null;
    
    try {
        // Handle hex-encoded data (starts with length prefix like 0e9b06)
        if (data.length > 4 && /^[0-9a-fA-F]+$/.test(data)) {
            console.log("Processing hex data:", data);
            
            // Skip the length prefix (first 2-4 chars) and decode the rest
            let hexContent = data;
            
            // Common prefixes to skip: 0e (variable length), followed by length bytes
            if (data.startsWith('0e')) {
                // Variable length encoding: 0e + length + data
                // For 0e9b06, skip first 6 chars (0e9b06)
                hexContent = data.substring(6);
            } else if (data.startsWith('04') || data.startsWith('05') || data.startsWith('08')) {
                // Fixed length encoding: skip first 2 chars
                hexContent = data.substring(2);
            }
            
            console.log("Hex content after prefix removal:", hexContent);
            
            // Convert hex to string
            const hexDecoded = hexContent.match(/.{2}/g)?.map(byte => String.fromCharCode(parseInt(byte, 16))).join('') || '';
            console.log("Decoded hex string:", hexDecoded);
            
            if (hexDecoded) {
                // Try parsing as JSON
                if (hexDecoded.startsWith('{')) {
                    const parsed = JSON.parse(hexDecoded);
                    console.log("Parsed JSON from hex:", parsed);
                    if (parsed.creator) {
                        return { address: parsed.creator };
                    }
                    if (parsed.address) {
                        return { address: parsed.address };
                    }
                }
                
                // Check if it's directly an Ergo address
                if (hexDecoded.startsWith('9') && hexDecoded.length > 40) {
                    return { address: hexDecoded };
                }
            }
        }
        
        // First we try direct JSON parsing (if it's already a JSON string)
        if (data.startsWith('{') || data.startsWith('"')) {
            const parsed = JSON.parse(data);
            if (parsed.address) {
                return { address: parsed.address };
            }
            if (parsed.creator) {
                return { address: parsed.creator };
            }
        }
        
        // Try base64 decode
        try {
            const decoded = atob(data);
            if (decoded.startsWith('{')) {
                const parsed = JSON.parse(decoded);
                if (parsed.address) {
                    return { address: parsed.address };
                }
                if (parsed.creator) {
                    return { address: parsed.creator };
                }
            } else if (decoded.startsWith('9') && decoded.length > 40) {
                return { address: decoded };
            }
        } catch (base64Error) {
            // Base64 failed, continue to other methods
        }
        
        // Check if it looks like an Ergo address directly
        if (data.startsWith('9') && data.length > 40) {
            return { address: data };
        }
        
        // Try to extract address from binary data using existing utilities
        const sanitized = sanitizeDeveloperAddress(data);
        if (sanitized && sanitized !== "Unknown" && sanitized !== "Address parsing error" && sanitized.startsWith('9')) {
            return { address: sanitized };
        }
        
    } catch (error) {
        console.warn("Failed to decode creator from data:", error, "Data:", data.substring(0, 100) + "...");
    }
    
    return null;
}

function sanitizeDeveloperAddress(developer: string): string {
    if (!developer || developer === "Unknown") return "Unknown";

    // Check if it's already a valid Ergo address
    if (developer.startsWith("9") && developer.length > 40) {
        return developer;
    }

    // Check for specific error messages from our conversion function
    if (
        developer.includes("Invalid key length") ||
        developer.includes("Invalid hex format") ||
        developer.includes("Conversion failed") ||
        developer.includes("Address conversion failed") ||
        developer.includes("Address extraction failed")
    ) {
        return "Address parsing error";
    }

    // If it contains non-printable characters, it's likely binary data
    if (/[^\x20-\x7E]/.test(developer)) {
        return "Address parsing error";
    }

    return developer;
}

/**
 * Creator approves proposal using the isCreatorApproveProposal path
 * This requires creator signature and validates against proposal contract
 */
export async function creatorApproveProposal(
    version: contract_version,
    bountyBox: BountyBox,
    proposalBox: ProposalBox,
    creatorAddress: string
): Promise<string | null> {
    if (!ergo) throw new Error("Ergo object is not available");

    // Validate that current user is the bounty creator
    const creatorDetails = decodeCreatorDetails(bountyBox);
    if (creatorDetails.address !== creatorAddress) {
        throw new Error("Only bounty creator can approve proposals");
    }

    // Validate minimum contribution threshold (existing logic)
    let counters: number[];
    try {
        const r6Data = (bountyBox as any).additionalRegisters?.R6 || bountyBox.R6 || "[0,0,0]";
        console.log("Raw R6 data:", r6Data);
        
        if (r6Data.startsWith('[')) {
            counters = JSON.parse(r6Data);
        } else if (/^[0-9a-fA-F]+$/.test(r6Data)) {
            console.log("Decoding hex R6 data:", r6Data);
            
            if (r6Data.startsWith('1103')) {
                const dataHex = r6Data.substring(4);
                if (dataHex === '000000') {
                    counters = [0, 0, 0];
                } else {
                    counters = [0, 0, 0]; // Default fallback
                    console.warn("Complex R6 hex parsing needed:", dataHex);
                }
            } else {
                const hexDecoded = r6Data.match(/.{2}/g)?.map(byte => String.fromCharCode(parseInt(byte, 16))).join('') || '';
                if (hexDecoded.startsWith('[')) {
                    counters = JSON.parse(hexDecoded);
                } else {
                    counters = [0, 0, 0];
                }
            }
        } else {
            counters = JSON.parse(r6Data);
        }
    } catch (e) {
        console.error("Failed to parse R6 counters:", e, "Raw data:", (bountyBox as any).additionalRegisters?.R6 || bountyBox.R6);
        counters = [0, 0, 0];
    }
    
    console.log("Parsed counters:", counters);
    const contributed = BigInt(counters[0] || 0);
    
    // Get minimum contribution from R5 
    let minimumContribution: bigint;
    try {
        const r5Data = (bountyBox as any).additionalRegisters?.R5 || bountyBox.R5 || "0";
        console.log("Raw R5 data:", r5Data);
        
        if (/^[0-9a-fA-F]+$/.test(r5Data) && r5Data !== "0") {
            if (r5Data.startsWith('05')) {
                const valueHex = r5Data.substring(2);
                minimumContribution = valueHex ? BigInt(parseInt(valueHex, 16)) : BigInt(0);
            } else {
                minimumContribution = BigInt(parseInt(r5Data, 16));
            }
        } else {
            minimumContribution = BigInt(r5Data);
        }
    } catch (e) {
        console.error("Failed to parse R5 minimum contribution:", e);
        minimumContribution = BigInt(0);
    }
    
    console.log("Minimum contribution:", minimumContribution, "Contributed:", contributed);
    
    if (contributed < minimumContribution) {
        throw new Error("Minimum contribution threshold not reached");
    }

    // Extract proposal data using fixed function
    console.log("Full proposal box:", proposalBox);
    console.log("Proposal additionalRegisters:", (proposalBox as any).additionalRegisters);
    
    let proposerPubKeyHex: string;
    let proposalBountyId: string;
    
    // R4 - proposerPubKey (hex encoded)
    const r4Data = (proposalBox as any).additionalRegisters?.R4 || proposalBox.R4;
    console.log("Proposal R4 (proposerPubKey):", r4Data);
    
    if (r4Data && /^[0-9a-fA-F]+$/.test(r4Data)) {
        if (r4Data.startsWith('07')) {
            proposerPubKeyHex = r4Data.substring(2);
        } else {
            proposerPubKeyHex = r4Data;
        }
    } else if (typeof r4Data === 'object' && r4Data.serializedValue) {
        const serialized = r4Data.serializedValue;
        proposerPubKeyHex = serialized.startsWith('07') ? serialized.substring(2) : serialized;
    } else if (typeof r4Data === 'object' && r4Data.renderedValue) {
        proposerPubKeyHex = r4Data.renderedValue;
    } else {
        proposerPubKeyHex = r4Data || '';
    }
    
    // R5 - bountyId using the fixed decoder
    try {
        proposalBountyId = decodeProposalBountyId(proposalBox);
        console.log("Successfully decoded proposal bounty ID:", proposalBountyId);
    } catch (error) {
        console.error("Failed to decode proposal bounty ID:", error);
        throw new Error(`Failed to decode proposal bounty ID: ${error.message}`);
    }
    
    console.log("Extracted proposal data:", {
        proposerPubKeyHex,
        proposalBountyId,
        proposalBountyIdLength: proposalBountyId.length
    });

    // Validate bounty linkage
    let bountyTokens = bountyBox.tokens || [];
    if (!bountyTokens || bountyTokens.length === 0) {
        bountyTokens = (bountyBox as any).assets || [];
    }
    
    console.log("Bounty tokens found:", bountyTokens);
    
    if (!bountyTokens || bountyTokens.length === 0) {
        throw new Error("No tokens found in bounty box");
    }
    
    const aptToken = bountyTokens[0];
    if (!aptToken || !aptToken.tokenId) {
        throw new Error("Invalid APT token in bounty box");
    }
    
    // Compare token IDs (case-insensitive)
    const normalizedProposalId = proposalBountyId.toLowerCase();
    const normalizedBountyId = aptToken.tokenId.toLowerCase();
    
    if (normalizedProposalId !== normalizedBountyId) {
        console.log("Token ID mismatch details:", { 
            proposalBountyId: normalizedProposalId, 
            proposalBountyIdLength: normalizedProposalId.length,
            aptTokenId: normalizedBountyId,
            aptTokenIdLength: normalizedBountyId.length,
            match: normalizedProposalId === normalizedBountyId
        });
        throw new Error(`Proposal bounty ID (${normalizedProposalId}) does not match bounty contract token ID (${normalizedBountyId})`);
    }
    if (!proposalBountyId) {
        throw new Error("Proposal bounty ID not found or could not be decoded");
    }
    
    if (proposalBountyId !== aptToken.tokenId) {
        console.log("Token ID mismatch details:", { 
            proposalBountyId, 
            proposalBountyIdLength: proposalBountyId.length,
            aptTokenId: aptToken.tokenId,
            aptTokenIdLength: aptToken.tokenId.length,
            match: proposalBountyId === aptToken.tokenId
        });
        throw new Error(`Proposal bounty ID (${proposalBountyId}) does not match bounty contract token ID (${aptToken.tokenId})`);
    }

    // Calculate reward distribution
    const bountyValue = BigInt(bountyBox.value);
    const devFeePercent = BigInt(get_dev_fee());
    const minerFeeAmount = BigInt(1100000);
    const devFeeAmount = (bountyValue * devFeePercent) / BigInt(100);
    const proposerERG = bountyValue - devFeeAmount - minerFeeAmount;

    // Handle PFT token distribution
    const pftToken = bountyTokens.length > 1 ? bountyTokens[1] : null;
    let proposerPFT = 0n;
    let contributorsPFT = 0n;
    let contractContinues = false;

    console.log("Token analysis:", {
        totalTokens: bountyTokens.length,
        aptToken: aptToken ? { tokenId: aptToken.tokenId, amount: aptToken.amount } : null,
        pftToken: pftToken ? { tokenId: pftToken.tokenId, amount: pftToken.amount } : null
    });

    if (pftToken && pftToken.amount > 0n) {
        const totalPFT = BigInt(pftToken.amount);
        contributorsPFT = contributed; // PFT allocated to contributors
        proposerPFT = totalPFT - contributorsPFT;
        
        // Contract continues if there are remaining PFT for contributors to claim
        contractContinues = contributorsPFT > 0n;
    }

    console.log("Distribution calculation:", {
        bountyValue: bountyValue.toString(),
        devFeeAmount: devFeeAmount.toString(),
        proposerERG: proposerERG.toString(),
        proposerPFT: proposerPFT.toString(),
        contributorsPFT: contributorsPFT.toString(),
        contractContinues
    });

    const walletUtxos = (await ergo.get_utxos()) as Box<Amount>[];
    const changeAddress = await ergo.get_change_address();

    // Build outputs
    const outputs: OutputBuilder[] = [];

    // 1. Updated bounty contract (if continuing) or skip if fully depleted
    if (contractContinues) {
        const updatedBountyBox = new OutputBuilder(
            0n, // All ERG withdrawn
            bountyBox.ergoTree
        );
        
        // Keep APT token
        if (aptToken && aptToken.tokenId && aptToken.amount) {
            updatedBountyBox.addTokens({
                tokenId: aptToken.tokenId,
                amount: BigInt(aptToken.amount)
            });
        }
        
        // Keep remaining PFT for contributors
        if (contributorsPFT > 0n && pftToken && pftToken.tokenId) {
            updatedBountyBox.addTokens({
                tokenId: pftToken.tokenId,
                amount: contributorsPFT
            });
        }
        
        // Copy all registers unchanged
        updatedBountyBox.setAdditionalRegisters({
            R4: bountyBox.R4,
            R5: bountyBox.R5,
            R6: bountyBox.R6,
            R7: bountyBox.R7,
            R8: bountyBox.R8,
            R9: bountyBox.R9
        });
        
        outputs.push(updatedBountyBox);
    }

    // 2. Proposer reward box
    const proposerRewardBox = new OutputBuilder(
        proposerERG,
        proposerPubKeyHex
    );
    
    if (proposerPFT > 0n && pftToken && pftToken.tokenId) {
        proposerRewardBox.addTokens({
            tokenId: pftToken.tokenId,
            amount: proposerPFT
        });
    }
    outputs.push(proposerRewardBox);

    // 3. Dev fee box
    if (devFeeAmount > 0n) {
        const devFeeBox = new OutputBuilder(
            devFeeAmount,
            get_dev_contract_address()
        );
        outputs.push(devFeeBox);
    }

    // Build transaction with proposal as data input
    const transactionBuilder = new TransactionBuilder(await ergo.get_current_height())
        .from([bountyBox, ...walletUtxos])
        .withDataFrom([proposalBox]) // Proposal as data input for validation
        .sendChangeTo(changeAddress)
        .payFee(RECOMMENDED_MIN_FEE_VALUE);

    outputs.forEach(output => transactionBuilder.to(output));

    const unsignedTransaction = await transactionBuilder.build().toEIP12Object();

    try {
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Creator approval transaction ID:", transactionId);
        return transactionId;
    } catch (error) {
        console.error("Failed to approve proposal:", error);
        throw error;
    }
}

/**
 * Simple bounty claim (legacy path) - anyone can trigger, sends to creator
 * Uses isClaimBountyReward path
 */
export async function claimBountyReward(
    version: contract_version,
    bountyBox: BountyBox
): Promise<string | null> {
    if (!ergo) throw new Error("Ergo object is not available");

    // Validate minimum contribution threshold
    let counters: number[];
    try {
        const r6Data = (bountyBox as any).additionalRegisters?.R6 || bountyBox.R6 || "[0,0,0]";
        console.log("Raw R6 data for claim:", r6Data);
        
        if (r6Data.startsWith('[')) {
            counters = JSON.parse(r6Data);
        } else if (/^[0-9a-fA-F]+$/.test(r6Data)) {
            // Same hex decoding logic 
            if (r6Data.startsWith('1103') && r6Data === '1103000000') {
                counters = [0, 0, 0];
            } else {
                counters = [0, 0, 0]; // Fallback
            }
        } else {
            counters = JSON.parse(r6Data);
        }
    } catch (e) {
        console.error("Failed to parse R6 counters for claim:", e);
        counters = [0, 0, 0];
    }
    
    const contributed = BigInt(counters[0]);
    
    let minimumContribution: bigint;
    try {
        const r5Data = (bountyBox as any).additionalRegisters?.R5 || bountyBox.R5 || "0";
        if (/^[0-9a-fA-F]+$/.test(r5Data) && r5Data !== "0") {
            if (r5Data.startsWith('05')) {
                const valueHex = r5Data.substring(2);
                minimumContribution = valueHex ? BigInt(parseInt(valueHex, 16)) : BigInt(0);
            } else {
                minimumContribution = BigInt(parseInt(r5Data, 16));
            }
        } else {
            minimumContribution = BigInt(r5Data);
        }
    } catch (e) {
        console.error("Failed to parse R5 minimum contribution for claim:", e);
        minimumContribution = BigInt(0);
    }
    
    if (contributed < minimumContribution) {
        throw new Error("Minimum contribution threshold not reached");
    }

    // Get creator address from bounty details 
    const creatorDetails = decodeCreatorDetails(bountyBox);
    const creatorAddress = creatorDetails.address;

    // Calculate distribution
    const bountyValue = BigInt(bountyBox.value);
    const devFeePercent = BigInt(get_dev_fee());
    const minerFeeAmount = BigInt(1100000);
    const devFeeAmount = (bountyValue * devFeePercent) / BigInt(100);
    const creatorReward = bountyValue - devFeeAmount - minerFeeAmount;

    const walletUtxos = (await ergo.get_utxos()) as Box<Amount>[];
    const changeAddress = await ergo.get_change_address();

    const outputs: OutputBuilder[] = [];

    // 1. Creator reward
    outputs.push(new OutputBuilder(creatorReward, creatorAddress));

    // 2. Dev fee
    if (devFeeAmount > 0n) {
        outputs.push(new OutputBuilder(devFeeAmount, get_dev_contract_address()));
    }

    const transactionBuilder = new TransactionBuilder(await ergo.get_current_height())
        .from([bountyBox, ...walletUtxos])
        .sendChangeTo(changeAddress)
        .payFee(RECOMMENDED_MIN_FEE_VALUE);

    outputs.forEach(output => transactionBuilder.to(output));

    const unsignedTransaction = await transactionBuilder.build().toEIP12Object();

    try {
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);

        return transactionId;
    } catch (error) {
        console.error("Failed to claim bounty:", error);
        return null;
    }
}