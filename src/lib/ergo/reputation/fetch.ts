import { Network, type RPBox, type ReputationProof, type TypeNFT } from "$lib/ergo/reputation/objects";
import { hexToBytes, hexToUtf8, serializedToRendered, uint8ArrayToHex } from "$lib/ergo/utils";
import { get } from "svelte/store";
import { types, connected, judges } from "$lib/common/store";
import { explorer_uri, CACHE_DURATION_MS } from "$lib/ergo/envs";
import { getReputationProofErgoTreeHex, getReputationProofTemplateHash } from "$lib/ergo/contract";
import { type Amount, type Box, ErgoAddress, SColl, SByte } from "@fleet-sdk/core";
import { blake2b256 } from "@fleet-sdk/crypto";
import { JUDGE } from "./types";

// Type for API response boxes (from explorer)
interface AdditionalRegister {
    serializedValue: string;
    renderedValue: string;
}

interface ApiBoxResponse {
    boxId: string;
    ergoTree: string;
    assets: Array<{ tokenId: string; amount: string }>;
    additionalRegisters: {
        R4?: AdditionalRegister;
        R5?: AdditionalRegister;
        R6?: AdditionalRegister;
        R7?: AdditionalRegister;
        R8?: AdditionalRegister;
        R9?: AdditionalRegister;
    };
    [key: string]: any; // for other box properties
}

const ergo_tree = getReputationProofErgoTreeHex();
const ergo_tree_hash = getReputationProofTemplateHash();

function parseR6(r6RenderedValue: string): { isLocked: boolean; totalSupply: number } {
    try {
        const [lockedStr, supplyStr] = r6RenderedValue.replace(/[()\[\]]/g, '').split(',');
        return { isLocked: lockedStr.trim() === 'true', totalSupply: Number(supplyStr.trim()) };
    } catch (e) {
        console.warn("Could not parse R6 tuple, returning defaults:", r6RenderedValue, e);
        return { isLocked: true, totalSupply: 0 };
    }
}

export async function fetchTypeNfts(force: boolean = false): Promise<Map<string, TypeNFT>> {
    try {
        if (!force && (Date.now() - get(types).last_fetch < CACHE_DURATION_MS)) {
            return get(types).data;
        }

        const typeNftBoxResponse = await fetch(`${explorer_uri}/api/v1/boxes/byTokenId/${JUDGE}`);
        if (!typeNftBoxResponse.ok) {
            alert(`Could not fetch the Type NFT box for JUDGE. Status: ${typeNftBoxResponse.status}.`);
            return new Map();
        }
        
        const responseData = await typeNftBoxResponse.json();
        if (!responseData.items || responseData.items.length === 0) {
            alert(`No NFT box found for type JUDGE.`);
            return new Map();
        }
        
        const box: ApiBoxResponse = responseData.items[0];
        const judgeType: TypeNFT = {
            tokenId: box.assets[0].tokenId,
            boxId: box.boxId,
            typeName: hexToUtf8(box.additionalRegisters.R4?.renderedValue || '') ?? "Judge",
            description: hexToUtf8(box.additionalRegisters.R5?.renderedValue || '') ?? "",
            schemaURI: hexToUtf8(box.additionalRegisters.R6?.renderedValue || '') ?? "",
            isRepProof: box.additionalRegisters.R7?.renderedValue === 'true',
            box: box as any
        };
        
        const typesMap = new Map([[judgeType.tokenId, judgeType]]);
        types.set({data: typesMap, last_fetch: Date.now()});
        console.log(`Successfully fetched and stored Judge Type NFT.`);
        return get(types).data;

    } catch (e: any) {
        console.error("Failed to fetch and store types:", e);
        types.set({data: new Map(), last_fetch: 0});
        return get(types).data;
    }
}

function createRPBoxFromApiBox(box: ApiBoxResponse, tokenId: string, availableTypes: Map<string, TypeNFT>): RPBox | null {
    if (box.ergoTree !== ergo_tree) return null;
    if (!box.assets?.length || !box.additionalRegisters.R4 || !box.additionalRegisters.R6 || !box.additionalRegisters.R7) return null;

    const type_nft_id_for_box = box.additionalRegisters.R4.renderedValue ?? "";
    let typeNftForBox = availableTypes.get(type_nft_id_for_box);
    if (!typeNftForBox) {
        typeNftForBox = { tokenId: type_nft_id_for_box, boxId: '', typeName: "Unknown Type", description: "Metadata not found", schemaURI: "", isRepProof: false, box: null };
    }
    
    let box_content: string|object|null = {};
    try {
        const rawValue = box.additionalRegisters.R9?.renderedValue;
        if (rawValue) {
            const potentialString = hexToUtf8(rawValue);
            try {
                box_content = JSON.parse(potentialString ?? "");
            } catch (jsonError) {
                box_content = potentialString;
            }
        }
    } catch (error) {
        box_content = {};
    }
    
    const object_pointer_for_box = box.additionalRegisters.R5?.renderedValue ?? "";

    return {
        box: box as any as Box<Amount>, // Type assertion for compatibility
        box_id: box.boxId,
        type: typeNftForBox,
        token_id: tokenId,
        token_amount: Number(box.assets[0].amount),
        object_pointer: object_pointer_for_box,
        is_locked: parseR6(box.additionalRegisters.R6.renderedValue).isLocked,
        polarization: box.additionalRegisters.R8?.renderedValue === 'true',
        content: box_content,
    };
}

export async function fetchAllJudges(ergo: any, force: boolean = false): Promise<Map<string, ReputationProof>> {
    if (!force && (Date.now() - get(judges).last_fetch < CACHE_DURATION_MS)) {
        console.log("Using cached Judges (data is fresh).");
        return get(judges).data;
    }

    const proofs = new Map<string, ReputationProof>();
    const tokenIdsToFetch = new Set<string>();
    
    let registers: { [key: string]: any } = { "R4": JUDGE };

    try {
        let offset = 0, limit = 100, moreDataAvailable = true;
        
        while (moreDataAvailable) {
            const url = `${explorer_uri}/api/v1/boxes/unspent/search?offset=${offset}&limit=${limit}`;
            const final_body = { "ergoTreeTemplateHash": ergo_tree_hash, "registers": registers };
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(final_body) });

            if (!response.ok) {
                moreDataAvailable = false;
                continue;
            }
            const json_data = await response.json();
            if (!json_data.items || json_data.items.length === 0) {
                moreDataAvailable = false;
                continue;
            }
            for (const box of json_data.items as Box<Amount>[]) {
                if (box.ergoTree === ergo_tree && box.assets?.length > 0) {
                    tokenIdsToFetch.add(box.assets[0].tokenId);
                }
            }
            offset += limit;
        }
    } catch (error) {
        console.error('An error occurred during the judge search phase:', error);
        return new Map();
    }
    
    if (tokenIdsToFetch.size > 0) {
        for (const tokenId of tokenIdsToFetch) {
            try {
                const proof = await fetchReputationProofByTokenId(tokenId, ergo);
                if (proof) {
                    proofs.set(tokenId, proof);
                }
            } catch (e) {
                console.error(`Failed to fetch or process proof for token ID ${tokenId}:`, e);
            }
        }
    }
    
    judges.set({data: proofs, last_fetch: Date.now()});
    console.log(`Successfully fetched and stored ${proofs.size} Judges.`);
    return proofs;
}

export async function fetchReputationProofByTokenId(tokenId: string, ergo: any): Promise<ReputationProof | null> {
    const availableTypes = await fetchTypeNfts();
    try {
        const resp = await fetch(`${explorer_uri}/api/v1/boxes/unspent/byTokenId/${tokenId}`);
        if (!resp.ok) return null;

        const data = await resp.json();
        const items: ApiBoxResponse[] = data.items || [];
        if (items.length === 0) return null;

        const rpBoxes = items.filter(b => b.ergoTree === ergo_tree);
        if (rpBoxes.length === 0) return null;

        const primaryBox = rpBoxes[0];
        const r6_parsed = parseR6(primaryBox.additionalRegisters.R6?.renderedValue ?? "");
        const owner_hash_serialized = primaryBox.additionalRegisters.R7?.serializedValue ?? "";

        let userR7SerializedHex: string | null = null;
        const change_address = get(connected) && ergo ? await ergo.get_change_address() : null;
        if (change_address) {
            const userAddress = ErgoAddress.fromBase58(change_address);
            const propositionBytes = hexToBytes(userAddress.ergoTree);
            if (propositionBytes) {
                const hashedProposition = blake2b256(propositionBytes);
                userR7SerializedHex = SColl(SByte, hashedProposition).toHex();
            }
        }

        const proof: ReputationProof = {
            token_id: tokenId,
            type: { tokenId: "", boxId: '', typeName: "N/A", description: "...", schemaURI: "", isRepProof: false, box: null },
            total_amount: r6_parsed.totalSupply,
            blake_owner_script: serializedToRendered(owner_hash_serialized),
            owner_hash_serialized,
            can_be_spend: userR7SerializedHex ? owner_hash_serialized === userR7SerializedHex : false,
            current_boxes: [],
            number_of_boxes: 0,
            network: Network.ErgoMainnet,
            data: {}
        };

        for (const box of items) {
            const rpBox = createRPBoxFromApiBox(box, tokenId, availableTypes);
            if (rpBox) {
                if (rpBox.object_pointer === proof.token_id) {
                    proof.type = rpBox.type;
                }
                proof.current_boxes.push(rpBox);
                proof.number_of_boxes += 1;
            }
        }
        return proof;
    } catch (error) {
        console.error(`Error fetching reputation proof for token ${tokenId}:`, error);
        return null;
    }
}

export async function fetchJudgeProofByAddress(address: string, ergo: any): Promise<ReputationProof | null> {
    try {
        const userAddress = ErgoAddress.fromBase58(address);
        const propositionBytes = hexToBytes(userAddress.ergoTree);
        if (!propositionBytes) return null;

        const hashedProposition = uint8ArrayToHex(blake2b256(propositionBytes));
        
        const url = `${explorer_uri}/api/v1/boxes/unspent/search`;
        const body = {
            "ergoTreeTemplateHash": ergo_tree_hash,
            "registers": {
                "R7": hashedProposition,
                "R4": JUDGE
            }
        };

        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) return null;

        const json_data = await response.json();
        if (!json_data.items || json_data.items.length === 0) return null;

        const box: ApiBoxResponse = json_data.items[0];
        if (box.assets && box.assets.length > 0) {
            const tokenId = box.assets[0].tokenId;
            return await fetchReputationProofByTokenId(tokenId, ergo);
        }
        return null;
    } catch (error) {
        console.error(`Error fetching judge proof for address ${address}:`, error);
        return null;
    }
}