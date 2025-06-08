<script lang="ts">
    import { bounty_detail } from '$lib/common/store';
    import { onMount } from 'svelte';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { page } from '$app/stores';
    import { address } from '$lib/common/store';
    import { web_explorer_uri_tx } from '$lib/ergo/envs';
    import type { Bounty } from '$lib/common/bounty';
    import Button from '$lib/components/ui/button/button.svelte';

    const platform = new ErgoPlatform();
    let bounty: Bounty | null = $bounty_detail;
    let isClaiming = false;
    let isCanceling = false;
    let error = '';
    let success = '';
    let message = "Bounty Details";

    onMount(async () => {
        try {
            if (!bounty) {
                const id = $page.params.id;
                if (typeof id !== 'string') throw new Error('Invalid bounty ID');
                
                bounty = await platform.getBountyById(id);
                bounty_detail.set(bounty);
            }
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to load bounty';
        }
    });

    // Helper function to safely get bounty status
    function getBountyStatus(bounty: Bounty): string {
        return bounty.status?.toLowerCase() || 'open';
    }

    // Helper function to format creator address
    function formatCreator(creator?: string): string {
        if (!creator) return 'Unknown creator';
        return `${creator.slice(0, 6)}...${creator.slice(-4)}`;
    }

    async function claimBounty() {
        if (!bounty) return;
        
        isClaiming = true;
        error = '';
        success = '';

        try {
            const txId = await platform.claimBounty(bounty);
            success = `Bounty claimed! Transaction ID: ${txId}`;
            // Refresh bounty
            bounty = await platform.getBountyById(bounty.id);
            bounty_detail.set(bounty);
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to claim bounty';
        } finally {
            isClaiming = false;
        }
    }

    async function cancelBounty() {
        if (!bounty) return;
        
        isCanceling = true;
        error = '';
        
        try {
            const txId = await platform.cancelBounty(bounty);
            success = `Bounty canceled! Transaction ID: ${txId}`;
            // Refresh bounty
            bounty = await platform.getBountyById(bounty.id);
            bounty_detail.set(bounty);
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to cancel bounty';
        } finally {
            isCanceling = false;
        }
    }
</script>

<style>
    :global(body) {
        background-color: #000000;
        color: #ffffff;
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        height: 100vh;
        overflow-y: auto;
    }

    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        height: 100%;
        overflow-y: auto;
        scrollbar-color: rgba(255, 255, 255, 0) rgba(0, 0, 0, 0);
    }

    h1 {
        text-align: center;
        margin-bottom: 20px;
        position: sticky;
        top: 0;
        background-color: #000000;
        padding: 20px 0;
        z-index: 10;
    }

    .content-wrapper {
        height: calc(100vh - 180px);
        overflow-y: auto;
        padding-right: 10px;
    }

    .bounty-card {
        background: #111111;
        border: 1px solid #444444;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 15px;
    }

    .bounty-meta {
        display: flex;
        justify-content: space-between;
        margin-bottom: 15px;
        flex-wrap: wrap;
        gap: 10px;
    }

    .reward {
        font-weight: bold;
        color: orange;
        font-size: 1.2em;
    }

    .status {
        padding: 5px 10px;
        border-radius: 4px;
        font-weight: bold;
    }

    .status-open {
        background-color: #2e7d32;
    }

    .status-completed {
        background-color: #ff8f00;
    }

    .status-paid {
        background-color: #1565c0;
    }

    .creator {
        color: #bbbbbb;
        font-size: 0.9em;
    }

    .bounty-description {
        margin: 15px 0;
        line-height: 1.6;
        white-space: pre-line;
    }

    .error-message {
        color: #ff4d4d;
        text-align: center;
        padding: 10px;
        background: rgba(255, 77, 77, 0.1);
        border-radius: 4px;
        margin: 10px 0;
    }

    .success-message {
        color: #4caf50;
        text-align: center;
        padding: 10px;
        background: rgba(76, 175, 80, 0.1);
        border-radius: 4px;
        margin: 10px 0;
    }

    .actions-container {
        position: sticky;
        bottom: 0;
        background-color: #000000;
        padding: 20px 0;
        border-top: 1px solid #444444;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .explorer-link {
        color: #4fc3f7;
        text-decoration: none;
        margin-left: 5px;
    }

    .explorer-link:hover {
        text-decoration: underline;
    }
</style>

<div class="container">
    <h1>{message}</h1>

    <div class="content-wrapper">
        {#if error}
            <p class="error-message">Error: {error}</p>
        {:else if !bounty}
            <p class="loading">Loading bounty details...</p>
        {:else}
            <div class="bounty-card">
                <div class="bounty-meta">
                    <span class="reward">{(bounty.reward || 0) / 1_000_000_000} ERG</span>
                    {#if bounty.status}
                        <span class="status status-{getBountyStatus(bounty)}">{bounty.status}</span>
                    {/if}
                    <span class="creator">Created by: {formatCreator(bounty.creator)}</span>
                </div>

                <h2>{bounty.title || 'Untitled Bounty'}</h2>

                <div class="bounty-description">
                    {bounty.description || 'No description provided'}
                </div>
            </div>
        {/if}
    </div>

    <div class="actions-container">
        {#if bounty}
            {#if getBountyStatus(bounty) === 'open' && $address && bounty.creator === $address}
                <Button on:click={cancelBounty} disabled={isCanceling}>
                    {isCanceling ? 'Canceling...' : 'Cancel Bounty'}
                </Button>
            {/if}

            {#if getBountyStatus(bounty) === 'open' && $address && bounty.creator !== $address}
                <Button on:click={claimBounty} disabled={isClaiming}>
                    {isClaiming ? 'Claiming...' : 'Claim Bounty'}
                </Button>
            {/if}
        {/if}

        {#if success}
            <div class="success-message">
                {success}
                {#if success.includes('Transaction ID')}
                    <a 
                        href="{web_explorer_uri_tx + success.split(': ')[1]}" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="explorer-link"
                    >
                        View on explorer
                    </a>
                {/if}
            </div>
        {/if}
    </div>
</div>