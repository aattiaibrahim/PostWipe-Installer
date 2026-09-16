import { invoke } from "@tauri-apps/api/core";
import type { Os } from "../types/catalog";
import type { Backdrop } from "./tauriCommands";

/** Bindings for `src-tauri/src/commands/account.rs`. All network traffic to the accounts
 *  Worker happens in Rust; see `src-tauri/src/accounts/mod.rs` for why. */

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  twoFactorEnabled: boolean;
}

export interface AppSet {
  id: string;
  name: string;
  apps: Record<Os, string[]>;
}

export interface SyncedSettings {
  theme?: string;
  backdrop?: Backdrop;
  soundEnabled?: boolean;
  autoCheckUpdates?: boolean;
}

export interface Profile {
  favorites: string[];
  sets: AppSet[];
  settings: SyncedSettings;
  /** Unix ms of the last save the server accepted; 0 for a new account. */
  updatedAt: number;
}

export type SaveOutcome = { outcome: "saved"; profile: Profile } | { outcome: "conflict"; profile: Profile };

export interface TwoFactorSetup {
  totpURI: string;
  backupCodes: string[];
}

export const accountStatus = () => invoke<AccountUser | null>("account_status");
export const signUp = (email: string, password: string, name: string) =>
  invoke<AccountUser>("account_sign_up", { email, password, name });
export const signIn = (email: string, password: string) =>
  invoke<{ needsTwoFactor: boolean; user: AccountUser | null }>("account_sign_in", { email, password });
export const verifyCode = (code: string, backup: boolean) =>
  invoke<AccountUser | null>("account_verify_code", { code, backup });
export const enableTwoFactor = (password: string) => invoke<TwoFactorSetup>("account_enable_two_factor", { password });
export const disableTwoFactor = (password: string) => invoke<void>("account_disable_two_factor", { password });
export const signOut = () => invoke<void>("account_sign_out");
export const deleteAccount = (password: string) => invoke<void>("account_delete", { password });
export const getProfile = () => invoke<Profile>("profile_get");
export const saveProfile = (profile: Profile) => invoke<SaveOutcome>("profile_save", { profile });

/** Tauri rejects with the Rust error string; normalise anything else into one. */
export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}
