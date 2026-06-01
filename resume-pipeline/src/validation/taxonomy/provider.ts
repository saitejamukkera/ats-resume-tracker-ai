// src/validation/taxonomy/provider.ts
// ITaxonomyProvider interface — abstraction for skill taxonomy lookups.
// Enables swapping between static JSON and embedding-based providers
// without touching the scoring dimension. Follows DIP (Dependency Inversion).

export interface ITaxonomyProvider {
  normalize(skill: string): string | null;
  getCanonicalLabel(uri: string): string | null;
  getSynonyms(uri: string): string[];
  getBroader(uri: string): string[];
  getNarrower(uri: string): string[];
}

export interface SkillEntry {
  preferredLabel: string;
  altLabels: string[];
  broader: string[];
  narrower: string[];
}

export interface TaxonomyData {
  synonyms: Record<string, string>;
  skills: Record<string, SkillEntry>;
}
