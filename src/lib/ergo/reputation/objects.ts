import { type Amount, type Box } from "@fleet-sdk/core";

// --- CORE TYPES ---

export interface TypeNFT {
    tokenId: string;
    boxId: string;
    typeName: string;
    description: string;
    schemaURI: string;
    isRepProof: boolean;
    box: Box<Amount>|null;
}

export interface ReputationProof {
    token_id: string;
    type: TypeNFT;  // SELF identification of the proof type (by Type NFT)
    total_amount: number;
    blake_owner_script: string;
    owner_hash_serialized: string;
    can_be_spend: boolean;
    current_boxes: RPBox[];
    number_of_boxes: number;
    network: Network;
    data: object;
}

export interface RPBox {
    box: Box<Amount>;
    box_id: string;
    type: TypeNFT; 
    token_id: string;
    token_amount: number;
    object_pointer: string;
    is_locked: boolean;
    polarization: boolean;
    content: object|string|null;
}

export interface ReputationOpinion {
    tokenId: string;
    boxId: string;
    type: {
        tokenId: string;
        typeName: string;
        description: string;
    };
    isPositive: boolean; // Based on polarization field
    content: any;
    ownerAddress: string;
}

// --- ENUMS & UTILITIES ---

export enum Network {
    ErgoTestnet = "ergo-testnet",
    ErgoMainnet = "ergo"
}

export function total_burned_string(proof: ReputationProof): string {
    const totalValue = proof.current_boxes.reduce((accumulator, box) => {
        return accumulator + BigInt(box.box.value);
    }, 0n);

    const scale = 10n ** 9n;
    const integerPart = totalValue / scale;
    const fractionalPart = totalValue % scale;

    let paddedFraction = fractionalPart.toString().padStart(9, '0');
    paddedFraction = paddedFraction.replace(/0+$/, '');

    if (paddedFraction === '') {
        paddedFraction = '0';
    }

    return `${integerPart}.${paddedFraction}`;
}

export function total_burned(proof: ReputationProof): number {
    const totalValue = proof.current_boxes.reduce((accumulator, box) => {
        return accumulator + BigInt(box.box.value);
    }, 0n);

    return Number(totalValue);
}