import { type ConstantContent } from "../../lib/common/bounty";
import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { sha256, hex, blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { get_dev_contract_hash } from "./dev/dev_contract";
import { get_proposal_contract_hash } from "./proposal_contract";
import mintTemplate from "../../../contracts/mint.es?raw";
import dpgTemplate from "../../../contracts/digital_public_good.es?raw";
import reputationTemplate from "../../../contracts/reputation_token.es?raw";
import bountyV1_0Template from "../../../contracts/bounty_v1_0.es?raw";

export type contract_version = "v1_0" | "v1_1";

export interface BountyContractDetails {
    address: string;
    ergoTree: string;
}

export interface MintContractDetails {
    address: string;
    ergoTree: string;
}

// Helper function to inject variables into contract template
function injectContractVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        // Handle both patterns:
        // 1. ErgoScript string concatenation pattern `+key+`
        const backtickPattern = new RegExp(`\\\`\\+${key}\\+\\\``, 'g');
        result = result.replace(backtickPattern, String(value));
        
        // 2. Template literal pattern ${key}
        const templatePattern = new RegExp(`\\\$\\{${key}\\}`, 'g');
        result = result.replace(templatePattern, String(value));
    }
    return result;
}

function generate_contract_v1_0(
    owner_addr: string, 
    dev_fee_contract_bytes_hash: string, 
    dev_fee: number, 
    token_id: string, 
    proposal_contract_hash: string
): string {
    return injectContractVariables(bountyV1_0Template, {
        owner_addr,
        dev_fee_contract_bytes_hash,
        dev_fee,
        token_id,
        proposal_contract_hash
    });
}

function generate_contract_v1_1(
    owner_addr: string, 
    dev_fee_contract_bytes_hash: string, 
    dev_fee: number, 
    token_id: string, 
    proposal_contract_hash: string
): string {
    return injectContractVariables(bountyV1_0Template, {
        owner_addr,
        dev_fee_contract_bytes_hash,
        dev_fee,
        token_id,
        proposal_contract_hash
    });
}

function handle_contract_generator(version: contract_version) {
    switch (version) {
        case "v1_0":
            return generate_contract_v1_0;
        case "v1_1":
            return generate_contract_v1_1;
        default:
            throw new Error("Invalid contract version");
    }
}

export function get_address(constants: ConstantContent, version: contract_version) {

    // In case that dev_hash is undefined, we try to use the current contract hash. But the tx will fail if the hash is different.
    const proposal_contract_hash = get_proposal_contract_hash("v1_0");
    let contract = handle_contract_generator(version)(constants.creator, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.token_id, proposal_contract_hash);
    let ergoTree = compile(contract, {version: 1, network: network_id})

    let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return ergoTree.toAddress(network).toString();
}

export function get_bounty_contract_details(constants: ConstantContent, version: contract_version, token_id: string): BountyContractDetails {
    // Log the structure of ConstantContent for review during execution
    console.log("ConstantContent structure received by get_bounty_contract_details:", JSON.stringify(constants, null, 2));

    // In case that dev_hash is undefined, we try to use the current contract hash. But the tx will fail if the hash is different.
    const proposal_contract_hash = get_proposal_contract_hash("v1_0");
    let contract_script = handle_contract_generator(version)(constants.creator, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.token_id, proposal_contract_hash);
    // Ensure compile option version: 1 is used for the main bounty contract script
    let ergoTree = compile(contract_script, {version: 1, network: network_id});

    let current_network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    const address = ergoTree.toAddress(current_network).toString();
    const ergoTreeHex = ergoTree.toHex();
    return { address, ergoTree: ergoTreeHex };
}

export function get_template_hash(version: contract_version): string {
    try {
        const random_mainnet_addr = "9f3iPJTiciBYA6DnTeGy98CvrwyEhiP7wNrhDrQ1QeKPRhTmaqQ";
        const random_testnet_addr = "3WzH5yEJongYHmBJnoMs3zeK3t3fouMi3pigKdEURWcD61pU6Eve";
        const random_addr = network_id === "mainnet" ? random_mainnet_addr : random_testnet_addr;
        const random_dev_contract = uint8ArrayToHex(blake2b256("9a3d2f6b"));
        const random_proposal_contract = uint8ArrayToHex(blake2b256("9a3d2f6c"));

        const contract = handle_contract_generator(version)(random_addr, random_dev_contract, 5, "", random_proposal_contract);
        const ergoTree = compile(contract, {
            version: 1, 
            network: network_id
        });
        
        return hex.encode(sha256(ergoTree.template.toBytes()));
    } catch (error) {
        console.error("Template hash generation failed:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate template hash: ${errorMessage}`);
    }
}

function get_contract_hash(constants: ConstantContent, version: contract_version): string {
    try {
        const proposal_contract_hash = get_proposal_contract_hash("v1_0");
        const contract = handle_contract_generator(version)(
            constants.creator, 
            constants.dev_hash ?? get_dev_contract_hash(), 
            constants.dev_fee, 
            constants.token_id,
            proposal_contract_hash
        );
        
        const ergoTree = compile(contract, {
            version: 1, 
            network: network_id
        });
        
        return uint8ArrayToHex(blake2b256(ergoTree.toBytes()));
    } catch (error) {
        console.error("Contract hash generation failed:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate contract hash: ${errorMessage}`);
    }
}

export function mint_contract_address(constants: ConstantContent, version: contract_version): string {
    try {
        const contract_bytes_hash = get_contract_hash(constants, version);
        const template = mintTemplate;
        
        const minting_script = injectContractVariables(template, {
            contract_bytes_hash
        });
        
        let ergoTree = compile(minting_script, {version: 1, network: network_id});
        let current_network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
        const address = ergoTree.toAddress(current_network).toString();
        
        return address;
    }
    catch (error) {
        console.error("Mint contract details generation failed:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate mint contract details: ${errorMessage}`);
    }
}

export function mint_contract_details(constants: ConstantContent, version: contract_version): MintContractDetails {
    try {
        const contract_bytes_hash = get_contract_hash(constants, version);
        const template = mintTemplate;
        
        const minting_script = injectContractVariables(template, {
            contract_bytes_hash
        });
        
        let ergoTree = compile(minting_script, {version: 1, network: network_id});
        let current_network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
        const address = ergoTree.toAddress(current_network).toString();
        const ergoTreeHex = ergoTree.toHex();
        
        return { address, ergoTree: ergoTreeHex };
    }
    catch (error) {
        console.error("Mint contract details generation failed:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate mint contract details: ${errorMessage}`);
    }
}

// Reputation System Contracts
export function getDigitalPublicGoodTemplateHash(): string {
    const template = dpgTemplate;
    const ergoTree = compile(template, { version: 1, network: network_id });
    return hex.encode(sha256(ergoTree.template.toBytes()));
}

function getReputationProofErgoTree(digitalPublicGoodHash: string) {
    const template = reputationTemplate;
    const contract = injectContractVariables(template, {
        digitalPublicGoodHash: digitalPublicGoodHash  
    });
    return compile(contract, { version: 1, network: network_id });
}

export function getReputationProofAddress(): string {
    const dpgHash = getDigitalPublicGoodTemplateHash();
    const ergoTree = getReputationProofErgoTree(dpgHash);
    const network = network_id === "mainnet" ? Network.Mainnet : Network.Testnet;
    return ergoTree.toAddress(network).toString();
}

export function getReputationProofErgoTreeHex(): string {
    const dpgHash = getDigitalPublicGoodTemplateHash();
    const ergoTree = getReputationProofErgoTree(dpgHash);
    return ergoTree.toHex();
}

export function getReputationProofTemplateHash(): string {
    const dpgHash = getDigitalPublicGoodTemplateHash();
    const ergoTree = getReputationProofErgoTree(dpgHash);
    return hex.encode(sha256(ergoTree.template.toBytes()));
}