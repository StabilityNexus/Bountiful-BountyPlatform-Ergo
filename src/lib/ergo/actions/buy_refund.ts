import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE,
    type Box
} from '@fleet-sdk/core';

import { SString } from '../utils';
import { type Bounty } from '../../common/bounty';
import { get_address } from '../contract';
import { SColl } from '@fleet-sdk/serializer';


export async function buy_refund(
    bounty: Bounty,
    token_amount: number
): Promise<string | null> {
    const ergo = window.ergo;
    
    if (!ergo) {
        throw new Error("Ergo object not available");
    }

    token_amount = Math.floor(token_amount * Math.pow(10, bounty.token_details.decimals));
    let ergo_amount = token_amount * bounty.exchange_rate;

    const walletPk = await ergo.get_change_address();
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    // Building the project output
    let output = new OutputBuilder(
        BigInt(bounty.value) + BigInt(ergo_amount),
        get_address(bounty.constants, bounty.version)
    )
    .addTokens({
        tokenId: bounty.bounty_id,
        amount: BigInt(bounty.current_idt_amount - token_amount)
    })
    .addTokens({
        tokenId: bounty.token_id,
        amount: BigInt(bounty.current_pft_amount)
    });

    let total_submissions = BigInt(token_amount > 0 ? bounty.total_submissions + token_amount : bounty.total_submissions);
    let refund_counter = BigInt(token_amount < 0 ? bounty.refund_counter - token_amount : bounty.refund_counter);
    
    output.setAdditionalRegisters({
        R4: SInt(bounty.block_limit).toHex(),
        R5: SLong(BigInt(bounty.min_submissions)).toHex(),
        R6: SColl(SLong, [total_submissions, refund_counter, BigInt(bounty.auxiliar_exchange_counter)]).toHex(),
        R7: SLong(BigInt(bounty.exchange_rate)).toHex(),
        R8: SString(bounty.constants.raw ?? ""),
        R9: SString(bounty.content.raw)
    });

    let outputs = [output];

    if (token_amount > 0) {
        outputs.push(
            new OutputBuilder(
                SAFE_MIN_BOX_VALUE,
                walletPk
            )
            .addTokens({
                tokenId: bounty.bounty_id,
                amount: (token_amount).toString()
            })
        )
    }

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object
    
    try {
        // Sign the transaction
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);

        // Send the transaction to the Ergo network
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Transaction id -> ", transactionId);
        return transactionId;
    } catch (e) {
        console.log(e)
        return null;
    }
}