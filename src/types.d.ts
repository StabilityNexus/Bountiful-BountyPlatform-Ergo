// types.d.ts
import type { PUBLIC_DEV_CONTRACT_HASH, PUBLIC_DEV_CONTRACT_ADDRESS } from '$env/static/public';

declare global {
  interface Window {
    ergo?: {
      get_change_address(): Promise<string>;
      get_utxos(): Promise<any[]>;
      get_current_height(): Promise<number>;
      sign_tx(tx: any): Promise<any>;
      submit_tx(tx: any): Promise<string>;
    };
    ergoConnector?: {
      nautilus?: {
        connect(): Promise<boolean>;
        isConnected(): Promise<boolean>;
      };
    };
  }

  // Your existing types
  type contract_version = "v1_0" | "v1_1";

  // SvelteKit env vars (automatically populated from .env)
  const PUBLIC_DEV_CONTRACT_HASH: string;
  const PUBLIC_DEV_CONTRACT_ADDRESS: string;
}