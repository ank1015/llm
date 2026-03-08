'use client';

import { Loader2, Plus, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { BundledSkillEntry, InstalledArtifactSkill } from '@/lib/client-api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  installArtifactSkill,
  listBundledSkills,
  listInstalledArtifactSkills,
} from '@/lib/client-api';

function sortSkillsByName<T extends { name: string }>(skills: T[]): T[] {
  return [...skills].sort((left, right) => left.name.localeCompare(right.name));
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
      <section className="bg-home-panel border-home-border mb-10 rounded-2xl border px-4 py-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
              <Sparkles className="size-3.5" />
              Installed skills
            </h2>
            <p className="text-muted-foreground text-sm">
              Installed skills are available to all threads in this artifact.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleInstallDialogChange(true)}
            disabled={isInstalledSkillsLoading || isInstallBusy}
            className="bg-home-page border-home-border shrink-0 cursor-pointer"
          >
            {isInstallBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Install skill
          </Button>
        </div>

        {isInstalledSkillsLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading installed skills...
          </div>
        ) : installedSkillsError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-red-500">{installedSkillsError}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => setInstalledSkillsRequestKey((current) => current + 1)}
            >
              Retry
            </Button>
          </div>
        ) : installedSkills.length === 0 ? (
          <p className="text-muted-foreground text-sm">No skills installed yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {installedSkills.map((skill) => (
              <Badge
                key={skill.name}
                variant="outline"
                className="border-home-border bg-home-page rounded-full px-2.5 py-1 text-[11px]"
              >
                {skill.name}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <CommandDialog
        open={isInstallDialogOpen}
        onOpenChange={handleInstallDialogChange}
        title="Install skill"
        description="Search and install a skill for this artifact."
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
              {installableSkills.map((skill) => (
                <CommandItem
                  key={skill.name}
                  value={`${skill.name} ${skill.description}`}
                  disabled={isInstallBusy}
                  onSelect={() => void handleInstallSkill(skill.name)}
                >
                  {installingSkillName === skill.name ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{skill.name}</span>
                    <span className="text-muted-foreground line-clamp-2 text-xs">
                      {skill.description}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
