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

declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<any[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: any): Promise<any>;
    submit_tx(tx: any): Promise<string>;
};

async function get_token_data(token_id: string): Promise<{amount: number, decimals: number}> {
    console.log("[submit_bounty.ts] get_token_data: Start", { token_id });
    try {
        let token_fetch = await fetch_token_details(token_id);
        console.log("[submit_bounty.ts] get_token_data: Fetched token details", { token_fetch });
        let id_token_amount = token_fetch['emissionAmount'] ?? 0;
        if (id_token_amount === 0) {
            console.error("[submit_bounty.ts] get_token_data: Token emission amount is 0");
            throw new Error(token_id+" token emission amount is 0.");
        }
        id_token_amount += 1;
        console.log("[submit_bounty.ts] get_token_data: End", { id_token_amount, decimals: token_fetch['decimals'] });
        return {"amount": id_token_amount, "decimals": token_fetch['decimals']};
    } catch (error) {
        console.error("[submit_bounty.ts] get_token_data: Catch block", { error });
        throw error;
    }
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
        console.warn("Audio playback failed:", error);
    }
}

async function mint_bounty_tx(title: string, constants: ConstantContent, version: contract_version): Promise<Box> {
    console.log("[submit_bounty.ts] mint_bounty_tx: Start", { title, constants, version });
    try {
        // Get the wallet address (will be the bounty address)
        console.log("[submit_bounty.ts] mint_bounty_tx: Before get_change_address()");
        const walletPk = await ergo.get_change_address();
        console.log("[submit_bounty.ts] mint_bounty_tx: After get_change_address()", { walletPk });

        // Get the UTXOs from the current wallet to use as inputs
        console.log("[submit_bounty.ts] mint_bounty_tx: Before get_utxos()");
        const inputs = await ergo.get_utxos();
        console.log("[submit_bounty.ts] mint_bounty_tx: After get_utxos()", { inputs });

        // Validate we have inputs
        if (!inputs || inputs.length === 0) {
            throw new Error("No UTXOs available for minting transaction");
        }

        let outputs: OutputBuilder[] = [
            new OutputBuilder(
                SAFE_MIN_BOX_VALUE,
                mint_contract_address(constants, version)
            )
            .mintToken({ 
                name: title + " APT",    // APT = Assignment Project Token
                description: "Bounty Token for " + title + ". Holders can claim the bounty reward upon successful completion.",
                amount: BigInt(1), 
            }) 
        ];

        // Building the unsigned transaction
        console.log("[submit_bounty.ts] mint_bounty_tx: Before TransactionBuilder");
        const currentHeight = await ergo.get_current_height();
        const unsignedTransaction = await new TransactionBuilder(currentHeight)
            .from(inputs)
            .to(outputs)
            .sendChangeTo(walletPk)
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .build()
            .toEIP12Object();
        console.log("[submit_bounty.ts] mint_bounty_tx: After TransactionBuilder", { unsignedTransaction });

        // Sign the transaction
        console.log("[submit_bounty.ts] mint_bounty_tx: Before sign_tx");
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        console.log("[submit_bounty.ts] mint_bounty_tx: After sign_tx", { signedTransaction });

        // Send the transaction to the Ergo network
        console.log("[submit_bounty.ts] mint_bounty_tx: Before submit_tx");
        const transactionId = await ergo.submit_tx(signedTransaction);
        console.log("[submit_bounty.ts] mint_bounty_tx: After submit_tx", { transactionId });

        console.log("[submit_bounty.ts] mint_bounty_tx: Before wait_until_confirmation");
        let box = await wait_until_confirmation(transactionId);
        console.log("[submit_bounty.ts] mint_bounty_tx: After wait_until_confirmation", { box });
        
        if (box == null) {
            console.error("[submit_bounty.ts] mint_bounty_tx: wait_until_confirmation returned null");
            throw new Error("Bounty mint transaction failed: No confirmation received.");
        }

        // Validate the minted token exists
        if (!box.assets || box.assets.length === 0) {
            throw new Error("Bounty mint transaction failed: No token was minted.");
        }

        console.log("[submit_bounty.ts] mint_bounty_tx: End", { box });
        return box;
    } catch (error) {
        console.error("[submit_bounty.ts] mint_bounty_tx: Catch block", { error });
        throw error;
    }
}

// Function to submit a bounty to the blockchain
export async function submit_bounty(
    version: contract_version,
    token_id: string, 
    blockLimit: number,     // Block height until bounty expires
    rewardAmount: number,   // Reward amount in ERG
    bountyContent: string,  // Bounty description and requirements
    minimumParticipants: number, // Minimum participants required
    title: string
): Promise<string|null> {
    console.log("[submit_bounty.ts] submit_bounty: Start", { version, token_id, blockLimit, rewardAmount, bountyContent, minimumParticipants, title });
    
    // Validate inputs
    if (!title || title.trim() === "") {
        throw new Error("Bounty title is required");
    }
    if (!bountyContent || bountyContent.trim() === "") {
        throw new Error("Bounty content is required");
    }
    if (rewardAmount <= 0) {
        throw new Error("Reward amount must be greater than 0");
    }
    if (minimumParticipants <= 0) {
        throw new Error("Minimum participants must be greater than 0");
    }
    if (blockLimit <= 0) {
        throw new Error("Block limit must be greater than 0");
    }

    try {
        // Get the wallet address (will be the bounty creator address)
        console.log("[submit_bounty.ts] submit_bounty: Before get_change_address()");
        const walletPk = await ergo.get_change_address();
        console.log("[submit_bounty.ts] submit_bounty: After get_change_address()", { walletPk });

        if (!walletPk) {
            throw new Error("Unable to get wallet address");
        }

        let addressContent: ConstantContent = {
            "owner": walletPk,
            "dev_addr": get_dev_contract_address(),
            "dev_hash": get_dev_contract_hash(),
            "dev_fee": get_dev_fee(),
            "token_id": token_id
        };

        // Build the mint tx for the bounty token
        console.log("[submit_bounty.ts] submit_bounty: Before mint_bounty_tx()");
        let mint_box = await mint_bounty_tx(title, addressContent, version);
        console.log("[submit_bounty.ts] submit_bounty: After mint_bounty_tx()", { mint_box });
        
        // Validate mint box and get bounty token ID
        if (!mint_box.assets || mint_box.assets.length === 0) {
            throw new Error("Bounty token minting failed: No token found in mint box.");
        }
        
        let bounty_id = mint_box.assets[0].tokenId;
        if (!bounty_id) {
            console.error("[submit_bounty.ts] submit_bounty: bounty_id is null after minting");
            throw new Error("Bounty token minting failed: No token ID found after minting.");
        }
        console.log("[submit_bounty.ts] submit_bounty: Bounty token ID", { bounty_id });

        // Get fresh UTXOs for the main transaction (excluding the mint box which we already have)
        console.log("[submit_bounty.ts] submit_bounty: Before get_utxos() for main transaction");
        const walletUtxos = await ergo.get_utxos();
        console.log("[submit_bounty.ts] submit_bounty: After get_utxos() for main transaction", { walletUtxos });

        // Combine mint box with wallet UTXOs as inputs
        const inputs = [mint_box, ...walletUtxos];
        console.log("[submit_bounty.ts] submit_bounty: Combined inputs", { inputCount: inputs.length });

        // Calculate total value needed (reward + minimum box value + fees)
        const totalNeeded = BigInt(rewardAmount) + SAFE_MIN_BOX_VALUE + RECOMMENDED_MIN_FEE_VALUE;
        console.log("[submit_bounty.ts] submit_bounty: Total value needed", { totalNeeded: totalNeeded.toString() });

        // Building the bounty output
        console.log("[submit_bounty.ts] submit_bounty: Building output object");
        let outputs: OutputBuilder[] = [
            new OutputBuilder(
                SAFE_MIN_BOX_VALUE + BigInt(rewardAmount), // Include reward amount in box value
                get_address(addressContent, version)       // Address of the bounty contract
            )
            .addTokens({
                tokenId: bounty_id,
                amount: BigInt(1)  // Add the minted bounty token
            })
            .setAdditionalRegisters({
                R4: SInt(blockLimit).toHex(),                              // Block limit for bounty expiration
                R5: SLong(BigInt(minimumParticipants)).toHex(),            // Minimum participants required
                R6: SColl(SLong, [BigInt(0), BigInt(0)]).toHex(),          // Pair [Participants counter, Completed counter]
                R7: SLong(BigInt(rewardAmount)).toHex(),                   // Reward amount in ERG
                R8: SString(JSON.stringify(addressContent)),               // Owner address, dev address and dev fee
                R9: SString(bountyContent)                                 // Bounty content and requirements
            })
        ];

        // Building the unsigned transaction
        console.log("[submit_bounty.ts] submit_bounty: Before TransactionBuilder for main transaction");
        const currentHeight = await ergo.get_current_height();
        const unsignedTransaction = await new TransactionBuilder(currentHeight)
            .from(inputs)
            .to(outputs)
            .sendChangeTo(walletPk)
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .build()
            .toEIP12Object();
        console.log("[submit_bounty.ts] submit_bounty: After TransactionBuilder for main transaction", { unsignedTransaction });

        // Play notification sound
        try {
            playBeep();
        } catch (error) {
            console.error('[submit_bounty.ts] submit_bounty: Error executing play beep:', error);
        }

        // Sign the transaction
        console.log("[submit_bounty.ts] submit_bounty: Before sign_tx for main transaction");
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        console.log("[submit_bounty.ts] submit_bounty: After sign_tx for main transaction", { signedTransaction });

        // Send the transaction to the Ergo network
        console.log("[submit_bounty.ts] submit_bounty: Before submit_tx for main transaction");
        const transactionId = await ergo.submit_tx(signedTransaction);
        console.log("[submit_bounty.ts] submit_bounty: After submit_tx for main transaction", { transactionId });

        console.log("[submit_bounty.ts] submit_bounty: End, returning transactionId", transactionId);
        return transactionId;
    } catch (error) {
        console.error("[submit_bounty.ts] submit_bounty: Catch block", { error });
        throw error;
    }
}