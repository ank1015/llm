import { Type, type Static } from '@sinclair/typebox';

export const SkillHelperProjectSchema = Type.Object(
  {
    runtime: Type.Literal('typescript'),
    package: Type.Literal('@ank1015/llm-agents'),
  },
  { additionalProperties: false }
);
export type SkillHelperProject = Static<typeof SkillHelperProjectSchema>;

export const BundledSkillDtoSchema = Type.Object(
  {
    name: Type.String(),
    description: Type.String(),
    helperProject: Type.Optional(SkillHelperProjectSchema),
  },
  { additionalProperties: false }
);
export type BundledSkillDto = Static<typeof BundledSkillDtoSchema>;

export const InstalledSkillDtoSchema = Type.Object(
  {
    name: Type.String(),
    description: Type.String(),
    helperProject: Type.Optional(SkillHelperProjectSchema),
  },
  { additionalProperties: false }
);
export type InstalledSkillDto = Static<typeof InstalledSkillDtoSchema>;

export const InstallArtifactSkillRequestSchema = Type.Object(
  {
    skillName: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type InstallArtifactSkillRequest = Static<typeof InstallArtifactSkillRequestSchema>;

export const DeleteArtifactSkillResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
    skillName: Type.String(),
    deleted: Type.Literal(true),
  },
  { additionalProperties: false }
);
export type DeleteArtifactSkillResponse = Static<typeof DeleteArtifactSkillResponseSchema>;
