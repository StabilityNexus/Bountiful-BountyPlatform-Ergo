import { compile } from "@fleet-sdk/compiler";
import { blake2b256, hex, sha256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "../utils";
import { Network } from "@fleet-sdk/core";
import { explorer_uri, network_id } from "../envs";
import { distributeFunds } from "./distribute_funds";

function wallets() {
    let bruno;
    let lgd;
    let jm;
    let order;

    if (network_id == "mainnet")
    {
        bruno = "9fBF4dceTsqdhsYUNVZHjsv4jqoKVzVv3KywFCycbkEXEq5j6bp";
        lgd   = "9gkRrMRdSstibAsVzCtYumUGbXDPQZHkfuAaqmA49FNH3tN4XDg";
        jm    = "9ejNy2qoifmzfCiDtEiyugthuXMriNNPhNKzzwjPtHnrK3esvbD";
        order = "9h9hjN2KC3jEyCa6KEYKBotPRESdo9oa29yyKcoSLWwtaX2VvhM";
    }
    else 
    {
        bruno = "3WzH5yEJongYHmBJnoMs3zeK3t3fouMi3pigKdEURWcD61pU6Eve";
        lgd   = "3WxiAefTPNZckPoXq4sUx2SSPYyqhXppee7P1AP1C1A8bQyFP79S";
        jm    = "3WzH5yEJongYHmBJnoMs3zeK3t3fouMi3pigKdEURWcD61pU6Eve";
        order = "3WxiAefTPNZckPoXq4sUx2SSPYyqhXppee7P1AP1C1A8bQyFP79S";
    }

    return {
        "bruno": bruno,
        "lgd": lgd,
        "jm": jm,
        "order": order
    }
}

function generate_contract(): string {
    let w = wallets()
    let bruno = w['bruno']
    let lgd = w['lgd']
    let jm = w['jm']
    let order = w['order']

    return `
{
    // ===== Contract Information ===== //
    // Name: Bountiful Bounty Platform Dev Fee Contract
    // Description: Contract guarding the fee box for the Bountiful Bounty Platform.
    // Version: 1.0.0
    // Based on: Bene Fundraising Platform Dev Fee Contract

    // ===== Box Contents ===== //
    // Tokens
    // None
    // Registers
    // None

    // ===== Relevant Transactions ===== //
    // 1. Fee Distribution Tx
    // Inputs: BountifulFee1, ... , BountifulFeeM
    // DataInputs: None
    // Outputs: Bruno, Lgd, Jossemii, The Stable Order, MinerFee
    // Context Variables: None

    // ===== Compile Time Constants ($) ===== //
    // bruno: receiver address
    // lgd:   receiver address
    // jm:    receiver address
    // order: receiver address

    // ===== Context Variables (_) ===== //
    // None

    // ===== Relevant Variables ===== //
    val minerFee = 1100000
    val minerFeeErgoTreeBytesHash: Coll[Byte] = fromBase16("e540cceffd3b8dd0f401193576cc413467039695969427df94454193dddfb375")
    
    val feeDenom: Long   = 100L
    val brunoNum: Long   = 32L  // Bruno
    val lgdNum: Long = 32L     // Lgd
    val jmNum: Long = 32L     // Jossemi
    val orderNum: Long = 4L  // The Stable Order
    
    val brunoAddress: SigmaProp   = PK("${bruno}")
    val lgdAddress: SigmaProp = PK("${lgd}")
    val jmAddress: SigmaProp = PK("${jm}")
    val orderAddress: SigmaProp = PK("${order}")

    // ===== Fee Distribution Tx ===== //
    val validFeeDistributionTx: Boolean = {                         

        // Outputs
        val brunoBoxOUT: Box    = OUTPUTS(0)
        val lgdBoxOUT: Box  = OUTPUTS(1)
        val jmBoxOUT: Box  = OUTPUTS(2)
        val orderBoxOUT: Box = OUTPUTS(3)
        val minerFeeBoxOUT: Box = OUTPUTS(4)

        val outputAmount: Long = OUTPUTS.map({ (output: Box) => output.value }).fold(0L, { (acc: Long, curr: Long) => acc + curr })
        val devAmount: Long = outputAmount - minerFeeBoxOUT.value // In case the miner fee increases in the future.

        val validMinAmount: Boolean = (outputAmount >= 5000000L) // This prevents dust transactions
        
        val validDevBoxes: Boolean = {

            val brunoAmount: Long   = (brunoNum * devAmount) / feeDenom
            val lgdAmount: Long = (lgdNum * devAmount) / feeDenom
            val jmAmount: Long = (jmNum * devAmount) / feeDenom
            val orderAmount: Long = (orderNum * devAmount) / feeDenom

            val validBruno: Boolean   = (brunoBoxOUT.value == brunoAmount) && (brunoBoxOUT.propositionBytes == brunoAddress.propBytes)
            val validLgd: Boolean = (lgdBoxOUT.value == lgdAmount) && (lgdBoxOUT.propositionBytes == lgdAddress.propBytes)
            val validJm: Boolean = (jmBoxOUT.value == jmAmount) && (jmBoxOUT.propositionBytes == jmAddress.propBytes)
            val validOrder: Boolean = (orderBoxOUT.value == orderAmount) && (orderBoxOUT.propositionBytes == orderAddress.propBytes)

            allOf(Coll(
                validBruno,
                validLgd,
                validJm,
                validOrder
            ))

        }

        val validMinerFee: Boolean = {

            allOf(Coll(
                (minerFeeBoxOUT.value >= minerFee), // In case the miner fee increases in the future
                (blake2b256(minerFeeBoxOUT.propositionBytes) == minerFeeErgoTreeBytesHash)
            ))

        }

        val validOutputSize: Boolean = (OUTPUTS.size == 5)

        allOf(Coll(
            validMinAmount,
            validDevBoxes,
            validMinerFee,
            validOutputSize
        ))

    }

    sigmaProp(validFeeDistributionTx) // && atLeast(1, Coll(brunoAddress, lgdAddress, jmAddress, orderAddress)) // Done so we are incentivized to not spam the miner fee.

}
    `;
}

export function get_dev_contract_hash(): string {
    return uint8ArrayToHex(
        blake2b256(
            compile(generate_contract(), {version: 1, network: network_id}).toBytes()  // Compile contract to ergo tree
        )                                                         // Blake2b256 hash of contract bytes
    );
}

export function get_dev_contract_address(): string {
    let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return compile(generate_contract(), {version: 1, network: network_id}).toAddress(network).toString()
}

export function get_dev_fee(): number {
    return 1; // 0.1% (as per the Bountiful contract - platformFeePercent = 10 which equals 1%)
}

function get_template_hash(): string {
    let contract = generate_contract();
    return hex.encode(sha256(compile(contract, {version: 1, network: network_id}).template.toBytes()))
}

export async function download_dev() {
    try {
        let params = {
            offset: 0,
            limit: 500,
        };
        let moreDataAvailable = true;

        while (moreDataAvailable) {
            const url = explorer_uri+'/api/v1/boxes/unspent/search';
            const response = await fetch(url + '?' + new URLSearchParams({
                offset: params.offset.toString(),
                limit: params.limit.toString(),
            }), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                    "ergoTreeTemplateHash": get_template_hash(),
                    "registers": {},
                    "constants": {},
                    "assets": []
                }),
            });

            if (response.ok) {
                let json_data = await response.json();
                return json_data.items.map((e: {
                    boxId: string;
                    value: number;
                    assets: any[];
                    ergoTree: string;
                    creationHeight: number;
                    additionalRegisters: Record<string, { serializedValue: string }>;
                    index: number;
                    transactionId: string;
                }) => ({
                    boxId: e.boxId,
                    value: e.value,
                    assets: e.assets,
                    ergoTree: e.ergoTree,
                    creationHeight: e.creationHeight,
                    additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc: Record<string, string>, [key, value]) => {
                        acc[key] = value.serializedValue;
                        return acc;
                    }, {} as Record<string, string>),
                    index: e.index,
                    transactionId: e.transactionId
                }));
            } else {
                console.log(response)
            }
        }
    } catch (error) {
        console.error('Error while making the POST request:', error);
    }
    return []
}

interface Box {
    boxId: string;
    value: number;
    assets: any[];
    ergoTree: string;
    creationHeight: number;
    additionalRegisters: Record<string, string>;
    index: number;
    transactionId: string;
}

export async function execute_dev(box: Box): Promise<void> {
    try {
        console.log(`Executing action with Box ID: ${box.boxId} and Value: ${box.value}`);

        let w = wallets();
        let bruno: string = w['bruno'];
        let lgd: string = w['lgd'];
        let jm: string = w['jm'];
        let order: string = w['order'];

        distributeFunds(box, bruno, lgd, jm, order, 32, 32, 32, 4, box.value);
    } catch (e: any) {
        console.error("Error executing action:", e.message);
    }
}