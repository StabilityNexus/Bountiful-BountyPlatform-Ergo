{
  // ===== Proposal Contract Description ===== //
  // Name: Bountiful Proposal Contract 
  // Description: Adds a Judge System phase for resolving disputes
  // Version: 1.4.0
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
  val isJudgeSystem = status == 4

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

  // Dispute can be triggered by either the proposer or the bounty creator
  val isDisputeAction = {
    allOf(Coll(
      (isPending || isApproved || isRejected),
      OUTPUTS(0).R4[GroupElement].get == proposerPK,
      OUTPUTS(0).R5[Coll[Byte]].get == bountyId,
      OUTPUTS(0).R6[Coll[Byte]].get == metadataJson,
      OUTPUTS(0).R7[SigmaProp].get == bountyCreatorProp,
      OUTPUTS(0).value == SELF.value,
      OUTPUTS(0).propositionBytes == SELF.propositionBytes,
      OUTPUTS(0).R8[Int].get == 3,
      anyOf(Coll(bountyCreatorProp, proveDlog(proposerPK)))
    ))
  }

  // Escalate an existing dispute into the Judge System phase (creator-only)
  val isEscalateToJudgeSystemAction = {
    allOf(Coll(
      isDisputed,
      OUTPUTS(0).R4[GroupElement].get == proposerPK,
      OUTPUTS(0).R5[Coll[Byte]].get == bountyId,
      OUTPUTS(0).R6[Coll[Byte]].get == metadataJson,
      OUTPUTS(0).R7[SigmaProp].get == bountyCreatorProp,
      OUTPUTS(0).value == SELF.value,
      OUTPUTS(0).propositionBytes == SELF.propositionBytes,
      OUTPUTS(0).R8[Int].get == 4,
      bountyCreatorProp
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

  // Creator can explicitly reject a proposal from Pending or Judge System
  val isRejectAction = {
    allOf(Coll(
      (isPending || isJudgeSystem),
      OUTPUTS(0).R4[GroupElement].get == proposerPK,
      OUTPUTS(0).R5[Coll[Byte]].get == bountyId,
      OUTPUTS(0).R6[Coll[Byte]].get == metadataJson,
      OUTPUTS(0).R7[SigmaProp].get == bountyCreatorProp,
      OUTPUTS(0).value == SELF.value,
      OUTPUTS(0).propositionBytes == SELF.propositionBytes,
      OUTPUTS(0).R8[Int].get == 2,
      bountyCreatorProp
    ))
  }

  // Creator can approve a proposal from Pending/Rejected or after Judge System
  val isApprovalAction = {
    allOf(Coll(
      (isPending || isRejected || isJudgeSystem),
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
    isEscalateToJudgeSystemAction,
    isMaintenanceAction,
    isRejectAction,
    isApprovalAction
  ))

  val validSetup = allOf(Coll(
    bountyId.size > 0,
    metadataJson.size > 0
  ))

  sigmaProp(validSetup && actions)
}
