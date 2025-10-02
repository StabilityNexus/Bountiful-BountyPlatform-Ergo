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
    import { onMount } from 'svelte';
    import { fetchAllJudges } from '$lib/ergo/reputation/fetch';
    import { judges, judge_detail, platform } from '$lib/common/store';
    import type { ReputationProof } from '$lib/ergo/reputation/objects';
    import { Button } from '$lib/components/ui/button';
    import { total_burned_string } from '$lib/ergo/reputation/objects';
    import { get } from 'svelte/store';

    let isLoading = true;
    let error: string | null = null;

    onMount(async () => {
        try {
            // const ergo = get(platform)?.ergo;
            if (!ergo) {
                // Silently fail if wallet not connected, as this is a public page
                // It's not ideal, but better than an alert. The button to view details will prompt connection.
                return;
            }
            await fetchAllJudges(ergo, true); // Force fetch on mount
        } catch (e: any) {
            console.error("Failed to fetch judges:", e);
            error = "Could not load the list of judges. Please try again later.";
        } finally {
            isLoading = false;
        }
    });

    function viewJudgeDetails(proof: ReputationProof) {
        judge_detail.set(proof);
    }
</script>

<div class="container mx-auto p-4 md:p-8">
    <div class="text-center mb-10">
        <h2 class="text-3xl font-bold">Registered Judges</h2>
        <p class="text-muted-foreground mt-2">Browse all on-chain judge profiles in the ecosystem.</p>
    </div>

    {#if isLoading}
        <div class="text-center py-10">
            <p>Loading judges...</p>
        </div>
    {:else if error}
        <div class="text-center text-red-500 bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
            {error}
        </div>
    {:else if $judges.data.size === 0}
        <div class="text-center py-10">
            <p>No judges have registered yet.</p>
        </div>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each Array.from($judges.data.values()) as proof (proof.token_id)}
                <div class="border rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow bg-card">
                    <h3 class="font-semibold text-lg truncate" title={proof.token_id}>
                        Judge ID: {proof.token_id.substring(0, 12)}...
                    </h3>
                    <div class="mt-3 text-sm text-muted-foreground space-y-2">
                        <p><strong>Opinions Issued:</strong> {proof.number_of_boxes}</p>
                        <p><strong>Reputation Stake:</strong> {total_burned_string(proof)} ERG</p>
                    </div>
                    <div class="mt-4">
                        <Button on:click={() => viewJudgeDetails(proof)} variant="outline" size="sm">
                            View Details
                        </Button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .container {
        animation: fade-in 0.5s ease-in-out;
    }

    @keyframes fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>