import { readFile } from "node:fs/promises";
import path from "node:path";

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  triggers: string[];
}

export interface Skill {
  manifest: SkillManifest;
  systemPrompt: string;
}

export async function loadSkill(skillDir: string): Promise<Skill> {
  const manifestPath = path.join(skillDir, "skill.json");
  const skillMdPath = path.join(skillDir, "SKILL.md");

  const [manifestRaw, systemPrompt] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(skillMdPath, "utf8"),
  ]);

  const manifest = JSON.parse(manifestRaw) as SkillManifest;

  return { manifest, systemPrompt };
}
