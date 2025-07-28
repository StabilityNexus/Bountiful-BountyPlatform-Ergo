import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { sha256 } from "@fleet-sdk/crypto"; // if not already
import { hex } from "@fleet-sdk/crypto";

export type proposal_contract_version = "v1_0";

// Return structure
export interface ProposalContractDetails {
  address: string;
  ergoTree: string;
}

// ===== Contract Generator for v1_0 ===== //
function generate_proposal_contract_v1_0(): string {
  return `
{
  // === Register Definitions (ProposalBox) ===
  // R4: GroupElement - proposerPubKey
  // R5: Coll[Byte]   - bountyId
  // R6: Coll[Byte]   - metadataJson

  val proposerPK = SELF.R4[GroupElement].get
  sigmaProp(proveDlog(proposerPK))
}
  `;
}

// ===== Version Switcher ===== //
function handle_proposal_contract_generator(version: proposal_contract_version): () => string {
  switch (version) {
    case "v1_0":
      return generate_proposal_contract_v1_0;
    default:
      throw new Error("Invalid proposal contract version");
  }
}

// ===== Public API: Get Address and ErgoTree ===== //
export function get_proposal_contract_details(version: proposal_contract_version): ProposalContractDetails {
  const generator = handle_proposal_contract_generator(version);
  const script = generator();

  const ergoTree = compile(script, { version: 1, network: network_id });
  const current_network = network_id === "mainnet" ? Network.Mainnet : Network.Testnet;

  return {
    address: ergoTree.toAddress(current_network).toString(),
    ergoTree: ergoTree.toHex()
  };
}

// ===== Public API: Get Contract Hash ===== //
export function get_proposal_contract_hash(version: proposal_contract_version): string {
  const generator = handle_proposal_contract_generator(version);
  const script = generator();

  const ergoTree = compile(script, { version: 1, network: network_id });
  return uint8ArrayToHex(blake2b256(ergoTree.toBytes()));
}

export function get_proposal_contract_address(version: proposal_contract_version): string {
  const { address } = get_proposal_contract_details(version);
  return address;
}

export function get_proposal_contract_ergo_tree(version: proposal_contract_version): string {
  const { ergoTree } = get_proposal_contract_details(version);
  return ergoTree;
}

export function get_proposal_contract_script(version: proposal_contract_version): string {
  const generator = handle_proposal_contract_generator(version);
  return generator();
}

export function get_proposal_template_hash(version: proposal_contract_version): string {
  try {
    const generator = handle_proposal_contract_generator(version);
    const script = generator();

    const ergoTree = compile(script, { version: 1, network: network_id });

    return hex.encode(sha256(ergoTree.template.toBytes()));
  } catch (error) {
    console.error("Proposal template hash generation failed:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate proposal template hash: ${errorMessage}`);
  }
}
