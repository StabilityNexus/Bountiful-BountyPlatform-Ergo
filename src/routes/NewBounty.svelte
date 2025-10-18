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
  import { block_to_date, time_to_block } from "$lib/common/countdown";
  import { explorer_uri, web_explorer_uri_tx } from "$lib/ergo/envs";
  import { ErgoPlatform } from "$lib/ergo/platform";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { get } from "svelte/store";
  import { user_tokens, judges } from "$lib/common/store";
  import { onMount } from "svelte";
  import { fetchAllJudges } from "$lib/ergo/reputation/fetch";
  import { goto } from "$app/navigation";
  import { truncateAddress } from "$lib/common/utils";

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

  // New judge address field
  let judgeAddresses: string[] = [];
  let newJudgeAddress: string = "";
  let selectedJudgeId: string | null = null;
  let selectedDropdownAddress: string = "";

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

  // Function to add judge
  function addJudge(): void {
    if (newJudgeAddress && isValidErgoAddress(newJudgeAddress)) {
      if (!judgeAddresses.includes(newJudgeAddress)) {
        judgeAddresses = [...judgeAddresses, newJudgeAddress];
        newJudgeAddress = "";
      }
    }
  }

  // Function to remove judge
  function removeJudge(index: number): void {
    judgeAddresses = judgeAddresses.filter((_, i) => i !== index);
  }

  // Address validation function
  function isValidErgoAddress(address: string): boolean {
    if (!address) return false;
    // Basic Ergo address validation - starts with 9 and has proper length
    const mainnetRegex = /^9[1-9A-HJ-NP-Za-km-z]{50,}$/;
    const testnetRegex = /^3[1-9A-HJ-NP-Za-km-z]{50,}$/;
    return mainnetRegex.test(address) || testnetRegex.test(address);
  }

  // Get current user's address for default judge
  let currentUserAddress: string = "";

  async function getCurrentUserAddress(): Promise<void> {
    if (!platform || !platformInitialized) {
      console.log(
        "getCurrentUserAddress: No platform available or not initialized",
      );
      return;
    }
    try {
      currentUserAddress = await platform.get_address();
      // Set current user as default judge if no judges are specified
      if (judgeAddresses.length === 0) {
        judgeAddresses = [currentUserAddress];
      }
      console.log("Current user address:", currentUserAddress);
    } catch (error) {
      console.error("getCurrentUserAddress: ERROR:", error);
    }
  }

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
        "calculateBlockLimit: No platform available or not initialized",
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

    if (judgeAddresses.length === 0) {
      errorMessage = "Please add at least one judge address";
      console.error("No judge addresses");
      return;
    }

    // Validate all judge addresses
    for (const address of judgeAddresses) {
      if (!isValidErgoAddress(address)) {
        errorMessage = `Invalid judge address: ${address}`;
        console.error("Invalid judge address:", address);
        return;
      }
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
      judgeAddresses,
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
        bountyTitle,
        judgeAddresses,
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
          })),
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
    daysLimitBlock > 0 &&
    judgeAddresses.length > 0;

  // Add a click handler that logs everything
  function handleButtonClick() {
    if (isFormValid && !isSubmitting) {
      handleSubmit();
    } else {
      console.log(
        "Button click ignored - form not valid or already submitting",
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
      await getCurrentUserAddress(); // Get current user address and set as default judge
      try {
        if (!ergo) {
          return;
        }
        await fetchAllJudges(ergo, true); // Force fetch on mount
      } catch (e: any) {
        console.error("Failed to fetch judges:", e);
        errorMessage = "Could not load the list of judges. Please try again later.";
      }
    } else {
      console.log(
        "onMount: Platform not ready, skipping blockchain data retrieval",
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

      <!-- Judge Addresses Section -->
      <div class="form-group">
        <Label class="text-sm font-medium mb-2 block">
          Judge Addresses
          <span class="text-orange-400">*</span>
        </Label>

        <!-- Judge selection dropdown -->
        <div class="flex gap-2 mb-2">
          <select
            class="w-full p-2 border border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1 rounded-md bg-background text-foreground"
            bind:value={selectedDropdownAddress}
            on:change={(e) => {
              const selectedIndex = e.currentTarget.selectedIndex;
              if (selectedIndex > 0) {
                  const selectedOption = e.currentTarget.options[selectedIndex];
                  selectedJudgeId = selectedOption.dataset.id ?? null;
              } else {
                  selectedJudgeId = null;
                  selectedDropdownAddress = "";
              }
            }}
          >
            <option value="" disabled>Select a judge from the list</option>
            {#each Array.from($judges.data.values()) as proof (proof.token_id)}
              {@const address = (proof.current_boxes[0]?.box as any)?.address}
              {#if address}
                <option value={address} data-id={proof.token_id}>
                  {truncateAddress(address)}
                </option>
              {/if}
            {/each}
          </select>
          <Button
            type="button"
            on:click={() => {
                if(selectedDropdownAddress) {
                    newJudgeAddress = selectedDropdownAddress;
                }
            }}
            disabled={!selectedDropdownAddress}
            class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-black rounded-md"
          >
            Use
          </Button>
          <Button
            type="button"
            on:click={() => {
                if(selectedJudgeId) {
                    goto(`/judges/${selectedJudgeId}`);
                }
            }}
            disabled={!selectedJudgeId}
            class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-black rounded-md"
          >
            View
          </Button>
        </div>

        <!-- Add new judge input -->
        <div class="flex gap-2 mb-2">
          <Input
            type="text"
            bind:value={newJudgeAddress}
            placeholder="Or enter judge's Ergo address manually"
            class="flex-1 border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
          />
          <Button
            type="button"
            on:click={addJudge}
            disabled={!newJudgeAddress || !isValidErgoAddress(newJudgeAddress)}
            class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-black rounded-md"
          >
            Add
          </Button>
        </div>

        <!-- Current user as judge button -->
        {#if currentUserAddress}
          <button
            type="button"
            on:click={() => {
              newJudgeAddress = currentUserAddress;
              addJudge();
            }}
            class="text-xs text-orange-400 hover:text-orange-300 underline transition-colors mb-2"
          >
            Add myself as judge
          </button>
        {/if}

        <!-- List of added judges -->
        {#if judgeAddresses.length > 0}
          <div class="space-y-2">
            <p class="text-sm text-muted-foreground">Added judges:</p>
            {#each judgeAddresses as judge, index}
              <div
                class="flex items-center justify-between bg-background/50 p-2 rounded-md"
              >
                <span class="text-sm font-mono"
                  >{judge.slice(0, 10)}...{judge.slice(-6)}</span
                >
                <button
                  type="button"
                  on:click={() => removeJudge(index)}
                  class="text-red-400 hover:text-red-300 text-sm"
                >
                  Remove
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Validation message -->
        {#if newJudgeAddress && !isValidErgoAddress(newJudgeAddress)}
          <p class="text-red-400 text-xs mt-1">
            Please enter a valid Ergo address
          </p>
        {/if}
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
