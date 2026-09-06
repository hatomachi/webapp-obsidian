import { VaultConfig } from '../types';

const VAULTS_STORAGE_KEY = 'webapp_obsidian_vaults';
const ACTIVE_VAULT_KEY = 'webapp_obsidian_active_vault_id';

export class VaultManager {
  static getVaults(): VaultConfig[] {
    try {
      const raw = localStorage.getItem(VAULTS_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to load vaults from localStorage:', e);
    }
    return [];
  }

  static saveVaults(vaults: VaultConfig[]): void {
    try {
      localStorage.setItem(VAULTS_STORAGE_KEY, JSON.stringify(vaults));
    } catch (e) {
      console.error('Failed to save vaults to localStorage:', e);
    }
  }

  static getActiveVaultId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_VAULT_KEY);
    } catch (e) {
      return null;
    }
  }

  static setActiveVaultId(id: string): void {
    try {
      localStorage.setItem(ACTIVE_VAULT_KEY, id);
    } catch (e) {
      console.error('Failed to set active vault ID:', e);
    }
  }

  static getActiveVault(): VaultConfig | null {
    const vaults = this.getVaults();
    if (vaults.length === 0) return null;

    const activeId = this.getActiveVaultId();
    if (activeId) {
      const found = vaults.find((v) => v.id === activeId);
      if (found) return found;
    }

    return vaults[0];
  }

  static addVault(vaultData: Omit<VaultConfig, 'id'>): VaultConfig {
    const vaults = this.getVaults();
    const newVault: VaultConfig = {
      ...vaultData,
      id: 'vault_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    };
    vaults.push(newVault);
    this.saveVaults(vaults);
    if (!this.getActiveVaultId()) {
      this.setActiveVaultId(newVault.id);
    }
    return newVault;
  }

  static updateVault(vault: VaultConfig): void {
    const vaults = this.getVaults();
    const idx = vaults.findIndex((v) => v.id === vault.id);
    if (idx !== -1) {
      vaults[idx] = vault;
      this.saveVaults(vaults);
    }
  }

  static deleteVault(id: string): void {
    let vaults = this.getVaults();
    vaults = vaults.filter((v) => v.id !== id);
    this.saveVaults(vaults);

    if (this.getActiveVaultId() === id) {
      if (vaults.length > 0) {
        this.setActiveVaultId(vaults[0].id);
      } else {
        localStorage.removeItem(ACTIVE_VAULT_KEY);
      }
    }
  }

  static clearVaultCache(owner: string, repo: string): void {
    try {
      localStorage.removeItem(`webapp_obsidian_file_cache_${owner}_${repo}`);
    } catch (e) {
      console.warn('Failed to clear cache:', e);
    }
  }
}
