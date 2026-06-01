// resume-pipeline/scripts/build-taxonomy.ts
// Builds ESCO skills taxonomy JSON from downloaded CSV files.
//
// PREREQUISITE: Download ESCO from https://esco.ec.europa.eu/en/use-esco/download
// (free, requires email). Save the zip or extracted CSVs to:
//   resume-pipeline/resources/esco/
//
// Required files:
//   - skills_en.csv          (conceptUri, preferredLabel, altLabels, description)
//   - broaderRelationsSkillPillar.csv  (conceptUri, broaderConceptUri)
//
// Run: npx tsx scripts/build-taxonomy.ts
//
// Output: src/validation/taxonomy/skills-taxonomy.json (~1.5MB without descriptions)

import fs from "node:fs";
import { join } from "node:path";

interface SkillEntry {
  preferredLabel: string;
  altLabels: string[];
  broader: string[];
  narrower: string[];
}

interface TaxonomyData {
  synonyms: Record<string, string>;
  skills: Record<string, SkillEntry>;
}

function readCSV(path: string): string[][] {
  const raw = fs.readFileSync(path, "utf8");
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && next === "\n") i++;
        if (current.length > 0 || field.length > 0) {
          current.push(field);
          rows.push(current);
          current = [];
          field = "";
        }
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    if (current.some((f) => f.length > 0)) rows.push(current);
  }

  return rows;
}

function main() {
  const skillsPath = join("resources", "esco", "skills_en.csv");
  const relationsPath = join(
    "resources",
    "esco",
    "broaderRelationsSkillPillar.csv",
  );
  const relationsPathAlt = join(
    "resources",
    "esco",
    "broaderRelationsSkillPillar_en.csv",
  );

  const relationsExists = fs.existsSync(relationsPath) || fs.existsSync(relationsPathAlt);
  const actualRelationsPath = fs.existsSync(relationsPath) ? relationsPath : relationsPathAlt;

  if (!fs.existsSync(skillsPath)) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ESCO files not found. Please download them manually:        ║
║                                                              ║
║  1. Go to: https://esco.ec.europa.eu/en/use-esco/download    ║
║  2. Select: version = ESCO dataset - v1.2.1                  ║
║  3. Content = Classification, Language = en, File type = CSV ║
║  4. Enter email, download the zip                             ║
║  5. Extract and copy these files to:                          ║
║     resume-pipeline/resources/esco/skills_en.csv              ║
║     resume-pipeline/resources/esco/broaderRelationsSkillPillar.csv ║
║  6. Re-run: npx tsx scripts/build-taxonomy.ts                 ║
╚══════════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  console.log("[taxonomy] Reading skills_en.csv...");
  const skillsRaw = readCSV(skillsPath);
  const header = skillsRaw[0];
  const uriIdx = header.indexOf("conceptUri");
  const labelIdx = header.indexOf("preferredLabel");
  const altIdx = header.indexOf("altLabels");

  const skills: Record<string, SkillEntry> = {};
  const synonyms: Record<string, string> = {};

  for (const row of skillsRaw.slice(1)) {
    const uri = row[uriIdx];
    const label = row[labelIdx];
    const altLabelsRaw = row[altIdx] || "";

    if (!uri || !label) continue;

    // altLabels are \n-delimited (terms may contain commas)
    const altLabels = altLabelsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    skills[uri] = {
      preferredLabel: label,
      altLabels,
      broader: [],
      narrower: [],
    };

    synonyms[label.toLowerCase().trim()] = uri;
    for (const alt of altLabels) {
      synonyms[alt.toLowerCase().trim()] = uri;
    }
  }

  console.log(`[taxonomy] Parsed ${Object.keys(skills).length} skills`);

  // Build hierarchy from broaderRelationsSkillPillar.csv (optional)
  if (relationsExists) {
    console.log("[taxonomy] Reading broaderRelationsSkillPillar.csv...");
    const relationsRaw = readCSV(actualRelationsPath);
    const relHeader = relationsRaw[0];
    const childIdx = relHeader.indexOf("conceptUri");
    const parentIdx = relHeader.indexOf("broaderUri");

    // First pass: collect direct relationships
    const directNarrower: Map<string, string[]> = new Map();
    const directBroader: Map<string, string[]> = new Map();

    for (const row of relationsRaw.slice(1)) {
      const childUri = row[childIdx];
      const parentUri = row[parentIdx];
      if (!childUri || !parentUri) continue;

      if (!directNarrower.has(parentUri)) directNarrower.set(parentUri, []);
      directNarrower.get(parentUri)!.push(childUri);

      if (!directBroader.has(childUri)) directBroader.set(childUri, []);
      directBroader.get(childUri)!.push(parentUri);
    }

    // Compute transitive closure: narrowers include ALL descendants recursively
    function getTransitiveNarrowers(uri: string): string[] {
      const result = new Set<string>();
      const queue = [...(directNarrower.get(uri) ?? [])];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (result.has(current)) continue;
        result.add(current);

        const children = directNarrower.get(current) ?? [];
        queue.push(...children);
      }

      return [...result];
    }

    // Apply transitive closure
    for (const uri of Object.keys(skills)) {
      skills[uri].narrower = getTransitiveNarrowers(uri);
      skills[uri].broader = directBroader.get(uri) ?? [];
    }

    console.log(`[taxonomy] Hierarchy built: ${directNarrower.size} parent nodes`);
  } else {
    console.log("[taxonomy] No relations file found — skipping hierarchy");
  }

  const taxonomyData: TaxonomyData = { synonyms, skills };

  const outputPath = join(
    "src",
    "validation",
    "taxonomy",
    "skills-taxonomy.json",
  );
  fs.writeFileSync(outputPath, JSON.stringify(taxonomyData, null, 2));
  console.log(
    `[taxonomy] Written ${Object.keys(synonyms).length} synonyms, ${Object.keys(skills).length} skills to ${outputPath}`,
  );
}

main();
