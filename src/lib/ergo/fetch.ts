/**
    https://api.ergoplatform.com/api/v1/docs/#operation/postApiV1BoxesUnspentSearch
*/

import { type Box, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { type Bounty, type TokenEIP4, getBountyContent, parseConstants, type ConstantContent } from "../common/bounty";
import { ErgoPlatform } from "./platform";
import { hexToUtf8 } from "./utils";
import { explorer_uri } from "./envs";
import { type contract_version, get_template_hash } from "./contract";

const expectedSigmaTypes = {
    R4: 'SInt',      // Block height (deadline) for the bounty
    R5: 'SLong',     // Minimum number of submissions required
    R6: 'Coll[SLong]', // [Total Submissions, Accepted Submissions, Rejected Submissions]
    R7: 'SLong',     // Reward amount in ERG
    R8: 'Coll[SByte]', // Creator's public key
    R9: 'Coll[SByte]'  // Encoded JSON containing bounty metadata, submissions data, judgment data
};

function hasValidSigmaTypes(additionalRegisters: any): boolean {
    for (const [key, expectedType] of Object.entries(expectedSigmaTypes)) {
        if (additionalRegisters[key] && additionalRegisters[key].sigmaType !== expectedType) {
            return false;
        }
    }
    return true;
}

export async function fetch_token_details(id: string): Promise<TokenEIP4> {
    const url = explorer_uri+'/api/v1/tokens/'+id;
        const response = await fetch(url, {
            method: 'GET',
        });

        try{
            if (response.ok) {
                let json_data = await response.json();
                if (json_data['type'] == 'EIP-004') {
                    return {
                        "name": json_data['name'],
                        "description": json_data['description'],
                        "decimals": json_data['decimals'],
                        "emissionAmount": json_data['emissionAmount']
                    }
                }
                else if (json_data['type'] == null) {
                    return {
                        "name": id.slice(0,6),
                        "description": "",
                        "decimals": 0,
                        "emissionAmount": json_data['emissionAmount']
                    }
                }
            }
        } catch {}
        return {
            'name': 'token',
            'description': "",
            'decimals': 0,
            'emissionAmount': null
        };
}

export async function wait_until_confirmation(tx_id: string): Promise<Box | null> {
    const url = explorer_uri + '/api/v1/transactions/' + tx_id;

    // Wait for 90 seconds before retrying
    await new Promise(resolve => setTimeout(resolve, 90000));

    const startTime = Date.now();

    while (true) {
        try {
            // Perform GET request to fetch transaction details
            const response = await fetch(url, {
                method: 'GET',
            });

            if (response.ok) {
                const json_data = await response.json();

                // Check if numConfirmations is greater than 0
                if (json_data.numConfirmations > 0) {
                    let e = json_data['outputs'][0];
                    return {
                        boxId: e.boxId,
                        value: e.value,
                        assets: e.assets,
                        ergoTree: e.ergoTree,
                        creationHeight: e.creationHeight,
                        additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc, [key, value]) => {
                            acc[key] = (value as { serializedValue: string }).serializedValue;
                            return acc;
                        }, {} as {
                            [key: string]: string;
                        }),
                        index: e.index,
                        transactionId: e.transactionId
                    };
                }
            } else {
               // console.log(`Error fetching transaction: ${response.statusText}`);
            }
        } catch (error) {
           // console.log(`Error during fetch: ${error}`);
        }

        // Check if 5 minutes have passed
        // if (Date.now() - startTime > 5 * 60 * 1000) {
        //     return null;
        // }

        // Wait for 5 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

export async function fetch_bounties(offset: number = 0): Promise<Map<string, Bounty>> {
    try {
        let bounties = new Map<string, Bounty>();
        let registers = {};
        let moreDataAvailable;

        const versions: contract_version[] = ["v1_0", "v1_1"];

        for (const version of versions) {
            
            moreDataAvailable = true;
            let params = {
                offset: offset,
                limit: 9,
            };

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
                        "ergoTreeTemplateHash": get_template_hash(version),
                        "registers": registers,
                        "constants": {},
                        "assets": []
                    }),
                });

                if (response.ok) {
                    let json_data = await response.json();
                    if (json_data.items.length == 0) {
                        moreDataAvailable = false;
                        break;
                    }
                    for (const e of json_data.items) {
                        if (hasValidSigmaTypes(e.additionalRegisters)) {
                            // Extract bounty data from registers
                            const bountyId = e.assets[0].tokenId;
                            const deadline = parseInt(e.additionalRegisters.R4.renderedValue);
                            const minSubmissions = parseInt(e.additionalRegisters.R5.renderedValue);
                            const submissionStats = JSON.parse(e.additionalRegisters.R6.renderedValue);
                            const totalSubmissions = submissionStats[0];
                            const acceptedSubmissions = submissionStats[1];
                            const rejectedSubmissions = submissionStats[2];
                            const rewardAmount = parseInt(e.additionalRegisters.R7.renderedValue);
                            // const creatorPubKey = e.additionalRegisters.R8.renderedValue; // Will be derived from parsedConstants
                            
                            // Parse R8 register for constants
                            const r8Value = e.additionalRegisters.R8?.renderedValue;
                            let parsedConstants: ConstantContent = { 
                                raw: r8Value, 
                                owner: '', 
                                dev_addr: '', 
                                dev_hash: '', 
                                dev_fee: 0, 
                                token_id: '' 
                            };
                            if (r8Value) {
                                try {
                                    parsedConstants = parseConstants(r8Value);
                                } catch (err) {
                                    console.error("Failed to parse R8 constants for box:", e.boxId, "R8 value:", r8Value, "Error:", err);
                                    // Keep default empty constants or skip this bounty if constants are crucial and unparseable
                                }
                            } else {
                                console.warn("R8 register not found or empty for box:", e.boxId);
                            }
                            
                            // Parse the encoded JSON data from R9
                            const bountyData = e.additionalRegisters.R9.renderedValue;
                            const submissionsRoot = bountyData.slice(0, 64); // First 32 bytes
                            const judgmentsRoot = bountyData.slice(64, 128); // Next 32 bytes
                            const metadataRoot = bountyData.slice(128, 192); // Next 32 bytes
                            
                            // Parse metadata content
                            const content = getBountyContent(
                                bountyId.slice(0, 8),
                                hexToUtf8(metadataRoot) ?? ""
                            );

                            // Check if bounty token is correct (amount should be 1)
                            if (e.assets[0].amount !== 1) continue;

                            // Create the bounty object
                            bounties.set(bountyId, {
                                                            version: version,
                                                            platform: new ErgoPlatform(),
                                                            status: 'open',
                                                            box: {
                                                                boxId: e.boxId,
                                                                value: e.value,
                                                                assets: e.assets,
                                                                ergoTree: e.ergoTree,
                                                                creationHeight: e.creationHeight,
                                                                additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc, [key, value]) => {
                                                                    acc[key] = (value as { serializedValue: string }).serializedValue;
                                                                    return acc;
                                                                }, {} as {
                                                                    [key: string]: string;
                                                                }),
                                                                index: e.index,
                                                                transactionId: e.transactionId
                                                            },
                                                            bounty_id: bountyId,
                                                            id: bountyId.slice(0, 8), // Example ID
                                                            title: content.title ?? "Untitled Bounty", // Example title
                                                            description: content.description ?? "No description available", // Example description
                                                            reward: rewardAmount, // Example reward
                                                            constants: parsedConstants, // Use parsed constants
                                                            deadline: deadline,
                                                            min_submissions: minSubmissions,
                                                            total_submissions: totalSubmissions,
                                                            accepted_submissions: acceptedSubmissions,
                                                            rejected_submissions: rejectedSubmissions,
                                                            reward_amount: rewardAmount,
                                                            creator: parsedConstants.owner, // Set creator from parsedConstants
                                                            creator_pub_key: parsedConstants.owner, // Assuming owner address also serves as pub_key
                                                            submissions_root: submissionsRoot,
                                                            judgements_root: judgmentsRoot,
                                                            metadata_root: metadataRoot,
                                                            content: content,
                                                            value: e.value,
                                                            current_height: e.creationHeight,
                                                            token_details: await fetch_token_details(bountyId)
                                                        });
                        }
                    }                
                    params.offset += params.limit;
                } 
                else {
                    console.error('Error while making the POST request');
                    return new Map();
                }
            }
        }
        return bounties;
    } catch (error) {
        console.error('Error while making the POST request:', error);
        return new Map();
    }
}

// Helper function to check if a bounty has passed its deadline
export function is_bounty_expired(bounty: Bounty, currentHeight: number): boolean {
    return currentHeight > (bounty.deadline ?? 0);
}

// Helper function to check if a bounty can be refunded
export function can_refund_bounty(bounty: Bounty, currentHeight: number): boolean {
    return is_bounty_expired(bounty, currentHeight) && 
           ((bounty.total_submissions ?? 0) < (bounty.min_submissions ?? 0) || bounty.accepted_submissions === 0);
}

// Helper function to check if rewards can be withdrawn
export function can_withdraw_reward(bounty: Bounty): boolean {
    return (bounty.accepted_submissions ?? 0) > 0 && (bounty.total_submissions ?? 0) >= (bounty.min_submissions ?? 0);
}

// Calculate platform fees for a bounty
export function calculate_fees(bounty: Bounty): { minerFee: number, platformFee: number, devFee: number } {
    const minerFee = 1100000; // Base miner fee
    const platformFeePercent = 10; // 1% fee (10/1000)
    const platformFee = Math.floor((bounty.reward_amount ?? 0) * platformFeePercent / 1000);
    const devFee = platformFee;
    
    return {
        minerFee,
        platformFee,
        devFee
    };
}

// Calculate final reward amount after fees
export function calculate_final_reward(bounty: Bounty): number {
    const { minerFee, platformFee } = calculate_fees(bounty);
    return (bounty.reward_amount ?? 0) - platformFee - minerFee;
}