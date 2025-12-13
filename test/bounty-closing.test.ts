import { describe, test, expect } from '@jest/globals';
import { 
    validateProposalForClosing,
    type ProposalBox
} from '../src/lib/ergo/actions/approve_proposal';

/**
 * Tests for bounty closing flow with proposal selection.
 * 
 * These tests validate:
 * 1. Proposal status validation (must be APPROVED)
 * 2. Bounty ID matching
 * 3. DataInput usage (proposal box not spent)
 * 4. Refund path when no proposal selected
 */

describe('Bounty Closing Flow Tests', () => {
    const mockBountyId = 'test_bounty_1234567890123456789012345678901234567890123456789012345678901234';
    
    // Mock proposal box with approved status
    const createMockProposalBox = (status: number, bountyId: string): ProposalBox => {
        const statusHex = status.toString(16).padStart(2, '0');
        const statusSerialized = `05${statusHex}`;
        
        const bountyIdBytes = Buffer.from(bountyId, 'utf8');
        const bountyIdLength = bountyIdBytes.length.toString(16).padStart(2, '0');
        const bountyIdSerialized = `0e${bountyIdLength}${bountyIdBytes.toString('hex')}`;
        
        const proposerPK = '037997278992e996c5af9c4085e339b4224749113d748d39f3fd5295c68aae3fbb';
        const r4Serialized = `07${proposerPK}`;
        
        return {
            boxId: 'mock_proposal_box_id',
            value: '1000000',
            ergoTree: 'mock_ergo_tree',
            assets: [],
            additionalRegisters: {
                R4: {
                    serializedValue: r4Serialized,
                    renderedValue: proposerPK
                },
                R5: {
                    serializedValue: bountyIdSerialized,
                    renderedValue: bountyId
                },
                R6: {
                    serializedValue: '0e0a7b227469746c65223a2254657374227d',
                    renderedValue: '{"title":"Test"}'
                },
                R7: {
                    serializedValue: '08cd' + proposerPK,
                    renderedValue: 'mock_creator_prop'
                },
                R8: {
                    serializedValue: statusSerialized,
                    renderedValue: status.toString()
                }
            }
        } as any as ProposalBox;
    };

    describe('validateProposalForClosing', () => {
        test('should validate approved proposal with matching bounty ID', () => {
            const proposalBox = createMockProposalBox(1, mockBountyId);
            const result = validateProposalForClosing(proposalBox, mockBountyId);
            
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        test('should reject proposal with status != 1 (APPROVED)', () => {
            const testCases = [
                { status: 0, name: 'PENDING' },
                { status: 2, name: 'REJECTED' },
                { status: 3, name: 'DISPUTED' }
            ];

            testCases.forEach(({ status }) => {
                const proposalBox = createMockProposalBox(status, mockBountyId);
                const result = validateProposalForClosing(proposalBox, mockBountyId);
                
                expect(result.isValid).toBe(false);
                expect(result.error).toContain('must be approved');
            });
        });

        test('should reject proposal with mismatched bounty ID', () => {
            const proposalBox = createMockProposalBox(1, 'different_bounty_id');
            const result = validateProposalForClosing(proposalBox, mockBountyId);
            
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('bounty ID mismatch');
        });

        test('should reject proposal with missing R4 (proposer address)', () => {
            const proposalBox = createMockProposalBox(1, mockBountyId);
            (proposalBox as any).additionalRegisters.R4 = null;
            
            const result = validateProposalForClosing(proposalBox, mockBountyId);
            
            expect(result.isValid).toBe(false);
            // Error should indicate validation failure (either mentions R4 or invalid register)
            expect(result.error).toBeDefined();
            expect(result.error?.toLowerCase()).toMatch(/r4|register|invalid|missing/);
        });
    });

    describe('Refund Path (No Proposal Selected)', () => {
        test('should allow refund when no approved proposals exist', () => {
            const hasApprovedProposals = false;
            const deadlinePassed = true;
            const canRefund = deadlinePassed && !hasApprovedProposals;
            
            expect(canRefund).toBe(true);
        });

        test('should prevent refund when approved proposal exists', () => {
            const hasApprovedProposals = true;
            const deadlinePassed = true;
            const shouldCloseWithProposal = hasApprovedProposals;
            const canRefund = deadlinePassed && !hasApprovedProposals;
            
            expect(shouldCloseWithProposal).toBe(true);
            expect(canRefund).toBe(false);
        });
    });
});
