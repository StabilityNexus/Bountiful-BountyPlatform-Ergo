import { type ConstantContent } from "../../lib/common/bounty";
import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { sha256, hex, blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { get_dev_contract_hash } from "./dev/dev_contract";
import { get_proposal_contract_hash } from "./proposal_contract";

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

function generate_contract_v1_0(owner_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number, token_id: string, proposal_contract_hash: string) {
    return `
{

// ===== Contract Description ===== //
// Name: Bountiful Bounty Platform Contract
// Description: Enables bounty creation, contribution management, and reward distribution
// Version: 1.0.0
// Author: Bountiful Team

// ===== Box Contents ===== //
// Tokens
// 1. (id, amount)
//    APT (Bounty Contribution Token); Identifies contributors to the bounty and tracks their stake.
//    where:
//       id      The bounty identifier.
//       amount  APT emission amount + 1
// 2. (id, amount)
//    PFT (Bounty Reward Token); Proof of contribution token that can be exchanged for rewards
//    where:
//       id      The bounty reward token identifier.
//       amount  The number of tokens equivalent to the maximum amount of ERG the bounty aims to collect.

// Registers
// R4: Int                   The block height until which contributions are allowed. After this height, bounty can be claimed or refunded.
// R5: Long                  The minimum amount of ERG that must be contributed to make the bounty claimable.
// R6: Coll[Long]           The total ERG contributed, the total ERG refunded, and the total APT exchanged for PFT so far.
// R7: Long                  The ERG-to-token exchange rate (ERG per contribution token).
// R8: Coll[Byte]            Base58-encoded JSON string containing the bounty creator's details.
// R9: Coll[Byte]            Base58-encoded JSON string containing bounty metadata, including "title", "description", "requirements".

// ===== Transactions ===== //
// 1. Contribute to Bounty
// Inputs:
//   - Bounty Contract
//   - Contributor box containing ERG
// Data Inputs: None
// Outputs:
//   - Updated Bounty Contract
//   - Contributor box containing APT (contribution tokens)
// Constraints:
//   - Ensure accurate ERG-to-token exchange based on the exchange rate.
//   - Update the contribution counter correctly.
//   - Transfer the correct number of tokens to the contributor.
//   - Validate that the contract is replicated correctly.

// 2. Refund Contribution
// Inputs:
//   - Bounty Contract
//   - Contributor box containing APT tokens
// Outputs:
//   - Updated Bounty Contract  
//   - Contributor box containing refunded ERG
// Constraints:
//   - Ensure the block height has surpassed the deadline (R4).
//   - Ensure the minimum contribution threshold (R5) has not been reached.
//   - Update the refund counter correctly.
//   - Validate the ERG-to-token refund exchange.
//   - Ensure the contract is replicated correctly.

// 3. Claim Bounty Reward
// Inputs:
//   - Bounty Contract
// Outputs:
//   - Updated Bounty Contract (if partially claimed; otherwise, contract depletes funds completely)
//   - Box containing ERG for the solution provider (100% - dev_fee).
//   - Box containing ERG for the developer address (dev_fee).
// Constraints:
//   - Ensure the minimum contribution threshold (R5) has been reached.
//   - Verify the correctness of the developer fee calculation.
//   - Ensure either complete withdrawal or proper replication of the contract.

// 4. Withdraw Unused Reward Tokens
// Inputs:
//   - Bounty Contract
// Outputs:
//   - Updated Bounty Contract
//   - Box containing unused reward tokens sent to the bounty creator
// Constraints:
//   - Validate proper replication of the contract.
//   - Ensure no ERG value changes during the transaction.
//   - Handle unused tokens correctly.

// 5. Add More Reward Tokens
// Inputs:
//   - Bounty Contract
//   - Box containing tokens sent from the bounty creator
// Outputs:
//   - Updated Bounty Contract
// Constraints:
//   - Validate proper replication of the contract.
//   - Ensure no ERG value changes during the transaction.
//   - Handle the added tokens correctly.

// 6. Exchange Contribution Tokens for Reward Tokens
// Inputs:
//   - Bounty Contract
//   - Contributor box with APT tokens
// Outputs:
//   - Updated Bounty Contract
//   - Contributor box with PFT tokens
// Constraints:
//   - Ensure minimum contribution threshold has been met
//   - Validate 1:1 exchange ratio between APT and PFT
//   - Update exchange counter correctly

// ===== Compile Time Constants ===== //
// $owner_addr: Base58 address of the bounty creator.
// $dev_fee_contract_bytes_hash: Blake2b-256 base16 string hash of the dev fee contract proposition bytes.
// $dev_fee: Percentage fee allocated to the developer (e.g., 5 for 5%).
// $token_id: Unique string identifier for the bounty reward token.
// $proposal_contract_hash: Blake2b-256 base16 string hash of the proposal contract proposition bytes.

// ===== Context Variables ===== //
// None

// ===== Helper Functions ===== //
// None

def temporaryContributionTokenAmountOnContract(contract: Box): Long = {
    // APT amount that serves as temporary contribution token that is currently on the contract available to exchange.

    val bounty_reward_token_amount = if (contract.tokens.size == 1) 0L else contract.tokens(1)._2
    val contributed                = contract.R6[Coll[Long]].get(0)
    val refunded                   = contract.R6[Coll[Long]].get(1)
    val exchanged                  = contract.R6[Coll[Long]].get(2)  // If the exchanged APT -> PFT amount is not accounted for, it will result in double-counting the contributed amount.

    bounty_reward_token_amount - contributed + refunded + exchanged
}

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

  val selfId = SELF.tokens(0)._1
  val selfAPT = SELF.tokens(0)._2
  val selfValue = SELF.value
  val selfBlockLimit = SELF.R4[Int].get
  val selfMinimumContribution = SELF.R5[Long].get
  val selfContributedCounter = SELF.R6[Coll[Long]].get(0)
  val selfRefundCounter = SELF.R6[Coll[Long]].get(1)
  val selfAuxiliarExchangeCounter = SELF.R6[Coll[Long]].get(2)
  val selfExchangeRate = SELF.R7[Long].get
  val selfCreatorDetails = SELF.R8[Coll[Byte]].get
  val selfBountyMetadata = SELF.R9[Coll[Byte]].get
  val selfScript = SELF.propositionBytes

  val bountyCreatorAddr: SigmaProp = PK("`+owner_addr+`")

  // Validation of the box replication process
  val isSelfReplication = {

    // The bounty id must be the same
    val sameId = selfId == OUTPUTS(0).tokens(0)._1

    // The deadline must be the same
    val sameBlockLimit = selfBlockLimit == OUTPUTS(0).R4[Int].get

    // The minimum contribution amount must be the same
    val sameMinimumContribution = selfMinimumContribution == OUTPUTS(0).R5[Long].get

    // The ERG/Token exchange rate must be same
    val sameExchangeRate = selfExchangeRate == OUTPUTS(0).R7[Long].get

    // The constants must be the same
    val sameConstants = selfCreatorDetails == OUTPUTS(0).R8[Coll[Byte]].get

    // The bounty metadata must be the same
    val sameBountyContent = selfBountyMetadata == OUTPUTS(0).R9[Coll[Byte]].get

    // The script must be the same
    val sameScript = selfScript == OUTPUTS(0).propositionBytes

    // The PFT must be the same
    val sameBountyRewardToken = {
      anyOf(Coll(
        OUTPUTS(0).tokens.size == 1,
        OUTPUTS(0).tokens(1)._1 == Coll[Byte](),
        OUTPUTS(0).tokens(1)._1 == OUTPUTS(0).tokens(1)._1
      ))
    }

    // Ensures that there are only one or two tokens in the contract (APT and PFT or only APT)
    val noAddsOtherTokens = OUTPUTS(0).tokens.size == 1 || OUTPUTS(0).tokens.size == 2

    // Verify that the output box is a valid copy of the input box
    sameId && sameBlockLimit && sameMinimumContribution && sameExchangeRate && sameConstants && sameBountyContent && sameScript && sameBountyRewardToken && noAddsOtherTokens
  }

  val APTokenRemainsConstant = selfAPT == OUTPUTS(0).tokens(0)._2
  val BountyRewardTokenRemainsConstant = {

    val selfAmount = 
      if (SELF.tokens.size == 1) 0L
      else SELF.tokens(1)._2

    val outAmount =
      if (OUTPUTS(0).tokens.size == 1) 0L
      else OUTPUTS(0).tokens(1)._2
      
    selfAmount == outAmount
  }
  val contributedCounterRemainsConstant = selfContributedCounter == OUTPUTS(0).R6[Coll[Long]].get(0)
  val refundCounterRemainsConstant = selfRefundCounter == OUTPUTS(0).R6[Coll[Long]].get(1)
  val auxiliarExchangeCounterRemainsConstant = selfAuxiliarExchangeCounter == OUTPUTS(0).R6[Coll[Long]].get(2)
  val maintainValue = selfValue == OUTPUTS(0).value

  val isToBountyCreatorAddress = {
    val propAndBox: (SigmaProp, Box) = (bountyCreatorAddr, OUTPUTS(1))
    val isSamePropBytes: Boolean = isSigmaPropEqualToBoxProp(propAndBox)

    isSamePropBytes
  }

  val isFromBountyCreatorAddress = {
    val propAndBox: (SigmaProp, Box) = (bountyCreatorAddr, INPUTS(1))
    val isSamePropBytes: Boolean = isSigmaPropEqualToBoxProp(propAndBox)
    
    isSamePropBytes
  }

  // Amount of PFT tokens added to the contract. In case of negative value, means that the token have been extracted.
  val deltaPFTokenAdded = {

    // Calculate the difference in token amounts
    val selfTokens = 
        if (SELF.tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.
        else SELF.tokens(1)._2
    
    val outTokens = 
        if (OUTPUTS(0).tokens.size == 1) 0L // There is going to be any PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.
        else OUTPUTS(0).tokens(1)._2
    
    // Return the difference between output tokens and self tokens
    outTokens - selfTokens
  }

  //  ACTIONS

  // Validation for contributing to bounty
  // > People should be allowed to exchange ERGs for contribution tokens until there are no more tokens left (even if the deadline has passed).
  val isContributeToBounty = {

    // Delta of tokens removed from the box
    val deltaTokenRemoved = {
      val outputAlreadyTokens = OUTPUTS(0).tokens(0)._2

      selfAPT - outputAlreadyTokens
    }

    val onlyTemporaryUnavailableTokens = deltaTokenRemoved <= temporaryContributionTokenAmountOnContract(SELF)
    
    // Verify if the ERG amount matches the required exchange rate for the given token quantity
    val correctExchange = {

      // Delta of ergs added value from the contributor's ERG payment
      val deltaValueAdded = OUTPUTS(0).value - selfValue
      
      // ERG / Token exchange rate
      val exchangeRate = selfExchangeRate

      deltaValueAdded == deltaTokenRemoved * exchangeRate
    }

    // Verify if the contribution counter (R6)._1 is increased in proportion of the tokens contributed.
    val incrementContributionCounterCorrectly = {

      // Calculate how much the contribution counter is incremented.
      val counterIncrement = {
          // Obtain the current and the next "contribution counter"
          val selfAlreadyContributedCounter = selfContributedCounter
          val outputAlreadyContributedCounter = OUTPUTS(0).R6[Coll[Long]].get(0)

          outputAlreadyContributedCounter - selfAlreadyContributedCounter
      }

      allOf(Coll(
        deltaTokenRemoved == counterIncrement,
        counterIncrement > 0 // This ensures that the increment is positive, if not, the contribution action could be reversed.
      ))
    }

    val constants = allOf(Coll(
      isSelfReplication,                          // Replicate the contract will be needed always                
      refundCounterRemainsConstant,               // The refund counter must be constant
      auxiliarExchangeCounterRemainsConstant,          // The exchange counter must be constant because there is no exchange between APT -> PFT.
      BountyRewardTokenRemainsConstant           // PFT needs to be constant
    ))

    allOf(Coll(
      constants,
      onlyTemporaryUnavailableTokens,            // Since the amount of APT is equal to the emission amount of PFT (+1), not necessarily equal to the contract amount, it must be ensured that the APT contributed can be exchanged in the future.
      correctExchange,                           // Ensures that the proportion between the APTs and value moved is the same following the R7 ratio.
      incrementContributionCounterCorrectly      // Ensures that the R6 first value is incremented in proportion to the exchange value moved.
    ))
  }

  // Validation for refunding contributions
  val isRefundTokens = {

    val minimumContributionReached = {
      val minimumContributionThreshold = selfMinimumContribution
      val contributedCounter = selfContributedCounter

      contributedCounter >= minimumContributionThreshold
    }

    // > People should be allowed to exchange tokens for ERGs if and only if the deadline has passed and the minimum number of tokens has not been sold.
    val canBeRefund = {
      // The minimum number of tokens has not been sold.
      val minimumNotReached = {
          val minimumContributionsThreshold = selfMinimumContribution
          val contributionCounter = selfContributedCounter

          contributionCounter < minimumContributionsThreshold
      }

      // Condition to check if the current height is beyond the block limit
      val afterBlockLimit = HEIGHT > selfBlockLimit
      
      afterBlockLimit && minimumNotReached
    }

    // Calculate the amount of tokens that the user adds to the contract.
    val deltaTokenAdded = {
      val outputAlreadyTokens = OUTPUTS(0).tokens(0)._2

      outputAlreadyTokens - selfAPT
    }

    // Verify if the ERG amount matches the required exchange rate for the returned token quantity
    val correctExchange = {
      // Calculate the value returned from the contract to the user
      val retiredValueFromTheContract = selfValue - OUTPUTS(0).value

      // Calculate the value of the tokens added on the contract by the user
      val addedTokensValue = deltaTokenAdded * selfExchangeRate

      retiredValueFromTheContract == addedTokensValue
    }

    // Verify if the refund counter (R6)._2 is increased in proportion of the tokens refunded.
    val incrementRefundCounterCorrectly = {

      // Calculate how much the refund counter is incremented.
      val counterIncrement = {
          // Obtain the current and the next "refund counter"
          val selfAlreadyRefundCounter = selfRefundCounter
          val outputAlreadyRefundCounter = OUTPUTS(0).R6[Coll[Long]].get(1)

          outputAlreadyRefundCounter - selfAlreadyRefundCounter
      }

      allOf(Coll(
        deltaTokenAdded == counterIncrement,
        counterIncrement > 0   // This ensures that the increment is positive, if not, the contribution action could be reversed.
      ))
    }

    val constants = allOf(Coll(
      isSelfReplication,                          // Replicate the contract will be needed always            
      contributedCounterRemainsConstant,          // The contribution counter needs to be constant.
      auxiliarExchangeCounterRemainsConstant,             // Exchange counter needs to be constant.
      BountyRewardTokenRemainsConstant           // PFT needs to be constant.
    ))

    // The contract returns the equivalent ERG value for the returned tokens
    allOf(Coll(
      constants,
      canBeRefund,                              // Ensures that the refund conditions are satisfied.
      incrementRefundCounterCorrectly,            // Ensures increment the refund counter correctly in proportion with the exchanged amount.
      correctExchange                             // Ensures that the value extracted and the APTs added are proportional following the R7 exchange ratio.
    ))
  }

  val isClaimBountyReward = {
    val minimumContributionReached = selfContributedCounter >= selfMinimumContribution

    if (OUTPUTS.size < 3) { false } else {
      // Find proposal boxes matching the proposal contract hash
      val proposalBoxes = CONTEXT.dataInputs.filter { (box: Box) =>
        blake2b256(box.propositionBytes) == fromBase16("`+proposal_contract_hash+`")
      }

      // Check if we have exactly one proposal box
      val hasValidProposal = proposalBoxes.size == 1

      // If we have a valid proposal, check all conditions in one place
      val proposalValid = if (hasValidProposal) {
        val proposalBox = proposalBoxes(0)
        
        // Check all conditions with safe access
        val hasBountyId = proposalBox.R5[Coll[Byte]].isDefined
        val matchesBounty = hasBountyId && proposalBox.R5[Coll[Byte]].get == selfId
        val hasStatus = proposalBox.R8[Int].isDefined
        val isApproved = hasStatus && proposalBox.R8[Int].get == 1
        val hasProposerPK = proposalBox.R4[GroupElement].isDefined
        
        // All conditions must be true
        matchesBounty && isApproved && hasProposerPK
      } else {
        false
      }

      // Check payout address is correct
      val payoutAddressCorrect = if (proposalValid) {
        val proposalBox = proposalBoxes(0)
        val proposerPK = proposalBox.R4[GroupElement].get
        val payoutBox = OUTPUTS(1)
        
        val pkBytes = proveDlog(proposerPK).propBytes
        val payoutBytes = payoutBox.propositionBytes
        
        if (payoutBytes(0) == 0) {
          payoutBytes == pkBytes
        } else {
          val offset = if (payoutBytes.size > 127) 3 else 2
          pkBytes.slice(1, pkBytes.size) == payoutBytes.slice(offset, payoutBytes.size)
        }
      } else {
        false
      }

      val minerFeeAmount = 100000L 
      val devFee = `+dev_fee+`
      val extractedValue: Long = if (selfScript == OUTPUTS(0).propositionBytes) { 
        selfValue - OUTPUTS(0).value 
      } else { 
        selfValue 
      }
      val devFeeAmount = extractedValue * devFee / 100L
      val bountyAmount = extractedValue - devFeeAmount - minerFeeAmount

      val correctBountyAmount = OUTPUTS(1).value == bountyAmount

      val correctDevFee = {
        val OUT = OUTPUTS(2)
        val isToDevAddress = fromBase16("`+dev_fee_contract_bytes_hash+`") == blake2b256(OUT.propositionBytes)
        val isCorrectDevAmount = OUT.value == devFeeAmount
        isToDevAddress && isCorrectDevAmount
      }

      val endOrReplicate = {
        val allFundsWithdrawn = extractedValue == selfValue
        val allTokensWithdrawn = SELF.tokens.size == 1
        isSelfReplication || (allFundsWithdrawn && allTokensWithdrawn)
      }

      val constants = 
        endOrReplicate &&
        contributedCounterRemainsConstant &&
        refundCounterRemainsConstant &&
        auxiliarExchangeCounterRemainsConstant &&
        APTokenRemainsConstant &&
        BountyRewardTokenRemainsConstant

      constants &&
      minimumContributionReached &&
      proposalValid &&
      payoutAddressCorrect &&
      correctDevFee &&
      correctBountyAmount
    }
}

  // > Bounty creators may withdraw unused reward tokens from the contract at any time.
  val isWithdrawUnusedRewardTokens = {
    // Calculate that only unused reward tokens are withdrawn, otherwise there will be problems with the APT -> PFT exchange.
    val onlyUnused = {

      // The amount of PFT token that has been extracted from the contract
      val extractedPFT = -deltaPFTokenAdded 

      // Current APT tokens without the one used for bounty identification (remember that the APT amount is equal to the PFT emission amount + 1, because the 1 is to always be inside the contract)
      val temporalTokens = temporaryContributionTokenAmountOnContract(SELF)

      // Only can extract an amount sufficient lower to allow the exchange APT -> PFT
      extractedPFT <= temporalTokens
    }

    val constants = allOf(Coll(
      isSelfReplication,                         // Replicate the contract will be needed always            
      contributedCounterRemainsConstant,         // Any of the counter needs to be incremented, so all of them (contributed, refund and exchange) need to remain constants.
      refundCounterRemainsConstant,                       
      auxiliarExchangeCounterRemainsConstant,
      maintainValue,                             // The value of the contract must not change.
      APTokenRemainsConstant                     // APT token must be constant.
    ))

    allOf(Coll(
      constants,
      isToBountyCreatorAddress,
      deltaPFTokenAdded < 0,  // A negative value means that PFT are extracted.
      onlyUnused  // Ensures that only extracts the token amount that has not been contributed for.
    ))
  }
  
  // > Bounty creators may add more reward tokens to the contract at any time.
  val isAddRewardTokens = {

    val constants = allOf(Coll(
      isSelfReplication,                     // Replicate the contract will be needed always            
      contributedCounterRemainsConstant,     // Any of the counter needs to be incremented, so all of them (contributed, refund and exchange) need to remain constants.
      refundCounterRemainsConstant,                       
      auxiliarExchangeCounterRemainsConstant,   
      maintainValue,                                 
      APTokenRemainsConstant                 // There is no need to modify the APT amount because the amount is established based on the PFT emission amount.
    ))

    if (INPUTS.size == 1) false  // To avoid access INPUTS(1) when there is no input, this could be resolved using actions.
    else allOf(Coll(
      constants,
      isFromBountyCreatorAddress,   // Ensures that the tokens come from the bounty creator.
      deltaPFTokenAdded > 0   // Ensures that the tokens are added.
    ))
  }
  
  // Exchange APT (token that identifies contributors used as temporary contribution token) with PFT (bounty reward token)
  val isExchangeContributionTokens = {

    val minimumContributionReached = {
      val minimumContributionThreshold = selfMinimumContribution
      val contributedCounter = selfContributedCounter

      contributedCounter >= minimumContributionThreshold
    }

    val deltaTemporaryContributionTokenAdded = {
      val selfTCT = SELF.tokens(0)._2
      val outTCT = OUTPUTS(0).tokens(0)._2

      outTCT - selfTCT
    }

    val correctExchange = {

      val deltaBountyRewardTokenExtracted = -deltaPFTokenAdded
      
      allOf(Coll(
        deltaTemporaryContributionTokenAdded == deltaBountyRewardTokenExtracted,
        deltaTemporaryContributionTokenAdded > 0  // Ensures one way exchange (only send TCT and receive PFT)
      ))
    }

    // Verify if the exchange counter (R6)._3 is increased in proportion of the tokens exchanged.
    val incrementExchangeCounterCorrectly = {

      // Calculate how much the counter is incremented.
      val counterIncrement = {
          val selfAlreadyCounter = selfAuxiliarExchangeCounter
          val outputAlreadyExchangeCounter = OUTPUTS(0).R6[Coll[Long]].get(2)

          outputAlreadyExchangeCounter - selfAlreadyCounter
      }

      deltaTemporaryContributionTokenAdded == counterIncrement
    }

    val endOrReplicate = {
      val allFundsWithdrawn = selfValue == OUTPUTS(0).value
      val allTokensWithdrawn = SELF.tokens.size == 1 // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.

      isSelfReplication || allFundsWithdrawn && allTokensWithdrawn
    }

    val constants = allOf(Coll(
      endOrReplicate,                                       // The contract could be finalized after this action, so it only checks self replication in case of partial withdrawal
      contributedCounterRemainsConstant,                    // Contribution counter must be constant
      refundCounterRemainsConstant,                         // Refund counter must be constant
      maintainValue                                         // ERG value must be constant
    ))

    allOf(Coll(
      constants,
      minimumContributionReached,                        // Only can exchange when the refund action is not, and will not be, possible
      incrementExchangeCounterCorrectly,                 // Ensures that the exchange counter is incremented in proportion to the APT added and the PFT extracted.
      correctExchange                                    // Ensures that the APT added and the PFT extracted amounts are equal.
    ))
  }

  val actions = anyOf(Coll(
    isContributeToBounty,
    isRefundTokens,
    isClaimBountyReward,
    isWithdrawUnusedRewardTokens,
    isAddRewardTokens,
    isExchangeContributionTokens
  ))

  // Validates that the contract was built correctly. Otherwise, it cannot be used.
  val correctBuild = {

    val correctTokenId = 
      if (SELF.tokens.size == 1) true 
      else SELF.tokens(1)._1 == fromBase16("`+token_id+`")
    
    val onlyOneOrTwoTokens = SELF.tokens.size == 1 || SELF.tokens.size == 2

    correctTokenId && onlyOneOrTwoTokens
  }

  sigmaProp(correctBuild && actions)
}
  `
}

function generate_contract_v1_1(owner_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number, token_id: string, proposal_contract_hash: string) {
    // Placeholder for v1.1 - implement as needed
    return generate_contract_v1_0(owner_addr, dev_fee_contract_bytes_hash, dev_fee, token_id, proposal_contract_hash);
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