<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { judge_detail } from "$lib/common/store";
    import { get } from "svelte/store";
    import {
        total_burned_string,
        type ReputationProof,
    } from "$lib/ergo/reputation/objects";
    import { onDestroy } from "svelte";
    import Fa from "svelte-fa";
    import {
        faTwitter,
        faGithub,
        faLinkedin,
    } from "@fortawesome/free-brands-svg-icons";

    let proof: ReputationProof | null | undefined = get(judge_detail);

    const unsubscribeDetail = judge_detail.subscribe((value) => {
        proof = value ?? undefined;
    });

    onDestroy(() => {
        unsubscribeDetail();
    });

    function handleViewDetails() {
        judge_detail.set(null);
    }
    // const address =
    //   proof?.data && (proof.data as any).ownerAddress
    //     ? (proof.data as any).ownerAddress
    //     : proof?.current_boxes?.[0]?.ownerAddress ?? null;

    $: displayProof = proof;

// Debug: Log the RPBox structure
$: if (displayProof?.current_boxes?.[0]) {
    console.log('First RPBox:', displayProof.current_boxes[0]);
    console.log('All RPBoxes:', displayProof.current_boxes);
    console.log('DisplayProof full object:', displayProof);
}

    // Extract social media links from the main proof box content
    $: judgeSocials = (() => {
        if (!displayProof) return null;
        const judgeBox = displayProof.current_boxes.find(
            (box) => box.object_pointer === displayProof.token_id,
        );
        if (
            judgeBox &&
            typeof judgeBox.content === "object" &&
            judgeBox.content !== null
        ) {
            const content = judgeBox.content as {
                twitter?: string;
                github?: string;
                linkedin?: string;
            };
            return content;
        }
        return null;
    })();

    $: judgeAddress = displayProof?.current_boxes?.[0]?.box 
    ? (displayProof.current_boxes[0].box as any).address 
    : 'N/A';
</script>

{#if displayProof}
    <div class="judge-header">
        <button class="back-button" on:click={handleViewDetails}>
            ← Back to Judge List
        </button>
    </div>

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
                            <span class="font-mono text-xs"
                                >{displayProof.token_id}</span
                            >
                        </li>
                        <!-- <li>
                            <strong>Judge Address:</strong>
                            <span class="font-mono text-xs judge-address"
                                >{judgeAddress}</span
                            >
                        </li> -->
                        <li>
                            <strong>Owner Script:</strong>
                            <span class="font-mono text-xs"
                                >{displayProof.blake_owner_script}</span
                            >
                        </li>
                        <li>
                            <strong>Total Opinions:</strong>
                            {displayProof.number_of_boxes}
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

    /* For dark mode, you can add slightly more opacity */
    @media (prefers-color-scheme: dark) {
        .social-link-item:hover {
            background: rgba(255, 165, 0, 0.15);
        }
    }
</style>
