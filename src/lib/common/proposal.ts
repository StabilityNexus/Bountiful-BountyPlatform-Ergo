import type { Box, Amount } from "@fleet-sdk/core";
import { ErgoAddress } from "@fleet-sdk/core";
import { parseErgoRegisterJson } from "../ergo/utils";

export interface Proposal {
    id: string;
    developer: string;
    summary: string;
    url: string;
    status: string;
    submittedAt: Date;
    boxId: string;
    bountyId?: string;
    rawContent: any;
    registers: Record<string, any>;
    box?: any;
}

export function hexToErgoAddress(hexString: string): string {
    try {
        // Remove '0x' prefix if present
        const cleanHex = hexString.replace(/^0x/, '');
        
        // Validate hex string
        if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
            console.error("Invalid hex characters in string:", cleanHex);
            return `Invalid hex format`;
        }
        
        // Ensure we have exactly 66 characters (33 bytes * 2) for compressed public key
        if (cleanHex.length !== 66) {
            console.error("Invalid hex length for public key:", cleanHex.length);
            return `Invalid key length (${cleanHex.length})`;
        }
        
        // Convert hex string to Uint8Array
        const bytes = new Uint8Array(cleanHex.length / 2);
        for (let i = 0; i < cleanHex.length; i += 2) {
            bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
        }
        
        // Create ErgoAddress from public key bytes
        const address = ErgoAddress.fromPublicKey(bytes);
        const addressString = address.toString();
        
        return addressString;
    } catch (error) {
        console.error("Failed to convert hex to address:", error);
        return `Conversion failed`;
    }
}

// New function to extract hex from binary data
export function extractHexFromBinary(binaryData: any): string | null {
    try {
        if (!binaryData) return null;
        
        // If it's already a string, check if it's hex
        if (typeof binaryData === 'string') {
            // Check if it's a hex string
            if (/^[0-9a-fA-F]+$/.test(binaryData) && binaryData.length === 66) {
                return binaryData;
            }
            
            // If it's binary string, convert to hex
            const hexString = Array.from(binaryData)
                .map((char: string) => char.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('');
            
            if (hexString.length === 66) {
                return hexString;
            }
        }
        
        // If it's a Uint8Array or similar array-like structure
        if (binaryData.length === 33) {
            return Array.from(binaryData as Uint8Array)
                .map((byte: number) => byte.toString(16).padStart(2, '0'))
                .join('');
        }
        
        return null;
    } catch (error) {
        console.error("Failed to extract hex from binary:", error);
        return null;
    }
}

// function to parse developer address from R4 register
export function parseDeveloperAddress(r4Register: any): string {
    if (!r4Register) return "Unknown";
    
    let hexValue = null;

    const serialized = r4Register.serializedValue;
    if (serialized && typeof serialized === 'string' && serialized.startsWith("07")) {
        // Remove prefix byte "07" used for GroupElement
        hexValue = serialized.substring(2);
    }
    
    if (!hexValue && r4Register.renderedValue) {
        const rendered = r4Register.renderedValue;
        if (typeof rendered === 'string' && /^[0-9a-fA-F]{66}$/.test(rendered)) {
            hexValue = rendered;
        } else {
            hexValue = extractHexFromBinary(rendered);
        }
    }

    if (!hexValue && r4Register.value) {
        hexValue = extractHexFromBinary(r4Register.value);
    }
 
    if (!hexValue) {
        for (const [key, value] of Object.entries(r4Register)) {
            if (key !== 'serializedValue' && key !== 'renderedValue' && key !== 'value') {
                const extracted = extractHexFromBinary(value);
                if (extracted && extracted.length === 66) {
                    hexValue = extracted;
                    break;
                }
            }
        }
    }
    
    // Convert to Ergo address
    if (hexValue && hexValue.length === 66) {
        try {
            const address = hexToErgoAddress(hexValue);
            return address;
        } catch (e) {
            console.error("Failed to decode developer address:", e);
            return "Address conversion failed";
        }
    }
    
    console.error("Could not extract valid hex from R4 register");
    return "Address extraction failed";
}

export function parseProposalBox(box: Box<Amount>, index: number): Proposal | null {
    const r6 = box.additionalRegisters?.R6 as { renderedValue?: string } | undefined;
    const rawHex = r6?.renderedValue ?? null;

    if (!rawHex) return null;

    try {
        const jsonString = parseErgoRegisterJson(rawHex)?.trim();
        const cleanedJson = jsonString?.replace(/^\u0000+|\u0000+$/g, "");

        if (!cleanedJson) return null;

        const parsed = JSON.parse(cleanedJson);

        const devRaw = box.additionalRegisters?.R4;
        const developer = parseDeveloperAddress(devRaw);

        const bountyIdRaw = box.additionalRegisters?.R5;
        const bountyId = bountyIdRaw
            ? parseErgoRegisterJson(bountyIdRaw as string) ?? ""
            : "";

        const ERGO_GENESIS = 1561939200000;
        const TIME_PER_BLOCK = 2 * 60 * 1000;
        
        let submittedAt: Date;
        if (box.creationHeight && box.creationHeight > 0) {
            const calculatedTime = ERGO_GENESIS + (box.creationHeight * TIME_PER_BLOCK);
            submittedAt = new Date(calculatedTime);
        } else if (parsed.timestamp) {
            submittedAt = new Date(parsed.timestamp);
        } else {
            submittedAt = new Date();
        }

        return {
            id: `${box.boxId}_${index}`,
            developer,
            summary: parsed.summary || parsed.title || "No summary",
            url: parsed.url || "",
            status: "pending",
            submittedAt,
            boxId: box.boxId,
            bountyId,
            rawContent: { ...parsed, bountyId },
            registers: box.additionalRegisters,
        };
    } catch (err) {
        console.error("Failed to parse proposal box:", err);
        return null;
    }
}

// Helper function to parse developer from rawContent if needed
export function parseDeveloperFromRawContent(rawContent: any): string {
    if (!rawContent) return "Unknown";
    
    try {
        let parsed;
        
        if (typeof rawContent === 'string') {
            parsed = JSON.parse(rawContent);
        } else if (typeof rawContent === 'object') {
            parsed = rawContent;
        } else {
            return "Unknown";
        }
        
        if (parsed.R4) {
            const result = parseDeveloperAddress(parsed.R4);
            return result;
        }
        
        return "Unknown";
    } catch (error) {
        console.error("Failed to parse developer from rawContent:", error);
        return "Unknown";
    }
}

// function to convert hex to address 
export function convertHexToErgoAddress(hexString: string): string {
    if (!hexString || hexString.length !== 66) return "Invalid hex";
    
    try {
        return hexToErgoAddress(hexString);
    } catch (error) {
        console.error("Failed to convert hex to address:", error);
        return "Conversion failed";
    }
}