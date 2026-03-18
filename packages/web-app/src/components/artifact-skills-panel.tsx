'use client';

import {
  ChevronRight,
  FileText,
  CircleAlert,
  Globe2,
  Loader2,
  Plus,
  Search,
  Settings2,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { BundledSkillDto, InstalledSkillDto } from '@/lib/client-api';

import { SkillIcon } from '@/components/skill-icon';
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

type CommandMenuView = 'root' | 'skills';

const MOCK_COMMAND_ITEMS = [
  { label: 'Search files', value: 'search-files', icon: Search },
  { label: 'Prompt library', value: 'prompt-library', icon: FileText },
  { label: 'Quick actions', value: 'quick-actions', icon: WandSparkles },
  { label: 'Artifact settings', value: 'artifact-settings', icon: Settings2 },
  { label: 'Web tools', value: 'web-tools', icon: Globe2 },
  { label: 'Automation', value: 'automation', icon: Sparkles },
] as const;

function sortSkillsByName<T extends { name: string }>(skills: T[]): T[] {
  return [...skills].sort((left, right) => left.name.localeCompare(right.name));
}

export function ArtifactSkillsPanel({
  projectId,
  artifactId,
  enableCommandMenu = false,
}: {
  projectId: string;
  artifactId: string;
  enableCommandMenu?: boolean;
}) {
  const [installedSkills, setInstalledSkills] = useState<InstalledSkillDto[]>([]);
  const [isInstalledSkillsLoading, setIsInstalledSkillsLoading] = useState(true);
  const [installedSkillsError, setInstalledSkillsError] = useState<string | null>(null);
  const [installedSkillsRequestKey, setInstalledSkillsRequestKey] = useState(0);

  const [bundledSkills, setBundledSkills] = useState<BundledSkillDto[] | null>(null);
  const [isBundledSkillsLoading, setIsBundledSkillsLoading] = useState(false);
  const [bundledSkillsError, setBundledSkillsError] = useState<string | null>(null);

  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [commandMenuView, setCommandMenuView] = useState<CommandMenuView>('root');
  const [commandSearch, setCommandSearch] = useState('');
  const [commandSelection, setCommandSelection] = useState('');
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const [installingSkillName, setInstallingSkillName] = useState<string | null>(null);
  const [skillSearch, setSkillSearch] = useState('');
  const [skillSelection, setSkillSelection] = useState('');
  const bundledSkillsRequestIdRef = useRef(0);

  const resetCommandMenuState = useCallback(() => {
    setCommandMenuView('root');
    setCommandSearch('');
    setCommandSelection('');
    setSkillSearch('');
    setSkillSelection('');
  }, []);

  useEffect(() => {
    bundledSkillsRequestIdRef.current += 1;
    setInstalledSkills([]);
    setInstalledSkillsError(null);
    setIsInstalledSkillsLoading(true);
    setBundledSkills(null);
    setIsBundledSkillsLoading(false);
    setBundledSkillsError(null);
    setIsCommandMenuOpen(false);
    resetCommandMenuState();
    setIsInstallDialogOpen(false);
    setInstallingSkillName(null);
  }, [artifactId, projectId, resetCommandMenuState]);

  useEffect(() => {
    if (!enableCommandMenu) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommandShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k';

      if (!isCommandShortcut) {
        return;
      }

      event.preventDefault();
      resetCommandMenuState();
      setIsCommandMenuOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enableCommandMenu, resetCommandMenuState]);

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

  const handleCommandMenuChange = (open: boolean) => {
    setIsCommandMenuOpen(open);
    if (!open) {
      resetCommandMenuState();
    }
  };

  const handlePrimaryActionClick = () => {
    if (enableCommandMenu) {
      resetCommandMenuState();
      setIsCommandMenuOpen(true);
      return;
    }

    handleInstallDialogChange(true);
  };

  const handleOpenSkillsMenu = () => {
    setCommandMenuView('skills');
    setCommandSearch('');
    setCommandSelection('');
    setSkillSearch('');
    setSkillSelection('');
    void loadBundledSkills();
  };

  const handleReturnToRootMenu = () => {
    setCommandMenuView('root');
    setSkillSearch('');
    setSkillSelection('');
    setCommandSelection('');
  };

  useEffect(() => {
    if (!enableCommandMenu || !isCommandMenuOpen || commandMenuView === 'root') {
      return;
    }

    const handleNestedEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleReturnToRootMenu();
    };

    window.addEventListener('keydown', handleNestedEscape, true);
    return () => {
      window.removeEventListener('keydown', handleNestedEscape, true);
    };
  }, [commandMenuView, enableCommandMenu, isCommandMenuOpen]);

  const handleMockCommandSelect = (label: string) => {
    toast.message(`${label} is coming soon.`);
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
      if (enableCommandMenu) {
        setIsCommandMenuOpen(false);
        resetCommandMenuState();
      } else {
        setIsInstallDialogOpen(false);
        setSkillSearch('');
        setSkillSelection('');
      }
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

  const activeSearch = commandMenuView === 'skills' ? skillSearch : commandSearch;
  const activeSelection = commandMenuView === 'skills' ? skillSelection : commandSelection;

  const handleActiveSearchChange = (nextValue: string) => {
    if (commandMenuView === 'skills') {
      setSkillSearch(nextValue);
      setSkillSelection('');
      return;
    }

    setCommandSearch(nextValue);
    setCommandSelection('');
  };

  const handleActiveSelectionChange = (nextValue: string) => {
    if (commandMenuView === 'skills') {
      setSkillSelection(nextValue);
      return;
    }

    setCommandSelection(nextValue);
  };

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
            return (
              <Tooltip key={skill.name}>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex size-5 items-center justify-center">
                    <SkillIcon skillName={skill.name} size={14} className="text-muted-foreground" />
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
              onClick={handlePrimaryActionClick}
              disabled={isInstallBusy}
              className="text-muted-foreground hover:text-foreground disabled:text-muted-foreground/60 flex size-5 cursor-pointer items-center justify-center transition-colors disabled:cursor-default"
              aria-label={enableCommandMenu ? 'Open command menu' : 'Add skill'}
            >
              {isInstallBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent sideOffset={8} className={SKILL_TOOLTIP_CLASS_NAME}>
            {enableCommandMenu ? 'Open menu' : 'Add skill'}
          </TooltipContent>
        </Tooltip>
      </div>

      {enableCommandMenu ? (
        <CommandDialog
          open={isCommandMenuOpen}
          onOpenChange={handleCommandMenuChange}
          title="Command menu"
          description="Search artifact actions."
          className="bg-home-page border-home-border sm:max-w-md"
          overlayClassName="bg-black/30 backdrop-blur-[1px]"
          commandProps={{
            loop: true,
            value: activeSelection,
            onValueChange: handleActiveSelectionChange,
          }}
        >
          <CommandInput
            value={activeSearch}
            onValueChange={handleActiveSearchChange}
            placeholder={
              commandMenuView === 'skills' ? 'Search available skills...' : 'Search commands...'
            }
          />
          <div className="text-muted-foreground flex items-center gap-1 px-3 py-2 text-[11px] font-medium">
            {commandMenuView === 'skills' ? (
              <>
                <button
                  type="button"
                  onClick={handleReturnToRootMenu}
                  className="hover:text-foreground cursor-pointer transition-colors"
                >
                  Artifact Options
                </button>
                <ChevronRight className="size-2.5" />
                <span className="text-foreground">Add Skills</span>
              </>
            ) : (
              <>
                <span>Artifact Options</span>
                <ChevronRight className="size-2.5" />
              </>
            )}
          </div>
          <CommandList className="max-h-72 overflow-y-auto p-2">
            <CommandEmpty>
              {commandMenuView === 'skills' ? commandEmptyMessage : 'No commands found.'}
            </CommandEmpty>
            {commandMenuView === 'skills' ? (
              installableSkills.map((skill) => {
                return (
                  <CommandItem
                    key={skill.name}
                    value={skill.name}
                    keywords={[skill.description]}
                    disabled={isInstallBusy}
                    onSelect={() => void handleInstallSkill(skill.name)}
                    className="mb-1 gap-2 rounded-xl px-2.5 py-2 text-[13px] last:mb-0"
                  >
                    {installingSkillName === skill.name ? (
                      <Loader2 className="size-3 animate-spin text-muted-foreground" />
                    ) : (
                      <SkillIcon
                        skillName={skill.name}
                        size={15}
                        className="text-muted-foreground"
                      />
                    )}
                    <span className="truncate font-medium">{skill.name}</span>
                  </CommandItem>
                );
              })
            ) : (
              <>
                <CommandItem
                  value="skills"
                  onSelect={handleOpenSkillsMenu}
                  className="mb-1 gap-2 rounded-xl px-2.5 py-2 text-[13px] last:mb-0"
                >
                  <Plus className="size-3 text-muted-foreground" />
                  <span>Skills</span>
                </CommandItem>
                {MOCK_COMMAND_ITEMS.map((item) => {
                  const Icon = item.icon;

                  return (
                    <CommandItem
                      key={item.value}
                      value={item.value}
                      onSelect={() => handleMockCommandSelect(item.label)}
                      className="mb-1 gap-2 rounded-xl px-2.5 py-2 text-[13px] last:mb-0"
                    >
                      <Icon className="size-3 text-muted-foreground" />
                      <span>{item.label}</span>
                    </CommandItem>
                  );
                })}
              </>
            )}
          </CommandList>
        </CommandDialog>
      ) : (
        <CommandDialog
          open={isInstallDialogOpen}
          onOpenChange={handleInstallDialogChange}
          title="Add skill"
          description="Search and add a skill for this artifact."
          className="bg-home-page border-home-border sm:max-w-xl"
          commandProps={{
            loop: true,
            value: skillSelection,
            onValueChange: setSkillSelection,
          }}
        >
          <CommandInput
            value={skillSearch}
            onValueChange={(nextValue) => {
              setSkillSearch(nextValue);
              setSkillSelection('');
            }}
            placeholder="Search available skills..."
          />
          <CommandList className="max-h-72 overflow-y-auto p-2">
            <CommandEmpty>{commandEmptyMessage}</CommandEmpty>
            {installableSkills.length > 0 ? (
              <CommandGroup heading="Available skills">
                {installableSkills.map((skill) => {
                  return (
                    <CommandItem
                      key={skill.name}
                      value={skill.name}
                      keywords={[skill.description]}
                      disabled={isInstallBusy}
                      onSelect={() => void handleInstallSkill(skill.name)}
                      className="mb-1 gap-2 rounded-xl px-2.5 py-2 text-[13px] last:mb-0"
                    >
                      {installingSkillName === skill.name ? (
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                      ) : (
                        <SkillIcon
                          skillName={skill.name}
                          size={15}
                          className="text-muted-foreground"
                        />
                      )}
                      <span className="truncate font-medium">{skill.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </CommandDialog>
      )}
    </>
  );
}
