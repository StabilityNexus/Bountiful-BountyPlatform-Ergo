// utils.ts
import { ErgoAddress, SByte, SColl, SConstant, SGroupElement, type Box, type Amount } from "@fleet-sdk/core";
import { stringToBytes } from "@scure/base";
import { connected } from "../common/store";
import { get } from "svelte/store";

export function serializedToRendered(serializedValue: string): string {
    if (!serializedValue) return "";
    // Assuming the serialized value always starts with a pattern to strip (e.g., '0e')
    const patternToStrip = '0e';
    if (serializedValue.startsWith(patternToStrip)) {
        // Remove the pattern and return the hex string
        const lengthHex = serializedValue.substring(2, 4);
        const length = parseInt(lengthHex, 16);
        return serializedValue.substring(4, 4 + (length * 2));
    } else {
        // Fallback for other formats
        return serializedValue;
    }
}

export function hexToUtf8(hexString: string): string | null {
    try {
        if (!hexString || hexString.length % 2 !== 0) {
            return null;
        }
        const bytesMatch = hexString.match(/.{1,2}/g);
        if (!bytesMatch) {
            return null;
        }
        const byteArray = new Uint8Array(bytesMatch.map(byte => parseInt(byte, 16)));
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(byteArray);
    } catch {
        return null;
    }
}

export function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        const hexSlice = hex.substring(i * 2, i * 2 + 2);
        if (hexSlice) {
            bytes[i] = parseInt(hexSlice, 16);
        }
    }
    return bytes;
}

export function parseBox(box: any): Box<Amount> {
    return {
        ...box,
        value: BigInt(box.value),
        assets: box.assets.map((asset: any) => ({
            ...asset,
            amount: BigInt(asset.amount)
        })),
    };
}


export function generate_pk_proposition(wallet_pk: string): string {
    const pk = ErgoAddress.fromBase58(wallet_pk).getPublicKeys()[0];
    const encodedProp = SGroupElement(pk);
    return encodedProp.toHex();
}

export function SString(value: string): string {
    return SConstant(SColl(SByte, stringToBytes('utf8', value)));
}

export function stringToRendered(value: string): string {
    return serializedToRendered(SString(value));
}

export async function is_local_addr(value: string): Promise<boolean> {
    if (!get(connected)) return false;
    if (!window.ergo) return false;
    const addr = await window.ergo.get_change_address();
    return stringToRendered(generate_pk_proposition(addr)).substring(4,) === stringToRendered(value);
}

export function uint8ArrayToHex(array: Uint8Array): string { 
    return [...new Uint8Array(array)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

export function parseErgoRegisterJson(rawHex: string): string | null {
    try {
        if (!rawHex || typeof rawHex !== "string") return null;

        // Serialized Ergo values for Coll[Byte] typically start with 0e
        // Format: 0eXX + actual hex body
        if (rawHex.startsWith("0e")) {
            const lengthByte = parseInt(rawHex.slice(2, 4), 16); // number of bytes
            const hexBody = rawHex.slice(4, 4 + lengthByte * 2);

            const byteArray = new Uint8Array(hexBody.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
            const decoded = new TextDecoder().decode(byteArray);
            return decoded;
        }

        // Optional fallback: some edge cases (e.g., legacy serialized string starts with "0c")
        if (rawHex.startsWith("0c")) {
            const hexBody = rawHex.slice(2);
            const byteArray = new Uint8Array(hexBody.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
            return new TextDecoder().decode(byteArray);
        }

        // Default fallback
        return null;
    } catch (e) {
        console.error("Failed to decode Ergo register from hex:", rawHex, e);
        return null;
    }
}

export function getRegisterUtf8Value(register: any): string | null {
    if (typeof register === 'object' && 'renderedValue' in register) {
        return register.renderedValue;
    }

    if (typeof register === 'string') {
        return parseErgoRegisterJson(register);
    }

    return null;
}

export function toBytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}