export class ScannerService {
  constructor(provider) {
    this.provider = provider;
  }

  async getChainStatus(chainId) {
    return this.provider.getChainStatus(chainId);
  }

  async getBalances(chainId, address) {
    return this.provider.getBalances(chainId, address);
  }

  async getAllowances(chainId, address) {
    return this.provider.getAllowances(chainId, address);
  }

  async getNfts(chainId, address) {
    return this.provider.getNfts(chainId, address);
  }

  async getContract(chainId, contractAddress) {
    return this.provider.getContract(chainId, contractAddress);
  }

  async getTransaction(chainId, hash) {
    return this.provider.getTransaction(chainId, hash);
  }
}
