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
    export let currentUserAddress: string = "";
    export let proposalsCount: number = 0;

    let platform = new ErgoPlatform();

    let deadline_passed = false;
    let is_min_submitted = false;
    let statusMessage = "";
    let statusColor = "";
    let showFullDescription = false;
    let isCurrentUserJudge: boolean = false;

    function truncateAddress(address: string): string {
        if (!address) return "";
        return address.length > 10
            ? `${address.slice(0, 6)}...${address.slice(-4)}`
            : address;
    }

    async function load() {
        deadline_passed = await is_ended(bounty);
        is_min_submitted = await min_submissions(bounty);
        const limit_date = await block_to_date(
            bounty.block_limit,
            bounty.platform,
        );

        isCurrentUserJudge =
            !!currentUserAddress &&
            !!bounty.content?.judges?.includes(currentUserAddress);

        const minErg =
            (bounty.min_submissions * bounty.exchange_rate) / Math.pow(10, 9);
        const maxErg =
            (bounty.max_submissions * bounty.exchange_rate) / Math.pow(10, 9);
        const isMaxReached =
            bounty.total_submissions >= bounty.total_pft_amount;

        if (isMaxReached) {
            statusMessage = `Reached maximum goal of ${maxErg} ${platform.main_token}; currently closed for contributions.`;
            statusColor =
                "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
        } else if (deadline_passed) {
            statusMessage = is_min_submitted
                ? `Reached minimum of ${minErg} ${platform.main_token}; open for contributions up to ${maxErg} ${platform.main_token}.`
                : `Did not raise minimum of ${minErg} ${platform.main_token} before ${limit_date}; open for contributions up to ${maxErg} ${platform.main_token}.`;
            statusColor = is_min_submitted
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
        } else {
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

<Card.Root
    class="relative bg-[#1a1a1a] h-auto min-h-[380px] flex flex-col {$mode ===
    'dark'
        ? 'bg-opacity-90 border-orange-500/30 border'
        : 'bg-opacity-0 border-orange-500/20 border'} rounded-lg shadow-lg transition-all duration-300 hover:shadow-orange-500/20 hover:shadow-md"
>
    <Card.Header
        class="p-3 sm:p-4 pb-2 {$mode === 'dark'
            ? 'bg-gradient-to-r from-[#1a1a1a] to-[#2a2a2a]'
            : 'bg-gradient-to-r from-white to-gray-100'} rounded-t-lg"
    >
        <!-- Title Row -->
        <div
            class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3"
        >
            <Card.Title
                class="text-lg sm:text-xl font-bold text-orange-500 flex-1 min-w-0"
            >
                <span class="block sm:truncate">
                    {bounty.content?.title || "Untitled Bounty"}
                </span>
            </Card.Title>

            <!-- Contract Version Badge - Top right on larger screens, below title on mobile -->
            <div class="flex-shrink-0 order-1 sm:order-2">
                {#if bounty.version}
                    <a
                        href="https://github.com/StabilityNexus/Bountiful-BountyPlatform-Ergo/blob/main/contracts/bounty_{bounty.version}.es"
                        target="_blank"
                        class={`${badgeVariants({ variant: "outline" })} text-xs`}
                    >
                        Contract v{bounty.version.replace("_", ".")}
                    </a>
                {/if}
            </div>
        </div>

        <!-- Metadata Row -->
        <div
            class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm opacity-75"
        >
            <!-- Left side - Judge and Time info -->
            <div
                class="flex flex-col xs:flex-row xs:items-center gap-2 xs:gap-4"
            >
                <!-- Judge(s) Display -->
                <div class="flex items-center gap-1 min-w-0 text-xs">
                    <span class="flex-shrink-0">🧑‍⚖️</span>

                    {#if isCurrentUserJudge}
                        <span class="text-orange-400 font-semibold truncate"
                            >You (Judge)</span
                        >
                    {:else if bounty.content?.judges?.length}
                        <div class="truncate">
                            Judges:
                            {#each bounty.content.judges as judge, index (judge)}
                                <span class="text-xs">
                                    {truncateAddress(judge)}{index <
                                    bounty.content.judges.length - 1
                                        ? ", "
                                        : ""}
                                </span>
                            {/each}
                        </div>
                    {:else}
                        <span class="truncate">Judge: Unknown</span>
                    {/if}
                </div>

                <!-- Right side - Proposals count -->
                <div
                    class="bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded text-xs flex-shrink-0 self-start sm:self-center"
                >
                    🧑‍💻 {proposalsCount} Proposal{proposalsCount !== 1
                        ? "s"
                        : ""}
                </div>
            </div>

            <!-- Judge Indicator for current user -->
            {#if isCurrentUserJudge}
                <div class="mt-2">
                    <div
                        class="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-2 py-1 rounded-full text-xs flex items-center gap-1 inline-flex"
                    >
                        ✅ You are the judge
                    </div>
                </div>
            {/if}
        </div></Card.Header
    >

    <Card.Content class="p-4 flex-1 flex flex-col">
        <div class="description-container flex-1 overflow-hidden">
            {#if !showFullDescription}
                <div class="truncated-description">
                    <p class="text-sm opacity-90 transition-all duration-300">
                        {#if bounty.content?.description && bounty.content.description.length > 150}
                            <span
                                >{bounty.content.description
                                    .slice(0, 150)
                                    .trim()}</span
                            >
                            <span class="fade-text">...</span>
                            <button
                                class="read-more-btn"
                                on:click|stopPropagation={() =>
                                    (showFullDescription = true)}
                            >
                                Read More
                            </button>
                        {:else}
                            {bounty.content?.description ||
                                "No description available"}
                        {/if}
                    </p>
                </div>
            {:else}
                <div class="full-description">
                    <p
                        class="text-sm opacity-90 transition-all duration-300 scrollable-description"
                    >
                        {bounty.content?.description ||
                            "No description available"}
                    </p>
                    <button
                        class="read-less-btn mt-2"
                        on:click|stopPropagation={() =>
                            (showFullDescription = false)}
                    >
                        Show Less
                    </button>
                </div>
            {/if}
        </div>
    </Card.Content>

    <!-- Status Message Sticky Bottom -->
    <div class="absolute bottom-16 left-0 w-full px-4">
        <div
            class={`${statusColor} p-2 rounded-md text-sm transition-all shadow-sm`}
        >
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

    .truncated-description,
    .full-description {
        position: relative;
        width: 100%;
    }

    .fade-text {
        opacity: 0.5;
    }

    .read-more-btn,
    .read-less-btn {
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

    .read-more-btn:hover,
    .read-less-btn:hover {
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

    /* Custom breakpoint for very small screens */
    @media (min-width: 480px) {
        .xs\:flex-row {
            flex-direction: row;
        }
        .xs\:items-center {
            align-items: center;
        }
        .xs\:gap-4 {
            gap: 1rem;
        }
    }
</style>
