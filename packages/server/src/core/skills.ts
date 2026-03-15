import { listBundledSkills } from '@ank1015/llm-agents';

export {
  addSkill,
  deleteSkill,
  listInstalledSkills,
  type AddSkillResult,
  type BundledSkillEntry,
  type DeleteSkillResult,
  type InstalledSkillEntry,
} from '@ank1015/llm-agents';

export async function listBundledAgentSkills(): Promise<
  Awaited<ReturnType<typeof listBundledSkills>>
> {
  return listBundledSkills();
}
