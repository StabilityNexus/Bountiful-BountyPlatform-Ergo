<script lang="ts">
    import BountyCard from './BountyCard.svelte';
    import { bounties, bounty_token_amount } from '$lib/common/store';
    import { onMount } from 'svelte';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { Input } from "$lib/components/ui/input";
    import { Loader2, Search } from 'lucide-svelte';
    import type { Bounty } from '$lib/common/bounty';
    import * as Alert from '$lib/components/ui/alert'
    import * as Dialog from '$lib/components/ui/dialog'
    import { get } from 'svelte/store';
    import { loadBountyById } from '$lib/common/load_by_id';
    import { onDestroy } from 'svelte';

    const platform = new ErgoPlatform();
    let listedBounties : Map<string, Bounty> | null = null;
    let errorMessage: string | null = null;
    let isLoading : boolean = true;
    let searchQuery : string = "";
    let offset : number = 0;
    let refreshInterval: number | undefined; // Fixed: Changed from number | null to number | undefined

    function startAutoRefresh(interval = 30000) {
        refreshInterval = setInterval(async () => {
            const freshBounties = await platform.fetch_bounties();
            bounties.set(freshBounties);
            listedBounties = await filterBounties(freshBounties);
        }, interval);
    }

    onMount(() => {
        loadBounties();
        startAutoRefresh(); // Start auto-refresh
    });

    onDestroy(() => {
        if (refreshInterval) { // Added check before clearing
            clearInterval(refreshInterval); // Clean up on component destroy
        }
    });

    export let filterBounty: ((bounty: any) => Promise<boolean>) | null = null;

    async function filterBounties(bountiesMap: Map<string, Bounty>) {
        const filteredBountiesMap = new Map<string, Bounty>();

        for (const [id, bounty] of bountiesMap.entries()) {
            let shouldAdd = true;
            if (filterBounty) {
                shouldAdd = await filterBounty(bounty);
            }
            if (shouldAdd) {
                if (searchQuery) {
                    const searchLower = searchQuery.toLowerCase();
                    const titleMatch = bounty.title.toLowerCase().includes(searchLower);
                    const descriptionMatch = bounty.content.description.toLowerCase().includes(searchLower);
                    shouldAdd = titleMatch || descriptionMatch;
                }
                if (shouldAdd) {
                    filteredBountiesMap.set(id, bounty);
                }
            }
        }

        // Fixed: Added null checks for box property
        const sorted = Array.from(filteredBountiesMap.entries()).sort(
            ([, a], [, b]) => {
                const aHeight = a.box?.creationHeight ?? 0;
                const bHeight = b.box?.creationHeight ?? 0;
                return bHeight - aHeight;
            }
        );

        return new Map(sorted);
    }

    async function loadBounties(forceRefresh = false) {
        try {
            isLoading = true;
            errorMessage = null;

            let bountiesInStore = get(bounties);

            if (forceRefresh || bountiesInStore.size === 0) {
                const fetchedBounties = await platform.fetch_bounties();
                bounties.set(fetchedBounties);
                bountiesInStore = fetchedBounties;
            }

            listedBounties = await filterBounties(bountiesInStore);
        } catch (error: any) {
            errorMessage = error.message || "Error occurred while fetching bounties";
        } finally {
            isLoading = false;
        }
    }

    $: if (searchQuery !== undefined) {
        loadBounties();
    }

    onMount(()=>{
        loadBounties();
    });
</script>

<style>
    :global(body) {
        background-color: #000000;
        color: #ffffff;
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        min-height: 100vh;
    }

    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        min-height: 100vh;
    }

    .project-title {
        text-align: center;
        font-size: 2.2rem;
        margin: 20px 0 30px;
        color: orange;
        font-weight: bold;
        letter-spacing: 0.02em;
    }

    .search-container {
        background: #111111;
        border: 1px solid #444444;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 24px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .search-wrapper {
        display: flex;
        flex-direction: column;
        gap: 16px;
        align-items: center;
    }

    .search-input-container {
        position: relative;
        width: 100%;
        max-width: 500px;
    }

    .search-input-container input {
        width: 100%;
        background: #222222;
        border: 2px solid #444444;
        border-radius: 8px;
        padding: 14px 16px 14px 48px;
        color: #ffffff;
        font-size: 16px;
        transition: all 0.2s ease;
        box-sizing: border-box;
    }

    .search-input-container input:focus {
        outline: none;
        border-color: orange;
        box-shadow: 0 0 0 3px rgba(255, 165, 0, 0.15);
        background: #2a2a2a;
    }

    .search-input-container input::placeholder {
        color: #888888;
    }

    .search-input-container :global(.search-icon) {
        position: absolute;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        color: orange;
        opacity: 0.8;
        pointer-events: none;
    }

    .refresh-button {
        background: linear-gradient(135deg, #ff8800, orange);
        color: black;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(255, 165, 0, 0.2);
        min-width: 120px;
    }
    
    .refresh-button:hover:not(:disabled) {
        background: linear-gradient(135deg, #ff9900, #ffaa00);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(255, 165, 0, 0.3);
    }
    
    .refresh-button:disabled {
        background: #666666;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
        opacity: 0.7;
    }

    .bounties-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
        margin-top: 20px;
    }

    .bounty-card {
        background: #111111;
        border: 1px solid #444444;
        border-radius: 8px;
        transition: all 0.2s ease;
    }

    .bounty-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(255, 165, 0, 0.2);
        border-color: rgba(255, 165, 0, 0.3);
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

    .no-bounties-container {
        text-align: center;
        padding: 40px 20px;
        background: #111111;
        border: 1px solid #444444;
        border-radius: 8px;
        margin-top: 20px;
    }

    .no-bounties-text {
        color: #bbbbbb;
        font-size: 1.1rem;
        margin: 0;
    }

    .loading-container {
        text-align: center;
        padding: 60px 20px;
        background: #111111;
        border: 1px solid #444444;
        border-radius: 8px;
        margin-top: 20px;
    }

    .loading-container :global(.loading-spinner) {
        color: orange;
        margin-bottom: 15px;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .loading-text {
        color: #ffffff;
        font-size: 1.1rem;
        margin: 0;
    }

    @media (max-width: 768px) {
        .container {
            padding: 15px;
        }

        .project-title {
            font-size: 1.8rem;
            margin: 15px 0 25px;
        }

        .search-container {
            padding: 20px;
        }

        .search-wrapper {
            gap: 12px;
        }

        .search-input-container input {
            font-size: 16px; /* Prevents zoom on iOS */
        }

        .bounties-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 15px;
        }
    }

    @media (max-width: 480px) {
        .bounties-grid {
            grid-template-columns: 1fr;
        }

        .search-input-container {
            max-width: 100%;
        }

        .search-container {
            padding: 16px;
        }

        .refresh-button {
            width: 100%;
            max-width: 200px;
        }
    }
</style>

<div class="container">
    <h1 class="project-title"><slot></slot></h1>

    <div class="search-container">
        <div class="search-wrapper">
            <div class="search-input-container">
                <Search class="search-icon" size={18} />
                <input
                    type="text"
                    placeholder="Search bounties by title or description..."
                    bind:value={searchQuery}
                />
            </div>
            <button 
                class="refresh-button" 
                on:click={() => loadBounties(true)}
                disabled={isLoading}
            >
                {isLoading ? 'Refreshing...' : 'Refresh Bounties'}
            </button>
        </div>
    </div>

    {#if errorMessage}
        <div class="error-message">
            {errorMessage}
        </div>
    {/if}

    {#if listedBounties && Array.from(listedBounties).length > 0 && !isLoading}
        <div class="bounties-grid">
            {#each Array.from(listedBounties) as [bountyId, bountyData]}
                <div class="bounty-card">
                    <BountyCard bounty={bountyData} />
                </div>
            {/each}
        </div>
    {:else if isLoading}
        <div class="loading-container">
            <Loader2 class="loading-spinner" size={32} />
            <p class="loading-text">Fetching bounties from the Ergo blockchain...</p>
        </div>
    {:else}
        <div class="no-bounties-container">
            <p class="no-bounties-text">No bounties found.</p>
        </div>
    {/if}
</div>