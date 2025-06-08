import { type ConstantContent } from "../../lib/common/bounty";
import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { sha256, hex, blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { get_dev_contract_hash } from "./dev/dev_contract";

// Define contract version type locally or import from a central definition if preferred
export type contract_version = "v1_0" | "v1_1";

// Define return type interfaces
export interface BountyContractDetails {
    address: string;
    ergoTree: string;
}

export interface MintContractDetails {
    address: string;
    ergoTree: string;
}

function generate_contract_v1_0(owner_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number) {
    return `
{
// ===== Contract Description ===== //
// Name: Bountiful Bounty Platform Contract
// Description: Enables bounty creation, submission management, and creator-based reward distribution
// Version: 1.0.0
// Author: Bountiful Team

// ===== Box Contents ===== //
// Tokens
// 1. (id, amount)
//    BBT (Bountiful Bounty Token); Identifies the bounty and holds the allocated reward.
//    where:
//       id      The unique bounty identifier
//       amount  Always 1 for a single bounty.

// Registers
// R4: Int                  Block height (deadline) for the bounty
// R5: Long                 Minimum number of submissions required
// R6: Coll[Long]           [Total Submissions, Accepted Submissions, Rejected Submissions]
// R7: Long                 Reward amount in ERG
// R8: Coll[Byte]           Creator's public key (33 bytes)
// R9: Coll[Byte]           Encoded JSON containing: bounty metadata, submissions data, judgment data

// ===== Helper Functions ===== //
def isSigmaPropEqualToBoxProp(propAndBox: (SigmaProp, Box)): Boolean = {
  val prop: SigmaProp = propAndBox._1
  val box: Box = propAndBox._2
  val propBytes: Coll[Byte] = prop.propBytes
  val treeBytes: Coll[Byte] = box.propositionBytes

  if (treeBytes(0) == 0) {
      (treeBytes == propBytes)
  } else {
      // offset = 1 + <number of VLQ encoded bytes to store propositionBytes.size>
      val offset = if (treeBytes.size > 127) 3 else 2
      (propBytes.slice(1, propBytes.size) == treeBytes.slice(offset, treeBytes.size))
  }
}

// ===== Box Data Extraction ===== //
val selfId = SELF.tokens(0)._1
val selfBountyToken = SELF.tokens(0)._2
val selfValue = SELF.value
val selfDeadline = SELF.R4[Int].get
val selfMinSubmissions = SELF.R5[Long].get
val selfSubmissionStats = SELF.R6[Coll[Long]].get
val selfTotalSubmissions = selfSubmissionStats(0)
val selfAcceptedSubmissions = selfSubmissionStats(1)
val selfRejectedSubmissions = selfSubmissionStats(2)
val selfRewardAmount = SELF.R7[Long].get
val creatorPubKey = SELF.R8[Coll[Byte]].get
val selfBountyData = SELF.R9[Coll[Byte]].get
val selfScript = SELF.propositionBytes

// Parse metadata - ensure sufficient data length
val submissionsRoot = if (selfBountyData.size >= 32) selfBountyData.slice(0, 32) else Coll[Byte]()
val judgmentsRoot = if (selfBountyData.size >= 64) selfBountyData.slice(32, 64) else Coll[Byte]()
val metadataRoot = if (selfBountyData.size >= 96) selfBountyData.slice(64, 96) else Coll[Byte]()

// Creator SigmaProp
val creatorProp = proveDlog(decodePoint(creatorPubKey))

// Output box reference for validation
val outBox = if (OUTPUTS.size > 0) OUTPUTS(0) else SELF

// ===== Box Replication Validation ===== //
val isBoxReplication = {
  val sameId = outBox.tokens.size > 0 && (selfId == outBox.tokens(0)._1 && selfBountyToken == outBox.tokens(0)._2)
  val sameDeadline = outBox.R4[Int].isDefined && selfDeadline == outBox.R4[Int].get
  val sameMinSubmissions = outBox.R5[Long].isDefined && selfMinSubmissions == outBox.R5[Long].get
  val sameCreatorPubKey = outBox.R8[Coll[Byte]].isDefined && creatorPubKey == outBox.R8[Coll[Byte]].get
  val sameScript = selfScript == outBox.propositionBytes
  
  allOf(Coll(sameId, sameDeadline, sameMinSubmissions, sameCreatorPubKey, sameScript))
}

// ===== Actions ===== //

// Action: Submit a solution
val isSubmitSolution = {
  val beforeDeadline = HEIGHT <= selfDeadline

  val correctSubmissionIncrement = outBox.R6[Coll[Long]].isDefined && {
    val newStats = outBox.R6[Coll[Long]].get
    newStats.size >= 3 && {
      val newTotal = newStats(0)
      val newAccepted = newStats(1)
      val newRejected = newStats(2)
      newTotal == selfTotalSubmissions + 1 && 
      newAccepted == selfAcceptedSubmissions &&
      newRejected == selfRejectedSubmissions
    }
  }

  val updatedBountyData = outBox.R9[Coll[Byte]].isDefined && {
    val newBountyData = outBox.R9[Coll[Byte]].get
    newBountyData.size >= 96 && {
      val newSubmissionsRoot = newBountyData.slice(0, 32)
      submissionsRoot != newSubmissionsRoot &&
      newBountyData.slice(32, 64) == judgmentsRoot &&
      newBountyData.slice(64, 96) == metadataRoot
    }
  }
  
  val valueUnchanged = selfValue == outBox.value
  
  allOf(Coll(
    beforeDeadline,
    correctSubmissionIncrement,
    updatedBountyData,
    isBoxReplication,
    valueUnchanged
  ))
}

// Action: Judge a submission
val isJudgeSubmission = {
  val checkValidJudgeDataInputs = CONTEXT.dataInputs.size == 1 &&
                             CONTEXT.dataInputs(0).R4[Boolean].isDefined &&
                             CONTEXT.dataInputs(0).R5[Int].isDefined

  val decision = if (checkValidJudgeDataInputs) CONTEXT.dataInputs(0).R4[Boolean].get else false

  val correctJudgmentUpdateEval = if (checkValidJudgeDataInputs) {
      outBox.R6[Coll[Long]].isDefined && {
        val newStats = outBox.R6[Coll[Long]].get
        newStats.size >= 3 && {
          val newTotal = newStats(0)
          val newAccepted = newStats(1)
          val newRejected = newStats(2)
          val totalUnchanged = newTotal == selfTotalSubmissions
          val statsUpdated = if (decision) {
            newAccepted == selfAcceptedSubmissions + 1 && newRejected == selfRejectedSubmissions
          } else {
            newAccepted == selfAcceptedSubmissions && newRejected == selfRejectedSubmissions + 1
          }
          totalUnchanged && statsUpdated
        }
      }
  } else false

  val judgmentRecordedEval = if (checkValidJudgeDataInputs) {
      outBox.R9[Coll[Byte]].isDefined && {
        val newBountyData = outBox.R9[Coll[Byte]].get
        newBountyData.size >= 96 && {
          val newJudgmentsRoot = newBountyData.slice(32, 64)
          judgmentsRoot != newJudgmentsRoot &&
          newBountyData.slice(0, 32) == submissionsRoot &&
          newBountyData.slice(64, 96) == metadataRoot
        }
      }
  } else false
  
  val valueUnchanged = selfValue == outBox.value

  val allBooleanChecks = allOf(Coll(
    checkValidJudgeDataInputs,
    correctJudgmentUpdateEval,
    judgmentRecordedEval,
    isBoxReplication,
    valueUnchanged
  ))
  
  creatorProp && allBooleanChecks
}

// Action: Withdraw reward
val isWithdrawReward = {
  val checkValidWithdrawDataInputs = CONTEXT.dataInputs.size == 1 &&
                                CONTEXT.dataInputs(0).R4[SigmaProp].isDefined &&
                                CONTEXT.dataInputs(0).R5[Int].isDefined
  
  val winnerAddress = if (checkValidWithdrawDataInputs) CONTEXT.dataInputs(0).R4[SigmaProp].get else creatorProp 
  val judgmentHeight = if (checkValidWithdrawDataInputs) CONTEXT.dataInputs(0).R5[Int].get else 0 

  val minerFee = 1000000L
  val platformFeePercent = ${dev_fee}L
  val platformFee = selfRewardAmount * platformFeePercent / 100L
  
  val hasAcceptedSubmission = selfAcceptedSubmissions > 0L
  val hasMinimumSubmissions = selfTotalSubmissions >= selfMinSubmissions
  
  val correctDistributionEval = if (checkValidWithdrawDataInputs) {
      OUTPUTS.size >= 3 && {
        val winnerBox = OUTPUTS(1)
        val devBox = OUTPUTS(2)
        val winnerAmount = selfRewardAmount - platformFee - minerFee
        val correctWinnerPayment = winnerBox.value == winnerAmount && 
                                isSigmaPropEqualToBoxProp((winnerAddress, winnerBox))
        val correctDevFee = devBox.value == platformFee && 
                            blake2b256(devBox.propositionBytes) == fromBase16("${dev_fee_contract_bytes_hash}")
        correctWinnerPayment && correctDevFee
      }
  } else false
    
  val disputePeriodPassedEval = if (checkValidWithdrawDataInputs) {
    val disputePeriod = 720 
    HEIGHT >= judgmentHeight + disputePeriod
  } else false
    
  allOf(Coll(
    checkValidWithdrawDataInputs,
    hasAcceptedSubmission,
    hasMinimumSubmissions,
    correctDistributionEval,
    disputePeriodPassedEval
  ))
}

// Action: Refund bounty
val isRefundBounty = {
  val afterDeadline = HEIGHT > selfDeadline
  val canBeRefundedCond = selfTotalSubmissions < selfMinSubmissions || selfAcceptedSubmissions == 0L
  val correctRefundCond = OUTPUTS.size >= 2 && {
                        val creatorBox = OUTPUTS(1)
                        isSigmaPropEqualToBoxProp((creatorProp, creatorBox)) && creatorBox.value == selfValue
                      }
  allOf(Coll(afterDeadline, canBeRefundedCond, correctRefundCond))
}

// Action: Add more funds
val isAddMoreFunds = {
  val creatorSigned = creatorProp
  val onlyValueIncreased = outBox.value > selfValue && 
                          outBox.R7[Long].isDefined &&
                          outBox.R7[Long].get > selfRewardAmount &&
                          outBox.R7[Long].get - selfRewardAmount == outBox.value - selfValue
  val allAddFundsConditionsMet = allOf(Coll(onlyValueIncreased, isBoxReplication))
  creatorSigned && allAddFundsConditionsMet
}

// Action: Extend deadline
val isExtendDeadline = {
  val creatorSigned = creatorProp
  val onlyDeadlineExtended = outBox.R4[Int].isDefined &&
                            outBox.R4[Int].get > selfDeadline &&
                            HEIGHT <= selfDeadline
  val allExtendDeadlineConditionsMet = allOf(Coll(onlyDeadlineExtended, isBoxReplication))
  creatorSigned && allExtendDeadlineConditionsMet
}

// Action: Update metadata
val isUpdateMetadata = {
  val creatorSigned = creatorProp
  val onlyMetadataUpdated = outBox.R9[Coll[Byte]].isDefined && {
    val newBountyData = outBox.R9[Coll[Byte]].get
    newBountyData.size >= 96 && {
      val newMetadataRoot = newBountyData.slice(64, 96)
      metadataRoot != newMetadataRoot &&
      newBountyData.slice(0, 32) == submissionsRoot &&
      newBountyData.slice(32, 64) == judgmentsRoot
    }
  }
  val beforeDeadline = HEIGHT <= selfDeadline
  val allUpdateMetadataConditionsMet = allOf(Coll(onlyMetadataUpdated, beforeDeadline, isBoxReplication))
  creatorSigned && allUpdateMetadataConditionsMet
}

// Initial contract creation validation
val correctBuild = {
  val hasBountyToken = SELF.tokens.size >= 1 && selfBountyToken == 1L
  val initialStats = selfSubmissionStats.size >= 3 && 
                     selfTotalSubmissions == 0L && 
                     selfAcceptedSubmissions == 0L && 
                     selfRejectedSubmissions == 0L
  val sufficientFunds = SELF.value >= selfRewardAmount
  allOf(Coll(hasBountyToken, initialStats, sufficientFunds))
}

// All possible actions for the contract
val actions = anyOf(Coll(
    isSubmitSolution, 
    isJudgeSubmission, 
    isWithdrawReward, 
    isRefundBounty, 
    isAddMoreFunds, 
    isExtendDeadline, 
    isUpdateMetadata
))

// Final contract condition
sigmaProp(correctBuild && actions)
}
`;
}

function generate_contract_v1_1(owner_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number) {
    // Placeholder for v1.1 - implement as needed
    return generate_contract_v1_0(owner_addr, dev_fee_contract_bytes_hash, dev_fee);
}

function handle_contract_generator(version: contract_version) {
  let f;
  switch (version) {
    case "v1_0":
      f = generate_contract_v1_0;
      break;
    case "v1_1":
      f = generate_contract_v1_1;
      break;
    default:
      throw new Error("Invalid contract version");
  }
  return f;
}

export function get_address(constants: ConstantContent, version: contract_version) {

    // In case that dev_hash is undefined, we try to use the current contract hash. But the tx will fail if the hash is different.
    let contract = handle_contract_generator(version)(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee);
    let ergoTree = compile(contract, {version: 1, network: network_id})

    let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return ergoTree.toAddress(network).toString();
}

export function get_bounty_contract_details(constants: ConstantContent, version: contract_version): BountyContractDetails {
    // Log the structure of ConstantContent for review during execution
    console.log("ConstantContent structure received by get_bounty_contract_details:", JSON.stringify(constants, null, 2));

    // In case that dev_hash is undefined, we try to use the current contract hash. But the tx will fail if the hash is different.
    let contract_script = handle_contract_generator(version)(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee);
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

        const contract = handle_contract_generator(version)(random_addr, random_dev_contract, 5);
        const ergoTree = compile(contract, {
            version: 1, // Changed to version 1 for consistency if main script features require it
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
        const contract = handle_contract_generator(version)(
            constants.owner, 
            constants.dev_hash ?? get_dev_contract_hash(), 
            constants.dev_fee, 
            
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
        // Ensure main contract hash is derived from a script compiled with version: 1
        const contract_bytes_hash = get_contract_hash(constants, version); 
        const minting_script = `
{
  val contractBox = OUTPUTS(0)

  val correctSpend = {
      // Assuming the bounty ID token is the first token in the minting box
      val isIDT = SELF.tokens(0)._1 == contractBox.tokens(0)._1 
      val spendAll = SELF.tokens(0)._2 == contractBox.tokens(0)._2

      isIDT && spendAll
  }

  val correctContract = {
      // Ensure the created bounty contract's script hash matches contract_bytes_hash
      blake2b256(contractBox.propositionBytes) == fromBase16("${contract_bytes_hash}")
  }

  // SigmaProp ensuring both conditions are met
  sigmaProp(allOf(Coll(
      correctSpend,
      correctContract
  )))
}
`;
        // Critically, compile minting script with version: 1 as it uses SELF.tokens
        let ergoTree = compile(minting_script, {version: 1, network: network_id});

        let current_network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
        const address = ergoTree.toAddress(current_network).toString();
        
        return address; // Return just the address string
    }
    catch (error) {
        console.error("Mint contract details generation failed:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate mint contract details: ${errorMessage}`);
    }
}

// If you need both address and ergoTree elsewhere, create a separate function:
export function mint_contract_details(constants: ConstantContent, version: contract_version): MintContractDetails {
    try {
        const contract_bytes_hash = get_contract_hash(constants, version); 
        const minting_script = `
{
  val contractBox = OUTPUTS(0)

  val correctSpend = {
      // Assuming the bounty ID token is the first token in the minting box
      val isIDT = SELF.tokens(0)._1 == contractBox.tokens(0)._1 
      val spendAll = SELF.tokens(0)._2 == contractBox.tokens(0)._2

      isIDT && spendAll
  }

  val correctContract = {
      // Ensure the created bounty contract's script hash matches contract_bytes_hash
      blake2b256(contractBox.propositionBytes) == fromBase16("${contract_bytes_hash}")
  }

  // SigmaProp ensuring both conditions are met
  sigmaProp(allOf(Coll(
      correctSpend,
      correctContract
  )))
}
`;
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