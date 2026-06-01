// src/validation/taxonomy/taxonomy-service.ts
// Composes ITaxonomyProvider implementations.
// Lazy-initialized singleton — first access loads the JSON, subsequent calls reuse it.
// Follows OCP: swap providers without touching consumers.

import { StaticTaxonomyProvider } from "./static-provider.js";
import type { ITaxonomyProvider } from "./provider.js";

export class TaxonomyService {
  constructor(private readonly provider: ITaxonomyProvider) {}

  normalize(skill: string): string | null {
    return this.provider.normalize(skill);
  }

  getSynonyms(uri: string): string[] {
    return this.provider.getSynonyms(uri);
  }

  getNarrower(uri: string): string[] {
    return this.provider.getNarrower(uri);
  }

  getBroader(uri: string): string[] {
    return this.provider.getBroader(uri);
  }

  isRelated(skillA: string, skillB: string): boolean {
    const uriA = this.normalize(skillA);
    const uriB = this.normalize(skillB);
    if (!uriA || !uriB) return false;
    if (uriA === uriB) return true;

    const narrowers = this.provider.getNarrower(uriA);
    if (narrowers.includes(uriB)) return true;

    const broaders = this.provider.getBroader(uriA);
    if (broaders.includes(uriB)) return true;

    return false;
  }

  private static instance: TaxonomyService | null = null;

  static getInstance(): TaxonomyService {
    if (!this.instance) {
      this.instance = new TaxonomyService(new StaticTaxonomyProvider());
    }
    return this.instance;
  }
}
