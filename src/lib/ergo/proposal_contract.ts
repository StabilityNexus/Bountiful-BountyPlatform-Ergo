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
  // Name: Bountiful Proposal Contract with Creator Approval
  // Description: Allows bounty creators to approve proposals and transfer rewards
  // Version: 1.1.0
  // Author: Bountiful Team

  // ===== Register Definitions (ProposalBox) ===
  // R4: GroupElement - proposerPubKey (proposer's public key for receiving rewards)
  // R5: Coll[Byte]   - bountyId (references the bounty this proposal is for)
  // R6: Coll[Byte]   - metadataJson (proposal details, description, solution, etc.)
  // R7: SigmaProp    - bountyCreatorProp (bounty creator's proposition for approval)

  val proposerPK = SELF.R4[GroupElement].get
  val bountyId = SELF.R5[Coll[Byte]].get
  val metadataJson = SELF.R6[Coll[Byte]].get
  val bountyCreatorProp = SELF.R7[SigmaProp].get

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

  // Validate that the bounty contract being referenced exists in data inputs
  val bountyContractExists = {
    CONTEXT.dataInputs.exists({ (dataInput: Box) =>
      dataInput.tokens.size > 0 && dataInput.tokens(0)._1 == bountyId
    })
  }

  // Get the bounty contract from data inputs
  val bountyContract = CONTEXT.dataInputs.filter({ (dataInput: Box) =>
    dataInput.tokens.size > 0 && dataInput.tokens(0)._1 == bountyId
  })(0)

  // Validate minimum contribution threshold is met on the bounty
  val minimumContributionReached = {
    val minimumContributionThreshold = bountyContract.R5[Long].get
    val contributedCounter = bountyContract.R6[Coll[Long]].get(0)
    contributedCounter >= minimumContributionThreshold
  }

  // Action: Creator approves proposal and transfers rewards
  val isCreatorApproval = {
    // Verify the bounty creator is signing this transaction
    val creatorSignature = bountyCreatorProp

    // Calculate reward distribution
    val minerFeeAmount = 1100000L
    val devFee = 5 // This should match the bounty contract's dev fee
    val bountyContractValue = bountyContract.value
    val devFeeAmount = bountyContractValue * devFee / 100
    val proposerReward = bountyContractValue - devFeeAmount - minerFeeAmount

    // Verify proposer receives correct reward amount
    val correctProposerReward = {
      val proposerOutput = OUTPUTS.filter({ (output: Box) =>
        val propAndBox = (sigmaProp(proveDlog(proposerPK)), output)
        isSigmaPropEqualToBoxProp(propAndBox)
      })
      
      proposerOutput.size == 1 && proposerOutput(0).value >= proposerReward
    }

    // Verify dev fee is paid correctly (if applicable)
    val correctDevFee = {
      if (devFeeAmount > 0) {
        val devOutputs = OUTPUTS.filter({ (output: Box) =>
          // Check if output goes to dev fee address (implement based on your dev fee logic)
          output.value == devFeeAmount
        })
        devOutputs.size >= 1
      } else {
        true
      }
    }

    // Verify PFT tokens are distributed correctly
    val correctTokenDistribution = {
      if (bountyContract.tokens.size > 1) {
        val pftTokenId = bountyContract.tokens(1)._1
        val availablePFT = bountyContract.tokens(1)._2
        
        // Calculate PFT distribution between proposer and APT holders
        val contributedAmount = bountyContract.R6[Coll[Long]].get(0)
        val totalPFT = availablePFT
        
        // Proposer gets remaining PFT not allocated to APT holders
        val proposerPFT = totalPFT - contributedAmount
        
        if (proposerPFT > 0) {
          val proposerTokenOutput = OUTPUTS.exists({ (output: Box) =>
            val propAndBox = (sigmaProp(proveDlog(proposerPK)), output)
            isSigmaPropEqualToBoxProp(propAndBox) && 
            output.tokens.exists({ (token: (Coll[Byte], Long)) => token._1 == pftTokenId }) &&
            output.tokens.filter({ (token: (Coll[Byte], Long)) => token._1 == pftTokenId })(0)._2 >= proposerPFT
          })
          proposerTokenOutput
        } else {
          true
        }
      } else {
        true
      }
    }

    allOf(Coll(
      creatorSignature,
      minimumContributionReached,
      correctProposerReward,
      correctDevFee,
      correctTokenDistribution
    ))
  }

  // Action: Regular proposal operations (view, update metadata if needed)
  val isProposalMaintenance = {
    // Allow proposer to update their proposal before approval
    val proposerSignature = sigmaProp(proveDlog(proposerPK))
    
    // Ensure bounty reference and core data remain unchanged
    val sameCore = allOf(Coll(
      OUTPUTS(0).R4[GroupElement].get == proposerPK,
      OUTPUTS(0).R5[Coll[Byte]].get == bountyId,
      OUTPUTS(0).R7[SigmaProp].get == bountyCreatorProp,
      OUTPUTS(0).value == SELF.value,
      OUTPUTS(0).propositionBytes == SELF.propositionBytes
    ))

    proposerSignature && sameCore
  }

  // Main validation logic
  val validActions = anyOf(Coll(
    isCreatorApproval,
    isProposalMaintenance
  ))

  // Ensure bounty contract exists and is valid
  val validSetup = allOf(Coll(
    bountyContractExists,
    bountyId.size > 0,
    metadataJson.size > 0
  ))

  sigmaProp(validSetup && validActions)
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
