'use client';

import {
  Bot,
  CircleAlert,
  FileSpreadsheet,
  Globe2,
  Loader2,
  Plus,
  Presentation,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { BundledSkillEntry, InstalledArtifactSkill } from '@/lib/client-api';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  installArtifactSkill,
  listBundledSkills,
  listInstalledArtifactSkills,
} from '@/lib/client-api';

const SKILL_TOOLTIP_CLASS_NAME =
  'border-border bg-popover text-popover-foreground shadow-xs border [&_svg]:fill-popover [&_svg]:bg-popover';

function sortSkillsByName<T extends { name: string }>(skills: T[]): T[] {
  return [...skills].sort((left, right) => left.name.localeCompare(right.name));
}

function getSkillIcon(skillName: string): typeof Globe2 {
  switch (skillName) {
    case 'browser-use':
      return Globe2;
    case 'llm-use':
      return Bot;
    case 'pptx':
      return Presentation;
    case 'xlsx':
      return FileSpreadsheet;
    default:
      return Sparkles;
  }
}

export function ArtifactSkillsPanel({
  projectId,
  artifactId,
}: {
  projectId: string;
  artifactId: string;
}) {
  const [installedSkills, setInstalledSkills] = useState<InstalledArtifactSkill[]>([]);
  const [isInstalledSkillsLoading, setIsInstalledSkillsLoading] = useState(true);
  const [installedSkillsError, setInstalledSkillsError] = useState<string | null>(null);
  const [installedSkillsRequestKey, setInstalledSkillsRequestKey] = useState(0);

  const [bundledSkills, setBundledSkills] = useState<BundledSkillEntry[] | null>(null);
  const [isBundledSkillsLoading, setIsBundledSkillsLoading] = useState(false);
  const [bundledSkillsError, setBundledSkillsError] = useState<string | null>(null);

  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const [installingSkillName, setInstallingSkillName] = useState<string | null>(null);
  const [skillSearch, setSkillSearch] = useState('');
  const bundledSkillsRequestIdRef = useRef(0);

  useEffect(() => {
    bundledSkillsRequestIdRef.current += 1;
    setInstalledSkills([]);
    setInstalledSkillsError(null);
    setIsInstalledSkillsLoading(true);
    setBundledSkills(null);
    setIsBundledSkillsLoading(false);
    setBundledSkillsError(null);
    setIsInstallDialogOpen(false);
    setInstallingSkillName(null);
    setSkillSearch('');
  }, [artifactId, projectId]);

  useEffect(() => {
    let isCancelled = false;

    setIsInstalledSkillsLoading(true);
    setInstalledSkillsError(null);

    void listInstalledArtifactSkills({ projectId, artifactId })
      .then((skills) => {
        if (isCancelled) {
          return;
        }

        setInstalledSkills(sortSkillsByName(skills));
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        setInstalledSkillsError(
          error instanceof Error ? error.message : 'Failed to load installed skills.'
        );
      })
      .finally(() => {
        if (isCancelled) {
          return;
        }

        setIsInstalledSkillsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [artifactId, projectId, installedSkillsRequestKey]);

  const loadBundledSkills = async (): Promise<void> => {
    if (bundledSkills !== null || isBundledSkillsLoading) {
      return;
    }

    const requestId = bundledSkillsRequestIdRef.current + 1;
    bundledSkillsRequestIdRef.current = requestId;

    setIsBundledSkillsLoading(true);
    setBundledSkillsError(null);

    try {
      const skills = await listBundledSkills();
      if (bundledSkillsRequestIdRef.current !== requestId) {
        return;
      }

      setBundledSkills(sortSkillsByName(skills));
    } catch (error) {
      if (bundledSkillsRequestIdRef.current !== requestId) {
        return;
      }

      setBundledSkillsError(
        error instanceof Error ? error.message : 'Failed to load available skills.'
      );
    } finally {
      if (bundledSkillsRequestIdRef.current === requestId) {
        setIsBundledSkillsLoading(false);
      }
    }
  };

  const installedSkillNames = new Set(installedSkills.map((skill) => skill.name));
  const installableSkills =
    bundledSkills?.filter((skill) => !installedSkillNames.has(skill.name)) ?? [];
  const isInstallBusy = installingSkillName !== null;

  const handleInstallDialogChange = (open: boolean) => {
    setIsInstallDialogOpen(open);
    if (open) {
      void loadBundledSkills();
    }
    if (!open) {
      setSkillSearch('');
    }
  };

  const handleInstallSkill = async (skillName: string) => {
    if (isInstallBusy) {
      return;
    }

    setInstallingSkillName(skillName);
    try {
      const installedSkill = await installArtifactSkill({ projectId, artifactId }, { skillName });

      setInstalledSkills((current) => {
        const next = current.filter((skill) => skill.name !== installedSkill.name);
        next.push(installedSkill);
        return sortSkillsByName(next);
      });
      setInstalledSkillsError(null);
      setIsInstallDialogOpen(false);
      setSkillSearch('');
      toast.success(`Installed ${installedSkill.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to install skill.';
      toast.error(message, {
        id: 'artifact-skill-install-error',
      });
    } finally {
      setInstallingSkillName(null);
    }
  };

  let commandEmptyMessage = 'No skills available.';
  if (isBundledSkillsLoading) {
    commandEmptyMessage = 'Loading available skills...';
  } else if (bundledSkillsError) {
    commandEmptyMessage = bundledSkillsError;
  } else if (bundledSkills !== null && installableSkills.length === 0) {
    commandEmptyMessage = 'All available skills are installed.';
  } else if (skillSearch.trim().length > 0) {
    commandEmptyMessage = `No skills match "${skillSearch.trim()}".`;
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {isInstalledSkillsLoading ? (
          <div className="text-muted-foreground flex size-5 items-center justify-center">
            <Loader2 className="size-3.5 animate-spin" />
          </div>
        ) : installedSkillsError ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setInstalledSkillsRequestKey((current) => current + 1)}
                className="flex size-5 cursor-pointer items-center justify-center text-red-500"
                aria-label="Retry loading installed skills"
              >
                <CircleAlert className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8} className={SKILL_TOOLTIP_CLASS_NAME}>
              {installedSkillsError}
            </TooltipContent>
          </Tooltip>
        ) : (
          installedSkills.map((skill) => {
            const SkillIcon = getSkillIcon(skill.name);

            return (
              <Tooltip key={skill.name}>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex size-5 items-center justify-center">
                    <SkillIcon className="size-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className={SKILL_TOOLTIP_CLASS_NAME}>
                  {skill.name}
                </TooltipContent>
              </Tooltip>
            );
          })
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handleInstallDialogChange(true)}
              disabled={isInstallBusy}
              className="text-muted-foreground hover:text-foreground disabled:text-muted-foreground/60 flex size-5 cursor-pointer items-center justify-center transition-colors disabled:cursor-default"
              aria-label="Add skill"
            >
              {isInstallBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent sideOffset={8} className={SKILL_TOOLTIP_CLASS_NAME}>
            Add skill
          </TooltipContent>
        </Tooltip>
      </div>

      <CommandDialog
        open={isInstallDialogOpen}
        onOpenChange={handleInstallDialogChange}
        title="Add skill"
        description="Search and add a skill for this artifact."
        className="bg-home-page border-home-border sm:max-w-xl"
      >
        <CommandInput
          value={skillSearch}
          onValueChange={setSkillSearch}
          placeholder="Search available skills..."
        />
        <CommandList>
          <CommandEmpty>{commandEmptyMessage}</CommandEmpty>
          {installableSkills.length > 0 ? (
            <CommandGroup heading="Available skills">
              {installableSkills.map((skill) => {
                const SkillIcon = getSkillIcon(skill.name);

                return (
                  <CommandItem
                    key={skill.name}
                    value={`${skill.name} ${skill.description}`}
                    disabled={isInstallBusy}
                    onSelect={() => void handleInstallSkill(skill.name)}
                  >
                    {installingSkillName === skill.name ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 truncate font-medium">
                        <SkillIcon className="size-4 text-muted-foreground" />
                        {skill.name}
                      </span>
                      <span className="text-muted-foreground line-clamp-2 text-xs">
                        {skill.description}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
