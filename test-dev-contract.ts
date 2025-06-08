// test-dev-contract.ts
import { get_dev_contract_hash, get_dev_contract_address } from './src/lib/ergo/dev/dev_contract';

async function main() {
  console.log("Dev Contract Hash:", get_dev_contract_hash());
  console.log("Dev Contract Address:", get_dev_contract_address());
}

main().catch(console.error);