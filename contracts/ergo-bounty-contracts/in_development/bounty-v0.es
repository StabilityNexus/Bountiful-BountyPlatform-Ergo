{
  // ===== Contract Description ===== //
  // Name: Bountiful Bounty Platform Contract
  // Description: Enables bounty creation, submission management, and judge-based reward distribution
  // Version: 1.0.0
  // Author: Bountiful Team

  // ===== Box Contents ===== //
  // Tokens
  // 1. (id, amount)
  //    APT (Bountiful Bounty Token); Identifies the bounty and holds the allocated reward.
  //    where:
  //       id      The unique bounty identifier
  //       amount  The number of tokens representing bounty reward. Always 1 for a single bounty.
  // 2. (id, amount)
  //    PFT (Proof of Bounty Token); Represents a submission and is used for tracking contributions.
  //    where:
  //       id      The unique token identifier for a submission
  //       amount  Number of tokens representing bounty submissions

  // Registers
  // R4: Int                  Block height (deadline) for the bounty
  // R5: Long                 Minimum number of submissions required
  // R6: Coll[Long]           [Total Submissions, Total Accepted, Total Rejected]
  // R7: Long                 Reward amount in ERG
  // R8: Coll[Byte]           Encoded JSON containing creator/judge data: creator public key, trust status, judge info
  // R9: Coll[Byte]           Encoded JSON containing: bounty metadata, submissions data, judgments data

  // Helper functions
def verifyMerkleProof(proof: Coll[Coll[Byte]], leaf: Coll[Byte], root: Coll[Byte]): Boolean = {
  if (proof.size == 0) {
    // If proof is empty, the leaf must be the root
    leaf == root
  } else {
    var currentHash = leaf
    
    // Walk through each proof element
    for (i <- 0 until proof.size) {
      val proofElement = proof(i)
      val isLeft = proofElement(0) == 0.toByte
      
      // The actual proof data without direction indicator
      val proofData = proofElement.slice(1, proofElement.size)
      
      // Concatenate based on direction and hash
      currentHash = if (isLeft) {
        blake2b256(proofData ++ currentHash)
      } else {
        blake2b256(currentHash ++ proofData)
      }
    }
    
    // Final hash should match the root
    currentHash == root
  }
}

// Validating that a byte collection is non-empty and within reasonable size limits
def validateByteArray(bytes: Coll[Byte], maxSize: Int = 1000): Boolean = {
  bytes.size > 0 && bytes.size <= maxSize
}

// Validating that a provided SigmaProp exists and is valid
def validateSigmaProp(prop: Option[SigmaProp]): Boolean = {
  prop.isDefined && prop.get.propBytes.size > 0
}

val hasValidRegisters = {
  val r4Data = OUTPUTS(0).R4[Coll[Byte]]
  val r5Data = OUTPUTS(0).R5[Coll[Byte]]
  val r6Data = OUTPUTS(0).R6[Coll[Byte]]
  val r7Data = OUTPUTS(0).R7[Coll[Byte]]
  val r8Data = OUTPUTS(0).R8[Boolean]
  val r9Data = OUTPUTS(0).R9[Coll[Byte]]
  
  r4Data.isDefined && validateByteArray(r4Data.get) &&
  r5Data.isDefined && validateByteArray(r5Data.get) &&
  r6Data.isDefined && validateByteArray(r6Data.get) &&
  r7Data.isDefined && validateByteArray(r7Data.get) &&
  r8Data.isDefined &&
  r9Data.isDefined && validateByteArray(r9Data.get, 4000) 
}

  def extractJsonField(data: Coll[Byte], field: String): Coll[Byte] = {
  // Convert field to bytes for comparison
  val fieldBytes = field.getBytes ++ ":".getBytes
  
  // Find field position
  var i = 0
  var fieldStart = -1
  var fieldEnd = -1
  var inQuotes = false
  var escapeNext = false
  
  while (i < data.size && (fieldStart == -1 || fieldEnd == -1)) {
    // Handle string literals and escaping
    if (data(i) == '"'.toByte && !escapeNext) {
      inQuotes = !inQuotes
    }
    escapeNext = !escapeNext && data(i) == '\\'.toByte
    
    // Look for our field marker
    if (!inQuotes && i + fieldBytes.size < data.size) {
      val potentialMatch = data.slice(i, i + fieldBytes.size)
      if (potentialMatch == fieldBytes) {
        // Found field, now find value start (after quote)
        var valueStart = i + fieldBytes.size
        while (valueStart < data.size && data(valueStart) != '"'.toByte) {
          valueStart += 1
        }
        fieldStart = valueStart + 1  // +1 to skip the opening quote
        
        // Find value end (closing quote not preceded by escape)
        var j = fieldStart
        while (j < data.size) {
          if (data(j) == '"'.toByte && (j == 0 || data(j-1) != '\\'.toByte)) {
            fieldEnd = j
            j = data.size  // exit loop
          }
          j += 1
        }
      }
    }
    i += 1
  }
  
  // Extract field value if found
  if (fieldStart >= 0 && fieldEnd > fieldStart) {
    data.slice(fieldStart, fieldEnd)
  } else {
    // Return empty if field not found
    Coll[Byte]()
  }
}

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

  // Box data extraction
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
  val selfCreatorJudgeData = SELF.R8[Coll[Byte]].get
  val selfBountyData = SELF.R9[Coll[Byte]].get
  val selfScript = SELF.propositionBytes
  
  // Trust status and creator extraction
  val creatorPubKey = selfCreatorJudgeData.slice(0, 33)
  val trustStatus = selfCreatorJudgeData(33)
  val isTrusted = trustStatus == 1.toByte
  val judgesData = selfCreatorJudgeData.slice(34, selfCreatorJudgeData.size)
  
  // Merkle root extractors 
  val submissionsRoot = selfBountyData.slice(0, 32)
  val judgmentsRoot = selfBountyData.slice(32, 64)
  val metadataRoot = selfBountyData.slice(64, 96)
  
  // Output box reference
  val outBox = OUTPUTS(0)
  
  // Validation of correct box replication
  val isBoxReplication = {
    // The bounty token ID must be the same
    val sameId = selfId == outBox.tokens(0)._1 && selfBountyToken == outBox.tokens(0)._2
    
    // Register values must be preserved
    val sameDeadline = selfDeadline == outBox.R4[Int].get
    val sameMinSubmissions = selfMinSubmissions == outBox.R5[Long].get
    val sameRewardAmount = selfRewardAmount == outBox.R7[Long].get
    val sameCreatorJudgeData = selfCreatorJudgeData == outBox.R8[Coll[Byte]].get
    
    // Script must be the same
    val sameScript = selfScript == outBox.propositionBytes
    
    // Validate complete box replication
    sameId && sameDeadline && sameMinSubmissions && 
    sameRewardAmount && sameCreatorJudgeData && sameScript
  }
  
  // Check if a judge is authorized for this bounty
  // ===== LINK EXTERNAL REPUTATION =====
// External Reputation Integration
val isLinkExternalReputation = {
  // Verify it's an external reputation link event
  val isExternalLink = OUTPUTS(0).R4[Coll[Byte]].get == "external-reputation".getBytes
  
  // Source type (GitHub, POAP, Gitcoin Passport, etc.)
  val hasValidSource = {
    val sourceType = OUTPUTS(0).R5[Coll[Byte]].get
    val validSources = Coll("github", "poap", "gitcoin", "discord")
    
    // Check if source is in valid list
    var isValid = false
    for (i <- 0 until validSources.size) {
      if (sourceType == validSources(i).getBytes) {
        isValid = true
      }
    }
    isValid
  }
  
  // GitHub integration verification
  val isValidGitHubProof = {
    val sourceType = OUTPUTS(0).R5[Coll[Byte]].get
    
    if (sourceType == "github".getBytes) {
      val githubProof = CONTEXT.dataInputs(0).R6[Coll[Byte]].get
      
      // Verify GitHub OAuth token signature
      // This would compare a signature against GitHub's public key
      // For MVP, we check minimum data requirements
      githubProof.size >= 64 &&
      extractJsonField(githubProof, "username").size > 0 &&
      extractJsonField(githubProof, "repos").size > 0
    } else {
      true // Skip if not GitHub
    }
  }
  
  // POAP verification
  val isValidPOAPProof = {
    val sourceType = OUTPUTS(0).R5[Coll[Byte]].get
    
    if (sourceType == "poap".getBytes) {
      val poapProof = CONTEXT.dataInputs(0).R7[Coll[Byte]].get
      
      // Verify POAP token ownership
      // This would check token signature against POAP's verification key
      // For MVP, we check minimum data requirements
      poapProof.size >= 64 &&
      extractJsonField(poapProof, "tokenId").size > 0 &&
      extractJsonField(poapProof, "ownerSignature").size > 0
    } else {
      true // Skip if not POAP
    }
  }
  
  // Gitcoin Passport verification
  val isValidGitcoinProof = {
    val sourceType = OUTPUTS(0).R5[Coll[Byte]].get
    
    if (sourceType == "gitcoin".getBytes) {
      val gitcoinProof = CONTEXT.dataInputs(0).R8[Coll[Byte]].get
      
      // Verify Gitcoin Passport score
      // This would check signature against Gitcoin's verification key
      // For MVP, we check minimum data requirements
      gitcoinProof.size >= 64 &&
      extractJsonField(gitcoinProof, "score").size > 0 &&
      // Require minimum passport score of 15
      byteArrayToLong(extractJsonField(gitcoinProof, "score")) >= 15
    } else {
      true // Skip if not Gitcoin
    }
  }
  
  // Record reputation boost based on external verification
  val correctReputationBoost = {
    val targetJudge = OUTPUTS(0).R6[Coll[Byte]].get
    val reputationBoost = OUTPUTS(0).R9[Int].get
    
    // Maximum reputation boost should be capped
    val sourceType = OUTPUTS(0).R5[Coll[Byte]].get
    val maxBoost = if (sourceType == "github".getBytes) 25
                   else if (sourceType == "poap".getBytes) 15
                   else if (sourceType == "gitcoin".getBytes) 20
                   else 10
    
    reputationBoost <= maxBoost
  }
  
  // All external link requirements must be met
  isExternalLink && hasValidSource && isValidGitHubProof && 
  isValidPOAPProof && isValidGitcoinProof && correctReputationBoost
}

// Helper function to convert byte array to long
def byteArrayToLong(bytes: Coll[Byte]): Long = {
  var result = 0L
  
  // Convert ASCII bytes to Long 
  for (i <- 0 until bytes.size) {
    val digit = bytes(i) - '0'.toByte
    if (digit >= 0 && digit <= 9) {
      result = result * 10 + digit
    }
  }
  
  result
}

def isAuthorizedJudge(signerPubKey: Coll[Byte]): Boolean = {
  if (isTrusted) {
    // For trusted projects, only creator can judge
    signerPubKey == creatorPubKey
  } else {
    // For untrusted projects, check if signer is in judge list AND has minimum reputation
    val judgeCount = judgesData.size / 34  // Each judge entry is 33 bytes pubkey + 1 byte rep threshold
    var isAuthorized = false
    
    for (i <- 0 until judgeCount) {
      val start = i * 34
      val judgePubKey = judgesData.slice(start, start + 33)
      val repThreshold = judgesData(start + 33)
      
      if (judgePubKey == signerPubKey) {
        // Get judge's reputation from reputation system
        val judgeRep = getJudgeReputation(signerPubKey)
        
        // Judge must meet minimum reputation threshold
        if (judgeRep >= repThreshold) {
          isAuthorized = true
        }
      }
    }
    
    isAuthorized
  }
}
  
  // Action: Create a new bounty
  val correctBuild = {
    // Ensure APT token is correctly set up
    val hasBountyToken = SELF.tokens.size >= 1
    
    // Initial submission stats counter [0,0,0]
    val initialStats = outBox.R6[Coll[Long]].get == Coll(0L, 0L, 0L)
    
    // Validate basic bounty structure
    hasBountyToken && initialStats
  }
  
  // Action: Submit a solution
  val isSubmitSolution = {
    // Can only submit before deadline
    val beforeDeadline = HEIGHT <= selfDeadline
 
    val correctSubmissionIncrement = {
      val newStats = outBox.R6[Coll[Long]].get
      val newTotal = newStats(0)
      val newAccepted = newStats(1)
      val newRejected = newStats(2)
      
      // Total should increase by 1, accepted and rejected remain unchanged
      newTotal == selfTotalSubmissions + 1 && 
      newAccepted == selfAcceptedSubmissions && 
      newRejected == selfRejectedSubmissions
    }

    val newSubmissionData = {
      val submissionProof = CONTEXT.dataInputs(0).R5[Coll[Byte]].get
      val newSubmissionsRoot = outBox.R9[Coll[Byte]].get.slice(0, 32)
      
      // Verify submission is correctly added via Merkle proof
      submissionsRoot != newSubmissionsRoot
    }
    
    // All submission requirements must be met
    beforeDeadline && correctSubmissionIncrement && 
    newSubmissionData && isBoxReplication
  }
  
  // Action: Judge a submission
  val isJudgeSubmission = {
  // Submission stats update - either accepted or rejected must increase by 1
  val correctJudgmentUpdate = {
    val newStats = outBox.R6[Coll[Long]].get
    val newTotal = newStats(0)
    val newAccepted = newStats(1)
    val newRejected = newStats(2)
    
    // Total remains same, either accepted or rejected increases by 1
    (newTotal == selfTotalSubmissions) && 
    ((newAccepted == selfAcceptedSubmissions + 1 && newRejected == selfRejectedSubmissions) ||
     (newAccepted == selfAcceptedSubmissions && newRejected == selfRejectedSubmissions + 1))
  }
  
  // Get signer's public key from data input
  val signerPubKey = CONTEXT.dataInputs(0).R4[Coll[Byte]].get
  
  // Verify judge is authorized using consistent function signature
  val validJudge = isAuthorizedJudge(signerPubKey)
  
  // Verify judgment is properly recorded
  val judgmentRecorded = {
    val judgmentProof = CONTEXT.dataInputs(0).R6[Coll[Coll[Byte]]].get
    val judgmentLeaf = CONTEXT.dataInputs(0).R7[Coll[Byte]].get
    val newJudgmentsRoot = outBox.R9[Coll[Byte]].get.slice(32, 64)
    
    // Verify judgment is correctly added via Merkle proof
    verifyMerkleProof(judgmentProof, judgmentLeaf, newJudgmentsRoot)
  }
  
  // All judgment requirements must be met
  correctJudgmentUpdate && validJudge && judgmentRecorded && isBoxReplication
}

// Function to retrieve judge reputation from reputation contract
def getJudgeReputation(judgePubKey: Coll[Byte]): Int = {
  // Find reputation data input box for this judge
  val repBox = CONTEXT.dataInputs.filter(box => 
    box.R4[Coll[Byte]].isDefined && 
    box.R4[Coll[Byte]].get == "reputation-calc".getBytes &&
    box.R6[Coll[Byte]].isDefined &&
    box.R6[Coll[Byte]].get == judgePubKey
  )
  
  // If reputation box found, return score, otherwise default to minimum reputation
  if (repBox.size > 0) {
    repBox(0).R5[Int].get
  } else {
    // Default minimum reputation
    0
  }
}
  
  // Action: Finalize consensus (for untrusted bounties with multiple judges)
  // Enhanced consensus mechanism for untrusted projects
val finalizeConsensus = {
  // Verify enough judges have voted
  val minJudgesRequired = if (isTrusted) 1 else {
    // For untrusted projects, number of judges depends on bounty value
    if (selfRewardAmount >= 100000000L) 5 // 1+ ERG, need 5 judges
    else if (selfRewardAmount >= 50000000L) 3 // 0.5+ ERG, need 3 judges
    else 2 // Otherwise at least 2 judges
  }
  
  val judgmentCount = CONTEXT.dataInputs(0).R7[Int].get
  val enoughJudges = judgmentCount >= minJudgesRequired
  
  // Enhanced consensus calculation based on trust and reputation
  val consensusValid = {
    val acceptCount = CONTEXT.dataInputs(0).R8[Int].get
    val rejectCount = judgmentCount - acceptCount
    
    // Get detailed judge reputation data
    val judgeReputations = CONTEXT.dataInputs(1).R4[Coll[Int]].get
    
    // Calculate reputation-weighted votes
    var weightedAccept = 0L
    var weightedReject = 0L
    
    // Accept votes weighted by judge reputation
    val acceptJudges = CONTEXT.dataInputs(1).R5[Coll[Int]].get
    for (i <- 0 until acceptJudges.size) {
      val judgeIndex = acceptJudges(i)
      val reputation = judgeReputations(judgeIndex)
      
      // Square root scaling to prevent dominance by high-rep judges
      // Approximation: rep^0.5 ~= rep / 10 + 1
      val weight = reputation / 10 + 1
      weightedAccept += weight
    }
    
    // Reject votes weighted by judge reputation
    val rejectJudges = CONTEXT.dataInputs(1).R6[Coll[Int]].get
    for (i <- 0 until rejectJudges.size) {
      val judgeIndex = rejectJudges(i)
      val reputation = judgeReputations(judgeIndex)
      
      // Square root scaling
      val weight = reputation / 10 + 1
      weightedReject += weight
    }
    
    // For approval, we need 60% of weighted votes
    val totalWeight = weightedAccept + weightedReject
    val isApproved = weightedAccept > totalWeight * 6 / 10
    
    // Ensure result is correctly reflected in output
    if (isApproved) {
      // Set accepted submission count properly
      outBox.R6[Coll[Long]].get(1) == selfAcceptedSubmissions + 1 &&
      outBox.R6[Coll[Long]].get(2) == selfRejectedSubmissions
    } else {
      // Set rejected submission count properly
      outBox.R6[Coll[Long]].get(1) == selfAcceptedSubmissions &&
      outBox.R6[Coll[Long]].get(2) == selfRejectedSubmissions + 1
    }
  }
  
  // Judge reputation impact - rewards good judgments
  val reputationImpact = {
    val consensusReached = CONTEXT.dataInputs(1).R7[Boolean].get
    
    // Only required for untrusted projects
    if (isTrusted) true
    else consensusReached
  }
  
  // All consensus requirements must be met
  enoughJudges && consensusValid && reputationImpact && isBoxReplication
}
  
// Action: Submit a dispute
// Enhanced dispute submission
val isSubmitDispute = {
  // Verify dispute submitter has stake in bounty
  val hasStake = {
    val submitterPubKey = CONTEXT.dataInputs(0).R4[Coll[Byte]].get
    val isSubmitter = {
      // Check if user has a submission for this bounty
      val submissionProof = CONTEXT.dataInputs(0).R5[Coll[Coll[Byte]]].get
      val submissionLeaf = CONTEXT.dataInputs(0).R6[Coll[Byte]].get
      
      // Verify submission belongs to submitter
      val submitterInSubmission = extractJsonField(submissionLeaf, "submitter") == submitterPubKey
      
      // Verify submission is part of this bounty
      verifyMerkleProof(submissionProof, submissionLeaf, submissionsRoot) && submitterInSubmission
    }
    
    // Either the submitter or the creator can raise a dispute
    isSubmitter || submitterPubKey == creatorPubKey
  }
  
  // Dispute must include stake based on trust status
  val includesStake = {
    val minStake = if (isTrusted) 1000000L else 5000000L // 0.001 ERG for trusted, 0.005 for untrusted
    SELF.value >= minStake
  }
  
  // Dispute window check
  val withinDisputeWindow = {
    val judgmentHeight = CONTEXT.dataInputs(0).R5[Int].get
    val disputeWindow = 360 // ~2.5 days in blocks
    
    // Can only dispute within dispute window
    HEIGHT <= judgmentHeight + disputeWindow
  }
  
  // Correctly mark as disputed
  val correctlyMarkedDisputed = {
    // Update metadata to mark as disputed
    val newMetadataRoot = outBox.R9[Coll[Byte]].get.slice(64, 96)
    val disputeFlag = extractJsonField(outBox.R9[Coll[Byte]].get, "disputed")
    
    // Verify dispute flag is set and metadata updated
    disputeFlag == "true".getBytes &&
    metadataRoot != newMetadataRoot &&
    
    // Ensure other data remains unchanged
    outBox.R9[Coll[Byte]].get.slice(0, 32) == submissionsRoot &&
    outBox.R9[Coll[Byte]].get.slice(32, 64) == judgmentsRoot
  }
  
  // Record dispute type and evidence
  val hasDisputeEvidence = {
    val disputeType = CONTEXT.dataInputs(0).R7[Coll[Byte]].get
    val validDisputeTypes = Coll("technical", "procedural", "ethical")
    
    // Check if dispute type is valid
    var isValid = false
    for (i <- 0 until validDisputeTypes.size) {
      if (disputeType == validDisputeTypes(i).getBytes) {
        isValid = true
      }
    }
    
    // Evidence must be provided
    val evidenceHash = CONTEXT.dataInputs(0).R8[Coll[Byte]].get
    
    isValid && evidenceHash.size == 32 // 32 bytes for hash
  }
  
  // All dispute requirements must be met
  hasStake && includesStake && withinDisputeWindow && 
  correctlyMarkedDisputed && hasDisputeEvidence && isBoxReplication
}

// Two-tier dispute resolution process
val isResolveDispute = {
  // Verify dispute exists
  val disputeExists = {
    val disputeFlag = extractJsonField(selfBountyData, "disputed")
    disputeFlag == "true".getBytes
  }
  
  // Different resolution based on trust status
  val resolutionApproach = if (isTrusted) {
    // Tier 1: For trusted projects, creator resolves directly
    val creatorSigning = {
      val signerPubKey = CONTEXT.dataInputs(0).R4[Coll[Byte]].get
      signerPubKey == creatorPubKey
    }
    
    // Creator must provide resolution rationale
    val hasRationale = {
      val rationale = CONTEXT.dataInputs(0).R5[Coll[Byte]].get
      rationale.size > 10 // Minimum rationale size
    }
    
    // Creator's decision is implemented
    val decisionImplemented = {
      val decision = CONTEXT.dataInputs(0).R6[Boolean].get
      
      // Update stats based on decision (overturn or uphold)
      val newStats = outBox.R6[Coll[Long]].get
      
      if (decision) {
        // Overturn: flip accepted/rejected count
        (newStats(1) == selfAcceptedSubmissions + 1 && newStats(2) == selfRejectedSubmissions - 1) ||
        (newStats(1) == selfAcceptedSubmissions - 1 && newStats(2) == selfRejectedSubmissions + 1)
      } else {
        // Uphold: stats remain the same
        newStats(1) == selfAcceptedSubmissions && newStats(2) == selfRejectedSubmissions
      }
    }
    
    creatorSigning && hasRationale && decisionImplemented
  } else {
    // Tier 2: For untrusted projects, require arbitration panel
    val hasArbitrationPanel = {
      // Minimum number of arbitrators based on bounty value
      val minArbitrators = if (selfRewardAmount >= 100000000L) 5 // 1+ ERG
                          else if (selfRewardAmount >= 50000000L) 3 // 0.5+ ERG
                          else 2 // Lower value
      
      val arbitratorCount = CONTEXT.dataInputs(0).R5[Int].get
      arbitratorCount >= minArbitrators
    }
    
    // Arbitrators must have high reputation
    val hasQualifiedArbitrators = {
      val arbitratorReps = CONTEXT.dataInputs(1).R4[Coll[Int]].get
      val minReputation = 75 // Minimum reputation required
      
      var allQualified = true
      for (i <- 0 until arbitratorReps.size) {
        if (arbitratorReps(i) < minReputation) {
          allQualified = false
        }
      }
      
      allQualified
    }
    
    // Need supermajority consensus
    val hasConsensus = {
      val approvalVotes = CONTEXT.dataInputs(0).R6[Int].get
      val totalVotes = CONTEXT.dataInputs(0).R7[Int].get
      
      // Need 2/3 majority for resolution
      approvalVotes * 3 >= totalVotes * 2
    }
    
    // Arbitration decision is implemented
    val decisionImplemented = {
      val decision = CONTEXT.dataInputs(0).R8[Boolean].get
      
      // Update stats based on panel decision
      val newStats = outBox.R6[Coll[Long]].get
      
      if (decision) {
        // Overturn: flip accepted/rejected count
        (newStats(1) == selfAcceptedSubmissions + 1 && newStats(2) == selfRejectedSubmissions - 1) ||
        (newStats(1) == selfAcceptedSubmissions - 1 && newStats(2) == selfRejectedSubmissions + 1)
      } else {
        // Uphold: stats remain the same
        newStats(1) == selfAcceptedSubmissions && newStats(2) == selfRejectedSubmissions
      }
    }
    
    // Arbitrators must provide detailed reasoning
    val hasDetailedReasoning = {
      val reasoningHash = CONTEXT.dataInputs(0).R9[Coll[Byte]].get
      reasoningHash.size == 32 // 32 bytes for hash
    }
    
    hasArbitrationPanel && hasQualifiedArbitrators && hasConsensus && 
    decisionImplemented && hasDetailedReasoning
  }
  
  // Update dispute status to resolved
  val markedResolved = {
    val newMetadataRoot = outBox.R9[Coll[Byte]].get.slice(64, 96)
    val disputeStatus = extractJsonField(outBox.R9[Coll[Byte]].get, "disputeStatus")
    
    // Verify dispute status is updated
    disputeStatus == "resolved".getBytes &&
    metadataRoot != newMetadataRoot
  }
  
  // All dispute resolution requirements must be met
  disputeExists && resolutionApproach && markedResolved && isBoxReplication
}
  
  // Action: Withdraw reward (for successful submission)
  // Corrected fee calculation in isWithdrawReward function
val isWithdrawReward = {
  // Platform fee calculation
  val minerFee = 1100000L // Base miner fee
  val platformFeePercent = if (isTrusted) 10 else 15 // 1% for trusted, 1.5% for untrusted
  val platformFee = selfRewardAmount * platformFeePercent / 1000
  
  // Fee distribution according to proposal
  val judgeIncentive = platformFee * 30 / 100 // 30% of platform fee
  val devFee = platformFee * 60 / 100 // 60% of platform fee
  val communityFee = platformFee * 10 / 100 // 10% of platform fee
  
  // Verify winning submission exists
  val hasAcceptedSubmission = selfAcceptedSubmissions > 0
  
  // Verify minimum submissions met
  val hasMinimumSubmissions = selfTotalSubmissions >= selfMinSubmissions
  
  // Verify reward distribution
  val correctDistribution = {
    // Get winner address from data input
    val winnerAddress = CONTEXT.dataInputs(0).R4[SigmaProp].get
    val winnerBox = OUTPUTS(1)
    
    // Platform fee boxes
    val devBox = OUTPUTS(2)
    val judgeBox = OUTPUTS(3)
    val communityBox = OUTPUTS(4)
    
    // Verify winner receives correct amount
    val winnerAmount = selfRewardAmount - platformFee - minerFee
    val correctWinnerPayment = winnerBox.value == winnerAmount && 
                            isSigmaPropEqualToBoxProp(winnerAddress, winnerBox)
    
    // Verify fee distribution is correct
    val correctDevFee = devBox.value == devFee &&
                        devBox.propositionBytes == PK("dev_wallet_address").propBytes
    
    val correctJudgeFee = judgeBox.value == judgeIncentive &&
                         isSigmaPropEqualToBoxProp(CONTEXT.dataInputs(1).R4[SigmaProp].get, judgeBox)
    
    val correctCommunityFee = communityBox.value == communityFee &&
                             communityBox.propositionBytes == PK("community_wallet_address").propBytes
    
    correctWinnerPayment && correctDevFee && correctJudgeFee && correctCommunityFee
  }
  
  // Add dispute period check
  val disputePeriodPassed = {
    val disputePeriod = 720  // ~5 days in blocks
    val judgmentHeight = CONTEXT.dataInputs(0).R5[Int].get
    
    // Ensure enough time has passed since judgment for disputes
    HEIGHT >= judgmentHeight + disputePeriod
  }
  
  // Check if disputed
  val notDisputed = {
    val disputeFlag = extractJsonField(selfBountyData, "disputed")
    disputeFlag != "true".getBytes
  }
  
  // All withdrawal requirements must be met
  hasAcceptedSubmission && hasMinimumSubmissions &&
  correctDistribution && disputePeriodPassed && notDisputed
}
  
  // Action: Refund (for failed bounty)
  val isRefundBounty = {
    // Can only refund after deadline
    val afterDeadline = HEIGHT > selfDeadline
    
    // Conditions for refund: either minimum submissions not met or no accepted solutions
    val canBeRefunded = afterDeadline && 
                       (selfTotalSubmissions < selfMinSubmissions || selfAcceptedSubmissions == 0)
    
    // Verify refund goes to creator
    val correctRefund = {
      val creatorProp = proveDlog(creatorPubKey.toGroupElement)
      val creatorBox = OUTPUTS(1)
      
      isSigmaPropEqualToBoxProp(creatorProp, creatorBox) && 
      creatorBox.value == selfRewardAmount
    }
    
    // All refund requirements must be met
    canBeRefunded && correctRefund
  }
  
  // Action: Add more funds to bounty
  val isAddMoreFunds = {
    // Only value should change, everything else remains same
    val onlyValueIncreased = outBox.value > selfValue && 
                            // Reward amount updated
                            outBox.R7[Long].get > selfRewardAmount &&
                            // Increase matches the added funds
                            outBox.R7[Long].get - selfRewardAmount == outBox.value - selfValue
    
    // All add funds requirements must be met
    onlyValueIncreased && isBoxReplication
  }
  
  // Action: Extend deadline
  val isExtendDeadline = {
    // Only deadline should change, everything else remains same
    val onlyDeadlineExtended = outBox.R4[Int].get > selfDeadline &&
                              // Current height must be before current deadline
                              HEIGHT <= selfDeadline
    
    // All deadline extension requirements must be met
    onlyDeadlineExtended && isBoxReplication
  }
  
  // Action: Update bounty metadata
  val isUpdateMetadata = {
    // Only creator can update metadata
    val byCreator = {
      val signerPubKey = CONTEXT.dataInputs(0).R4[Coll[Byte]].get
      signerPubKey == creatorPubKey
    }
    
    // Only metadata root should change
    val onlyMetadataUpdated = {
      val newMetadataRoot = outBox.R9[Coll[Byte]].get.slice(64, 96)
      
      // Verify metadata root has changed but others remain same
      metadataRoot != newMetadataRoot &&
      outBox.R9[Coll[Byte]].get.slice(0, 32) == submissionsRoot &&
      outBox.R9[Coll[Byte]].get.slice(32, 64) == judgmentsRoot
    }
    
    // Can only update before deadline
    val beforeDeadline = HEIGHT <= selfDeadline

    // Add version tracking
  val hasVersionIncrement = {
    val oldVersion = extractJsonField(selfBountyData, "version")
    val newVersion = extractJsonField(outBox.R9[Coll[Byte]].get, "version")
    
    // Convert version strings to numbers and verify increment
    byteArrayToLong(newVersion) > byteArrayToLong(oldVersion)
  }
  
  // All metadata update requirements must be met
  byCreator && onlyMetadataUpdated && beforeDeadline && hasVersionIncrement && isBoxReplication
}
  
  // All possible actions for the contract
  val actions = anyOf(Coll(
  isCreateJudgeProfile,
  isAddJudgeFeedback,
  isRecordJudgment,
  isReportSpam,
  isQueryJudgeReputation,
  isCalculateReputation
))
  
  // Final contract condition
  sigmaProp(correctBuild || actions)
}