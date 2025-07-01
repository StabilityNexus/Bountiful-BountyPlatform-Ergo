import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    type Box
} from '@fleet-sdk/core';
import { SInt, SPair, SColl } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { type contract_version, get_address, mint_contract_address } from '../contract';
import { type ConstantContent } from '$lib/common/bounty';
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from '../dev/dev_contract';
import { fetch_token_details, wait_until_confirmation } from '../fetch';

// Declare ergo object with proper typings
declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<Box[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: unknown): Promise<unknown>;
    submit_tx(tx: unknown): Promise<string>;
} | undefined;
    
async function get_token_data(token_id: string): Promise<{amount: number, decimals: number}> {
    let token_fetch = await fetch_token_details(token_id);
    let id_token_amount = token_fetch['emissionAmount'] ?? 0;
    if (id_token_amount === 0) { alert(token_id+" token emission amount is 0."); throw new Error(token_id+" token emission amount is 0.") }
    id_token_amount += 1;
    return {"amount": id_token_amount, "decimals": token_fetch['decimals']}
}

// Function to submit a project to the blockchain
export async function submit_bounty(
    version: contract_version,
    token_id: string, 
    token_amount: number,
    blockLimit: number,     // Block height until withdrawal/refund is allowed
    exchangeRate: number,   // Exchange rate ERG/Token
    bountyContent: string,    // Project content
    minimumSold: number,     // Minimum amount sold to allow withdrawal
    title: string,
    judgeAddress: string[]
): Promise<string|null> {
    if (!ergo) {
        throw new Error("Ergo object is not available");
    }

    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();

    let addressContent: ConstantContent = {
        "creator": walletPk,
        "dev_addr": get_dev_contract_address(),
        "dev_hash": get_dev_contract_hash(),
        "dev_fee": get_dev_fee(),
        "token_id": token_id
    };

    // Create structured bounty content with judges
    let structuredContent;
    try {
        // Try to parse existing bountyContent as JSON
        structuredContent = JSON.parse(bountyContent);
    } catch {
        // If not JSON, treat as description
        structuredContent = {
            description: bountyContent
        };
    }

    // Add title and judges to the content
    structuredContent.title = title;
    structuredContent.judges = judgeAddress;

    // Convert back to JSON string for storage in R9
    const finalBountyContent = JSON.stringify(structuredContent);

    // Get token emission amount.
    const token_data = await get_token_data(token_id);
    const id_token_amount = token_data.amount;
    const id_token_decimals = token_data.decimals;

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await ergo.get_utxos();
    if (inputs.length === 0) {
        throw new Error("No UTXOs available to fund the transaction");
    }

    let mintOutput = new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            mint_contract_address(addressContent, version)
        )
        .mintToken({ 
            amount: BigInt(id_token_amount),
            name: `${title} APT`,
            decimals: id_token_decimals, 
            description: `Temporal-funding Token for the ${title} project. Please, exchange the PFT for the project token on Bountiful once the deadline has passed.`
        });

    let contractOutput = new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            get_address(addressContent, version)    // Address of the project contract
        )
        .addTokens({
            tokenId: inputs[0].boxId,
            amount: BigInt(id_token_amount)  // The mint contract force to spend all the id_token_amount
        })
        .addTokens({
            tokenId: token_id ?? "",
            amount: token_amount.toString()
        })
        .setAdditionalRegisters({
           R4: SInt(blockLimit).toHex(),                              // Block limit for withdrawals/refunds
           R5: SLong(BigInt(minimumSold)).toHex(),                    // Minimum sold
           R6: SPair(SLong(BigInt(0)), SLong(BigInt(0))).toHex(),     // Pair [Tokens sold counter, Tokens refunded counter]
           R7: SLong(BigInt(exchangeRate)).toHex(),                   // Exchange rate ERG/Token
           R8: SString(JSON.stringify(addressContent)),               // Owner address, dev address and dev fee.
           R9: SString(finalBountyContent)                                // Project content
        });

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs) 
        .to(mintOutput)  
        .sendChangeTo(walletPk) 
        .payFee(RECOMMENDED_MIN_FEE_VALUE)  
        .build()
        .chain((builder) => 
            builder
                .to(contractOutput)
                .payFee(RECOMMENDED_MIN_FEE_VALUE)
                .build()
        )
        .toEIP12Object();

    // Sign the transaction
    const signedTransaction = await ergo.sign_tx(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    return transactionId;
}