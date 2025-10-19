<script lang="ts" context="module">
    declare const ergo: {
        get_change_address(): Promise<string>;
        get_utxos(): Promise<any[]>;
        get_current_height(): Promise<number>;
        sign_tx(tx: any): Promise<any>;
        submit_tx(tx: any): Promise<string>;
    };
</script>

<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { fetchReputationProofByTokenId } from "$lib/ergo/reputation/fetch";
    import type { ReputationProof } from "$lib/ergo/reputation/objects";
    import { ErgoAddress } from "@fleet-sdk/core";
    import Fa from "svelte-fa";
    import {
        faTwitter,
        faGithub,
        faLinkedin,
    } from "@fortawesome/free-brands-svg-icons";

    let judgeProof: ReputationProof | null = null;
    let judgeAddress: string | null = null;
    let isLoading = true;
    let errorMessage: string | null = null;

    onMount(async () => {
        try {
            // Get the token ID from the URL parameter
            const judgeTokenId = $page.params.id;
            console.log("Loading judge with token ID:", judgeTokenId);

            if (!judgeTokenId) {
                errorMessage = "Invalid judge ID";
                isLoading = false;
                return;
            }

            const ergoWallet = typeof ergo !== "undefined" ? ergo : null;
            
            // Fetch the reputation proof using the token ID
            const proof = await fetchReputationProofByTokenId(judgeTokenId, ergoWallet);

            console.log("Fetched proof:", proof);

            if (proof) {
                judgeProof = proof;

                try {
                    const primaryBox = proof.current_boxes[0]?.box;
                    if (primaryBox && primaryBox.additionalRegisters) {
                        judgeAddress = (primaryBox as any).address || "Contract Address";

                        let r7Value: string | null = null;
                        const r7Reg = primaryBox.additionalRegisters?.R7;
                        if (r7Reg !== undefined && r7Reg !== null) {
                            if (typeof r7Reg === "object") {
                                r7Value = (r7Reg as any).renderedValue ?? String(r7Reg);
                            } else {
                                r7Value = String(r7Reg);
                            }
                        }
                    } else {
                        judgeAddress = "Box data unavailable";
                    }
                } catch (err) {
                    console.error("Failed to extract judge info:", err);
                    judgeAddress = "Could not extract info";
                }
            } else {
                errorMessage = "Judge not found. The profile may not exist or could not be loaded.";
            }
        } catch (e: any) {
            console.error("Failed to load judge details:", e);
            errorMessage = "A critical error occurred while loading judge details. Please try again later.";
        } finally {
            isLoading = false;
        }
    });

    function goBack() {
        window.history.back();
    }

    // Reactive statement to extract social media links once judgeProof is loaded
    $: judgeSocials = (() => {
        if (!judgeProof) return null;
        // Find the main box of the reputation proof to get the content
        const judgeBox = judgeProof.current_boxes.find(
            (box) => box.object_pointer === judgeProof?.token_id,
        );
        if (
            judgeBox &&
            typeof judgeBox.content === "object" &&
            judgeBox.content !== null
        ) {
            return judgeBox.content as {
                twitter?: string;
                github?: string;
                linkedin?: string;
            };
        }
        return null;
    })();
</script>

<div class="judge-header">
    <button class="back-button" on:click={goBack}> ← Back </button>
</div>

{#if isLoading}
    <div class="text-center p-10">
        <p>Loading judge details...</p>
    </div>
{:else if errorMessage}
    <div
        class="text-center text-red-500 bg-red-50 dark:bg-red-900/20 p-4 rounded-md mx-auto max-w-lg mt-10"
    >
        <h3 class="font-bold text-lg mb-2">Error</h3>
        <p>{errorMessage}</p>
    </div>
{:else if judgeProof}
    <div class="show-judge-container">
        <div class="hero-section text-center">
            <h2 class="project-title">Judge Profile</h2>
            <p class="subtitle">
                Detailed on-chain reputation for the selected judge.
            </p>
        </div>

        <div class="content-section">
            <div class="proof-details-grid">
                <div>
                    <h3 class="section-title">Reputation Proof</h3>
                    <ul class="proof-details">
                        <li>
                            <strong>Judge ID:</strong>
                            <span class="font-mono text-xs break-all"
                                >{judgeProof.token_id}</span
                            >
                        </li>
                        <li>
                            <strong>Judge Address:</strong>
                            <span
                                class="font-mono text-xs break-all judge-address"
                                >{judgeAddress}</span
                            >
                        </li>
                        <li>
                            <strong>Owner Script Hash:</strong>
                            <span class="font-mono text-xs break-all"
                                >{judgeProof.blake_owner_script}</span
                            >
                        </li>
                        <li>
                            <strong>Total Opinions:</strong>
                            {judgeProof.number_of_boxes}
                        </li>
                    </ul>
                </div>
                {#if judgeSocials}
                    <div>
                        <h3 class="section-title">Social Profiles</h3>
                        <div class="social-links">
                            {#if judgeSocials.twitter}
                                <a
                                    href={judgeSocials.twitter}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="social-link-item"
                                >
                                    <Fa icon={faTwitter} />
                                    <span>Twitter</span>
                                </a>
                            {/if}
                            {#if judgeSocials.github}
                                <a
                                    href={judgeSocials.github}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="social-link-item"
                                >
                                    <Fa icon={faGithub} />
                                    <span>GitHub</span>
                                </a>
                            {/if}
                            {#if judgeSocials.linkedin}
                                <a
                                    href={judgeSocials.linkedin}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="social-link-item"
                                >
                                    <Fa icon={faLinkedin} />
                                    <span>LinkedIn</span>
                                </a>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style lang="postcss">
    .show-judge-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 2rem 1.5rem 4rem;
    }
    .project-title {
        text-align: center;
        font-size: 2.8rem;
        font-family: "Russo One", sans-serif;
    }
    .subtitle {
        font-size: 1.1rem;
        color: hsl(var(--muted-foreground));
        margin-top: 0.5rem;
        margin-bottom: 3rem;
        text-align: center;
    }
    .content-section {
        @apply p-0;
    }
    .section-title {
        text-align: center;
        font-size: 1.8rem;
        font-family: "Russo One", sans-serif;
    }
    .proof-details-grid {
        @apply grid md:grid-cols-2 gap-10 mb-8;
    }
    .proof-details {
        @apply text-sm text-muted-foreground leading-relaxed list-none space-y-3;
    }
    .proof-details li strong {
        @apply font-medium text-foreground;
    }
    .judge-header {
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding-left: 5rem;
        padding-top: 3rem;
    }
    .back-button {
        background: orange;
        color: #222;
        padding: 0.5rem 1.25rem;
        border-radius: 8px;
        font-weight: 600;
        border: none;
        font-size: 1rem;
        box-shadow: 0 2px 8px rgba(255, 165, 0, 0.12);
        cursor: pointer;
        transition:
            background 0.18s,
            color 0.18s;
    }
    .back-button:hover {
        background: #ffd580;
        color: #000;
    }
    .social-links {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    .social-link-item {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.875rem;
        padding: 0.5rem;
        border-radius: 0.5rem;
        transition: all 0.2s ease;
        color: hsl(var(--foreground));
        text-decoration: none;
    }
    .social-link-item:hover {
        background: rgba(255, 165, 0, 0.1);
        color: orange;
    }
    @media (prefers-color-scheme: dark) {
        .social-link-item:hover {
            background: rgba(255, 165, 0, 0.15);
        }
    }
</style>