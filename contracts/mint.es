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