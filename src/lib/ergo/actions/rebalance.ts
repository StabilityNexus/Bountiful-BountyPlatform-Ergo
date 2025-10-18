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

interface Window {
  ergo?: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<Box[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: unknown): Promise<unknown>;
    submit_tx(tx: unknown): Promise<string>;
  };
}

// Function to submit a project to the blockchain
export async function rebalance(
    bounty: Bounty,
    token_amount: number
): Promise<string|null> {
    
    const ergo = window.ergo;
    if (!ergo) {
        throw new Error("Ergo wallet not available");
    }
    
    token_amount = Math.trunc(token_amount * Math.pow(10, bounty.token_details.decimals));
    
    console.log("wants to add ", token_amount);

    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    // Building the project output
    let contract_output = new OutputBuilder(
        BigInt(bounty.value).toString(),
        get_address(bounty.constants, bounty.version)
    )
    .addTokens({
        tokenId: bounty.bounty_id,
        amount: BigInt(bounty.current_idt_amount).toString()
    });

    console.log("PFT current amount " + bounty.current_pft_amount / Math.pow(10, bounty.token_details.decimals));
    let contract_token_amount = bounty.current_pft_amount + token_amount;
    console.log("contract token amount " + contract_token_amount / Math.pow(10, bounty.token_details.decimals));
    
    if (contract_token_amount > 0) {
        contract_output.addTokens({
            tokenId: bounty.token_id,
            amount: (contract_token_amount).toString()
        });
    }

    contract_output.setAdditionalRegisters({
        R4: SInt(bounty.block_limit).toHex(),                        // Block limit for withdrawals/refunds
        R5: SLong(BigInt(bounty.min_submissions)).toHex(),            // Minimum sold
        R6: SColl(SLong, [
            BigInt(bounty.total_submissions), 
            BigInt(bounty.refund_counter), 
            BigInt(bounty.auxiliar_exchange_counter)
        ]).toHex(),
        R7: SLong(BigInt(bounty.exchange_rate)).toHex(),             // Exchange rate ERG/Token
        R8: SString(bounty.constants.raw ?? ""),                   // Withdrawal address (hash of walletPk)
        R9: SString(bounty.content.raw)                              // Project content
    });
    
    let outputs: OutputBuilder[] = [contract_output];
    
    // Building withdraw to address output
    if (token_amount < 0) {
        outputs.push(
            new OutputBuilder(
                SAFE_MIN_BOX_VALUE.toString(),
                walletPk
            )
            .addTokens({
                tokenId: bounty.token_id,
                amount: BigInt((-1) * token_amount).toString()
            })
        );
    }

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object

    // Sign the transaction
    const signedTransaction = await ergo.sign_tx(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    return transactionId;
}