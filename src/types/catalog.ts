export type Os = "windows" | "macos";
export type AppKind = "download" | "script" | "link" | "placeholder";
export type Vendor = "intel" | "amd";

export type ResolverSpec =
  | { type: "static"; url: string }
  | { type: "github_release"; repo: string; asset_pattern: string }
  | {
      type: "html";
      page_url: string;
      selector: string;
      attr: string;
      base_url?: string;
      url_regex?: string;
    }
  | {
      type: "html_regex";
      page_url: string;
      url_regex: string;
    }
  | {
      type: "webview";
      page_url: string;
      selector: string;
      attr: string;
      base_url?: string;
      url_regex?: string;
      wait_ms?: number;
    };

export interface PlatformEntry {
  resolver?: ResolverSpec;
  filename?: string;
  script_id?: string;
  stale: boolean;
}

export interface AppEntry {
  id: string;
  name: string;
  bio?: string;
  /** Longer user-facing copy for the expanded panel; `notes` is internal-only. */
  description?: string;
  icon: string;
  domain?: string;
  /** Full URL for the "Visit" link when `domain` alone is too generic (GitHub apps). */
  website?: string;
  /** CPU-vendor compatibility for the Overclocking filter; absent = works everywhere. */
  vendor?: Vendor;
  /** Optional sub-heading inside a category (Essential Bookmarks groups links by topic). */
  group?: string;
  kind: AppKind;
  notes?: string;
  platforms: Partial<Record<Os, PlatformEntry>>;
}

export interface Category {
  id: string;
  name: string;
  apps: AppEntry[];
}

export interface Catalog {
  version: number;
  categories: Category[];
}
