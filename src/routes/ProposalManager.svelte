<script lang="ts">
    import { type Bounty } from "$lib/common/bounty";
    import { address, connected } from "$lib/common/store";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { web_explorer_uri_tx } from "$lib/ergo/envs";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label/index.js";
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { Card } from "$lib/components/ui/card";
    import { Textarea } from "$lib/components/ui/textarea";
    import { submit_proposal } from "$lib/ergo/actions/_submit_proposal";
    import { fetch_proposals } from "$lib/ergo/fetch";
    import { mode } from "mode-watcher";
    import { parseErgoRegisterJson } from "$lib/ergo/utils";
    import { loadProposalsFromPlatform } from "$lib/common/load_proposal";
    import { proposal_detail } from "$lib/common/store";
    import {
        hexToErgoAddress,
        extractHexFromBinary,
        parseDeveloperFromRawContent,
        convertHexToErgoAddress,
    } from "$lib/common/proposal";
    import { web_explorer_uri_addr } from "$lib/ergo/envs";

    import { creatorApproveProposal } from "$lib/ergo/actions/approve_proposal";

    export let bounty: Bounty;
    export let deadline_passed: boolean = false;
    export let is_max_submissions: boolean = false;

    let platform = new ErgoPlatform();

    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let show_proposal_form = false;
    let proposalSummary = "";
    let proposalChecklist = "";
    let proposalCodeLink = "";
    let proposalDemoLink = "";
    let proposalUrl = "";

    let proposals: Array<{
        id: string;
        developer: string | null;
        summary: string;
        url: string;
        status: string;
        submittedAt: Date;
        boxId: string;
        rawContent: any;
        registers: Record<string, string>;
        box: any;
    }> = [];

    let isCurrentUserJudge = false;

    // truncateAddress function for Ergo addresses
    function truncateAddress(address: string): string {
        if (!address || address === "Unknown") return "Unknown";

        // For Ergo addresses (starting with 9 and typically 51 characters)
        if (address.startsWith("9") && address.length > 20) {
            return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`;
        }

        // For other addresses
        if (address.length > 20) {
            return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`;
        }

        return address;
    }
    function formatDate(date: Date): string {
        return date.toLocaleDateString() + " at " + date.toLocaleTimeString();
    }

    // Check if current user is a judge
    // $: if (bounty) {
    //     isCurrentUserJudge =
    //         !!$address && !!bounty.content?.judges?.includes($address);
    // }

    $: if (bounty) {
        // Extract creator address from bounty metadata
        let creatorAddress = "";

        console.log("Full bounty object:", bounty);
        console.log("Bounty constants:", bounty.constants);
        console.log("Raw creator data:", bounty.constants?.creator);
        console.log("Creator data type:", typeof bounty.constants?.creator);

        try {
            if (bounty.constants?.creator) {
                let creatorData = bounty.constants.creator;

                // Log the raw bytes
                console.log(
                    "Creator data as bytes:",
                    Array.from(creatorData).map((c) => c.charCodeAt(0)),
                );

                // Try multiple approaches
                console.log("Attempting method 1: Direct sanitization");
                let attempt1 = sanitizeDeveloperAddress(creatorData);
                console.log("Method 1 result:", attempt1);

                if (
                    attempt1 &&
                    attempt1 !== "Unknown" &&
                    attempt1 !== "Address parsing error"
                ) {
                    creatorAddress = attempt1;
                } else {
                    console.log("Attempting method 2: Hex extraction");
                    const hexValue = extractHexFromBinary(creatorData);
                    console.log("Extracted hex:", hexValue);

                    if (hexValue && hexValue.length === 66) {
                        try {
                            creatorAddress = hexToErgoAddress(hexValue);
                            console.log(
                                "Method 2 hex conversion result:",
                                creatorAddress,
                            );
                        } catch (hexError) {
                            console.error(
                                "Hex to address conversion failed:",
                                hexError,
                            );
                        }
                    }

                    if (!creatorAddress) {
                        console.log(
                            "Attempting method 3: convertHexToErgoAddress",
                        );
                        try {
                            creatorAddress =
                                convertHexToErgoAddress(creatorData);
                            console.log("Method 3 result:", creatorAddress);
                        } catch (convertError) {
                            console.error(
                                "convertHexToErgoAddress failed:",
                                convertError,
                            );
                        }
                    }

                    if (!creatorAddress) {
                        console.log(
                            "Attempting method 4: Check bounty.box for creator info",
                        );
                        // Sometimes creator might be in the box itself
                        if (bounty.box) {
                            console.log("Bounty box:", bounty.box);
                            // Check if there's creator info in registers
                            const registers =
                                bounty.box.additionalRegisters || {};
                            console.log("Box registers:", registers);

                            // Try to find creator in any register
                            for (const [key, value] of Object.entries(
                                registers,
                            )) {
                                if (value && typeof value === "string") {
                                    const sanitized =
                                        sanitizeDeveloperAddress(value);
                                    if (
                                        sanitized &&
                                        sanitized !== "Unknown" &&
                                        sanitized !== "Address parsing error" &&
                                        sanitized.startsWith("9")
                                    ) {
                                        console.log(
                                            `Found potential creator in register ${key}:`,
                                            sanitized,
                                        );
                                        creatorAddress = sanitized;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (!creatorAddress) {
                        console.log(
                            "Attempting method 5: Check if data is already an address",
                        );
                        // Check if the raw data is already an Ergo address
                        if (
                            typeof creatorData === "string" &&
                            creatorData.startsWith("9") &&
                            creatorData.length > 40
                        ) {
                            creatorAddress = creatorData;
                            console.log(
                                "Method 5 - raw data is address:",
                                creatorAddress,
                            );
                        }
                    }
                }
            } else {
                console.log("No creator data found in bounty.constants");
            }
        } catch (e) {
            console.error("Failed to parse creator details:", e);
        }

        // Current user can approve if they are the bounty creator
        isCurrentUserJudge =
            !!$address && !!creatorAddress && $address === creatorAddress;

        // Debug logging
        console.log("Final creator address resolved to:", creatorAddress);
        console.log("Current user address:", $address);
        console.log("Is current user judge:", isCurrentUserJudge);
    }

    async function loadProposals() {
        if (!bounty) return;

        try {
            // Load proposals using the centralized function
            await loadProposalsFromPlatform(platform);

            // Subscribe to the proposal store to get the loaded proposals
            const unsubscribe = proposal_detail.subscribe((loadedProposals) => {
                if (loadedProposals) {
                    // Filter proposals for this specific bounty
                    proposals = loadedProposals
                        .filter((proposal) => {
                            // The bountyId is stored directly on the proposal object, not in rawContent
                            const proposalBountyId = proposal.bountyId;

                            // Handle the @ prefix that might be present
                            const cleanBountyId = proposalBountyId?.startsWith(
                                "@",
                            )
                                ? proposalBountyId.substring(1)
                                : proposalBountyId;

                            return cleanBountyId === bounty.bounty_id;
                        })

                        .map((proposal) => {
                            let developer = proposal.developer;

                            if (
                                developer === "Address parsing error" ||
                                developer === "Unknown" ||
                                /[^\x20-\x7E]/.test(developer)
                            ) {
                                developer = parseDeveloperFromRawContent(
                                    proposal.rawContent,
                                );

                                if (
                                    developer === "Unknown" ||
                                    developer === "Address parsing error"
                                ) {
                                    try {
                                        const rawContentObj =
                                            typeof proposal.rawContent ===
                                            "string"
                                                ? JSON.parse(
                                                      proposal.rawContent,
                                                  )
                                                : proposal.rawContent;

                                        if (
                                            rawContentObj.R4 &&
                                            rawContentObj.R4.renderedValue
                                        ) {
                                            developer = convertHexToErgoAddress(
                                                rawContentObj.R4.renderedValue,
                                            );
                                        }
                                    } catch (e) {
                                        console.error(
                                            "Failed direct hex conversion:",
                                            e,
                                        );
                                    }
                                }
                            }

                            developer = sanitizeDeveloperAddress(developer);

                            return {
                                id:
                                    proposal.id ||
                                    `${proposal.boxId}_${Date.now()}`,
                                developer,
                                summary: proposal.summary || "No summary",
                                url: proposal.url || "",
                                status: proposal.status || "pending",
                                submittedAt: proposal.submittedAt || new Date(),
                                boxId: proposal.boxId || "",
                                rawContent: proposal.rawContent || {},
                                registers: proposal.registers || {},
                                box: proposal.box,
                            };
                        })
                        .sort(
                            (a, b) =>
                                b.submittedAt.getTime() -
                                a.submittedAt.getTime(),
                        );

                    console.log("Loaded proposals from platform:", proposals);
                    console.log("Filtered for bounty:", bounty.bounty_id);
                }
            });

            unsubscribe();
        } catch (error) {
            console.error("Failed to load proposals:", error);
        }
    }

    async function submitProposal() {
        if (!bounty || !proposalSummary.trim() || !$address) return;

        isSubmitting = true;
        errorMessage = null;

        try {
            const timestamp = Date.now();
            if (!isValidUrl(proposalUrl)) {
                errorMessage =
                    "Please enter a valid URL for your code repository.";
                isSubmitting = false;
                return;
            }

            const submissionData = {
                title: proposalSummary.trim(),
                url: proposalUrl.trim(),
            };

            console.log("Submitting proposal data:", submissionData);

            const txId = await submit_proposal(
                bounty.bounty_id,
                "v1_0",
                $address,
                submissionData,
            );

            transactionId = txId;

            // Wait and reload proposals
            setTimeout(async () => {
                await loadProposals();
            }, 5000);

            show_proposal_form = false;
        } catch (error) {
            console.error("Proposal submission failed:", error);
            errorMessage =
                (error as any)?.message || "Failed to submit proposal";
        } finally {
            isSubmitting = false;
        }
    }

    // Proposal form functions
    function openProposalForm() {
        show_proposal_form = true;
        proposalSummary = "";
        proposalUrl = "";
        transactionId = null;
        errorMessage = null;
    }

    function closeProposalForm() {
        show_proposal_form = false;
    }

    // Helper function to validate URLs
    function isValidUrl(string: string): boolean {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

async function approveProposal(proposalId: string) {
    console.log("=== APPROVE PROPOSAL DEBUG START ===");
    console.log("ProposalId:", proposalId);
    console.log("Bounty exists:", !!bounty);
    console.log("Is current user judge:", isCurrentUserJudge);
    console.log("Current address:", $address);
    
    // Clear any previous error messages
    errorMessage = null;
    
    if (!bounty) {
        errorMessage = "No bounty found";
        console.error("No bounty found");
        return;
    }
    
    if (!isCurrentUserJudge) {
        errorMessage = "Only the bounty creator can approve proposals";
        console.error("User is not the judge. isCurrentUserJudge:", isCurrentUserJudge);
        return;
    }

    const proposal = proposals.find((p) => p.id === proposalId);
    if (!proposal) {
        errorMessage = "Proposal not found";
        console.error("Proposal not found with ID:", proposalId);
        console.log("Available proposals:", proposals.map(p => p.id));
        return;
    }
    
    console.log("Found proposal:", proposal);

    // Validate contribution threshold
    try {
        const bountyBox = bounty.box as any;
        console.log("Bounty box:", bountyBox);
        
        const countersRaw = bountyBox.R6 || "[0,0,0]";
        console.log("Counters raw:", countersRaw);
        
        const counters = JSON.parse(countersRaw);
        console.log("Parsed counters:", counters);

        const contributed = BigInt(counters?.[0] || 0);
        const minimumContribution = BigInt(bountyBox.R5 || "0");
        
        console.log("Contributed:", contributed.toString());
        console.log("Minimum contribution:", minimumContribution.toString());

        if (contributed < minimumContribution) {
            errorMessage = "Minimum contribution threshold not yet reached";
            console.error("Contribution threshold not met");
            return;
        }
        
        console.log("Contribution threshold validation passed");
    } catch (e) {
        console.error("Failed to validate contribution threshold:", e);
        errorMessage = "Failed to validate bounty state";
        return;
    }

    if (!$address) {
        errorMessage = "No wallet address found";
        console.error("No address found");
        return;
    }

    // Set loading state
    isSubmitting = true;
    console.log("Setting isSubmitting to true");

    try {
        const proposalBox = proposal.box;
        if (!proposalBox) {
            throw new Error("Proposal box data is missing from the proposal object.");
        }
        
        console.log("Using proposal.box for approval:", proposalBox);

        console.log("=== CALLING creatorApproveProposal ===");
        console.log("Bounty version:", bounty.version);
        console.log("Bounty box:", bounty.box);
        console.log("Creator address:", $address);

        // Call the blockchain function
        const txId = await creatorApproveProposal(
            bounty.version,
            bounty.box as any,
            proposalBox,
            $address
        );

        console.log("Approval transaction result:", txId);

        if (txId) {
            // Update proposal status locally
            proposals = proposals.map((p) =>
                p.id === proposalId ? { ...p, status: "approved" } : p,
            );
            transactionId = txId;
            errorMessage = null;
            console.log("Local state updated successfully");
        } else {
            throw new Error("Approval transaction returned no transaction ID");
        }
        
    } catch (err) {
        console.error("Approval error:", err);
        console.error("Error stack:", (err as Error).stack);
        errorMessage = (err as any).message || "Failed to approve proposal";
    } finally {
        isSubmitting = false;
        console.log("Setting isSubmitting to false");
        console.log("Final error message:", errorMessage);
        console.log("=== APPROVE PROPOSAL DEBUG END ===");
    }
}
    // async function rejectProposal(proposalId: string) {
    //     if (!bounty || !isCurrentUserJudge) return;

    //     const proposal = proposals.find(p => p.id === proposalId);
    //     if (!proposal) return;

    //     isSubmitting = true;
    //     errorMessage = null;

    //     try {
    //         // Call the blockchain reject (off-chain or on-chain)
    //         await chainRejectProposal(proposal.rawContent as any, "Judge rejected");

    //         proposals = proposals.map(p =>
    //             p.id === proposalId ? { ...p, status: "rejected" } : p
    //         );
    //     } catch (err) {
    //         errorMessage = (err as any).message || "Failed to reject proposal";
    //     } finally {
    //         isSubmitting = false;
    //     }
    // }

    // Initialize proposals when component loads
    $: if (bounty) {
        loadProposals();
    }

    export function sanitizeDeveloperAddress(developer: string): string {
        if (!developer || developer === "Unknown") return "Unknown";

        // Check if it's already a valid Ergo address
        if (developer.startsWith("9") && developer.length > 40) {
            return developer;
        }

        // Check for specific error messages from our conversion function
        if (
            developer.includes("Invalid key length") ||
            developer.includes("Invalid hex format") ||
            developer.includes("Conversion failed") ||
            developer.includes("Address conversion failed") ||
            developer.includes("Address extraction failed")
        ) {
            return "Address parsing error";
        }

        const hexValue = extractHexFromBinary(developer);
        if (hexValue && hexValue.length === 66) {
            try {
                return hexToErgoAddress(hexValue);
            } catch (e) {
                return "Address parsing error";
            }
        }

        // If it contains non-printable characters, it's likely binary data
        if (/[^\x20-\x7E]/.test(developer)) {
            return "Address parsing error";
        }

        return developer;
    }
</script>

<!-- Proposals Section -->
<div class="proposals-section">
    <div class="section-header">
        <h2 class="section-title">Proposals ({proposals.length})</h2>
        {#if isCurrentUserJudge}
            <div class="creator-notice">
                🎯 You are the bounty creator - you can approve proposals
            </div>
        {/if}
        {#if $connected && !deadline_passed && !is_max_submissions}
            <button
                class="submit-btn primary"
                style="background-color: #FF8C00; color: black;"
                on:click={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openProposalForm();
                }}
            >
                Submit Proposal
            </button>
        {/if}
    </div>

    {#if proposals.length > 0}
        <div class="proposals-grid">
            {#each proposals as proposal}
                <div class="proposal-card">
                    <div class="card-header">
                        <h3 class="proposal-title">{proposal.summary}</h3>
                        <div class="status-badge status-{proposal.status}">
                            {proposal.status === "approved"
                                ? "Approved"
                                : proposal.status === "rejected"
                                  ? "Rejected"
                                  : "Pending"}
                        </div>
                    </div>

                    <div class="card-content">
                        <div class="proposal-meta">
                            <div class="meta-item">
                                <span class="meta-label">Developer</span>
                                <a
                                    href="{web_explorer_uri_addr}{proposal.developer ||
                                        'Unknown'}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="judge-link"
                                >
                                    {truncateAddress(
                                        proposal.developer || "Unknown",
                                    )}
                                </a>
                            </div>

                            <div class="meta-item">
                                <span class="meta-label">Submitted</span>
                                <span class="meta-value"
                                    >{formatDate(proposal.submittedAt)}</span
                                >
                            </div>

                            {#if proposal.url}
                                <div class="meta-item">
                                    <span class="meta-label">Repository</span>
                                    <a
                                        href={proposal.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="repo-link"
                                    >
                                        View Code
                                    </a>
                                </div>
                            {/if}
                        </div>

                        <!-- Bounty Context for Judges -->
                        {#if isCurrentUserJudge && bounty}
                            <div class="bounty-context">
                                <h4 class="context-title">Bounty Context</h4>
                                <div class="context-content">
                                    <div class="context-item">
                                        <span class="context-label"
                                            >Bounty ID:</span
                                        >
                                        <span class="context-value"
                                            >{truncateAddress(
                                                bounty.bounty_id,
                                            )}</span
                                        >
                                    </div>
                                    {#if bounty.content?.description}
                                        <div class="context-item">
                                            <span class="context-label"
                                                >Requirements:</span
                                            >
                                            <span class="context-value"
                                                >{bounty.content
                                                    .description}</span
                                            >
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>

                    {#if isCurrentUserJudge && proposal.status === "pending"}
                        <div class="card-actions">
                            <button
                                class="action-btn approve"
                                on:click={() => approveProposal(proposal.id)}
                                disabled={isSubmitting}
                            >
                                {isSubmitting
                                    ? "Processing..."
                                    : "Approve Proposal"}
                            </button>
                            <!-- Note: Rejection would be off-chain or through a separate mechanism -->
                        </div>
                    {:else if proposal.status === "approved"}
                        <div class="approval-notice">
                            ✅ Approved by bounty creator
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {:else}
        <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h3>No proposals yet</h3>
            {#if $connected && !deadline_passed}
                <p>Be the first to submit a proposal!</p>
            {:else}
                <p>No proposals have been submitted for this bounty.</p>
            {/if}
        </div>
    {/if}
</div>

<!-- Proposal Form Modal -->
{#if show_proposal_form}
    <div class="modal-overlay" on:click={closeProposalForm}>
        <div class="modal-content" on:click|stopPropagation>
            <div class="modal-header">
                <h2>Submit Proposal</h2>
                <button class="close-btn" on:click={closeProposalForm}>×</button
                >
            </div>

            <div class="modal-body">
                {#if transactionId}
                    <div class="success-message">
                        <div class="success-icon">✅</div>
                        <h3>Proposal Submitted Successfully!</h3>
                        <p>
                            Transaction ID:
                            <a
                                href={web_explorer_uri_tx + transactionId}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="transaction-link"
                            >
                                {transactionId.slice(0, 16)}...
                            </a>
                        </p>
                    </div>
                {:else if errorMessage}
                    <div class="error-message">
                        <div class="error-icon">❌</div>
                        <p>{errorMessage}</p>
                    </div>
                {:else}
                    <form
                        class="proposal-form"
                        on:submit|preventDefault={submitProposal}
                    >
                        <div class="form-group">
                            <label for="proposal-summary" class="form-label">
                                Summary <span class="required">*</span>
                            </label>
                            <input
                                id="proposal-summary"
                                type="text"
                                bind:value={proposalSummary}
                                placeholder="Brief summary of your proposal"
                                class="form-input"
                                required
                            />
                        </div>

                        <div class="form-group">
                            <label for="proposal-url" class="form-label">
                                Repository URL <span class="required">*</span>
                            </label>
                            <input
                                id="proposal-url"
                                type="url"
                                bind:value={proposalUrl}
                                placeholder="https://github.com/username/repo"
                                class="form-input"
                            />
                        </div>

                        <div class="form-actions">
                            <button
                                type="button"
                                class="submit-btn secondary"
                                on:click={closeProposalForm}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                class="submit-btn primary"
                                style="background-color: #FF8C00; color: black;"
                                disabled={isSubmitting ||
                                    !proposalSummary.trim()}
                            >
                                {isSubmitting
                                    ? "Submitting..."
                                    : "Submit Proposal"}
                            </button>
                        </div>
                    </form>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .proposals-section {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 2px solid #f0f0f0;
    }

    .section-title {
        font-size: 1.75rem;
        font-weight: 600;
        color: #2c3e50;
        margin: 0;
    }

    .submit-btn {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
    }

    .submit-btn.primary {
        background-color: #3498db;
        color: white;
    }

    .submit-btn.primary:hover {
        background-color: #2980b9;
        transform: translateY(-1px);
    }

    .submit-btn.secondary {
        background-color: #95a5a6;
        color: white;
    }

    .submit-btn.secondary:hover {
        background-color: #7f8c8d;
    }

    .submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }

    .proposals-grid {
        display: grid;
        gap: 1.5rem;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    }

    .proposal-card {
        background: white;
        border-radius: 12px;
        border: 1px solid #e1e8ed;
        overflow: hidden;
        transition: all 0.3s ease;
    }

    .proposal-card:hover {
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
    }

    .card-header {
        padding: 1.5rem;
        border-bottom: 1px solid #f8f9fa;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
    }

    .proposal-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: #2c3e50;
        margin: 0;
        line-height: 1.4;
        flex: 1;
    }

    .status-badge {
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
    }

    .status-approved {
        background-color: #d4edda;
        color: #155724;
    }

    .status-rejected {
        background-color: #f8d7da;
        color: #721c24;
    }

    .status-pending {
        background-color: #fff3cd;
        color: #856404;
    }

    .card-content {
        padding: 1.5rem;
    }

    .proposal-meta {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .meta-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .meta-label {
        font-weight: 500;
        color: #7f8c8d;
        font-size: 0.9rem;
    }

    .meta-value {
        color: #2c3e50;
        font-weight: 500;
    }

    .repo-link {
        color: #3498db;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s ease;
    }

    .repo-link:hover {
        color: #2980b9;
        text-decoration: underline;
    }

    .bounty-context {
        margin-top: 1.5rem;
        padding: 1rem;
        background-color: #f8f9fa;
        border-radius: 8px;
        border-left: 4px solid #3498db;
    }

    .context-title {
        font-size: 1rem;
        font-weight: 600;
        color: #2c3e50;
        margin: 0 0 0.75rem 0;
    }

    .context-content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .context-item {
        display: flex;
        gap: 0.5rem;
        font-size: 0.9rem;
    }

    .context-label {
        font-weight: 500;
        color: #7f8c8d;
        min-width: 100px;
    }

    .context-value {
        color: #2c3e50;
        flex: 1;
    }

    .card-actions {
        padding: 1rem 1.5rem;
        border-top: 1px solid #f8f9fa;
        background-color: #fafbfc;
        display: flex;
        gap: 0.75rem;
        justify-content: flex-end;
    }

    .action-btn {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 0.9rem;
    }

    .action-btn.approve {
        background-color: #27ae60;
        color: white;
    }

    .action-btn.approve:hover {
        background-color: #229954;
    }

    .action-btn.reject {
        background-color: #e74c3c;
        color: white;
    }

    .action-btn.reject:hover {
        background-color: #c0392b;
    }

    .empty-state {
        text-align: center;
        padding: 4rem 2rem;
        color: #7f8c8d;
    }

    .empty-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }

    .empty-state h3 {
        font-size: 1.5rem;
        margin: 0 0 0.5rem 0;
        color: #2c3e50;
    }

    .empty-state p {
        font-size: 1rem;
        margin: 0;
    }

    /* Modal Styles */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .modal-content {
        background: white;
        border-radius: 12px;
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid #f0f0f0;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1.5rem;
        color: #2c3e50;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #7f8c8d;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }

    .close-btn:hover {
        background-color: #f8f9fa;
        color: #2c3e50;
    }

    .modal-body {
        padding: 1.5rem;
    }

    .success-message,
    .error-message {
        text-align: center;
        padding: 2rem;
    }

    .success-icon,
    .error-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }

    .success-message h3 {
        color: #27ae60;
        margin: 0 0 1rem 0;
    }

    .error-message p {
        color: #e74c3c;
        margin: 0;
    }

    .transaction-link {
        color: #3498db;
        text-decoration: none;
        font-weight: 500;
    }

    .transaction-link:hover {
        text-decoration: underline;
    }

    .proposal-form {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .form-label {
        font-weight: 500;
        color: #2c3e50;
    }

    .required {
        color: #e74c3c;
    }

    .form-input {
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 1rem;
        transition: border-color 0.2s ease;
    }

    .form-input:focus {
        outline: none;
        border-color: #3498db;
        box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
    }

    .form-actions {
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
        margin-top: 1rem;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
        .proposals-section {
            background-color: #1a1a1a;
            color: #e0e0e0;
        }

        .section-title {
            color: #e0e0e0;
        }

        .section-header {
            border-bottom-color: #333;
        }

        .proposal-card {
            background-color: #2d2d2d;
            border-color: #444;
        }

        .proposal-card:hover {
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .card-header {
            border-bottom-color: #444;
        }

        .proposal-title {
            color: #e0e0e0;
        }

        .meta-label {
            color: #aaa;
        }

        .meta-value {
            color: #e0e0e0;
        }

        .bounty-context {
            background-color: #333;
        }

        .context-title {
            color: #e0e0e0;
        }

        .context-label {
            color: #aaa;
        }

        .context-value {
            color: #e0e0e0;
        }

        .card-actions {
            background-color: #333;
            border-top-color: #444;
        }

        .modal-content {
            background-color: #2d2d2d;
            color: #e0e0e0;
        }

        .modal-header {
            border-bottom-color: #444;
        }

        .modal-header h2 {
            color: #e0e0e0;
        }

        .form-input {
            background-color: #333;
            border-color: #555;
            color: #e0e0e0;
        }

        .form-input:focus {
            border-color: #3498db;
        }

        .form-label {
            color: #e0e0e0;
        }
    }

    /* Responsive design */
    @media (max-width: 768px) {
        .proposals-section {
            padding: 1rem;
        }

        .proposals-grid {
            grid-template-columns: 1fr;
        }

        .section-header {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
        }

        .card-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
        }

        .meta-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
        }

        .form-actions {
            flex-direction: column;
        }
    }

    .judge-link {
        color: #ff8c00;
        text-decoration: none;
        font-weight: 500;
    }

    .judge-link:hover {
        text-decoration: underline;
    }

    .judge-highlight {
        margin-top: 0.5rem;
    }
</style>
