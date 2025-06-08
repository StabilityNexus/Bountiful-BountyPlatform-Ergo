<script lang="ts">
  import { type Bounty } from "$lib/common/bounty";
  import { address } from "$lib/common/store";
  import { sha256 } from "$lib/common/utils";
  import BountyList from "./BountyList.svelte";

  const filter = async (bounty: Bounty) => bounty.constants.owner == $address
</script>
<BountyList filterBounty={filter}>
  My Projects
</BountyList>