import {
    OutputBuilder,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE,
    type Box
} from '@fleet-sdk/core';
import { SString } from '../utils';
import { type Bounty } from '../../common/bounty';
import { get_address } from '../contract';
import { get_dev_contract_address } from '../dev/dev_contract';
import { SColl, SPair } from '@fleet-sdk/serializer';

// Function to submit a project to the blockchain
export async function withdraw(
    bounty: Bounty,
    amount: number
): Promise<string|null> {

    const ergo = window.ergo;
    
    if (!ergo) {
        throw new Error("Ergo object not available");
    }
    
    amount = amount * Math.pow(10, 9);
    
    console.log("wants withdraw ", amount);

    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    // Building the project output
    let outputs: OutputBuilder[] = [];

    const devAddress = bounty.constants.dev_addr ?? get_dev_contract_address();  // If the constants do not contain the address and the development contract on the code base has changed, the transaction cannot be executed. In that case it is necessary to run the application from the commit with which the contract was created.
    const devFeePercentage = bounty.constants.dev_fee;
    let devAmount = amount * devFeePercentage/100;
    let projectAmount = BigInt(amount) - BigInt(devAmount) - BigInt(1100000);

    let number_of_dev_holders = BigInt(4);  // Should be variable.
    if (projectAmount < SAFE_MIN_BOX_VALUE || devAmount < SAFE_MIN_BOX_VALUE * number_of_dev_holders) {
        alert("The amount must be greater.");  // TODO improve the message.
        return null;
    }

    if (bounty.value > amount) {  // bounty.value represents the current ERG balance plus the minimum box value. Therefore, the maximum probable amount is likely equal to bounty.value minus the minimum box value (managed through the interface).
        const contractOutput = new OutputBuilder(
            (BigInt(bounty.value) - BigInt(amount)).toString(),
            get_address(bounty.constants, bounty.version)    // Address of the project contract
        ).addTokens({
            tokenId: bounty.bounty_id,
            amount: BigInt(bounty.current_idt_amount).toString()
        });
    
        if (bounty.current_pft_amount > 0) {
            contractOutput.addTokens({
                tokenId: bounty.token_id,
                amount: BigInt(bounty.current_pft_amount).toString()
            });
        }
    
        // Set additional registers in the output box
        contractOutput.setAdditionalRegisters({
            R4: SInt(bounty.block_limit).toHex(),                     // Block limit for withdrawals/refunds
            R5: SLong(BigInt(bounty.min_submissions)).toHex(),         // Minimum sold
            R6: SColl(SLong, [BigInt(bounty.total_submissions), BigInt(bounty.refund_counter), BigInt(bounty.auxiliar_exchange_counter)]).toHex(),
            R7: SLong(BigInt(bounty.exchange_rate)).toHex(),          // Exchange rate ERG/Token
            R8: SString(bounty.constants.raw ?? ""),                  // Dev content
            R9: SString(bounty.content.raw)                           // Project content
        });
        outputs.push(contractOutput);
    }

    outputs.push(
        new OutputBuilder(
            projectAmount.toString(),
            walletPk
        )
    );

    outputs.push(
        new OutputBuilder(
            BigInt(devAmount).toString(),
            devAddress
        )
    );

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(BigInt(1100000))               // Pay the recommended minimum fee
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
        console.error("Transaction failed:", e);
        return null;
    }
}