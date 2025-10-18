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
  // ===== Proposal Contract Description ===== //
  // Name: Bountiful Proposal Contract 
  // Description: Allows bounty creators to approve proposals and transfer rewards
  // Version: 1.3.0 - Fixed signature/boolean separation
  // Author: Bountiful Team

  val proposerPK = SELF.R4[GroupElement].get
  val bountyId = SELF.R5[Coll[Byte]].get
  val metadataJson = SELF.R6[Coll[Byte]].get
  val bountyCreatorProp = SELF.R7[SigmaProp].get
  val status = SELF.R8[Int].get

  val isPending = status == 0
  val isApproved = status == 1
  val isRejected = status == 2
  val isDisputed = status == 3

  // Helper function to check if a box proposition matches a SigmaProp
  def isSigmaPropEqualToBoxProp(propAndBox: (SigmaProp, Box)): Boolean = {
    val prop: SigmaProp = propAndBox._1
    val box: Box = propAndBox._2
    val propBytes: Coll[Byte] = prop.propBytes
    val treeBytes: Coll[Byte] = box.propositionBytes

    if (treeBytes(0) == 0) {
      (treeBytes == propBytes)
    } else {
      val offset = if (treeBytes.size > 127) 3 else 2
      (propBytes.slice(1, propBytes.size) == treeBytes.slice(offset, treeBytes.size))
    }
  }

  val isDisputeAction = {
    allOf(Coll(
      (isPending || isApproved || isRejected),
      OUTPUTS(0).R4[GroupElement].get == proposerPK,
      OUTPUTS(0).R5[Coll[Byte]].get == bountyId,
      OUTPUTS(0).R6[Coll[Byte]].get == metadataJson,
      OUTPUTS(0).R7[SigmaProp].get == bountyCreatorProp,
      OUTPUTS(0).value == SELF.value,
      OUTPUTS(0).propositionBytes == SELF.propositionBytes,
      OUTPUTS(0).R8[Int].get == 3
    ))
  }

  val isMaintenanceAction = {
    allOf(Coll(
      isPending,
      OUTPUTS(0).R4[GroupElement].get == proposerPK,
      OUTPUTS(0).R5[Coll[Byte]].get == bountyId,
      OUTPUTS(0).R7[SigmaProp].get == bountyCreatorProp,
      OUTPUTS(0).value == SELF.value,
      OUTPUTS(0).propositionBytes == SELF.propositionBytes,
      OUTPUTS(0).R8[Int].get == 0
    ))
  }

  val isApprovalAction = {
    allOf(Coll(
      (isPending || isRejected),
      OUTPUTS(0).R4[GroupElement].get == proposerPK,
      OUTPUTS(0).R5[Coll[Byte]].get == bountyId,
      OUTPUTS(0).R6[Coll[Byte]].get == metadataJson,
      OUTPUTS(0).R7[SigmaProp].get == bountyCreatorProp,
      OUTPUTS(0).value == SELF.value,
      OUTPUTS(0).propositionBytes == SELF.propositionBytes,
      OUTPUTS(0).R8[Int].get == 1,
      bountyCreatorProp
    ))
  }

  val actions = anyOf(Coll(
    isDisputeAction,
    isMaintenanceAction,
    isApprovalAction
  ))

  val validSetup = allOf(Coll(
    bountyId.size > 0,
    metadataJson.size > 0
  ))

  sigmaProp(validSetup && actions)
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
