import { listBundledSkills } from '@ank1015/llm-agents';

export {
  addSkill,
  listInstalledSkills,
  type AddSkillResult,
  type BundledSkillEntry,
  type InstalledSkillEntry,
} from '@ank1015/llm-agents';

export async function listBundledAgentSkills() {
  return listBundledSkills();
}
