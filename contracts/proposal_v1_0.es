{
  // === Register Definitions (ProposalBox) ===
  // R4: Coll[Byte] - proposerPropBytes: Raw bytes of the proposer's address (propositionBytes)
  //                  This address will be used to restrict spending rights of the box.
  // R5: Coll[Byte] - bountyId: Token ID (in byte form) of the bounty this proposal is submitted for.
  //                  This links the proposal to a specific bounty without needing to spend that bounty box.
  // R6: Coll[Byte] - metadataJson: Encoded JSON string containing metadata about the proposal.
  //                  Example: {"title":"My solution", "url":"ipfs://...", "cost":1000000}
  //                  This data is used off-chain for display, ranking, or selection — not used by this contract.

  // === Value Extraction from SELF ===

  // Extract the proposer's address from R4. This is expected to be the propositionBytes of their P2PK address.
  val proposerPropBytes = SELF.R4[Coll[Byte]].get

  // Convert raw bytes into a SigmaProp for signature checking.
  val proposerPK = PK(proposerPropBytes)

  // === Action: Only Proposer May Spend the ProposalBox ===
  // The only action currently allowed is the proposer spending their own proposal box.
  // This could be used to cancel or reclaim it, or to modify/resubmit a new version.
  //
  // The bounty contract will *not* spend this box — instead, it will read the box as a reference
  // (from `INPUTS`) to determine who the selected winner is.
  //
  // The actual payout logic happens inside the bounty contract script, which verifies:
  //   - That the proposal's `R5` matches the bounty ID.
  //   - That the `R4` (proposer’s address) matches the receiver in OUTPUT(1).

  sigmaProp(proposerPK)
}
