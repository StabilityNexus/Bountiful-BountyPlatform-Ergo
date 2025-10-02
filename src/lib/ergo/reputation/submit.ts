import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    type Box,
    type Amount,
    ErgoAddress,
    SColl,
    SByte,
    SBool,
    SLong
} from '@fleet-sdk/core';
import { blake2b256 } from '@fleet-sdk/crypto';
import { getReputationProofAddress }  from "$lib/ergo/contract";
import { SString, hexToBytes, parseBox } from '../utils';
import { explorer_uri, REPUTATION_PROOF_TOTAL_SUPPLY } from '../envs';
import { SPair } from '@fleet-sdk/serializer';
import { JUDGE } from './types';
import { fetchTypeNfts } from './fetch';

const ergo_tree_address = getReputationProofAddress();

function tupleToSerialized(isLocked: boolean, totalSupply: number): string {
    return SPair(SBool(isLocked), SLong(BigInt(totalSupply))).toHex();
}

function booleanToSerializer(value: boolean): string {
    return SBool(value).toHex();
}

export async function generate_reputation_proof(ergo: any, burned_amount: bigint, content: object|string|null): Promise<string | null> {
    const token_amount = REPUTATION_PROOF_TOTAL_SUPPLY;
    const total_supply = REPUTATION_PROOF_TOTAL_SUPPLY;
    const is_locked = false;
    const type_nft_id = JUDGE;
    const polarization = true;

    const creatorAddressString = await ergo.get_change_address();
    if (!creatorAddressString) {
        throw new Error("Could not get the creator's address from the wallet.");
    }
    const creatorP2PKAddress = ErgoAddress.fromBase58(creatorAddressString);

    const typeNftBoxResponse = await fetch(`${explorer_uri}/api/v1/boxes/byTokenId/${type_nft_id}`);
    if (!typeNftBoxResponse.ok) {
      alert("Could not fetch the Type NFT box. Aborting transaction.");
      return null;
    }

    const utxos = await ergo.get_utxos();
    const inputs: Box<Amount>[] = utxos;

    const outputs: OutputBuilder[] = [];

    const new_proof_output = new OutputBuilder(
        burned_amount > SAFE_MIN_BOX_VALUE ? burned_amount : SAFE_MIN_BOX_VALUE,
        ergo_tree_address
    );

    new_proof_output.mintToken({
        amount: token_amount.toString()
    });

    const object_pointer = inputs[0].boxId;

    const propositionBytes = hexToBytes(creatorP2PKAddress.ergoTree);
    if (!propositionBytes) {
        throw new Error(`Could not get proposition bytes from address ${creatorAddressString}.`);
    }
    const hashedProposition = blake2b256(propositionBytes);

    new_proof_output.setAdditionalRegisters({
        R4: SColl(SByte, hexToBytes(type_nft_id) ?? "").toHex(),
        R5: SColl(SByte, hexToBytes(object_pointer) ?? "").toHex(),
        R6: tupleToSerialized(is_locked, total_supply),
        R7: SColl(SByte, hashedProposition).toHex(),
        R8: booleanToSerializer(polarization),
        R9: SString(typeof(content) === "object" ? JSON.stringify(content): content ?? "")
    });

    outputs.push(new_proof_output);

    try {
        const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
            .from(inputs)
            .to(outputs)
            .sendChangeTo(creatorP2PKAddress)
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .build()
            .toEIP12Object();

        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Transaction ID -> ", transactionId);
        return transactionId;
    } catch (e: any) {
        console.error("Error building or submitting transaction:", e);
        alert(`Transaction failed: ${e.message}`);
        return null;
    }
}