{
  // ===== Contract Description ===== //
  // Name: Bountiful Reputation System Contract
  // Description: Tracks and manages judge reputation through on-chain tokens
  // Version: 1.0.0
  // Author: Bountiful Team

  // ===== Box Contents ===== //
  // Tokens
  // 1. (id, amount)
  //    RBT (Reputation Badge Token); Identifies the reputation event
  //    where:
  //       id      The unique reputation event identifier
  //       amount  Always 1 for a single reputation event

  // Registers
  // R4: Coll[Byte]           Event type (judge-profile, judge-feedback, judgment, spam-alert)
  // R5: Coll[Byte]           Reference type (what kind of entity this references)
  // R6: Coll[Byte]           Target identifier (address of judge being evaluated)
  // R7: Coll[Byte]           Author's address (who created this reputation event)
  // R8: Boolean              Sentiment (true = positive, false = negative)
  // R9: Coll[Byte]           Encoded JSON metadata (comment text, timestamp, etc.)

  // Helper functions
  def isSigmaPropEqualToBoxProp(prop: SigmaProp, box: Box): Boolean = {
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
  
  def hasValidRegisters(): Boolean = {
    // Event type must be one of the allowed types
    val validEventType = {
      val eventType = OUTPUTS(0).R4[Coll[Byte]].get
      eventType == "judge-profile".getBytes ||
      eventType == "judge-feedback".getBytes ||
      eventType == "judgment".getBytes ||
      eventType == "spam-alert".getBytes ||
      eventType == "reputation-query".getBytes ||
      eventType == "reputation-calc".getBytes ||
      eventType == "external-verification".getBytes
    }
    
    // Reference type must not be empty
    val validReferenceType = OUTPUTS(0).R5[Coll[Byte]].get.size > 0
    
    // Target ID must not be empty
    val validTargetId = OUTPUTS(0).R6[Coll[Byte]].get.size > 0
    
    // Author address must not be empty
    val validAuthorAddress = OUTPUTS(0).R7[Coll[Byte]].get.size > 0
    
    // Metadata validation (basic size check)
    val validMetadata = OUTPUTS(0).R9[Coll[Byte]].get.size > 0
    
    validEventType && validReferenceType && validTargetId && validAuthorAddress && validMetadata
  }

  val contractIsTokenIssuer = {
    // Check that contract's own address is the token issuer
    if (OUTPUTS(0).tokens.size > 0) {
      val tokenId = OUTPUTS(0).tokens(0)._1
      // For a new token being issued, the token ID should be the box ID of the first input
      tokenId == INPUTS(0).id
    } else {
      false // No tokens found
    }
  }

  // ===== CREATE REPUTATION EVENT =====
  val isCreateEvent = {
    // Verify the RBT token is correctly created
    val tokenCorrect = OUTPUTS(0).tokens.size == 1 && OUTPUTS(0).tokens(0)._2 == 1L
    
    // Verify register structure is correct
    val hasRequiredRegisters = OUTPUTS(0).R4[Coll[Byte]].isDefined &&
                             OUTPUTS(0).R5[Coll[Byte]].isDefined &&
                             OUTPUTS(0).R6[Coll[Byte]].isDefined &&
                             OUTPUTS(0).R7[Coll[Byte]].isDefined &&
                             OUTPUTS(0).R8[Boolean].isDefined &&
                             OUTPUTS(0).R9[Coll[Byte]].isDefined
    
    // Fixed author validation with safety checks
    val signerIsAuthor = {
      // Ensure we have at least one data input
      if (CONTEXT.dataInputs.size > 0) {
        // Get the transaction signer if R4 exists
        if (CONTEXT.dataInputs(0).R4[SigmaProp].isDefined) {
          val signer = CONTEXT.dataInputs(0).R4[SigmaProp].get
          
          // Get the author address from R7 of the output box
          val authorAddress = OUTPUTS(0).R7[Coll[Byte]].get
          
          // Compare signer's proposition bytes with author address
          signer.propBytes == authorAddress
        } else {
          false // No SigmaProp in R4
        }
      } else {
        false // No data inputs
      }
    }
    
    // All create requirements must be met
    tokenCorrect && hasRequiredRegisters && hasValidRegisters() && signerIsAuthor && contractIsTokenIssuer
  }
  
  // ===== CREATE JUDGE PROFILE =====
  val isCreateJudgeProfile = {
    // Verify it's a judge profile event type
    val isJudgeProfile = OUTPUTS(0).R4[Coll[Byte]].isDefined && 
                       OUTPUTS(0).R4[Coll[Byte]].get == "judge-profile".getBytes
    
    // Fixed self verification with safety checks
    val forSelf = {
      if (CONTEXT.dataInputs.size > 0 && CONTEXT.dataInputs(0).R4[SigmaProp].isDefined) {
        val creator = CONTEXT.dataInputs(0).R4[SigmaProp].get
        val target = OUTPUTS(0).R6[Coll[Byte]].get
        
        creator.propBytes == target
      } else {
        false // No data inputs or missing SigmaProp
      }
    }
    
    // Verify minimal ERG fee to prevent Sybil attacks
    val hasFee = SELF.value >= 1000000L // 0.001 ERG fee
    
    // All profile creation requirements must be met
    isCreateEvent && isJudgeProfile && forSelf && hasFee
  }
  
  // ===== ADD FEEDBACK FOR JUDGE =====
  val isAddJudgeFeedback = {
    // Verify it's a feedback event type
    val isFeedback = OUTPUTS(0).R4[Coll[Byte]].isDefined && 
                   OUTPUTS(0).R4[Coll[Byte]].get == "judge-feedback".getBytes
    
    // Verify reference is to a judge profile
    val isJudgeRef = OUTPUTS(0).R5[Coll[Byte]].isDefined && 
                   OUTPUTS(0).R5[Coll[Byte]].get == "judge-profile".getBytes
    
    // Verify target exists (simplified - in real implementation we'd check if target judge exists)
    val targetExists = OUTPUTS(0).R6[Coll[Byte]].isDefined && 
                     OUTPUTS(0).R6[Coll[Byte]].get.size > 0
    
    // All feedback requirements must be met
    isCreateEvent && isFeedback && isJudgeRef && targetExists
  }

  // ===== QUERY JUDGE REPUTATION =====
  val isQueryJudgeReputation = {
    // Ensure we have at least one data input
    if (CONTEXT.dataInputs.size > 0 && CONTEXT.dataInputs(0).R4[Coll[Byte]].isDefined) {
      // Input contains judge's public key
      val judgePublicKey = CONTEXT.dataInputs(0).R4[Coll[Byte]].get
      
      // Output should contain reputation events metadata
      val containsEventsMeta = OUTPUTS(0).R4[Coll[Byte]].isDefined && 
                             OUTPUTS(0).R5[Coll[Byte]].isDefined &&
                             OUTPUTS(0).R4[Coll[Byte]].get == "reputation-query".getBytes &&
                             OUTPUTS(0).R5[Coll[Byte]].get == judgePublicKey
                             
      containsEventsMeta
    } else {
      false // No data inputs or missing judge key
    }
  }
  
  // ===== RECORD JUDGMENT =====
  val isRecordJudgment = {
    // Verify it's a judgment event type
    val isJudgment = OUTPUTS(0).R4[Coll[Byte]].isDefined && 
                   OUTPUTS(0).R4[Coll[Byte]].get == "judgment".getBytes
    
    // Verify judgment is coming from a bounty contract with proper checks
    val fromBountyContract = {
      if (CONTEXT.dataInputs.size > 0 && CONTEXT.dataInputs(0).tokens.size > 0) {
        val bountyId = CONTEXT.dataInputs(0).tokens(0)._1
        
        // Reference should include bounty ID
        OUTPUTS(0).R5[Coll[Byte]].isDefined &&
        OUTPUTS(0).R5[Coll[Byte]].get.containsSlice(bountyId.toString.getBytes)
      } else {
        false // No data inputs or no tokens
      }
    }
    
    // Verify judge is the signer with proper checks
    val signerIsJudge = {
      if (CONTEXT.dataInputs.size > 0 && CONTEXT.dataInputs(0).R4[SigmaProp].isDefined) {
        val judge = CONTEXT.dataInputs(0).R4[SigmaProp].get
        val judgeBytes = judge.propBytes
        
        // Judge in event should match signer
        OUTPUTS(0).R6[Coll[Byte]].isDefined &&
        OUTPUTS(0).R6[Coll[Byte]].get == judgeBytes
      } else {
        false // No data inputs or no SigmaProp
      }
    }
    
    // All judgment recording requirements must be met
    isCreateEvent && isJudgment && fromBountyContract && signerIsJudge
  }
  
  // ===== REPORT SPAM =====
  val isReportSpam = {
    // Verify it's a spam alert event type
    val isSpamAlert = OUTPUTS(0).R4[Coll[Byte]].isDefined && 
                    OUTPUTS(0).R4[Coll[Byte]].get == "spam-alert".getBytes
    
    // Verify the reported content exists
    val reportedContentExists = OUTPUTS(0).R5[Coll[Byte]].isDefined && 
                              OUTPUTS(0).R5[Coll[Byte]].get.size > 0
    
    // Require negative sentiment for spam reports
    val isNegative = OUTPUTS(0).R8[Boolean].isDefined && 
                   !OUTPUTS(0).R8[Boolean].get
    
    // All spam report requirements must be met
    isCreateEvent && isSpamAlert && reportedContentExists && isNegative
  }

  // ===== CALCULATE REPUTATION SCORE =====
  val isCalculateReputation = {
    val isCalcRequest = OUTPUTS(0).R4[Coll[Byte]].isDefined && 
                      OUTPUTS(0).R4[Coll[Byte]].get == "reputation-calc".getBytes

    if (CONTEXT.dataInputs.size >= 6 && 
        OUTPUTS(0).R5[Int].isDefined && 
        OUTPUTS(0).R6[Coll[Byte]].isDefined) {
      
      // Judge's public key
      val judgePublicKey = CONTEXT.dataInputs(0).R4[Coll[Byte]].get
      
      // Pre-calculated values provided in data inputs
      val positiveFeedbackCount = CONTEXT.dataInputs(1).R4[Int].get
      val negativeFeedbackCount = CONTEXT.dataInputs(2).R4[Int].get
      val judgmentsMade = CONTEXT.dataInputs(3).R4[Int].get
      val spamReports = CONTEXT.dataInputs(4).R4[Int].get
      val verifiedProfiles = CONTEXT.dataInputs(5).R4[Int].get
      
      // Weight factors
      val baseReputation = 50
      val positiveFeedbackWeight = 2
      val negativeFeedbackWeight = -3
      val judgmentWeight = 1
      val spamReportWeight = -5
      val verificationWeight = 5
      
      // Calculate total reputation score
      val reputationScore = baseReputation +
                           (positiveFeedbackCount * positiveFeedbackWeight) +
                           (negativeFeedbackCount * negativeFeedbackWeight) +
                           (judgmentsMade * judgmentWeight) +
                           (spamReports * spamReportWeight) +
                           (verifiedProfiles * verificationWeight)
      
      // Cap reputation between 0 and 100
      val cappedReputation = if (reputationScore > 100) 100
                             else if (reputationScore < 0) 0
                             else reputationScore
      
      // Verify output box contains correct reputation score
      val outputScoreCorrect = OUTPUTS(0).R5[Int].get == cappedReputation
      
      // Verify judge public key is included in output
      val outputJudgeCorrect = OUTPUTS(0).R6[Coll[Byte]].get == judgePublicKey
      
      // All calculation requirements must be met
      isCalcRequest && outputScoreCorrect && outputJudgeCorrect
    } else {
      false // Not enough data inputs or missing outputs
    }
  }
  
  val actions = anyOf(Coll(
    isCreateJudgeProfile,
    isAddJudgeFeedback,
    isRecordJudgment,
    isReportSpam,
    isQueryJudgeReputation,
    isCalculateReputation
  ))
  
  sigmaProp(actions)
}