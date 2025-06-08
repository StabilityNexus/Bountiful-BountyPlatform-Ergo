<script lang="ts">
  import { ErgoPlatform } from "$lib/ergo/platform";
  import { type Bounty } from "$lib/common/bounty";
  import BountyList from "./BountyList.svelte";
  import { get } from "svelte/store";
  import { user_tokens } from "$lib/common/store";

  let platform = new ErgoPlatform();

  const filter = async (project: Bounty) => {
  try {
      let tokens: Map<string, number> = get(user_tokens);
      if (tokens.size === 0) {
          tokens = await platform.get_balance();
          user_tokens.set(tokens);
      }
      return (tokens.has(bounty.token_id) && (tokens.get(bounty.token_id) ?? 0) > 0) 
      || (tokens.has(BountyList.bounty_id) && (tokens.get(BountyList.bounty_id) ?? 0) > 0);
  } catch (error) {
      console.error("Error checking project token:", error);
      return false;
  }
};
</script>
<BountyList filterBounty={filter}>
  My Contributions
</BountyList>