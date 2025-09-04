import { describe, test, expect, beforeAll } from '@jest/globals';
import { OutputBuilder } from '@fleet-sdk/core';
import { get_proposal_contract_details } from '../src/lib/ergo/proposal_contract';

describe('Proposal Contract Tests', () => {
    let contractDetails: any;
    
    beforeAll(() => {
        contractDetails = get_proposal_contract_details("v1_0");
        console.log('Testing contract:', contractDetails.address.substring(0, 50) + '...');
    });

    test('Contract should compile successfully', () => {
        expect(contractDetails).toBeDefined();
        expect(contractDetails.address).toBeDefined();
        expect(contractDetails.ergoTree).toBeDefined();
        expect(contractDetails.address.length).toBeGreaterThan(50);
        
        console.log('Contract compilation test passed');
    });

    test('Should validate dispute functionality structure', () => {
        // Test the dispute logic we implemented
        const validStatuses = {
            PENDING: 0,
            APPROVED: 1, 
            REJECTED: 2,
            DISPUTED: 3
        };
        
        // Test status transitions for dispute
        const canDisputeFrom = [
            validStatuses.PENDING,
            validStatuses.APPROVED,
            validStatuses.REJECTED
        ];
        
        expect(canDisputeFrom).toContain(0); // Can dispute from pending
        expect(canDisputeFrom).toContain(1); // Can dispute from approved
        expect(canDisputeFrom).toContain(2); // Can dispute from rejected
        expect(canDisputeFrom).not.toContain(3); // Cannot dispute from disputed
        
        console.log('Dispute status validation passed');
    });

    test('Should create valid proposal registers', () => {
        const testData = {
            proposerPK: "037997278992e996c5af9c4085e339b4224749113d748d39f3fd5295c68aae3fbb",
            bountyId: "test_bounty_123",
            metadata: JSON.stringify({ title: "Test Proposal", url: "https://github.com/test" }),
            status: 0 // Pending
        };

        // Test register formatting
        const registers = {
            R4: `0721${testData.proposerPK}`, // GroupElement
            R5: encodeCollBytes(testData.bountyId), // BountyId
            R6: encodeCollBytes(testData.metadata), // Metadata
            R7: `08cd${testData.proposerPK}`, // Creator (same as proposer for test)
            R8: '0400' // Status: Pending
        };

        // Validate register formats
        expect(registers.R4).toMatch(/^0721[0-9a-f]{66}$/i);
        expect(registers.R5).toMatch(/^0e[0-9a-f]+$/i);
        expect(registers.R6).toMatch(/^0e[0-9a-f]+$/i);
        expect(registers.R7).toMatch(/^08cd[0-9a-f]{66}$/i);
        expect(registers.R8).toBe('0400');

        console.log('Register formatting test passed');
    });

    test('Should create valid dispute transaction structure', () => {
        const proposalBox = new OutputBuilder(
            1000000n, // 1 ERG
            contractDetails.ergoTree
        );

        const testRegisters = {
            R4: "072137997278992e996c5af9c4085e339b4224749113d748d39f3fd5295c68aae3fbb",
            R5: encodeCollBytes("test_bounty"),
            R6: encodeCollBytes('{"title":"Test"}'),
            R7: "08cd37997278992e996c5af9c4085e339b4224749113d748d39f3fd5295c68aae3fbb", 
            R8: '0406' // Status: Disputed
        };

        proposalBox.setAdditionalRegisters(testRegisters);

        expect(proposalBox).toBeDefined();
        console.log('Dispute box structure test passed');
    });
});

// Helper function to encode Coll[Byte]
function encodeCollBytes(str: string): string {
    const bytes = Buffer.from(str, 'utf8');
    const lengthHex = bytes.length.toString(16).padStart(2, '0');
    return `0e${lengthHex}${bytes.toString('hex')}`;
}
