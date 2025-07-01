import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    type Box
} from '@fleet-sdk/core';
import { SColl, SInt, SPair } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { type contract_version, get_address, mint_contract_address } from '../contract';
import { type ConstantContent } from '$lib/common/bounty';
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from '../dev/dev_contract';
import { wait_until_confirmation, fetch_token_details } from '../fetch';

declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<any[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: any): Promise<any>;
    submit_tx(tx: any): Promise<string>;
};

function playBeep(frequency = 1000, duration = 3000) {
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
}

async function get_token_data(token_id: string): Promise<{ amount: number; decimals: number }> {
    let token_fetch = await fetch_token_details(token_id);
    let id_token_amount = token_fetch['emissionAmount'] ?? 0;
    if (id_token_amount === 0) {
        alert(token_id + " token emission amount is 0.");
        throw new Error(token_id + " token emission amount is 0.");
    }
    id_token_amount += 1;
    return { amount: id_token_amount, decimals: token_fetch['decimals'] };
}

async function mint_tx(title: string, constants: ConstantContent, version: contract_version, amount: number, decimals: number, judgeAddresses: string[]): Promise<Box> {
    const walletPk = await ergo.get_change_address();
    const inputs = await ergo.get_utxos();

    const structuredContent = {
        title,
        judges: judgeAddresses,
        description: "Temporal-funding Token for the " + title + " project. Please, exchange the APT for the project token on Bountiful once the deadline has passed."
    };

    const finalContent = JSON.stringify(structuredContent);

    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE,
            mint_contract_address(constants, version)
        )
            .mintToken({
                amount: BigInt(amount),
                name: title + " APT",
                decimals: decimals,
                description: "Temporal-funding Token for the " + title + " project. Please, exchange the APT for the project token on Bountiful once the deadline has passed."
            })
            .setAdditionalRegisters({
                R4: SInt(0).toHex(), // Placeholder value
                R5: SLong(BigInt(0)).toHex(), // Placeholder value
                R6: SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex(), // Placeholder value
                R7: SLong(BigInt(0)).toHex(), // Placeholder value
                R8: SString(""),
                R9: SString(finalContent)
            })
    ];

    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();

    const signedTransaction = await ergo.sign_tx(unsignedTransaction);
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Mint tx id: " + transactionId);

    let box = await wait_until_confirmation(transactionId);
    if (box == null) {
        alert("Mint tx failed.");
        throw new Error("Mint tx failed.");
    }

    console.log("Token created " + (await fetch_token_details(inputs[0].boxId)).name);
    console.log("Token minted id: " + inputs[0].boxId);
    return box;
}

export async function submit_bounty(
    version: contract_version,
    token_id: string,
    token_amount: number,
    blockLimit: number,     // Block height until withdrawal/refund is allowed
    exchangeRate: number,   // Exchange rate ERG/Token
    bountyContent: string,    // Project content
    minimumSold: number,     // Minimum amount sold to allow withdrawal
    title: string,
    judgeAddresses: string[]
): Promise<string | null> {
    const walletPk = await ergo.get_change_address();

    let addressContent: ConstantContent = {
        "creator": walletPk,
        "dev_addr": get_dev_contract_address(),
        "dev_hash": get_dev_contract_hash(),
        "dev_fee": get_dev_fee(),
        "token_id": token_id
    };

    let token_data = await get_token_data(token_id);
    let id_token_amount = token_data["amount"];

    // Build the mint tx.
    let mint_box = await mint_tx(title, addressContent, version, id_token_amount, token_data["decimals"], judgeAddresses);
    let bounty_id = mint_box.assets[0].tokenId;

    if (bounty_id === null) { alert("Token minting failed!"); return null; }

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [mint_box, ...await ergo.get_utxos()];

    // Structured content with judges and title
    let structuredContent;
    try {
        structuredContent = JSON.parse(bountyContent);
    } catch {
        structuredContent = { description: bountyContent };
    }
    structuredContent.title = title;
    structuredContent.judges = judgeAddresses;

    const finalBountyContent = JSON.stringify(structuredContent);

    // Building the project output
    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE,
            get_address(addressContent, version)
        )
            .addTokens({
                tokenId: bounty_id,
                amount: BigInt(id_token_amount)
            })
            .addTokens({
                tokenId: token_id ?? "",
                amount: token_amount.toString()
            })
            .setAdditionalRegisters({
                R4: SInt(blockLimit).toHex(),
                R5: SLong(BigInt(minimumSold)).toHex(),
                R6: SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex(),
                R7: SLong(BigInt(exchangeRate)).toHex(),
                R8: SString(JSON.stringify(addressContent)),
                R9: SString(finalBountyContent)
            })
    ];

    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();

    try {
        playBeep();
    } catch (err) {
        console.error("Beep error:", err);
    }

    // Sign the transaction
    const signedTransaction = await ergo.sign_tx(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    return transactionId;
}


