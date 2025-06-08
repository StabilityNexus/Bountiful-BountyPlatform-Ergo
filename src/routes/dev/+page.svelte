<script lang="ts">
    import { download_dev, execute_dev } from "$lib/ergo/dev/dev_contract";
    import { mint_token } from "$lib/ergo/dev/mint_token";
    import { submit_test } from "$lib/ergo/dev/submit";
    import Button from "$lib/components/ui/button/button.svelte";
    import type { Box, Amount } from "@fleet-sdk/core"; // Import the Box and Amount types if available

    let message = "Developer tools (mainnet only)";
    let items: Box<Amount>[] = []; // Explicitly typed as array of Boxes
    let error: string | undefined = undefined; // Explicitly typed as string or undefined

    async function fetchDownloadDev() {
      try {
        items = await download_dev();
        error = undefined; // Clear error on success
      } catch (e) {
        error = e instanceof Error ? e.message : "Unknown error occurred";
      }
    }

    fetchDownloadDev();
</script>
  
  <div class="container">
    <h1>{message}</h1>
  
    <div class="content-wrapper">
      {#if error}
        <p class="error-message">Error loading data: {error}</p>
      {:else if items.length === 0}
        <p class="loading">Loading data...</p>
      {:else}
        <ul>
          {#each items as box}
            <li>
              <div><span class="box-id">Box ID:</span> {box.boxId}</div>
              <div><span class="value">Value:</span> {Number(box.value) / Math.pow(10, 9)} ERG</div>
              <Button on:click={() => execute_dev({ ...box, value: Number(box.value) })}>Execute</Button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  
    <div class="actions-container">
      <Button on:click={() => submit_test()}>Add test data</Button>
      <Button on:click={() => fetchDownloadDev()}>Refresh</Button>
      <Button on:click={() => mint_token(1000, "TEST", 2)}>Mint test token</Button>
    </div>
  </div>
  
  <style>
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: white;
      background-color: #111;
    }
  
    h1 {
      text-align: center;
      margin-bottom: 20px;
    }
  
    .content-wrapper {
      max-height: 60vh;
      overflow-y: auto;
      margin-bottom: 20px;
    }
  
    ul {
      list-style: none;
      padding: 0;
    }
  
    li {
      background: #222;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 10px;
    }
  
    .box-id, .value {
      font-weight: bold;
    }
  
    .error-message {
      color: #ff4d4d;
      text-align: center;
    }
  
    .loading {
      text-align: center;
      color: #bbb;
    }
  
    .actions-container {
      display: flex;
      gap: 10px;
      justify-content: center;
      padding: 20px 0;
      border-top: 1px solid #444;
    }
  </style>