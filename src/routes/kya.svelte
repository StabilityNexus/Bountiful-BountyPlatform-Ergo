<script lang="ts">
    import { onMount } from "svelte";
    import { createEventDispatcher } from 'svelte';
    import * as Dialog from "$lib/components/ui/dialog";
    import { Button } from "$lib/components/ui/button";
  
    export let title: string = 'Know Your Assumptions';
    export let closeBtnText: string = 'I understand and I agree';
    
    let showModal = false;
    let isButtonEnabled = false;
    let contentDiv: HTMLDivElement;
    
    const dispatch = createEventDispatcher();
  
    onMount(() => {
      showModal = localStorage.getItem('acceptedKYA') !== 'true';
    });
  
    function checkScroll(e: Event) {
      const element = e.target as HTMLDivElement;
      if (Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) < 2) {
        isButtonEnabled = true;
      }
    }
  
    function close() {
      showModal = false;
      setTimeout(() => { showModal = false; }, 10); // Extra safety
      localStorage.setItem('acceptedKYA', 'true');
      console.log('KYA accepted');
      dispatch('close');
    }
  </script>
  
  <span 
    class="text-gray-500 cursor-pointer" 
    on:click={() => (showModal = true)}
    on:keydown={(e) => e.key === 'Enter' && (showModal = true)}
    role="button"
    tabindex="0"
  >
    KYA
  </span>
  
  <Dialog.Root bind:open={showModal}>
    <Dialog.Content class="w-[800px] max-w-[90vw]">
      <Dialog.Header>
        <Dialog.Title>{title}</Dialog.Title>
      </Dialog.Header>
  
      <div 
        bind:this={contentDiv}
        on:scroll={checkScroll}
        class="max-h-[400px] overflow-y-auto pr-4"
      >
        <p>This website is an open-source UI for interacting with bounty contracts on the Ergo blockchain.</p>
        
        <p class="font-bold mt-4">Please note:</p>
        <ul class="list-disc ml-6 space-y-2">
          <li>Bounty rewards are locked in smart contracts and can only be claimed when bounty conditions are met.</li>
          <li>As a bounty creator, you must fund the bounty with the reward amount upfront.</li>
          <li>As a bounty hunter, you must meet all requirements specified in the bounty to claim the reward.</li>
          <li>Disputes should be resolved between bounty creators and hunters directly.</li>
        </ul>
  
        <p class="font-bold mt-4">Additionally:</p>
        <ul class="list-disc ml-6 space-y-2">
          <li>This website doesn't store, collect, or share your personal data.</li>
          <li>All transactions are public and visible on the Ergo blockchain.</li>
          <li>Transactions are irreversible once confirmed.</li>
        </ul>
  
        <p class="mt-4">There is no guarantee against bugs or errors in the smart contracts or this interface.</p>
  
        <p class="font-bold mt-4">By using this website, you agree that:</p>
        <ul class="list-disc ml-6 space-y-2">
          <li>You use it at your own risk.</li>
          <li>You are solely responsible for your funds and transactions.</li>
          <li>You must securely store your passwords, recovery phrases, and private keys.</li>
        </ul>
  
        <p class="italic mt-4">Do you understand and agree to these terms?</p>
      </div>
  
      <Dialog.Footer class="mt-4">
        <!-- Add native button as test -->
        <button 
          on:click|stopPropagation={close}
          class="px-4 py-2 bg-primary text-black rounded disabled:opacity-50"
          disabled={!isButtonEnabled}
        >
          {@html closeBtnText}
        </button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
  
  <style>
    [role="button"] {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      background: rgba(255, 165, 0, 0.1);
    }
  </style>