import { SorobanRpc } from 'stellar-sdk';
import { config } from '../config.js';
import { info, error, debug } from '../utils/logger.js';

export interface StellarRpcClientInterface {
  getLatestLedger(): Promise<SorobanRpc.Api.GetLatestLedgerResponse>;
  getHealth(): Promise<SorobanRpc.Api.GetHealthResponse>;
  // Add other methods as needed
}

/**
 * Stellar RPC Client wrapper with base implementation
 */
export class StellarRpcClient implements StellarRpcClientInterface {
  protected client: SorobanRpc.Server;

  constructor(rpcUrl: string = config.stellar.rpcUrl) {
    this.client = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
    info('Stellar RPC Client initialized', { rpcUrl });
  }

  /**
   * Get the latest ledger from the network
   */
  async getLatestLedger(): Promise<SorobanRpc.Api.GetLatestLedgerResponse> {
    debug('Fetching latest ledger');
    try {
      return await this.client.getLatestLedger();
    } catch (err) {
      error('Failed to fetch latest ledger', { error: err });
      throw err;
    }
  }

  /**
   * Check the health of the RPC server
   */
  async getHealth(): Promise<SorobanRpc.Api.GetHealthResponse> {
    debug('Checking RPC health');
    try {
      return await this.client.getHealth();
    } catch (err) {
      error('Failed to check RPC health', { error: err });
      throw err;
    }
  }
}
