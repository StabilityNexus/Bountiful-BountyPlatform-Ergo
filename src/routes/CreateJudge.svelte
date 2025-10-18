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
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { generate_reputation_proof } from '$lib/ergo/reputation/submit';
    import { SAFE_MIN_BOX_VALUE } from '@fleet-sdk/core';
    import { platform } from '$lib/common/store';
    import { get } from 'svelte/store';

    let twitter = '';
    let github = '';
    let linkedin = '';
    let isLoading = false;
    let errorMessage = '';
    let successMessage = '';

    async function handleRegister() {
        if (!twitter || !github || !linkedin) {
            errorMessage = 'All social media links are mandatory.';
            return;
        }
        errorMessage = '';
        successMessage = '';
        isLoading = true;

        try {
            const socialLinks = {
                twitter,
                github,
                linkedin,
            };

            // const ergo = get(platform)?.ergo;
            if (!ergo) {
                throw new Error("Wallet not connected or platform not initialized.");
            }

            const txId = await generate_reputation_proof(ergo, SAFE_MIN_BOX_VALUE, socialLinks);

            if (txId) {
                successMessage = `Registration successful! Your Judge profile has been created on-chain. Transaction ID: ${txId}`;
            } else {
                errorMessage = 'Transaction failed to submit. Please try again.';
            }

        } catch (error: any) {
            console.error(error);
            errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during registration.';
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="container mx-auto p-4 md:p-8 max-w-2xl">
    <div class="text-center mb-8">
        <h2 class="text-3xl font-bold">Become a Judge</h2>
        <p class="text-muted-foreground mt-2">
            Create your on-chain reputation proof by providing your social media links.
        </p>
    </div>

    <div class="grid gap-4">
        <div class="grid gap-2">
            <Label for="twitter">Twitter Profile URL</Label>
            <Input id="twitter" bind:value={twitter} placeholder="https://twitter.com/your_handle" required />
        </div>
        <div class="grid gap-2">
            <Label for="github">GitHub Profile URL</Label>
            <Input id="github" bind:value={github} placeholder="https://github.com/your_username" required />
        </div>
        <div class="grid gap-2">
            <Label for="linkedin">LinkedIn Profile URL</Label>
            <Input id="linkedin" bind:value={linkedin} placeholder="https://linkedin.com/in/your_profile" required />
        </div>
    </div>

    <div class="mt-8 text-center">
        <Button on:click={handleRegister} disabled={isLoading} size="lg">
            {#if isLoading}
                <span><svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Submitting...</span>
            {:else}
                Register as Judge
            {/if}
        </Button>
    </div>

    {#if errorMessage}
        <div class="mt-6 text-center text-red-500 bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
            <p class="font-bold">Error</p>
            <p>{errorMessage}</p>
        </div>
    {/if}

    {#if successMessage}
        <div class="mt-6 text-center text-green-500 bg-green-50 dark:bg-green-900/20 p-4 rounded-md">
            <p class="font-bold">Success!</p>
            <p>{successMessage}</p>
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