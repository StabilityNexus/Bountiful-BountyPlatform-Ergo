import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    type Box
} from '@fleet-sdk/core';
import { SColl, SInt } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { type contract_version, get_address, mint_contract_address } from '../contract';
import { type ConstantContent } from '$lib/common/bounty';
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from '../dev/dev_contract';
import { fetch_token_details, wait_until_confirmation } from '../fetch';

// Declare ergo object for TypeScript
declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<any[]>;
    get_current_height(): Promise<number>;
    get_public_keys(): Promise<string[]>;
    sign_tx(tx: any): Promise<any>;
    submit_tx(tx: any): Promise<string>;
};

async function get_token_data(token_id: string): Promise<{amount: number, decimals: number}> {
    let token_fetch = await fetch_token_details(token_id);
    let id_token_amount = token_fetch['emissionAmount'] ?? 0;
    if (id_token_amount === 0) { 
        alert(token_id + " token emission amount is 0."); 
        throw new Error(token_id + " token emission amount is 0.") 
    }
    id_token_amount += 1;
    return {"amount": id_token_amount, "decimals": token_fetch['decimals']}
}

function playBeep(frequency = 1000, duration = 3000) {
    try {
        const audioCtx = new window.AudioContext();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        setTimeout(() => {
            oscillator.stop();
        }, duration);
    } catch (error) {
        console.error('Error playing beep:', error);
    }
}

async function mint_tx(title: string, constants: ConstantContent, version: contract_version, amount: number, decimals: number): Promise<Box> {
    // Get the wallet address (will be the bounty creator address)
    const walletPk = await ergo.get_change_address();

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await ergo.get_utxos();

    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            mint_contract_address(constants, version)
        )
        .mintToken({ 
            amount: BigInt(amount),
            name: title + " BNT",    // Bounty Token
            decimals: decimals, 
            description: "Bounty Token for the " + title + " bounty. This token represents participation in the bounty system."
        }) 
    ];

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new mint box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object

    // Sign the transaction
    const signedTransaction = await ergo.sign_tx(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Mint tx id: " + transactionId);

    let box = await wait_until_confirmation(transactionId);
    if (box == null) {
        alert("Mint tx failed.")
        throw new Error("Mint tx failed.")
    }

    console.log("Token created " + (await fetch_token_details(inputs[0].boxId)).name)
    console.log("Token minted id: " + inputs[0].boxId)
    return box;
}

/**
 * Creates a test submission to the dev fee contract
 * Used for testing the fee collection mechanism
 */
export async function submit_test(): Promise<string> {
    try {
        const walletPk = await ergo.get_change_address();
        const inputs = await ergo.get_utxos();
        const devAddress = get_dev_contract_address();
        
        const devOutput = new OutputBuilder(
            BigInt(5) * SAFE_MIN_BOX_VALUE,
            devAddress
        );
        
        const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
            .from(inputs)
            .to([devOutput])
            .sendChangeTo(walletPk)
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .build()
            .toEIP12Object();
            
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);
        
        await wait_until_confirmation(transactionId);
        return transactionId;
    } catch (error) {
        console.error("Error submitting test transaction:", error);
        throw new Error("Failed to submit test transaction");
    }
}

/**
 * Creates a bounty on the Bountiful platform
 */
export async function submit_bounty(
    version: contract_version,
    token_id: string,
    reward_amount: bigint,
    deadline: number,
    min_submissions: number,
    bounty_content: string,
    title: string,
    metadata: Record<string, any> = {}
): Promise<string | null> {
    try {
        // Get the wallet address (will be the bounty creator address)
        const walletPk = await ergo.get_change_address();

        let addressContent: ConstantContent = {
            "owner": walletPk,
            "creator": walletPk,
            "dev_addr": get_dev_contract_address(),
            "dev_hash": get_dev_contract_hash(),
            "dev_fee": get_dev_fee(),
            "token_id": token_id
        };

        // Get token emission amount
        let token_data = await get_token_data(token_id);
        let id_token_amount = token_data["amount"];

        // Build the mint tx
        let mint_box = await mint_tx(title, addressContent, version, id_token_amount, token_data["decimals"]);
        let bounty_id = mint_box.assets[0].tokenId;

        if (bounty_id === null) { 
            alert("Token minting failed!"); 
            return null; 
        }

        const currentHeight = await ergo.get_current_height();
        const actualDeadline = deadline > 0 ? deadline : currentHeight + 1000;

        // Get the UTXOs from the current wallet to use as inputs
        const inputs = [mint_box, ...await ergo.get_utxos()];

        // Building the bounty output
        let outputs: OutputBuilder[] = [
            new OutputBuilder(
                reward_amount + SAFE_MIN_BOX_VALUE, // Reward amount plus minimum box value
                get_address(addressContent, version) // Address of the bounty contract
            )
            .addTokens({
                tokenId: bounty_id,
                amount: BigInt(id_token_amount) // The mint contract forces to spend all the id_token_amount
            })
            .addTokens({
                tokenId: token_id,
                amount: "1" // Single NFT token for bounty identification
            })
            .setAdditionalRegisters({
                R4: SInt(actualDeadline).toHex(),                      // Deadline block height
                R5: SInt(min_submissions).toHex(),                     // Minimum submissions required
                R6: SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex(), // [submissions_count, judgments_count, rewards_paid]
                R7: SLong(reward_amount).toHex(),                      // Total reward amount
                R8: SString(JSON.stringify(addressContent)),           // Owner address, dev address and dev fee
                R9: SString(JSON.stringify({
                    content: bounty_content,
                    metadata: metadata,
                    submissions: {},
                    judgments: {}
                }))                                                    // Bounty content and state
            })
        ];

        // Building the unsigned transaction
        const unsignedTransaction = await new TransactionBuilder(currentHeight)
            .from(inputs)                          // Inputs coming from the mint box and user's UTXOs
            .to(outputs)                           // Outputs (the new bounty box)
            .sendChangeTo(walletPk)                // Send change back to the wallet
            .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
            .build()                               // Build the transaction
            .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object

        try {
            playBeep();
        } catch (error) {
            console.error('Error executing play beep:', error);
        }

        // Sign the transaction
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);

        // Send the transaction to the Ergo network
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Bounty transaction id -> ", transactionId);
        return transactionId;

    } catch (error) {
        console.error("Error creating bounty:", error);
        throw new Error("Failed to create bounty");
    }
}