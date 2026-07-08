export type Os = "windows" | "macos";
export type AppKind = "download" | "script";

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
  icon: string;
  domain?: string;
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
