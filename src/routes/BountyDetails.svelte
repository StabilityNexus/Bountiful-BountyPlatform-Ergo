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
    let loading = false;

    onMount(async () => {
        await loadBounty();
    });

    async function loadBounty() {
        try {
            loading = true;
            error = '';
            
            if (!bounty) {
                const id = $page.params.id;
                if (typeof id !== 'string') {
                    throw new Error('Invalid bounty ID');
                }
                
                console.log('Loading bounty with ID:', id);
                bounty = await platform.getBountyById(id);
                
                if (!bounty) {
                    throw new Error('Bounty not found');
                }
                
                bounty_detail.set(bounty);
            }
        } catch (e) {
            console.error('Error loading bounty:', e);
            error = e instanceof Error ? e.message : 'Failed to load bounty';
        } finally {
            loading = false;
        }
    }

    // Helper function to safely get bounty status
    function getBountyStatus(bounty: Bounty): string {
        if (!bounty || !bounty.status) return 'open';
        return bounty.status.toLowerCase();
    }

    // Helper function to format creator address
    function formatCreator(creator?: string): string {
        if (!creator) return 'Unknown creator';
        if (creator.length <= 10) return creator;
        return `${creator.slice(0, 6)}...${creator.slice(-4)}`;
    }

    // Helper function to format deadline
    function formatDeadline(deadline?: number): string {
        if (!deadline) return 'No deadline';
        
        // If deadline is a block height (large number), convert approximately
        if (deadline > 1000000) {
            // Assume current block height and 2 minutes per block
            const currentTime = Math.floor(Date.now() / 1000);
            const currentBlock = Math.floor(currentTime / 120);
            const blocksRemaining = deadline - currentBlock;
            const secondsRemaining = blocksRemaining * 120;
            
            if (secondsRemaining <= 0) return 'Expired';
            
            const days = Math.floor(secondsRemaining / 86400);
            const hours = Math.floor((secondsRemaining % 86400) / 3600);
            
            if (days > 0) return `${days} days, ${hours} hours remaining`;
            return `${hours} hours remaining`;
        }
        
        // If deadline is a timestamp
        const deadlineDate = new Date(deadline * 1000);
        const now = new Date();
        
        if (deadlineDate < now) return 'Expired';
        
        const diffMs = deadlineDate.getTime() - now.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (diffDays > 0) return `${diffDays} days, ${diffHours} hours remaining`;
        return `${diffHours} hours remaining`;
    }

    // Helper function to get metadata safely
    function getBountyMetadata(bounty: Bounty) {
        if (!bounty.metadata) return { category: 'General', tags: [] };
        
        if (typeof bounty.metadata === 'string') {
            try {
                return JSON.parse(bounty.metadata);
            } catch {
                return { category: 'General', tags: [] };
            }
        }
        
        return bounty.metadata;
    }

    async function claimBounty() {
        if (!bounty || !$address) return;
        
        isClaiming = true;
        error = '';
        success = '';

        try {
            const txId = await platform.claimBounty(bounty);
            
            if (!txId) {
                throw new Error('Failed to claim bounty - no transaction ID returned');
            }
            
            success = `Bounty claimed! Transaction ID: ${txId}`;
            
            // Refresh bounty after a short delay
            setTimeout(async () => {
                try {
                    bounty = await platform.getBountyById(bounty!.id);
                    bounty_detail.set(bounty);
                } catch (e) {
                    console.error('Failed to refresh bounty:', e);
                }
            }, 2000);
            
        } catch (e) {
            console.error('Error claiming bounty:', e);
            error = e instanceof Error ? e.message : 'Failed to claim bounty';
        } finally {
            isClaiming = false;
        }
    }

    async function cancelBounty() {
        if (!bounty || !$address) return;
        
        isCanceling = true;
        error = '';
        success = '';
        
        try {
            const txId = await platform.cancelBounty(bounty);
            
            if (!txId) {
                throw new Error('Failed to cancel bounty - no transaction ID returned');
            }
            
            success = `Bounty canceled! Transaction ID: ${txId}`;
            
            // Refresh bounty after a short delay
            setTimeout(async () => {
                try {
                    bounty = await platform.getBountyById(bounty!.id);
                    bounty_detail.set(bounty);
                } catch (e) {
                    console.error('Failed to refresh bounty:', e);
                }
            }, 2000);
            
        } catch (e) {
            console.error('Error canceling bounty:', e);
            error = e instanceof Error ? e.message : 'Failed to cancel bounty';
        } finally {
            isCanceling = false;
        }
    }

    // Helper to check if user can claim bounty
    function canClaimBounty(bounty: Bounty): boolean {
    const userAddress = $address;
    return getBountyStatus(bounty) === 'open' && 
           userAddress !== null && 
           userAddress !== undefined &&
           bounty.creator !== userAddress;
}

function canCancelBounty(bounty: Bounty): boolean {
    const userAddress = $address;
    return getBountyStatus(bounty) === 'open' && 
           userAddress !== null && 
           userAddress !== undefined &&
           bounty.creator === userAddress;
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
        color: orange;
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

    .meta-item {
        display: flex;
        flex-direction: column;
        gap: 5px;
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
        text-transform: capitalize;
    }

    .status-open {
        background-color: #2e7d32;
        color: white;
    }

    .status-completed {
        background-color: #ff8f00;
        color: white;
    }

    .status-paid {
        background-color: #1565c0;
        color: white;
    }

    .status-expired {
        background-color: #d32f2f;
        color: white;
    }

    .creator {
        color: #bbbbbb;
        font-size: 0.9em;
    }

    .deadline {
        color: #ffa726;
        font-size: 0.9em;
        font-weight: 500;
    }

    .bounty-title {
        margin: 15px 0;
        color: #ffffff;
        font-size: 1.5em;
        font-weight: bold;
    }

    .bounty-description {
        margin: 15px 0;
        line-height: 1.6;
        white-space: pre-line;
        color: #e0e0e0;
    }

    .metadata-section {
        margin: 15px 0;
        padding: 15px;
        background: #0a0a0a;
        border-radius: 4px;
        border: 1px solid #333;
    }

    .category {
        color: #81c784;
        font-weight: 500;
        margin-bottom: 10px;
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .tag {
        background: #333;
        color: #fff;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 0.8em;
    }

    .loading {
        text-align: center;
        color: #bbbbbb;
        padding: 40px;
        font-size: 1.1em;
    }

    .error-message {
        color: #ff4d4d;
        text-align: center;
        padding: 15px;
        background: rgba(255, 77, 77, 0.1);
        border: 1px solid rgba(255, 77, 77, 0.3);
        border-radius: 4px;
        margin: 15px 0;
    }

    .success-message {
        color: #4caf50;
        text-align: center;
        padding: 15px;
        background: rgba(76, 175, 80, 0.1);
        border: 1px solid rgba(76, 175, 80, 0.3);
        border-radius: 4px;
        margin: 15px 0;
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

    .wallet-warning {
        text-align: center;
        color: #ff8a65;
        padding: 10px;
        background: rgba(255, 138, 101, 0.1);
        border-radius: 4px;
        margin: 10px 0;
    }
</style>

<div class="container">
    <h1>{message}</h1>

    <div class="content-wrapper">
        {#if error}
            <div class="error-message">
                Error: {error}
                <br>
                <Button on:click={loadBounty} disabled={loading}>
                    {loading ? 'Retrying...' : 'Retry'}
                </Button>
            </div>
        {:else if loading}
            <p class="loading">Loading bounty details...</p>
        {:else if !bounty}
            <p class="loading">No bounty data available</p>
        {:else}
            <div class="bounty-card">
                <div class="bounty-meta">
                    <div class="meta-item">
                        <span class="reward">{(bounty.reward || 0) / 1_000_000_000} ERG</span>
                        <span class="creator">Created by: {formatCreator(bounty.creator)}</span>
                    </div>
                    
                    <div class="meta-item">
                        {#if bounty.status}
                            <span class="status status-{getBountyStatus(bounty)}">{bounty.status}</span>
                        {/if}
                        <span class="deadline">{formatDeadline(bounty.deadline)}</span>
                    </div>
                </div>

                <h2 class="bounty-title">{bounty.title || 'Untitled Bounty'}</h2>

                <div class="bounty-description">
                    {bounty.description || 'No description provided'}
                </div>

                {#if bounty.metadata}
                    {@const metadata = getBountyMetadata(bounty)}
                    <div class="metadata-section">
                        {#if metadata.category}
                            <div class="category">Category: {metadata.category}</div>
                        {/if}
                        
                        {#if metadata.tags && metadata.tags.length > 0}
                            <div class="tags">
                                {#each metadata.tags as tag}
                                    <span class="tag">{tag}</span>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <div class="actions-container">
        {#if !$address}
            <div class="wallet-warning">
                Connect your wallet to interact with this bounty
            </div>
        {/if}

        {#if bounty && $address}
            {#if canCancelBounty(bounty)}
                <Button on:click={cancelBounty} disabled={isCanceling}>
                    {isCanceling ? 'Canceling...' : 'Cancel Bounty'}
                </Button>
            {/if}

            {#if canClaimBounty(bounty)}
                <Button on:click={claimBounty} disabled={isClaiming}>
                    {isClaiming ? 'Claiming...' : 'Claim Bounty'}
                </Button>
            {/if}
        {/if}

        {#if error}
            <div class="error-message">{error}</div>
        {/if}

        {#if success}
            <div class="success-message">
                {success}
                {#if success.includes('Transaction ID:')}
                    {@const txId = success.split('Transaction ID: ')[1]}
                    <a 
                        href="{web_explorer_uri_tx + txId}" 
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