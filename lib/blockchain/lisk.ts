import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError } from '@/lib/errors';

export class LiskAdapter implements BlockchainAdapter {
  readonly name = 'Lisk Service';
  readonly supportedChains: BlockchainId[] = ['lisk'];

  async getTransactions(
    _walletAddress: string,
    _startDate: Date,
    _endDate: Date,
    _chain: BlockchainId
  ): Promise<RawTransaction[]> {
    // service.lisk.com foi descomissionado após a migração do Lisk L1 para
    // Ethereum L2 (OP Stack) em maio de 2024. Endereços lsk... não têm
    // equivalente na nova rede. Para rastrear LSK no Ethereum, use o
    // endereço EVM correspondente com a chain ethereum.
    throw new BlockchainApiError(
      'lisk',
      503,
      'Fonte de dados Lisk indisponível: API do L1 desativada após migração para Ethereum L2 (maio 2024). Use a chain ethereum para rastrear LSK na nova rede.',
      false
    );
  }
}
