{
  val DIGITAL_PUBLIC_GOOD = fromBase16("${digitalPublicGoodHash}")
  val ownerSignedPath = {
    val isOwner = INPUTS.exists { (b: Box) => blake2b256(b.propositionBytes) == SELF.R7[Coll[Byte]].get }
    if (isOwner) {
      val r6Tuple = SELF.R6[(Boolean, Long)].get
      val isLocked = r6Tuple._1
      val totalSupply = r6Tuple._2
      val repTokenId = SELF.tokens(0)._1
      val repBoxesOnDataInputs = CONTEXT.dataInputs.filter { (b: Box) =>
        blake2b256(b.propositionBytes) == blake2b256(SELF.propositionBytes) &&
        b.tokens.size > 0 && b.tokens(0)._1 == repTokenId &&
        b.R6[(Boolean, Long)].get._2 == totalSupply &&
        b.R7[Coll[Byte]].get == SELF.R7[Coll[Byte]].get &&
        b.R4[Coll[Byte]].isDefined &&
        b.R5[Coll[Byte]].isDefined &&
        b.R8[Boolean].isDefined
      }
      val repBoxesOnInputs = INPUTS.filter { (b: Box) =>
        blake2b256(b.propositionBytes) == blake2b256(SELF.propositionBytes) &&
        b.tokens.size > 0 && b.tokens(0)._1 == repTokenId &&
        b.R6[(Boolean, Long)].get._2 == totalSupply &&
        b.R7[Coll[Byte]].get == SELF.R7[Coll[Byte]].get &&
        b.R4[Coll[Byte]].isDefined &&
        b.R5[Coll[Byte]].isDefined &&
        b.R8[Boolean].isDefined
      }
      val repBoxesOnOutputs = OUTPUTS.filter { (b: Box) =>
        blake2b256(b.propositionBytes) == blake2b256(SELF.propositionBytes) &&
        b.tokens.size > 0 && b.tokens(0)._1 == repTokenId &&
        b.R6[(Boolean, Long)].get._2 == totalSupply &&
        b.R7[Coll[Byte]].get == SELF.R7[Coll[Byte]].get &&
        b.R4[Coll[Byte]].isDefined &&
        b.R5[Coll[Byte]].isDefined &&
        b.R8[Boolean].isDefined
      }
      val correctManagedSupply = {
        val dataInputsAmount = repBoxesOnDataInputs.fold(0L, { (sum: Long, b: Box) => sum + b.tokens(0)._2 })
        val inputsAmount = repBoxesOnInputs.fold(0L, { (sum: Long, b: Box) => sum + b.tokens(0)._2 })
        val outputsAmount = repBoxesOnOutputs.fold(0L, { (sum: Long, b: Box) => sum + b.tokens(0)._2 })
        val valuePreserved = {
          val secondaryInputTokens = repBoxesOnInputs.flatMap({ (b: Box) =>
            if (b.tokens.size > 1) { b.tokens.slice(1, b.tokens.size) } else { Coll[(Coll[Byte], Long)]() }
          })
          val secondaryOutputTokens = repBoxesOnOutputs.flatMap({ (b: Box) =>
            if (b.tokens.size > 1) { b.tokens.slice(1, b.tokens.size) } else { Coll[(Coll[Byte], Long)]() }
          })
          val uniqueTokenIds = secondaryInputTokens.fold(Coll[Coll[Byte]](), { (acc: Coll[Coll[Byte]], t: (Coll[Byte], Long)) =>
            if (acc.exists({ (x: Coll[Byte]) => x == t._1 })) acc else acc.append(Coll(t._1))
          })
          uniqueTokenIds.forall({ (tokenId: Coll[Byte]) =>
            val totalIn = secondaryInputTokens
              .filter({ (t: (Coll[Byte], Long)) => t._1 == tokenId })
              .fold(0L, { (sum: Long, t: (Coll[Byte], Long)) => sum + t._2 })
            val totalOut = secondaryOutputTokens
              .filter({ (t: (Coll[Byte], Long)) => t._1 == tokenId })
              .fold(0L, { (sum: Long, t: (Coll[Byte], Long)) => sum + t._2 })
            totalOut >= totalIn
          })
        }
        (inputsAmount + dataInputsAmount) == totalSupply && inputsAmount == outputsAmount && valuePreserved
      }
      val outputsValid = repBoxesOnOutputs.forall { (x: Box) =>
        {
            val typeTokenIdToCheck: Coll[Byte] = SELF.R4[Coll[Byte]].get
            val availableTypeTokenIds: Coll[Coll[Byte]] = CONTEXT.dataInputs.filter { (b: Box) =>
              blake2b256(b.propositionBytes) == DIGITAL_PUBLIC_GOOD &&
              b.creationInfo._1 < CONTEXT.HEIGHT
            }.map { (b: Box) => b.tokens(0)._1 }
            val typeExists = availableTypeTokenIds.exists { (id: Coll[Byte]) => id == typeTokenIdToCheck }
            val uniqueInDataInputs = repBoxesOnDataInputs.forall { (d: Box) =>
                (d.R4[Coll[Byte]].get, d.R5[Coll[Byte]].get) != (x.R4[Coll[Byte]].get, x.R5[Coll[Byte]].get)
            }
            val uniqueInOutputs = repBoxesOnOutputs.forall { (otherOut: Box) =>
                (otherOut.id == x.id) ||
                ((otherOut.R4[Coll[Byte]].get, otherOut.R5[Coll[Byte]].get) != (x.R4[Coll[Byte]].get, x.R5[Coll[Byte]].get))
            }
            typeExists && uniqueInDataInputs && uniqueInOutputs
        }
      }
      val correctLock =  {
        if (isLocked) {
          repBoxesOnOutputs.exists { (x: Box) => {
            x.tokens(0)._2 >= SELF.tokens(0)._2 &&
            x.R4[Coll[Byte]].get == SELF.R4[Coll[Byte]].get &&
            x.R5[Coll[Byte]].get == SELF.R5[Coll[Byte]].get &&
            x.R6[(Boolean, Long)].get._1 == true &&
            x.R9[Coll[Byte]].get == SELF.R9[Coll[Byte]].get
          }}
        }
        else { true }
      }
      correctManagedSupply && outputsValid && correctLock
    } 
    else { false }
  }
  val publicTopUpPath = {
    val successorOutputs = OUTPUTS.filter { (box: Box) =>
      box.propositionBytes == SELF.propositionBytes &&
      box.tokens.size > 0 &&
      box.tokens(0)._1 == SELF.tokens(0)._1
    }
    if (successorOutputs.size == 1) {
      val successor = successorOutputs(0)
      val registersAreImmutable = (
        successor.R4[Coll[Byte]] == SELF.R4[Coll[Byte]] &&
        successor.R5[Coll[Byte]] == SELF.R5[Coll[Byte]] &&
        successor.R6[(Boolean, Long)] == SELF.R6[(Boolean, Long)] &&
        successor.R7[Coll[Byte]] == SELF.R7[Coll[Byte]] &&
        successor.R8[Boolean] == SELF.R8[Boolean] &&
        successor.R9[Coll[Byte]] == SELF.R9[Coll[Byte]]
      )
      val tokensAreImmutable = successor.tokens == SELF.tokens
      val canOnlyAddErgs = successor.value >= SELF.value
      registersAreImmutable && tokensAreImmutable && canOnlyAddErgs
    } else {
      false
    }
  }
  sigmaProp(ownerSignedPath || publicTopUpPath)
}