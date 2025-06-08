<script lang="ts">
    import BountyList from './BountyList.svelte';
    import { type Bounty } from '$lib/common/bounty';

    async function bountyFilter(bounty: Bounty){
        return true;
    }
</script>
<BountyList filterBounty={bountyFilter}>
    Bounty List
</BountyList>