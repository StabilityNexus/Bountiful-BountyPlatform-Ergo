// utils.ts
import { ErgoAddress, SByte, SColl, SConstant, SGroupElement } from "@fleet-sdk/core";
import { stringToBytes } from "@scure/base";
import { connected } from "../common/store";
import { get } from "svelte/store";

export function serializedToRendered(serializedValue: string): string {
    // Assuming the serialized value always starts with a pattern to strip (e.g., '0e')
    const patternToStrip = '0e';
    if (serializedValue.startsWith(patternToStrip)) {
        // Remove the pattern and return the hex string
        return serializedValue.substring(patternToStrip.length).substring(2);
    } else {
        // If the pattern does not exist at the start, return the original string
        return serializedValue.substring(2);
    }
}

export function hexToUtf8(hexString: string): string | null {
    try {
        if (hexString.length % 2 !== 0) {
            return null;
        }
    
        // Convierte la cadena hexadecimal a un array de bytes
        const byteArray = new Uint8Array(hexString.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    
        // Crea un nuevo TextDecoder para convertir el array de bytes a una cadena UTF-8
        const decoder = new TextDecoder('utf-8');
        const utf8String = decoder.decode(byteArray);
    
        return utf8String;
    } catch {
        return null;
    }
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

