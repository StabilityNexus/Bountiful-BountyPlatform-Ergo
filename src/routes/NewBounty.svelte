<script lang="ts">
  import { block_to_date, time_to_block } from "$lib/common/countdown";
  import { explorer_uri, web_explorer_uri_tx } from "$lib/ergo/envs";
  import { ErgoPlatform } from "$lib/ergo/platform";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { get } from "svelte/store";
  import { user_tokens } from "$lib/common/store";
  import { onMount } from "svelte";

  // Constants
  const MIN_ERG_AMOUNT = 0.001;
  const ERG_DECIMALS = 9;
  const MAX_DEADLINE_DAYS = 365;
  const MAX_MIN_SUBMISSIONS = 100;

  let platform = new ErgoPlatform();
  let platformInitialized: boolean = false;
  let initializationError: string | null = null;

  // Token-related state
  let tokenOption: string = "";
  let tokenId: string | null = null;
  let tokenDecimals: number = 0;

  let tokenAmountRaw: number = 0;
  let tokenAmountPrecise: number = 0;
  let maxTokenAmountRaw: number = 0;

  let daysLimit: number = 1;
  let daysLimitBlock: number = 0;
  let daysLimitText: string = "";

  let exchangeRateRaw: number = 0;
  let exchangeRatePrecise: number = 0;

  let maxValuePrecise: number = 0;
  let minValuePrecise: number = 0;

  let bountyTitle: string = "";
  let bountyDescription: string = "";
  let bountyImage: string = "";
  let bountyLink: string = "";

  let transactionId: string | null = null;
  let errorMessage: string | null = null;
  let isSubmitting: boolean = false;

  let currentHeight: number | null = null;
  let userTokens: Array<{
    tokenId: string;
    title: string;
    balance: number;
    decimals: number;
  }> = [];

  // Reactive statements
  $: tokenId = tokenOption || null;

  $: tokenDecimals =
    userTokens.find((t) => t.tokenId === tokenId)?.decimals || 0;

  $: {
    const token = userTokens.find((t) => t.tokenId === tokenId);
    maxTokenAmountRaw = token
      ? Number(token.balance) / Math.pow(10, token.decimals)
      : 0;
  }

  $: {
    tokenAmountRaw = tokenAmountPrecise * Math.pow(10, tokenDecimals);
  }

  $: {
    exchangeRateRaw = exchangeRatePrecise * Math.pow(10, 9 - tokenDecimals);
  }

  $: {
    if (daysLimit > 0 && platformInitialized) {
      calculateBlockLimit(daysLimit);
    }
  }

  async function initializePlatform(): Promise<void> {
    try {
      platform = new ErgoPlatform();
      if (typeof platform.get_current_height === "function") {
        platformInitialized = true;
        initializationError = null;
        console.log("Platform initialized successfully");
      } else {
        throw new Error("Platform methods not available");
      }
    } catch (error) {
      console.error("initializePlatform: ERROR:", error);
      initializationError =
        error instanceof Error ? error.message : "Unknown initialization error";
      platformInitialized = false;
    }
  }

  async function calculateBlockLimit(days: number): Promise<void> {
    if (!platform || !platformInitialized) {
      console.log(
        "calculateBlockLimit: No platform available or not initialized"
      );
      return;
    }
    try {
      let targetDate = new Date();
      targetDate.setTime(targetDate.getTime() + days * 24 * 60 * 60 * 1000);
      daysLimitBlock = await time_to_block(targetDate.getTime(), platform);
      daysLimitText = await block_to_date(daysLimitBlock, platform);
      console.log("Block limit calculated:", daysLimitBlock);
    } catch (error) {
      console.error("calculateBlockLimit: ERROR:", error);
      daysLimitText = "Error calculating deadline";
    }
  }

  async function getCurrentHeight(): Promise<void> {
    if (!platform || !platformInitialized) {
      console.log("getCurrentHeight: No platform available or not initialized");
      return;
    }
    try {
      currentHeight = await platform.get_current_height();
      console.log("Current height:", currentHeight);
    } catch (error) {
      console.error("getCurrentHeight: ERROR:", error);
      errorMessage = "Failed to connect to blockchain";
    }
  }

  async function handleSubmit(): Promise<void> {
    console.log("handleSubmit called");
    console.log("Platform initialized:", platformInitialized);
    console.log("Token ID:", tokenId);
    console.log("Token amount raw:", tokenAmountRaw);
    console.log("Exchange rate raw:", exchangeRateRaw);
    console.log("Max value precise:", maxValuePrecise);
    console.log("Bounty title:", bountyTitle);
    console.log("Days limit block:", daysLimitBlock);

    if (!platform || !platformInitialized) {
      errorMessage = "Platform not initialized. Please refresh the page.";
      console.error("Platform not ready");
      return;
    }

    if (!tokenId) {
      errorMessage = "Please select a token";
      console.error("No token selected");
      return;
    }

    if (!tokenAmountRaw || tokenAmountRaw <= 0) {
      errorMessage = "Please enter a valid token amount";
      console.error("Invalid token amount");
      return;
    }

    if (!exchangeRateRaw || exchangeRateRaw <= 0) {
      errorMessage = "Please enter a valid exchange rate";
      console.error("Invalid exchange rate");
      return;
    }

    if (!maxValuePrecise || maxValuePrecise <= 0) {
      errorMessage = "Please enter a valid max value";
      console.error("Invalid max value");
      return;
    }

    if (!bountyTitle || bountyTitle.trim() === "") {
      errorMessage = "Please enter a bounty title";
      console.error("No bounty title");
      return;
    }

    if (!daysLimitBlock || daysLimitBlock <= 0) {
      errorMessage = "Please enter a valid days limit";
      console.error("Invalid days limit block");
      return;
    }

    isSubmitting = true;
    errorMessage = null;
    transactionId = null;

    if (minValuePrecise === undefined) {
      minValuePrecise = 0;
    }
    let minValueNano = minValuePrecise * Math.pow(10, 9);
    let minimumTokenSold = minValueNano / exchangeRateRaw;

    let bountyContent = JSON.stringify({
      title: bountyTitle,
      description: bountyDescription,
      image: bountyImage,
      link: bountyLink,
    });

    console.log("Submitting with parameters:", {
      version: platform.last_version,
      tokenId,
      tokenAmountRaw,
      daysLimitBlock,
      exchangeRateRaw: Math.round(exchangeRateRaw),
      bountyContent,
      minimumTokenSold: Math.round(minimumTokenSold),
      bountyTitle,
    });

    try {
      const result = await platform.submit(
        platform.last_version,
        tokenId,
        tokenAmountRaw,
        daysLimitBlock,
        Math.round(exchangeRateRaw),
        bountyContent,
        Math.round(minimumTokenSold),
        bountyTitle
      );

      transactionId = result;
      console.log("Transaction successful:", result);
    } catch (error) {
      console.error("Submit error:", error);
      errorMessage =
        error instanceof Error
          ? error.message
          : "Error occurred while submitting the bounty";
    } finally {
      isSubmitting = false;
    }
  }

  let ergBalance: number = 0;

  async function getErgBalance(): Promise<void> {
    if (!platform || !platformInitialized) {
      console.log("getErgBalance: No platform available or not initialized");
      return;
    }
    try {
      const tokens = await platform.get_balance();
      ergBalance = tokens.get("ERG") || 0;
      const ergBalanceDecimal = ergBalance / Math.pow(10, ERG_DECIMALS);
      console.log("ERG balance:", ergBalanceDecimal);
    } catch (error) {
      console.error("getErgBalance: ERROR:", error);
      errorMessage =
        "Failed to load ERG balance. Please ensure your wallet is connected.";
    }
  }

  async function getTokenName(id: string): Promise<string> {
    const url = explorer_uri + "/api/v1/tokens/" + id;
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        let json_data = await response.json();
        if (json_data["name"] !== null) {
          return json_data["name"];
        }
      }
    } catch (error) {
      console.error("Error fetching token name:", error);
    }
    return id.slice(0, 6) + id.slice(-4);
  }

  async function getTokenDecimals(id: string): Promise<number> {
    const url = explorer_uri + "/api/v1/tokens/" + id;
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        let json_data = await response.json();
        if (json_data["decimals"] !== null) {
          return json_data["decimals"];
        }
      }
    } catch (error) {
      console.error("Error fetching token decimals:", error);
    }
    return 0;
  }

  async function getUserTokens() {
    try {
      let tokens: Map<string, number> = get(user_tokens);
      if (tokens.size === 0 && platformInitialized) {
        tokens = await platform.get_balance();
        user_tokens.set(tokens);
      }
      userTokens = await Promise.all(
        Array.from(tokens.entries())
          .filter(([tokenId, _]) => tokenId !== "ERG")
          .map(async ([tokenId, balance]) => ({
            tokenId: tokenId,
            title: await getTokenName(tokenId),
            balance: balance,
            decimals: await getTokenDecimals(tokenId),
          }))
      );
      console.log("User tokens loaded:", userTokens);
    } catch (error) {
      console.error("Error fetching user tokens:", error);
    }
  }

  function updateExchangeRate(): void {
    if (tokenAmountPrecise > 0 && maxValuePrecise > 0) {
      exchangeRatePrecise = maxValuePrecise / tokenAmountPrecise;
    }
  }

  function updateMaxValue(): void {
    if (tokenAmountPrecise > 0 && exchangeRatePrecise > 0) {
      maxValuePrecise = tokenAmountPrecise * exchangeRatePrecise;
    }
  }

  // Check if form is valid for submission
  $: isFormValid =
    platformInitialized &&
    tokenId &&
    tokenAmountRaw > 0 &&
    exchangeRateRaw > 0 &&
    maxValuePrecise > 0 &&
    bountyTitle.trim() !== "" &&
    daysLimitBlock > 0;

  // Add a click handler that logs everything
  function handleButtonClick() {
    if (isFormValid && !isSubmitting) {
      handleSubmit();
    } else {
      console.log(
        "Button click ignored - form not valid or already submitting"
      );
    }
  }

  onMount(async () => {
    console.log("Component mounted, initializing...");
    await initializePlatform();

    if (platformInitialized && platform) {
      await calculateBlockLimit(daysLimit);
      await getCurrentHeight();
      await getErgBalance();
      await getUserTokens();
    } else {
      console.log(
        "onMount: Platform not ready, skipping blockchain data retrieval"
      );
    }
  });
</script>

<div class="container mx-auto py-4">
  <h2 class="bounty-title">Create New Bounty</h2>

  <!-- Status Panel -->
  <div
    class="status-panel bg-background/80 backdrop-blur-lg rounded-xl p-4 mb-6"
  >
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
      <div class="flex items-center gap-2">
        <div
          class="w-3 h-3 rounded-full {platformInitialized
            ? 'bg-green-500'
            : 'bg-red-500'}"
        ></div>
        <span
          >Platform: {platformInitialized ? "Connected" : "Disconnected"}</span
        >
      </div>
      <div class="flex items-center gap-2">
        <div
          class="w-3 h-3 rounded-full {currentHeight
            ? 'bg-green-500'
            : 'bg-red-500'}"
        ></div>
        <span
          >Blockchain: {currentHeight
            ? `Height ${currentHeight}`
            : "Not Connected"}</span
        >
      </div>
      <div class="flex items-center gap-2">
        <div
          class="w-3 h-3 rounded-full {ergBalance > 0
            ? 'bg-green-500'
            : 'bg-red-500'}"
        ></div>
        <span>Wallet: {ergBalance > 0 ? "Connected" : "Not Connected"}</span>
      </div>
    </div>
    {#if initializationError}
      <div class="mt-2 text-red-400 text-sm">
        Initialization Error: {initializationError}
      </div>
    {/if}
  </div>

  <!-- Main Form Container -->
  <div
    class="form-container bg-background/80 backdrop-blur-lg rounded-xl p-6 mb-6"
  >
    <!-- Form Grid -->
    <div class="form-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Token Selection -->
      <div class="form-group">
        <Label for="tokenId" class="text-sm font-medium mb-2 block">Token</Label
        >

        <select
          bind:value={tokenOption}
          class="w-full p-2 border border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1 rounded-md bg-background text-foreground"
        >
          <option value="" disabled>Select a token</option>
          {#each userTokens as token}
            <option value={token.tokenId}>
              {token.title} (Balance: {token.balance /
                Math.pow(10, token.decimals)})
            </option>
          {/each}
        </select>

        <p class="text-sm mt-2 text-muted-foreground">
          Don't have a token?
          <a
            href="https://tools.mewfinance.com/mint"
            target="_blank"
            rel="noopener noreferrer"
            class="text-orange-400 underline hover:text-orange-300 transition-colors"
          >
            Mint one here
          </a>.
        </p>
      </div>

      <!-- Token Amount -->
      <div class="form-group">
        <Label for="tokenAmount" class="text-sm font-medium mb-2 block"
          >Token amount</Label
        >
        <Input
          type="number"
          id="tokenAmount"
          bind:value={tokenAmountPrecise}
          max={maxTokenAmountRaw}
          step={1 / Math.pow(10, tokenDecimals)}
          min={0}
          placeholder="Max amount token"
          on:input={() => updateExchangeRate()}
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
        />
      </div>

      <!-- Exchange Rate -->
      <div class="form-group">
        <Label for="exchangeRate" class="text-sm font-medium mb-2 block"
          >Exchange Rate (ERGs per token)</Label
        >
        <Input
          type="number"
          id="exchangeRate"
          bind:value={exchangeRatePrecise}
          min={0}
          step="0.000000001"
          placeholder="Exchange rate in ERG"
          on:input={updateMaxValue}
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
        />
      </div>

      <!-- Min ERGs Collected -->
      <div class="form-group">
        <Label for="minValue" class="text-sm font-medium mb-2 block"
          >Min ERGs collected</Label
        >
        <Input
          type="number"
          id="minValue"
          bind:value={minValuePrecise}
          max={maxValuePrecise}
          min={0}
          placeholder="Min ERGs collected"
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
        />
      </div>

      <!-- Max ERGs Collected -->
      <div class="form-group">
        <Label for="maxValue" class="text-sm font-medium mb-2 block"
          >Max ERGs collected</Label
        >
        <Input
          type="number"
          id="maxValue"
          bind:value={maxValuePrecise}
          min={minValuePrecise}
          placeholder="Max ERGs collected"
          on:input={updateExchangeRate}
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
        />
      </div>

      <!-- Days Limit -->
      <div class="form-group">
        <Label for="blockLimit" class="text-sm font-medium mb-2 block"
          >Days limit</Label
        >
        <Input
          id="blockLimit"
          type="number"
          bind:value={daysLimit}
          min="1"
          placeholder="Enter days limit"
          aria-label="Enter the limit in days"
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
          autocomplete="off"
        />
        <!-- Development info (hidden) -->
        <div class="hidden">
          {#if daysLimitBlock}
            <span>On block: {daysLimitBlock}</span>
            <br />
            <span>Date limit: {daysLimitText}</span>
          {/if}
        </div>
      </div>

      <!-- Bounty Title -->
      <div class="form-group">
        <Label for="bountyTitle" class="text-sm font-medium mb-2 block"
          >Bounty Title</Label
        >
        <Input
          type="text"
          id="bountyTitle"
          bind:value={bountyTitle}
          placeholder="Enter bounty title"
          required
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
        />
      </div>

      <!-- Bounty Image URL -->
      <div class="form-group">
        <Label for="bountyImage" class="text-sm font-medium mb-2 block"
          >Bounty Image URL</Label
        >
        <Input
          type="text"
          id="bountyImage"
          bind:value={bountyImage}
          placeholder="Enter image URL"
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
        />
      </div>

      <!-- Bounty Link -->
      <div class="form-group">
        <Label for="bountyLink" class="text-sm font-medium mb-2 block"
          >Bounty Link</Label
        >
        <Input
          type="text"
          id="bountyLink"
          bind:value={bountyLink}
          placeholder="Enter bounty link"
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
        />
      </div>

      <!-- Bounty Description (Full Width) -->
      <div class="form-group lg:col-span-3">
        <Label for="bountyDescription" class="text-sm font-medium mb-2 block"
          >Bounty Description</Label
        >
        <Textarea
          id="bountyDescription"
          bind:value={bountyDescription}
          placeholder="Enter bounty description"
          required
          class="w-full h-28 lg:h-32 border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
        />
      </div>
    </div>

    <!-- Form Actions -->
    <div class="form-actions mt-6 flex justify-center">
      {#if transactionId}
        <div
          class="result bg-background/80 backdrop-blur-lg border border-orange-500/20 rounded-lg p-4 w-full max-w-xl"
        >
          <p class="text-center">
            <strong>Transaction ID:</strong>
            <a
              href={web_explorer_uri_tx + transactionId}
              target="_blank"
              rel="noopener noreferrer"
              class="text-orange-400 hover:text-orange-300 underline transition-colors"
            >
              {transactionId}
            </a>
          </p>
        </div>
      {:else}
        <button
          type="button"
          on:click={handleButtonClick}
          disabled={!isFormValid || isSubmitting}
          class="bg-orange-500 hover:bg-orange-600 text-black border-none py-2 px-6 text-lg font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          {isSubmitting
            ? "Waiting for confirmation of the bounty creation..."
            : "Submit Bounty"}
        </button>
      {/if}
    </div>

    <!-- Error Message -->
    {#if errorMessage}
      <div
        class="error mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center"
      >
        <p class="text-red-500">{errorMessage}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 10px 15px;
    overflow-y: auto;
    scrollbar-color: rgba(255, 255, 255, 0) rgba(0, 0, 0, 0);
  }

  .bounty-title {
    text-align: center;
    font-size: 2.2rem;
    margin: 20px 0 30px;
    color: orange;
    font-family: "Russo One", sans-serif;
    letter-spacing: 0.02em;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    position: relative;
  }

  .bounty-title::after {
    content: "";
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 100px;
    height: 3px;
    background: linear-gradient(
      90deg,
      rgba(255, 165, 0, 0),
      rgba(255, 165, 0, 1),
      rgba(255, 165, 0, 0)
    );
  }

  .form-container {
    animation: fadeIn 0.5s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  @media (max-width: 768px) {
    .bounty-title {
      font-size: 1.8rem;
      margin: 15px 0 25px;
    }
  }
</style>
