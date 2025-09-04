<script lang="ts">
    import {
        type Bounty,
        is_ended,
        max_submissions,
        min_submissions,
    } from "$lib/common/bounty";
    import {
        address,
        connected,
        bounty_detail,
        bounty_token_amount,
        temporal_token_amount,
        timer,
        balance,
    } from "$lib/common/store";
    import { Progress } from "$lib/components/ui/progress";
    import { Button } from "$lib/components/ui/button";
    import { block_to_time } from "$lib/common/countdown";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import {
        web_explorer_uri_addr,
        web_explorer_uri_tkn,
        web_explorer_uri_tx,
    } from "$lib/ergo/envs";
    import { mode } from "mode-watcher";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label/index.js";
    import { Badge, badgeVariants } from "$lib/components/ui/badge/index.js";
    import { Card } from "$lib/components/ui/card";
    import { Textarea } from "$lib/components/ui/textarea";
    import ProposalManager from "./ProposalManager.svelte";
    import { get } from "svelte/store";
    import { onDestroy } from "svelte";
    import { onMount } from "svelte";

    export let bountyId: string = "";

    let bounty: Bounty | null = $bounty_detail;

    let platform = new ErgoPlatform();

    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let showCopyMessage = false;

    let currentVal = bounty?.total_submissions ?? 0;
    let min = bounty?.min_submissions ?? 0;
    let max = bounty?.total_pft_amount ?? 0;
    let percentage =
        max > 0 ? parseInt(((currentVal / max) * 100).toString()) : 0;

    // States for amounts
    let show_submit = false;
    let label_submit = "";
    let info_type_to_show: "buy" | "dev" | "dev-collect" | "" = "";
    let function_submit: ((event?: any) => Promise<void>) | null = null;
    let value_submit = 0;
    let submit_info = "";
    let hide_submit_info = false;
    let submit_amount_label = "";

    let funders: Array<{
        address: string;
        amount: number;
        token: string;
    }> = [];

    $: if (bounty) {
        submit_info =
            Number(
                value_submit *
                    bounty.exchange_rate *
                    Math.pow(10, bounty.token_details.decimals - 9),
            )
                .toFixed(10)
                .replace(/\.?0+$/, "") + "ERGs in total.";
    }

    let daysValue = 0;
    let hoursValue = 0;
    let minutesValue = 0;
    let secondsValue = 0;

    // Balance-aware variables
    let userErgBalance = 0; // User's ERG balance
    let userBountyTokenBalance = 0; // User's bounty token balance
    let userTemporalTokenBalance = 0; // User's temporal token balance
    let maxContributeAmount = 0; // Maximum amount user can contribute
    let maxRefundAmount = 0; // Maximum amount user can refund
    let maxCollectAmount = 0; // Maximum amount user can collect
    let maxWithdrawTokenAmount = 0; // Maximum amount bounty owner can withdraw
    let maxWithdrawErgAmount = 0; // Maximum amount bounty owner can withdraw

    let isCurrentUserJudge = false;

    function truncateAddress(address: string): string {
        if (!address) return "";
        return address.length > 10
            ? `${address.slice(0, 6)}...${address.slice(-4)}`
            : address;
    }

    $: if (bounty) {
        submit_info =
            Number(
                value_submit *
                    bounty.exchange_rate *
                    Math.pow(10, bounty.token_details.decimals - 9),
            )
                .toFixed(10)
                .replace(/\.?0+$/, "") + "ERGs in total.";
    }

    // Initialize data loading
    async function initializeBounty() {
        if (bountyId) {
            const bounties = await platform.fetch();
            const fetchedBounty = bounties.get(bountyId) || null;
            if (fetchedBounty) {
                bounty = fetchedBounty;
                bounty_detail.set(bounty);
            }
        }

        if (bounty) {
            await Promise.all([
                load(),
                checkIfIsOwner(),
                checkIfIsJudge(), // Add this line
                setTargetDate(),
                getWalletBalances(),
                get_user_bounty_tokens(),
                loadFunders(),
            ]);
        }
    }

    // Load funders from API
    async function loadFunders() {
        if (!bounty) return;

        try {
            // Replace with actual API call
            // funders = await platform.getFunders(bounty.bounty_id);
            console.log("Loading funders for bounty:", bounty.bounty_id);
        } catch (error) {
            console.error("Failed to load funders:", error);
        }
    }

    async function getWalletBalances() {
        if (!bounty) return;

        // Get ERG balance
        userErgBalance = ($balance || 0) / Math.pow(10, 9);

        // Fetch bounty token balances
        const userTokens = await platform.get_balance();

        // Get bounty token balance
        userBountyTokenBalance =
            (userTokens.get(bounty.token_id) || 0) /
            Math.pow(10, bounty.token_details.decimals);

        // Get temporal token balance
        userTemporalTokenBalance =
            (userTokens.get(bounty.bounty_id) || 0) /
            Math.pow(10, bounty.token_details.decimals);

        // Calculate maximum contribution amount based on both ERG balance and available tokens
        const ergLimitedAmount =
            userErgBalance /
            (bounty.exchange_rate *
                Math.pow(10, bounty.token_details.decimals - 9));
        const bountyLimitedAmount =
            (bounty.total_pft_amount - bounty.total_submissions) /
            Math.pow(10, bounty.token_details.decimals);
        maxContributeAmount = Math.min(ergLimitedAmount, bountyLimitedAmount);

        // Calculate maximum refund amount based on user's bounty tokens
        maxRefundAmount = userBountyTokenBalance;

        // Calculate maximum collect amount based on user's temporal tokens
        maxCollectAmount = userTemporalTokenBalance;

        // For bounty owner
        maxWithdrawTokenAmount =
            bounty.current_pft_amount /
            Math.pow(10, bounty.token_details.decimals);
        maxWithdrawErgAmount = bounty.current_value / Math.pow(10, 9);
    }

    // Add balance check after connection state changes
    $: if ($connected && bounty) {
        getWalletBalances();
    }

    // Bounty owner actions
    function setupAddTokens() {
        if (!bounty) return;

        info_type_to_show = "dev";
        label_submit = "How many tokens do you want to add?";
        function_submit = add_tokens;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = bounty.token_details.name;
    }

    async function add_tokens() {
        if (!bounty) return;

        console.log("Adding tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.rebalance(bounty, value_submit);
            transactionId = result;
        } catch (error) {
            if (error && typeof error === "object" && "message" in error) {
                errorMessage =
                    (error as { message: string }).message ||
                    "Error occurred while exchange TFT <-> PFT";
            } else {
                errorMessage = "Error occurred while exchange TFT <-> PFT";
            }
        } finally {
            isSubmitting = false;
        }
    }

    function setupWithdrawTokens() {
        if (!bounty) return;

        info_type_to_show = "dev";
        label_submit = "How many tokens do you want to withdraw?";
        function_submit = withdraw_tokens;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = bounty.token_details.name;
    }

    async function withdraw_tokens() {
        if (!bounty) return;

        console.log("Withdrawing tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.rebalance(bounty, -1 * value_submit);
            transactionId = result;
        } catch (error) {
            console.log(error);
            if (error && typeof error === "object" && "message" in error) {
                errorMessage =
                    (error as { message: string }).message ||
                    "Error occurred while exchange TFT <-> PFT";
            } else {
                errorMessage = "Error occurred while exchange TFT <-> PFT";
            }
        } finally {
            isSubmitting = false;
        }
    }

    function setupWithdrawErg() {
        if (!bounty) return;

        info_type_to_show = "dev-collect";
        label_submit = "How many ERGs do you want to withdraw?";
        function_submit = withdraw_erg;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
        submit_amount_label = "ERGs";
    }

    async function withdraw_erg() {
        if (!bounty) return;

        console.log("Withdrawing ERGs:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.withdraw(bounty, value_submit);
            transactionId = result;
        } catch (error) {
            if (error && typeof error === "object" && "message" in error) {
                errorMessage =
                    (error as { message: string }).message ||
                    "Error occurred while exchange TFT <-> PFT";
            } else {
                errorMessage = "Error occurred while exchange TFT <-> PFT";
            }
        } finally {
            isSubmitting = false;
        }
    }

    // User actions
    function setupBuy() {
        if (!bounty) return;

        getWalletBalances(); // Refresh balances before opening modal
        info_type_to_show = "buy";
        label_submit = "How much do you want to contribute?";
        function_submit = buy;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = bounty.token_details.name;
    }

    async function buy() {
        if (!bounty) return;

        console.log("Buying tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.buy_refund(bounty, value_submit);
            transactionId = result;
        } catch (error) {
            if (error && typeof error === "object" && "message" in error) {
                errorMessage =
                    (error as { message: string }).message ||
                    "Error occurred while exchange TFT <-> PFT";
            } else {
                errorMessage = "Error occurred while exchange TFT <-> PFT";
            }
        } finally {
            isSubmitting = false;
        }
    }

    function setupRefund() {
        if (!bounty) return;

        getWalletBalances(); // Refresh balances before opening modal
        info_type_to_show = "";
        label_submit = "How many tokens do you want to refund?";
        function_submit = refund;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = bounty.token_details.name;
    }

    async function refund() {
        if (!bounty) return;

        console.log("Refunding tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.buy_refund(bounty, -1 * value_submit);
            transactionId = result;
        } catch (error) {
            if (error && typeof error === "object" && "message" in error) {
                errorMessage =
                    (error as { message: string }).message ||
                    "Error occurred while exchange TFT <-> PFT";
            } else {
                errorMessage = "Error occurred while exchange TFT <-> PFT";
            }
        } finally {
            isSubmitting = false;
        }
    }

    function setupTempExchange() {
        if (!bounty) return;

        getWalletBalances(); // Refresh balances before opening modal
        info_type_to_show = "";
        label_submit =
            "Exchange " +
            bounty.content.title +
            " APT per " +
            bounty.token_details.name;
        function_submit = temp_exchange;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
        submit_amount_label = bounty.token_details.name;
    }

    async function temp_exchange() {
        if (!bounty) return;

        console.log("Refunding tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.temp_exchange(bounty, value_submit);
            transactionId = result;
        } catch (error) {
            if (error && typeof error === "object" && "message" in error) {
                errorMessage =
                    (error as { message: string }).message ||
                    "Error occurred while exchange TFT <-> PFT";
            } else {
                errorMessage = "Error occurred while exchange TFT <-> PFT";
            }
        } finally {
            isSubmitting = false;
        }
    }

    // Function to handle sharing the bounty
    function shareBounty() {
        navigator.clipboard
            .writeText(window.location.href)
            .then(() => {
                showCopyMessage = true;
                setTimeout(() => {
                    showCopyMessage = false;
                }, 2000);
            })
            .catch((err) => console.error("Failed to copy text: ", err));
    }

    function close_submit_form() {
        show_submit = false;
        transactionId = null;
        errorMessage = null;
        isSubmitting = false;
    }

    let deadline_passed = false;
    let is_min_submissions = false;
    let is_max_submissions = false;
    let limit_date = "";
    async function load() {
        if (!bounty) return;

        deadline_passed = await is_ended(bounty);
        is_min_submissions = await min_submissions(bounty);
        is_max_submissions = await max_submissions(bounty);
        limit_date = new Date(
            await block_to_time(bounty.block_limit, bounty.platform),
        ).toLocaleString();
    }
    load();

    let is_owner = false;
    async function checkIfIsOwner() {
        if (!bounty) return;

        is_owner = $connected && (await $address) === bounty.constants.creator;
    }
    checkIfIsOwner();

    let timerValue = get(timer);
    let targetDate = timerValue.target;
    let countdownInterval: any = timerValue.countdownInterval;

    async function setTargetDate() {
        if (!bounty) return;

        targetDate = await block_to_time(bounty.block_limit, bounty.platform);
    }
    setTargetDate();

    let progressColor = "white";
    let countdownAnimation = false;

    function formatDate(date: Date): string {
        return date.toLocaleDateString() + " at " + date.toLocaleTimeString();
    }

    function updateCountdown() {
        var currentDate = new Date().getTime();
        var diff = targetDate - currentDate;

        if (diff > 0) {
            // Use reactive variables instead of DOM manipulation
            daysValue = Math.floor(diff / (1000 * 60 * 60 * 24));
            hoursValue = Math.floor(
                (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
            );
            minutesValue = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            secondsValue = Math.floor((diff % (1000 * 60)) / 1000);
        } else {
            daysValue = 0;
            hoursValue = 0;
            minutesValue = 0;
            secondsValue = 0;
        }

        if (is_min_submissions) {
            progressColor = "#A8E6A1";
        } else {
            if (diff <= 0) {
                progressColor = "#FF6F61";
                countdownAnimation = false;
            } else if (diff < 24 * 60 * 60 * 1000) {
                progressColor = "#FFF5A3";
                countdownAnimation = true;
            } else {
                progressColor = "white";
                countdownAnimation = false;
            }
        }
    }

    countdownInterval = setInterval(updateCountdown, 1000);
    timer.update((current) => ({ ...current, countdownInterval }));

    async function get_user_bounty_tokens() {
        if (!bounty) return;

        var user_bounty_tokens =
            (await platform.get_balance(bounty.token_id)).get(
                bounty.token_id,
            ) ?? 0;
        bounty_token_amount.set(
            (
                user_bounty_tokens / Math.pow(10, bounty.token_details.decimals)
            ).toString() +
                " " +
                bounty.token_details.name,
        );

        var temporal_tokens =
            (await platform.get_balance(bounty.bounty_id)).get(
                bounty.bounty_id,
            ) ?? 0;
        temporal_token_amount.set(
            temporal_tokens / Math.pow(10, bounty.token_details.decimals),
        );
    }
    get_user_bounty_tokens();

    // Call getWalletBalances initially to set up values
    getWalletBalances();

    onDestroy(() => {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
    });

    async function checkIfIsJudge() {
        if (!bounty || !$connected) return;

        const currentAddress = (await $address) || "";
        console.log("Checking if current address is a judge:", currentAddress);
        isCurrentUserJudge =
            Array.isArray(bounty.content?.judges) &&
            bounty.content.judges.includes(currentAddress);
    }

    onMount(async () => {
        await initializeBounty();
    });

    $: if ($connected && bounty) {
        checkIfIsJudge();
    }
</script>

{#if bounty}
    <div
        class="bounty-detail"
        style={$mode === "light" ? "color: black;" : "color: #ddd;"}
    >
        <div class="bounty-container">
            <!-- Left Column - Bounty Information -->
            <div class="bounty-info">
                <!-- Header Section -->
                <div class="bounty-header">
                    <div class="header-main">
                        <h1 class="bounty-title">{bounty.content.title}</h1>
                        <div class="status-badges">
                            <Badge
                                variant={deadline_passed
                                    ? is_min_submissions
                                        ? "default"
                                        : "destructive"
                                    : "secondary"}
                            >
                                {#if is_max_submissions}
                                    🔒 Fully Funded
                                {:else if deadline_passed}
                                    {is_min_submissions
                                        ? "✅ Funded"
                                        : "❌ Failed"}
                                {:else}
                                    🟢 Open
                                {/if}
                            </Badge>

                            {#if bounty.version}
                                <a
                                    href="https://github.com/StabilityNexus/Bountiful-BountyPlatform-Ergo/blob/main/contracts/bounty_{bounty.version}.es"
                                    target="_blank"
                                    class={badgeVariants({
                                        variant: "outline",
                                    })}
                                >
                                    Contract v{bounty.version.replace("_", ".")}
                                </a>
                            {/if}
                        </div>
                    </div>

                    <div class="header-metadata">
                        <!-- Judge Display -->
                        <div class="metadata-grid">
                            <div class="metadata-item">
                                <span class="icon">🧑‍⚖️</span>
                                <div class="metadata-content">
                                    <span class="label">
                                        Judge{(bounty.content?.judges?.length ??
                                            0) > 1
                                            ? "s"
                                            : ""}:
                                    </span>

                                    {#if isCurrentUserJudge}
                                        <div class="metadata-item judge-badge">
                                            <div class="metadata-content">
                                                <div class="value">
                                                    You are a <span
                                                        class="judge-highlight"
                                                        >Judge</span
                                                    >
                                                </div>
                                            </div>
                                        </div>
                                    {/if}

                                    {#if (bounty.content?.judges?.length ?? 0) > 0}
                                        <span class="value">
                                            {#each bounty.content.judges ?? [] as judge, index (judge)}
                                                <a
                                                    href="{web_explorer_uri_addr}{judge}"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="judge-link"
                                                >
                                                    {truncateAddress(judge)}
                                                </a>
                                                {index <
                                                (bounty.content.judges ?? [])
                                                    .length -
                                                    1
                                                    ? ", "
                                                    : ""}
                                            {/each}
                                        </span>
                                    {:else}
                                        <span class="value"
                                            >No judges assigned</span
                                        >
                                    {/if}
                                </div>
                            </div>

                            <div class="metadata-item">
                                <span class="icon">⛓️</span>
                                <div class="metadata-content">
                                    <span class="label">Bounty ID</span>
                                    <span class="value"
                                        >{truncateAddress(
                                            bounty.bounty_id,
                                        )}</span
                                    >
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Image Section -->
                {#if bounty.content.image}
                    <div
                        class="bounty-image"
                        style="background-image: url({bounty.content.image});"
                    ></div>
                {/if}

                <!-- Description Section -->
                <div class="bounty-description">
                    <div class="section-header">
                        <h2>📋 Description</h2>
                    </div>
                    <div class="description-content">
                        <p>{bounty.content.description}</p>
                        {#if bounty.content.link}
                            <p>
                                More info <a
                                    href={bounty.content.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="external-link">here</a
                                >.
                            </p>
                        {/if}
                    </div>
                </div>

                <!-- Technical Metadata Section -->
                <div class="technical-metadata">
                    <div class="section-header">
                        <h2>🔧 Technical Details</h2>
                    </div>
                    <div class="technical-grid">
                        <div class="technical-item">
                            <span class="label">Token</span>
                            <a
                                href={web_explorer_uri_tkn + bounty.token_id}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="value link"
                            >
                                {bounty.token_details.name}
                            </a>
                        </div>

                        <div class="technical-item">
                            <span class="label">Max Funding</span>
                            <span class="value">
                                {max /
                                    Math.pow(10, bounty.token_details.decimals)}
                                {bounty.token_details.name}
                            </span>
                        </div>

                        <div class="technical-item">
                            <span class="label">Block Limit</span>
                            <span class="value">{bounty.block_limit}</span>
                        </div>

                        <div class="technical-item">
                            <span class="label">Exchange Rate</span>
                            <span class="value">
                                {(
                                    bounty.exchange_rate *
                                    Math.pow(
                                        10,
                                        bounty.token_details.decimals - 9,
                                    )
                                ).toFixed(4)} ERG/{bounty.token_details.name}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Funding Section -->
                <div class="funding-section">
                    <div class="section-header">
                        <h2>💰 Funding Details</h2>
                    </div>
                    <div class="funding-overview">
                        <div class="funding-item">
                            <span class="amount"
                                >{(
                                    (currentVal * bounty.exchange_rate) /
                                    Math.pow(10, 9)
                                ).toFixed(2)}</span
                            >
                            <span class="unit">ERG</span>
                            <span class="label">Current</span>
                        </div>

                        <div class="funding-item">
                            <span class="amount"
                                >{(
                                    (min * bounty.exchange_rate) /
                                    Math.pow(10, 9)
                                ).toFixed(2)}</span
                            >
                            <span class="unit">ERG</span>
                            <span class="label">Minimum</span>
                        </div>

                        <div class="funding-item">
                            <span class="amount"
                                >{(
                                    (max * bounty.exchange_rate) /
                                    Math.pow(10, 9)
                                ).toFixed(2)}</span
                            >
                            <span class="unit">ERG</span>
                            <span class="label">Maximum</span>
                        </div>
                    </div>

                    {#if funders.length > 0}
                        <div class="funders-list">
                            <h3>👥 Funders</h3>
                            <div class="funders-grid">
                                {#each funders as funder}
                                    <div class="funder-item">
                                        <div class="funder-avatar">
                                            {funder.address
                                                .slice(0, 2)
                                                .toUpperCase()}
                                        </div>
                                        <div class="funder-details">
                                            <div class="funder-address">
                                                {truncateAddress(
                                                    funder.address,
                                                )}
                                            </div>
                                            <div class="funder-amount">
                                                {funder.amount}
                                                {funder.token}
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="proposal-section">
                    <ProposalManager
                        {bounty}
                        {deadline_passed}
                        {is_max_submissions}
                    />
                </div>
            </div>

            <!-- Right Column - Bounty Stats & Actions -->
            <div class="bounty-stats">
                <!-- Countdown Timer -->
                <div class="countdown-container">
                    <div
                        class="timeleft {deadline_passed
                            ? 'ended'
                            : countdownAnimation
                              ? 'soon'
                              : ''}"
                    >
                        <span class="timeleft-label">
                            {#if deadline_passed}
                                TIME'S UP!
                                {#if !is_max_submissions}
                                    <small class="secondary-text"
                                        >... But you can still contribute!</small
                                    >
                                {/if}
                            {:else}
                                TIME LEFT
                            {/if}
                        </span>
                        <div class="countdown-items">
                            <div class="item">
                                <div>{daysValue}</div>
                                <div class="h3"><h3>Days</h3></div>
                            </div>
                            <div class="item">
                                <div>{hoursValue}</div>
                                <div class="h3"><h3>Hours</h3></div>
                            </div>
                            <div class="item">
                                <div>{minutesValue}</div>
                                <div class="h3"><h3>Minutes</h3></div>
                            </div>
                            <div class="item">
                                <div>{secondsValue}</div>
                                <div class="h3"><h3>Seconds</h3></div>
                            </div>
                        </div>
                        <small class="deadline-info"
                            >Until {limit_date} UTC on block {bounty.block_limit}</small
                        >
                    </div>
                </div>

                <!-- Progress Bar -->
                <div class="progress-container">
                    <Progress value={percentage} color={progressColor} />

                    <div class="amounts-info">
                        <div class="amount-item">
                            <div class="amount-label">Minimum Amount</div>
                            <div class="amount-value">
                                {min /
                                    Math.pow(10, bounty.token_details.decimals)}
                                {bounty.token_details.name}
                            </div>
                            <div class="amount-ergs">
                                {(min * bounty.exchange_rate) / Math.pow(10, 9)}
                                {platform.main_token}
                            </div>
                        </div>

                        <div class="amount-item current">
                            <div class="amount-label">Current Amount</div>
                            <div class="amount-value">
                                {currentVal /
                                    Math.pow(10, bounty.token_details.decimals)}
                                {bounty.token_details.name}
                            </div>
                            <div class="amount-ergs">
                                {(currentVal * bounty.exchange_rate) /
                                    Math.pow(10, 9)}
                                {platform.main_token}
                            </div>
                        </div>

                        <div class="amount-item">
                            <div class="amount-label">Maximum Amount</div>
                            <div class="amount-value">
                                {max /
                                    Math.pow(10, bounty.token_details.decimals)}
                                {bounty.token_details.name}
                            </div>
                            <div class="amount-ergs">
                                {(max * bounty.exchange_rate) / Math.pow(10, 9)}
                                {platform.main_token}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- User Actions -->
                {#if $connected}
                    <div class="actions-section">
                        <h2 class="actions-title">Actions</h2>
                        <div class="action-buttons">
                            <Button
                                class="action-btn primary"
                                style="background-color: #FFA500; color: black;"
                                on:click={setupBuy}
                                disabled={!(
                                    bounty.total_pft_amount !==
                                    bounty.total_submissions
                                ) || maxContributeAmount <= 0}
                            >
                                Contribute
                            </Button>

                            <Button
                                class="action-btn"
                                style="background-color: #FF8C00; color: black;"
                                on:click={setupRefund}
                                disabled={!(
                                    deadline_passed && !is_min_submissions
                                ) || maxRefundAmount <= 0}
                            >
                                Get a Refund
                            </Button>

                            <Button
                                class="action-btn"
                                style="background-color: #FF8C00; color: black;"
                                on:click={setupTempExchange}
                                disabled={!is_min_submissions ||
                                    maxCollectAmount <= 0}
                            >
                                Collect {bounty.token_details.name}
                            </Button>
                        </div>
                    </div>
                {/if}

                <!-- Bounty Owner Actions -->
                {#if $connected && is_owner}
                    <div class="actions-section owner">
                        <h2 class="actions-title">Owner Actions</h2>
                        <div class="action-buttons">
                            <Button
                                class="action-btn"
                                style="background-color: #FF8C00; color: black;"
                                on:click={setupAddTokens}
                            >
                                Add {bounty.token_details.name}
                            </Button>

                            <Button
                                class="action-btn"
                                style="background-color: #FF8C00; color: black;"
                                on:click={setupWithdrawTokens}
                                disabled={maxWithdrawTokenAmount <= 0}
                            >
                                Withdraw {bounty.token_details.name}
                            </Button>

                            <Button
                                class="action-btn"
                                style="background-color: #FF8C00; color: black;"
                                on:click={setupWithdrawErg}
                                disabled={!is_min_submissions ||
                                    maxWithdrawErgAmount <= 0}
                            >
                                Collect {platform.main_token}
                            </Button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
    <!-- Transaction Form Modal -->
    {#if show_submit}
        <div class="modal-overlay">
            <div
                class="actions-form"
                style={$mode === "light"
                    ? "background: white;"
                    : "background: #2a2a2a;"}
            >
                <div class="close-button" on:click={close_submit_form}>
                    &times;
                </div>
                <div class="centered-form">
                    {#if transactionId}
                        <div class="result">
                            <p>
                                <strong>Transaction ID:</strong>
                                <a
                                    href={web_explorer_uri_tx + transactionId}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="transaction-link"
                                >
                                    {transactionId.slice(0, 16)}
                                </a>
                            </p>
                        </div>
                    {:else if errorMessage}
                        <div class="error">
                            <p>{errorMessage}</p>
                        </div>
                    {:else}
                        <div class="form-container">
                            <div class="form-info">
                                {#if info_type_to_show === "buy"}
                                    <p>
                                        <strong>Exchange Rate:</strong>
                                        {(
                                            bounty.exchange_rate *
                                            Math.pow(
                                                10,
                                                bounty.token_details.decimals -
                                                    9,
                                            )
                                        )
                                            .toFixed(10)
                                            .replace(/\.?0+$/, "")}
                                        {platform.main_token}/{bounty
                                            .token_details.name}
                                    </p>
                                    <p>
                                        <strong>Available Balance:</strong>
                                        {userErgBalance.toFixed(4)}
                                        {platform.main_token}
                                    </p>
                                    <p>
                                        <strong>Maximum Contribution:</strong>
                                        {maxContributeAmount.toFixed(4)}
                                        {bounty.token_details.name}
                                    </p>
                                {/if}
                                {#if info_type_to_show === "dev-collect"}
                                    <p>
                                        <strong>Current ERG balance:</strong>
                                        {bounty.current_value / Math.pow(10, 9)}
                                        {platform.main_token}
                                    </p>
                                    <p>
                                        <strong>Maximum Withdrawal:</strong>
                                        {maxWithdrawErgAmount.toFixed(4)}
                                        {platform.main_token}
                                    </p>
                                {/if}
                                {#if info_type_to_show === "dev"}
                                    <p>
                                        <strong>Current PFT balance:</strong>
                                        {bounty.current_pft_amount /
                                            Math.pow(
                                                10,
                                                bounty.token_details.decimals,
                                            )}
                                        {bounty.token_details.name}
                                    </p>
                                    <p>
                                        <strong>Maximum Withdrawal:</strong>
                                        {maxWithdrawTokenAmount.toFixed(4)}
                                        {bounty.token_details.name}
                                    </p>
                                {/if}
                                {#if function_submit === refund}
                                    <p>
                                        <strong>Your Token Balance:</strong>
                                        {userBountyTokenBalance.toFixed(4)}
                                        {bounty.token_details.name}
                                    </p>
                                    <p>
                                        <strong>Maximum Refund:</strong>
                                        {maxRefundAmount.toFixed(4)}
                                        {bounty.token_details.name}
                                    </p>
                                {/if}
                                {#if function_submit === temp_exchange}
                                    <p>
                                        <strong
                                            >Your Temporal Token Balance:</strong
                                        >
                                        {userTemporalTokenBalance.toFixed(4)} APT
                                    </p>
                                    <p>
                                        <strong>Maximum Collection:</strong>
                                        {maxCollectAmount.toFixed(4)}
                                        {bounty.token_details.name}
                                    </p>
                                {/if}
                            </div>

                            <div class="form-content">
                                <Label for="amount-input" class="form-label"
                                    >{label_submit}</Label
                                >
                                <div class="input-container">
                                    <Input
                                        id="amount-input"
                                        type="number"
                                        bind:value={value_submit}
                                        min="0"
                                        max={function_submit === buy
                                            ? maxContributeAmount
                                            : function_submit === refund
                                              ? maxRefundAmount
                                              : function_submit ===
                                                  temp_exchange
                                                ? maxCollectAmount
                                                : function_submit ===
                                                    withdraw_tokens
                                                  ? maxWithdrawTokenAmount
                                                  : function_submit ===
                                                      withdraw_erg
                                                    ? maxWithdrawErgAmount
                                                    : null}
                                        step="0.001"
                                        class="form-input"
                                    />
                                    <span class="input-suffix"
                                        >{submit_amount_label}</span
                                    >
                                </div>

                                {#if !hide_submit_info}
                                    <div class="info-badge">
                                        <Badge type="primary" rounded
                                            >{submit_info}</Badge
                                        >
                                    </div>
                                {/if}

                                <Button
                                    on:click={function_submit ?? (() => {})}
                                    disabled={isSubmitting ||
                                        value_submit <= 0 ||
                                        (function_submit === buy &&
                                            value_submit >
                                                maxContributeAmount) ||
                                        (function_submit === refund &&
                                            value_submit > maxRefundAmount) ||
                                        (function_submit === temp_exchange &&
                                            value_submit > maxCollectAmount) ||
                                        (function_submit === withdraw_tokens &&
                                            value_submit >
                                                maxWithdrawTokenAmount) ||
                                        (function_submit === withdraw_erg &&
                                            value_submit >
                                                maxWithdrawErgAmount)}
                                    class="submit-btn"
                                    style="background-color: #FF8C00; color: black;"
                                >
                                    {isSubmitting ? "Processing..." : "Submit"}
                                </Button>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
{/if}

<style>
    /* Section Headers */
    .section-header {
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .section-header h2 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
    }

    .metadata-item {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.75rem;
        background-color: rgba(255, 255, 255, 0.03);
        border-radius: 6px;
    }

    .metadata-content {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }

    .metadata-item .icon {
        font-size: 1.25rem;
        flex-shrink: 0;
    }

    .metadata-item .label {
        font-size: 0.875rem;
        font-weight: 600;
        opacity: 0.8;
    }

    .metadata-item .value {
        font-size: 0.9rem;
        font-weight: 500;
    }

    .judge-highlight {
        color: #ffa500 !important;
        font-weight: 600;
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

    /* Header Metadata Grid */
    .header-metadata {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        margin-bottom: 1.5rem;
    }

    .metadata-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
    }

    .description-content {
        line-height: 1.6;
    }

    .external-link {
        color: #ffa500;
        text-decoration: underline;
        transition: color 0.2s ease;
    }

    .external-link:hover {
        color: #ff8c00;
    }

    /* Technical Metadata */
    .technical-metadata {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .technical-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
    }

    @media (max-width: 767px) {
        .technical-grid {
            grid-template-columns: 1fr;
        }
    }

    .technical-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.75rem;
        background-color: rgba(255, 255, 255, 0.03);
        border-radius: 6px;
    }

    .technical-item .label {
        font-size: 0.875rem;
        font-weight: 600;
        opacity: 0.8;
    }

    .technical-item .value {
        font-size: 0.9rem;
        font-weight: 500;
    }

    .technical-item .link {
        color: #ffa500;
        text-decoration: underline;
        transition: color 0.2s ease;
    }

    .technical-item .link:hover {
        color: #ff8c00;
    }

    /* Funding Section */
    .funding-section {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    /* Proposals Section */
    .proposals-section {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .proposals-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .proposals-header h2 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
    }

    /* Update existing bounty-info styles */
    .bounty-info {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        overflow: visible;
    }

    .bounty-header {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .header-main {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    @media (min-width: 768px) {
        .header-main {
            flex-direction: row;
            justify-content: space-between;
            align-items: flex-start;
        }
    }

    .status-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    /* Submit Proposal Form Styles */

    .proposal-form {
        position: relative;
        width: 90%;
        max-width: 600px;
        max-height: 90vh;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        overflow-y: auto;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: scale(0.95) translateY(-20px);
        }
        to {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }

    .proposal-form .close-button {
        position: absolute;
        top: 16px;
        right: 20px;
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255, 69, 0, 0.1);
        color: #ff4500;
        font-size: 24px;
        font-weight: bold;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 10;
    }

    .proposal-form .close-button:hover {
        background: rgba(255, 69, 0, 0.2);
        transform: scale(1.1);
    }

    .proposal-form .centered-form {
        padding: 32px;
        padding-top: 60px; /* Account for close button */
    }

    .proposal-form h2 {
        font-size: 28px;
        font-weight: 700;
        margin: 0 0 24px 0;
        color: #ffa500;
        text-align: center;
        position: relative;
    }

    .proposal-form h2::after {
        content: "";
        position: absolute;
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 60px;
        height: 3px;
        background: linear-gradient(90deg, #ffa500, #ff8c00);
        border-radius: 2px;
    }

    .proposal-form .form-container {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .proposal-form .form-content {
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    .proposal-form .form-field {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .proposal-form .form-label {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary, #333);
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    /* Dark mode label color */
    [data-mode="dark"] .proposal-form .form-label {
        color: #ddd;
    }

    .proposal-form .form-label::before {
        content: "";
        width: 4px;
        height: 4px;
        background: #ffa500;
        border-radius: 50%;
        display: inline-block;
    }

    .proposal-form .form-input,
    .proposal-form .form-textarea {
        padding: 12px 16px;
        border: 2px solid rgba(255, 165, 0, 0.2);
        border-radius: 8px;
        font-size: 14px;
        font-family: inherit;
        transition: all 0.2s ease;
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-primary, #333);
        resize: vertical;
        min-height: 44px;
    }

    /* Dark mode input styles */
    [data-mode="dark"] .proposal-form .form-input,
    [data-mode="dark"] .proposal-form .form-textarea {
        background: rgba(255, 255, 255, 0.05);
        color: #ddd;
        border-color: rgba(255, 165, 0, 0.3);
    }

    .proposal-form .form-input:focus,
    .proposal-form .form-textarea:focus {
        outline: none;
        border-color: #ffa500;
        box-shadow: 0 0 0 3px rgba(255, 165, 0, 0.1);
        background: rgba(255, 165, 0, 0.05);
    }

    .proposal-form .form-input::placeholder,
    .proposal-form .form-textarea::placeholder {
        color: rgba(133, 133, 133, 0.7);
        font-style: italic;
    }

    .proposal-form .form-textarea {
        min-height: 100px;
        font-family: "SF Mono", "Monaco", "Inconsolata", "Roboto Mono",
            monospace;
        line-height: 1.5;
    }

    .proposal-form .form-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid rgba(255, 165, 0, 0.1);
    }

    .proposal-form .cancel-btn {
        padding: 12px 24px;
        background: transparent;
        border: 2px solid rgba(255, 165, 0, 0.3);
        color: #ffa500;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        min-width: 100px;
    }

    .proposal-form .cancel-btn:hover {
        background: rgba(255, 165, 0, 0.1);
        border-color: #ffa500;
        transform: translateY(-1px);
    }

    .proposal-form .submit-btn {
        padding: 12px 32px;
        background: linear-gradient(135deg, #ffa500, #ff8c00);
        border: none;
        color: black;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        min-width: 140px;
        box-shadow: 0 4px 12px rgba(255, 165, 0, 0.3);
    }

    .proposal-form .submit-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #ff8c00, #ffa500);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(255, 165, 0, 0.4);
    }

    .proposal-form .submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }

    .proposal-form .result {
        text-align: center;
        padding: 24px;
        border-radius: 12px;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.2);
        margin-bottom: 16px;
    }

    .proposal-form .result p {
        margin: 8px 0;
        color: var(--text-primary, #333);
    }

    [data-mode="dark"] .proposal-form .result p {
        color: #ddd;
    }

    .proposal-form .result .transaction-link {
        color: #ffa500;
        text-decoration: none;
        font-weight: 600;
        font-family: "SF Mono", "Monaco", "Inconsolata", "Roboto Mono",
            monospace;
    }

    .proposal-form .result .transaction-link:hover {
        text-decoration: underline;
    }

    .proposal-form .error {
        text-align: center;
        padding: 24px;
        border-radius: 12px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        margin-bottom: 16px;
    }

    .proposal-form .error p {
        margin: 0;
        color: #ef4444;
        font-weight: 500;
    }

    /* Responsive design */
    @media (max-width: 768px) {
        .proposal-form {
            width: 95%;
            max-height: 95vh;
        }

        .proposal-form .centered-form {
            padding: 24px 20px;
            padding-top: 50px;
        }

        .proposal-form h2 {
            font-size: 24px;
        }

        .proposal-form .form-actions {
            flex-direction: column-reverse;
            gap: 8px;
        }

        .proposal-form .cancel-btn,
        .proposal-form .submit-btn {
            width: 100%;
            padding: 14px 24px;
        }
    }

    /* Loading state animation */
    .proposal-form .submit-btn:disabled::after {
        content: "";
        width: 16px;
        height: 16px;
        border: 2px solid transparent;
        border-top: 2px solid currentColor;
        border-radius: 50%;
        display: inline-block;
        animation: spin 1s linear infinite;
        margin-left: 8px;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* Form validation states */
    .proposal-form .form-input:invalid {
        border-color: rgba(239, 68, 68, 0.5);
    }

    .proposal-form .form-input:valid:not(:placeholder-shown) {
        border-color: rgba(34, 197, 94, 0.5);
    }

    /* Enhanced focus states */
    .proposal-form .form-input:focus-visible,
    .proposal-form .form-textarea:focus-visible {
        outline: 2px solid #ffa500;
        outline-offset: 2px;
    }

    /* Smooth scrollbar for form */
    .proposal-form::-webkit-scrollbar {
        width: 6px;
    }

    .proposal-form::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
    }

    .proposal-form::-webkit-scrollbar-thumb {
        background: rgba(255, 165, 0, 0.3);
        border-radius: 3px;
    }

    .proposal-form::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 165, 0, 0.5);
    }

    /* Base Layout */
    .bounty-detail {
        min-height: 100vh;
        height: auto;
        width: 100%;
        padding: 2rem;
        overflow-y: auto;
        overflow-x: hidden;
        position: relative;
    }

    .bounty-container {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2rem;
        max-width: 1400px;
        margin: 0 auto;
        overflow: visible;
    }

    /* Bounty Information Section */
    .bounty-info {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        overflow: visible;
    }

    .bounty-header {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .bounty-title {
        font-size: 2rem;
        font-weight: 700;
        margin: 0;
        line-height: 1.2;
    }

    .bounty-badge {
        margin-bottom: 1rem;
    }

    .bounty-image {
        width: 100%;
        height: 300px;
        border-radius: 8px;
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .bounty-description {
        font-size: 1rem;
        line-height: 1.6;
    }

    .token-info {
        margin-top: 0.5rem;
    }

    .share-button {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
        margin-top: 1rem;
    }

    .share-btn {
        background-color: #6b7280;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .share-btn:hover {
        background-color: #4b5563;
    }

    .copy-msg {
        color: #10b981;
        font-size: 0.875rem;
    }

    /* Bounty Stats Section */
    .bounty-stats {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        overflow: visible;
    }

    /* Countdown Timer */
    .countdown-container {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .timeleft {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .timeleft-label {
        font-size: 1.5rem;
        font-weight: 600;
        text-align: center;
    }

    .secondary-text {
        display: block;
        font-size: 0.875rem;
        opacity: 0.8;
        margin-top: 0.25rem;
    }

    .countdown-items {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .item {
        width: 80px;
        height: 80px;
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        border: 2px solid;
        border-radius: 8px;
        transition: all 0.3s ease;
    }

    .item > div {
        font-size: 1.75rem;
        font-weight: 700;
        line-height: 1;
    }

    .item > div > h3 {
        font-size: 0.875rem;
        font-weight: 400;
        margin-top: 0.5rem;
    }

    .deadline-info {
        font-size: 0.75rem;
        opacity: 0.8;
        text-align: center;
    }

    /* Progress Bar */
    .progress-container {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .progress {
        height: 10px;
        margin-bottom: 1.5rem;
    }

    .amounts-info {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        margin-top: 1rem;
    }

    .amount-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 0.75rem;
        border-radius: 6px;
        background-color: rgba(255, 255, 255, 0.03);
    }

    .amount-item.current {
        background-color: rgba(255, 165, 0, 0.1);
        border: 1px solid rgba(255, 165, 0, 0.3);
    }

    .amount-label {
        font-size: 0.75rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
    }

    .amount-value {
        font-size: 0.95rem;
        font-weight: 500;
    }

    .amount-ergs {
        font-size: 0.75rem;
        opacity: 0.8;
        margin-top: 0.25rem;
    }

    /* Action Sections */
    .actions-section {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .actions-section.owner {
        background-color: rgba(255, 165, 0, 0.05);
        border: 1px solid rgba(255, 165, 0, 0.2);
    }

    .actions-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin-top: 0;
        margin-bottom: 1rem;
    }

    .action-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
    }

    .action-btn {
        color: black;
        border: none;
        padding: 0.75rem 1.25rem;
        border-radius: 4px;
        font-weight: 600;
        transition: all 0.2s ease;
        flex: 1;
        min-width: 140px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .action-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .action-btn:active:not(:disabled) {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        box-shadow: none;
    }

    .action-btn.primary {
        font-weight: 700;
        letter-spacing: 0.5px;
    }

    /* Modal Styles */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .actions-form {
        position: relative;
        width: 90%;
        max-width: 600px;
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    }

    .close-button {
        position: absolute;
        top: 1rem;
        right: 1.5rem;
        font-size: 1.5rem;
        cursor: pointer;
        width: 30px;
        height: 30px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 50%;
        transition: background-color 0.2s;
    }

    .close-button:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }

    .centered-form {
        width: 100%;
    }

    .form-container {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .form-info {
        background-color: rgba(255, 255, 255, 0.05);
        padding: 0.75rem;
        border-radius: 6px;
    }

    .form-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .form-label {
        font-size: 1.1rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
        text-align: center;
    }

    .input-container {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .form-input {
        flex: 1;
        padding: 0.75rem;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background-color: rgba(255, 255, 255, 0.05);
        color: inherit;
        font-size: 1rem;
    }

    .input-suffix {
        font-size: 0.9rem;
        font-weight: 500;
        min-width: 50px;
    }

    .info-badge {
        margin-top: 0.5rem;
        text-align: center;
    }

    .submit-btn {
        color: black;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        font-weight: 600;
        margin-top: 1rem;
        cursor: pointer;
        transition: all 0.2s ease;
        align-self: center;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .submit-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .submit-btn:active:not(:disabled) {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .result {
        text-align: center;
        padding: 1rem;
    }

    .transaction-link {
        color: #ff8c00;
        text-decoration: underline;
    }

    .error {
        color: #ef5350;
        text-align: center;
        padding: 1rem;
    }

    /* Animation */
    @keyframes pulse {
        0% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.05);
        }
        100% {
            transform: scale(1);
        }
    }

    .timeleft.soon .item {
        animation: pulse 1.2s infinite;
        border-color: #ffc107;
        color: #ffc107;
    }

    .timeleft.ended {
        opacity: 0.6;
    }

    /* Responsive Design */
    @media (min-width: 768px) {
        .metadata-grid {
            grid-template-columns: repeat(2, 1fr);
        }

        .bounty-container {
            grid-template-columns: 1fr 1fr;
        }

        .action-buttons {
            display: flex;
            flex-wrap: wrap;
        }

        .form-container {
            flex-direction: row;
        }

        .form-info {
            flex: 1;
        }

        .form-content {
            flex: 2;
        }
    }

    @media (max-width: 767px) {
        .metadata-grid {
            grid-template-columns: repeat(3, 1fr);
        }

        .bounty-detail {
            padding: 1rem;
            height: auto;
            min-height: 100vh;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .countdown-items {
            gap: 0.5rem;
        }

        .item {
            width: 70px;
            height: 70px;
        }

        .amounts-info {
            grid-template-columns: 1fr;
        }

        .action-buttons {
            flex-direction: column;
        }

        .actions-form {
            padding: 1.5rem;
        }
    }
</style>
