<script lang="ts">
    import { block_to_date, block_to_time } from "$lib/common/countdown";
    import { is_ended, min_submissions, type Bounty } from "$lib/common/bounty";
    import { bounty_detail } from "$lib/common/store";
    import { badgeVariants } from "$lib/components/ui/badge";
    import { Button } from "$lib/components/ui/button";
    import * as Card from "$lib/components/ui/card";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { mode } from "mode-watcher";
    
    export let bounty: Bounty;

    let platform = new ErgoPlatform();
  
    let deadline_passed = false;
    let is_min_submitted = false;
    let statusMessage = "";
    let statusColor = "";
    let showFullDescription = false;
  
    async function load() {
        deadline_passed = await is_ended(bounty);
        is_min_submitted = await min_submissions(bounty);
        const limit_date = await block_to_date(bounty.block_limit, bounty.platform);

        const minErg = ((bounty.min_submissions * bounty.exchange_rate) / Math.pow(10, 9));
        const maxErg = ((bounty.max_submissions * bounty.exchange_rate) / Math.pow(10, 9))
        const isMaxReached = bounty.total_submissions >= bounty.total_pft_amount;

        if (isMaxReached) {
            statusMessage = `Reached maximum goal of ${maxErg} ${platform.main_token}; currently closed for contributions.`;
            statusColor = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
        } 
        else if (deadline_passed) {
            statusMessage = is_min_submitted
                ? `Reached minimum of ${minErg} ${platform.main_token}; open for contributions up to ${maxErg} ${platform.main_token}.`
                : `Did not raise minimum of ${minErg} ${platform.main_token} before ${limit_date}; open for contributions up to ${maxErg} ${platform.main_token}.`;
            statusColor = is_min_submitted
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
        } 
        else {
            statusMessage = is_min_submitted
                ? `Reached minimum of ${minErg} ${platform.main_token}; open for contributions up to ${maxErg} ${platform.main_token}.`
                : `Aiming to raise a minimum of ${minErg} ${platform.main_token} before ${limit_date}.`;
            statusColor = is_min_submitted
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
        }
    }
    load();
</script>

<Card.Root class="relative bg-[#1a1a1a] h-auto min-h-[380px] flex flex-col {$mode === 'dark' ? 'bg-opacity-90 border-orange-500/30 border' : 'bg-opacity-0 border-orange-500/20 border'} rounded-lg shadow-lg transition-all duration-300 hover:shadow-orange-500/20 hover:shadow-md">
  <Card.Header class="p-4 pb-2 flex flex-row items-center justify-between {$mode === 'dark' ? 'bg-gradient-to-r from-[#1a1a1a] to-[#2a2a2a]' : 'bg-gradient-to-r from-white to-gray-100'} rounded-t-lg">
        <Card.Title class="text-xl font-bold line-clamp-1 text-orange-500">
            {bounty.content?.title || "Untitled Bounty"}
        </Card.Title>
        <div>
        {#if bounty.version}
            <a href="https://github.com/StabilityNexus/Bountiful-BountyPlatform-Ergo/blob/main/contracts/bounty_{bounty.version}.es" 
               target="_blank"
               class={badgeVariants({ variant: "outline" })}>
               Contract version: {bounty.version.replace("_", ".")}
            </a>
        {/if}
    </div>
    </Card.Header>
    
    <Card.Content class="p-4 flex-1 flex flex-col">
        <div class="description-container flex-1 overflow-hidden">
            {#if !showFullDescription}
                <div class="truncated-description">
                    <p class="text-sm opacity-90 transition-all duration-300">
                        {#if bounty.content?.description && bounty.content.description.length > 150}
                            <span>{bounty.content.description.slice(0, 150).trim()}</span>
                            <span class="fade-text">...</span>
                            <button 
                                class="read-more-btn"
                                on:click|stopPropagation={() => showFullDescription = true}
                            >
                                Read More
                            </button>
                        {:else}
                            {bounty.content?.description || "No description available"}
                        {/if}
                    </p>
                </div>
            {:else}
                <div class="full-description">
                    <p class="text-sm opacity-90 transition-all duration-300 scrollable-description">
                        {bounty.content?.description || "No description available"}
                    </p>
                    <button 
                        class="read-less-btn mt-2"
                        on:click|stopPropagation={() => showFullDescription = false}
                    >
                        Show Less
                    </button>
                </div>
            {/if}
        </div>
    </Card.Content>
  
    <!-- Status Message Sticky Bottom -->
    <div class="absolute bottom-16 left-0 w-full px-4">
        <div class={`${statusColor} p-2 rounded-md text-sm transition-all shadow-sm`}>
            {statusMessage}
        </div>
    </div>
  
    <Card.Footer class="p-4 pt-2 mt-auto">
        <Button
            class="w-full transition-all duration-300 hover:scale-[1.02] hover:brightness-110"
            on:click={() => bounty_detail.set(bounty)}
            style="background-color: orange; color: black; font-weight: 600;"
        >
            View Bounty Details
        </Button>
    </Card.Footer>
  </Card.Root>

<style>
  .description-container {
      position: relative;
      margin-bottom: 1rem;
  }

  .truncated-description, .full-description {
      position: relative;
      width: 100%;
  }

  .fade-text {
      opacity: 0.5;
  }

  .read-more-btn, .read-less-btn {
      color: orange;
      background: none;
      border: none;
      padding: 0;
      font-size: 0.875rem;
      cursor: pointer;
      margin-top: 0.5rem;
      display: block;
      width: 100%;
      text-align: left;
      transition: color 0.2s ease;
  }

  .read-more-btn:hover, .read-less-btn:hover {
      color: #ff8c00;
  }

  .scrollable-description {
      max-height: 200px;
      overflow-y: auto;
  }

  .scrollable-description::-webkit-scrollbar {
      width: 6px;
  }

  .scrollable-description::-webkit-scrollbar-track {
      background: rgba(255, 165, 0, 0.1);
      border-radius: 3px;
  }

  .scrollable-description::-webkit-scrollbar-thumb {
      background: rgba(255, 165, 0, 0.3);
      border-radius: 3px;
  }

  .scrollable-description::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 165, 0, 0.5);
  }
</style>