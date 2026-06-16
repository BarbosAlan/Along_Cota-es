import type { BlockchainId, RawTransaction, TokenMeta } from '@/types';

export interface BlockchainAdapter {
  readonly name: string;
  readonly supportedChains: BlockchainId[];

  getTransactions(
    walletAddress: string,
    startDate: Date,
    endDate: Date,
    chain: BlockchainId
  ): Promise<RawTransaction[]>;

  getTokenMetadata?(
    tokenAddress: string,
    chain: BlockchainId
  ): Promise<TokenMeta | undefined>;
}
