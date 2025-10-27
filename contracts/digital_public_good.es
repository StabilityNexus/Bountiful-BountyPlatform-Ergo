{
  val successorOutputs = OUTPUTS.filter { (box: Box) =>
    box.tokens.size > 0 && box.tokens(0)._1 == SELF.tokens(0)._1
  }
  if (successorOutputs.size == 1) {
    val successor = successorOutputs(0)
    val registersAreImmutable = (
      successor.R4[Coll[Byte]] == SELF.R4[Coll[Byte]] &&
      successor.R5[Coll[Byte]] == SELF.R5[Coll[Byte]] &&
      successor.R6[Coll[Byte]] == SELF.R6[Coll[Byte]] &&
      successor.R7[Boolean] == SELF.R7[Boolean] &&
      successor.R8[Coll[Byte]] == SELF.R8[Coll[Byte]] &&
      successor.R9[Coll[Byte]] == SELF.R9[Coll[Byte]]
    )
    val dataIsImmutable = (
      successor.propositionBytes == SELF.propositionBytes &&
      successor.tokens(0) == SELF.tokens(0) &&
      registersAreImmutable
    )
    val canOnlyAddErgs = successor.value >= SELF.value
    sigmaProp(dataIsImmutable && canOnlyAddErgs)
  } else {
    sigmaProp(false)
  }
}