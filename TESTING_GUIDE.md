# Testing Guide: Bounty Closing with Proposal Selection

This guide covers how to test the bounty closing functionality that uses proposal DataInputs.

## Table of Contents
1. [Unit Tests](#unit-tests)
2. [Manual Testing in Browser](#manual-testing-in-browser)
3. [Testnet Testing](#testnet-testing)
4. [Test Scenarios](#test-scenarios)
5. [Troubleshooting](#troubleshooting)

---

## Unit Tests

### Run All Tests
```bash
npm test
```

### Run Only Bounty Closing Tests
```bash
npm test -- bounty-closing.test.ts
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Expected Test Results
The tests should validate:
- ✅ Approved proposal validation passes
- ✅ Non-approved proposals are rejected
- ✅ Bounty ID mismatch is detected
- ✅ Missing registers are caught
- ✅ Refund path logic works correctly

---

## Manual Testing in Browser

### Prerequisites
1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Have Nautilus wallet installed and connected to testnet
4. Have testnet ERG for transactions

### Step-by-Step Testing

#### 1. Create a Test Bounty
1. Open the app in browser (usually `http://localhost:5173`)
2. Connect your Nautilus wallet (testnet)
3. Navigate to "Create Bounty"
4. Fill in:
   - Title: "Test Bounty for Closing"
   - Description: "Testing proposal selection"
   - Token ID: (use a test token or leave empty for ERG-only)
   - Block Limit: Set to a future block (e.g., current height + 1000)
   - Exchange Rate: 1000000000 (1 ERG per token)
   - Minimum Sold: 1
5. Click "Create Bounty"
6. **Verify**: Bounty appears in "My Bounties"

#### 2. Submit a Proposal (as different user/address)
1. Switch to a different wallet address (or use a different browser/profile)
2. Navigate to the created bounty
3. Click "Submit Proposal"
4. Fill in:
   - Summary: "Test Proposal"
   - Repository URL: "https://github.com/test/repo"
5. Click "Submit Proposal"
6. **Verify**: Proposal appears with status "pending"

#### 3. Approve the Proposal (as bounty creator)
1. Switch back to the creator wallet
2. Navigate to the bounty
3. Find the proposal in the list
4. Click "Approve" button
5. Sign the transaction in Nautilus
6. **Verify**: 
   - Proposal status changes to "approved"
   - Transaction appears in explorer

#### 4. Test Proposal Selection UI
1. As bounty creator, navigate to the bounty
2. **Verify**: "Close Bounty" section appears (only after deadline passes)
3. If deadline hasn't passed, wait or manually set block limit to past
4. In "Close Bounty" section:
   - **Verify**: Dropdown shows approved proposals
   - Select a proposal from dropdown
   - **Verify**: Selected proposal info displays
   - **Verify**: Validation error appears if proposal is invalid

#### 5. Close Bounty with Selected Proposal
1. Select an approved proposal from dropdown
2. **Verify**: Selected proposal details show correctly
3. **Verify**: No validation errors appear
4. Click "Close Bounty & Distribute Rewards"
5. Sign transaction in Nautilus
6. **Verify**:
   - Transaction succeeds
   - Transaction ID is displayed
   - Bounty is closed (no longer appears in active bounties)
   - Proposer receives reward
   - Dev fee is sent correctly

#### 6. Test Validation Errors
1. Try to close without selecting a proposal:
   - **Verify**: Button is disabled
   - **Verify**: Error message appears
2. Try to select a non-approved proposal:
   - **Verify**: Only approved proposals appear in dropdown
3. Try to close with mismatched bounty ID (if you can simulate):
   - **Verify**: Validation error appears

#### 7. Test Refund Path (No Proposal Selected)
1. Create a new bounty
2. Wait for deadline to pass
3. **Verify**: "Close Bounty" section shows message about no approved proposals
4. As a contributor, try to refund:
   - **Verify**: Refund transaction works
   - **Verify**: ERG is returned correctly

---

## Testnet Testing

### Setup Testnet Environment
1. Ensure `src/lib/ergo/envs.ts` has:
   ```typescript
   export const network_id: "mainnet"|"testnet" = "testnet";
   ```

2. Connect to Ergo testnet in Nautilus

3. Get testnet ERG from faucet if needed

### Testnet Test Checklist
- [ ] Create bounty on testnet
- [ ] Submit proposal from different address
- [ ] Approve proposal
- [ ] Select proposal for closing
- [ ] Close bounty successfully
- [ ] Verify transaction on testnet explorer
- [ ] Verify funds distributed correctly
- [ ] Test refund path when no proposals

---

## Test Scenarios

### Scenario 1: Happy Path - Close with Approved Proposal
**Steps:**
1. Create bounty
2. Submit proposal
3. Approve proposal
4. Wait for deadline
5. Select proposal
6. Close bounty

**Expected:**
- ✅ Proposal selection works
- ✅ Validation passes
- ✅ Transaction succeeds
- ✅ Rewards distributed correctly

### Scenario 2: Invalid Proposal Status
**Steps:**
1. Create bounty
2. Submit proposal (status: pending)
3. Try to select pending proposal

**Expected:**
- ✅ Only approved proposals in dropdown
- ✅ Cannot select pending proposal

### Scenario 3: Bounty ID Mismatch
**Steps:**
1. Create bounty A
2. Create bounty B
3. Approve proposal for bounty A
4. Try to use that proposal for bounty B

**Expected:**
- ✅ Validation error appears
- ✅ Cannot close bounty B with bounty A's proposal

### Scenario 4: No Approved Proposals
**Steps:**
1. Create bounty
2. Wait for deadline
3. Don't approve any proposals

**Expected:**
- ✅ "No approved proposals" message appears
- ✅ Contributors can request refunds
- ✅ Cannot close bounty (no proposals to select)

### Scenario 5: Multiple Approved Proposals
**Steps:**
1. Create bounty
2. Submit multiple proposals
3. Approve multiple proposals
4. Select one for closing

**Expected:**
- ✅ All approved proposals appear in dropdown
- ✅ Can select any approved proposal
- ✅ Only selected proposal is used for closing

---

## Troubleshooting

### Issue: Tests fail with module not found
**Solution:**
```bash
npm install
npm test
```

### Issue: Proposal selection dropdown is empty
**Check:**
- Are there any approved proposals?
- Is the deadline passed?
- Are you logged in as the bounty creator?

### Issue: Validation error even with approved proposal
**Check:**
- Proposal status is exactly 1 (approved)
- Proposal bounty ID matches bounty box ID
- Proposal R4 register contains valid proposer address

### Issue: Transaction fails
**Check:**
- Sufficient ERG for fees
- Proposal box exists and is unspent
- Bounty box exists and is unspent
- Network connection is stable

### Issue: DataInput not included
**Check:**
- Transaction builder uses `.withDataFrom([proposalBox])`
- Proposal box is NOT in `.from()` inputs
- Check transaction in explorer for dataInputs array

### Debug Mode
Enable console logging:
1. Open browser DevTools (F12)
2. Check Console tab
3. Look for logs starting with:
   - "=== CLOSE BOUNTY WITH PROPOSAL START ==="
   - "Proposal status (parsed):"
   - "Building transaction with:"

---

## Verification Checklist

After testing, verify:

### Functionality
- [ ] Proposal selection dropdown works
- [ ] Only approved proposals shown
- [ ] Validation errors display correctly
- [ ] Close bounty button works
- [ ] Transaction succeeds
- [ ] Rewards distributed correctly

### Security
- [ ] Only creator can close bounty
- [ ] Only approved proposals can be selected
- [ ] Bounty ID mismatch is caught
- [ ] Invalid status proposals are rejected

### UI/UX
- [ ] Close bounty section appears at right time
- [ ] Error messages are clear
- [ ] Selected proposal info displays
- [ ] Button states are correct (disabled/enabled)

### Contract Integration
- [ ] Proposal box used as DataInput (not spent)
- [ ] Contract validates proposal correctly
- [ ] Payout address matches proposal R4
- [ ] Dev fee calculated correctly

---

## Quick Test Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- bounty-closing.test.ts

# Run tests in watch mode
npm run test:watch

# Start dev server
npm run dev

# Check TypeScript errors
npm run check
```

---

## Next Steps After Testing

1. **If tests pass**: Ready for testnet deployment
2. **If issues found**: 
   - Check console logs
   - Review transaction in explorer
   - Verify contract validation
   - Check network configuration

3. **Before mainnet**:
   - Complete all testnet tests
   - Review security audit
   - Test with multiple proposals
   - Test edge cases

---

## Additional Resources

- Ergo Testnet Explorer: https://testnet.ergoplatform.com
- Nautilus Wallet: https://github.com/capt-nemo429/nautilus-wallet
- Fleet SDK Docs: https://github.com/fleet-sdk/fleet

