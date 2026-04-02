'use client';

import { Delete03Icon, PlusSignIcon, ReloadIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { ArtifactContext, RegisteredSkillDto } from '@/lib/client-api';

import { SkillIcon } from '@/components/skill-icon';
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  useDeleteArtifactSkillMutation,
  useInstalledArtifactSkillsQuery,
  useInstallArtifactSkillMutation,
  useRegisteredSkillsQuery,
  useReloadArtifactSkillMutation,
} from '@/hooks/api';


type CommandMenuView = 'root' | 'add' | 'reload' | 'delete';
type SkillActionView = Exclude<CommandMenuView, 'root'>;
type SkillMenuEntry = Pick<RegisteredSkillDto, 'name' | 'description'>;

type RootCommandItem = {
  label: string;
  value: SkillActionView;
  icon: IconSvgElement;
};

const ROOT_COMMAND_ITEMS: RootCommandItem[] = [
  { label: 'Add Skill', value: 'add', icon: PlusSignIcon },
  { label: 'Reload Skill', value: 'reload', icon: ReloadIcon },
  { label: 'Delete Skill', value: 'delete', icon: Delete03Icon },
];

function sortSkillsByName<T extends { name: string }>(skills: readonly T[]): T[] {
  return [...skills].sort((left, right) => left.name.localeCompare(right.name));
}

function getViewTitle(view: SkillActionView): string {
  switch (view) {
    case 'add':
      return 'Add Skill';
    case 'reload':
      return 'Reload Skill';
    case 'delete':
      return 'Delete Skill';
  }
}

function getViewPlaceholder(view: SkillActionView): string {
  return view === 'add' ? 'Search available skills...' : 'Search installed skills...';
}

function getViewLoadingMessage(view: SkillActionView): string {
  return view === 'add' ? 'Loading available skills...' : 'Loading installed skills...';
}

function getViewSuccessMessage(view: SkillActionView, skillName: string): string {
  switch (view) {
    case 'add':
      return `Installed ${skillName}`;
    case 'reload':
      return `Reloaded ${skillName}`;
    case 'delete':
      return `Deleted ${skillName}`;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function matchesSkill(entry: SkillMenuEntry, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    entry.name.toLowerCase().includes(normalizedQuery) ||
    entry.description.toLowerCase().includes(normalizedQuery)
  );
}

export function ArtifactCommandMenu({
  enabled,
  projectId,
  artifactId,
}: {
  enabled: boolean;
  projectId: string;
  artifactId: string;
}) {
  const artifactContext: ArtifactContext = { projectId, artifactId };
  const [isOpen, setIsOpen] = useState(false);
  const [commandMenuView, setCommandMenuView] = useState<CommandMenuView>('root');
  const [commandSearch, setCommandSearch] = useState('');
  const [commandSelection, setCommandSelection] = useState('');
  const [skillSearch, setSkillSearch] = useState('');
  const [skillSelection, setSkillSelection] = useState('');
  const [pendingSkillAction, setPendingSkillAction] = useState<{
    view: SkillActionView;
    skillName: string;
  } | null>(null);

  const registeredSkillsQuery = useRegisteredSkillsQuery({
    enabled: enabled && isOpen,
  });
  const installedSkillsQuery = useInstalledArtifactSkillsQuery(artifactContext, {
    enabled: enabled && isOpen,
  });
  const installSkillMutation = useInstallArtifactSkillMutation(artifactContext);
  const reloadSkillMutation = useReloadArtifactSkillMutation(artifactContext);
  const deleteSkillMutation = useDeleteArtifactSkillMutation(artifactContext);

  const resetCommandMenuState = useCallback(() => {
    setCommandMenuView('root');
    setCommandSearch('');
    setCommandSelection('');
    setSkillSearch('');
    setSkillSelection('');
    setPendingSkillAction(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
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
      setIsOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, resetCommandMenuState]);

  useEffect(() => {
    if (!enabled || !isOpen || commandMenuView === 'root') {
      return;
    }

    const handleNestedEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setCommandMenuView('root');
      setSkillSearch('');
      setSkillSelection('');
      setCommandSelection('');
      setPendingSkillAction(null);
    };

    window.addEventListener('keydown', handleNestedEscape, true);
    return () => {
      window.removeEventListener('keydown', handleNestedEscape, true);
    };
  }, [commandMenuView, enabled, isOpen]);

  useEffect(() => {
    if (!enabled || !isOpen || commandMenuView !== 'root') {
      return;
    }

    const handleRootEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setIsOpen(false);
      resetCommandMenuState();
    };

    window.addEventListener('keydown', handleRootEscape, true);
    return () => {
      window.removeEventListener('keydown', handleRootEscape, true);
    };
  }, [commandMenuView, enabled, isOpen, resetCommandMenuState]);

  const installedSkills = sortSkillsByName(installedSkillsQuery.data ?? []);
  const registeredSkills = sortSkillsByName(registeredSkillsQuery.data ?? []);
  const installedSkillNames = new Set(installedSkills.map((skill) => skill.name));
  const addableSkills = registeredSkills.filter((skill) => !installedSkillNames.has(skill.name));
  const activeNestedView = commandMenuView === 'root' ? null : commandMenuView;

  const filteredRootCommandItems = ROOT_COMMAND_ITEMS.filter((item) => {
    const query = commandSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return item.label.toLowerCase().includes(query);
  });

  const filteredNestedSkills =
    activeNestedView === 'add'
      ? addableSkills.filter((skill) => matchesSkill(skill, skillSearch))
      : installedSkills.filter((skill) => matchesSkill(skill, skillSearch));

  const isNestedLoading =
    activeNestedView === 'add'
      ? registeredSkillsQuery.isLoading || installedSkillsQuery.isLoading
      : installedSkillsQuery.isLoading;
  const nestedError =
    activeNestedView === 'add'
      ? (registeredSkillsQuery.error ?? installedSkillsQuery.error)
      : installedSkillsQuery.error;

  let nestedEmptyMessage = activeNestedView ? getViewLoadingMessage(activeNestedView) : '';
  if (activeNestedView && !isNestedLoading) {
    if (nestedError) {
      nestedEmptyMessage = getErrorMessage(nestedError, 'Could not load skills.');
    } else if (activeNestedView === 'add' && addableSkills.length === 0) {
      nestedEmptyMessage =
        registeredSkills.length === 0
          ? 'No skills available.'
          : 'All available skills are installed.';
    } else if (
      (activeNestedView === 'reload' || activeNestedView === 'delete') &&
      installedSkills.length === 0
    ) {
      nestedEmptyMessage = 'No installed skills found.';
    } else if (skillSearch.trim().length > 0) {
      const prefix = activeNestedView === 'add' ? 'available skills' : 'installed skills';
      nestedEmptyMessage = `No ${prefix} match "${skillSearch.trim()}".`;
    } else {
      nestedEmptyMessage = 'No skills available.';
    }
  }

  const activeSearch = activeNestedView ? skillSearch : commandSearch;
  const activeSelection = activeNestedView ? skillSelection : commandSelection;
  const isMutating = pendingSkillAction !== null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetCommandMenuState();
    }
  };

  const handleOpenActionView = (view: SkillActionView) => {
    setCommandMenuView(view);
    setCommandSearch('');
    setCommandSelection('');
    setSkillSearch('');
    setSkillSelection('');
    setPendingSkillAction(null);
  };

  const handleReturnToRootMenu = () => {
    setCommandMenuView('root');
    setSkillSearch('');
    setSkillSelection('');
    setCommandSelection('');
    setPendingSkillAction(null);
  };

  const handleActiveSearchChange = (nextValue: string) => {
    if (activeNestedView) {
      setSkillSearch(nextValue);
      setSkillSelection('');
      return;
    }

    setCommandSearch(nextValue);
    setCommandSelection('');
  };

  const handleActiveSelectionChange = (nextValue: string) => {
    if (activeNestedView) {
      setSkillSelection(nextValue);
      return;
    }

    setCommandSelection(nextValue);
  };

  const handleSkillAction = async (skillName: string) => {
    if (!activeNestedView || isMutating) {
      return;
    }

    setPendingSkillAction({
      view: activeNestedView,
      skillName,
    });

    try {
      if (activeNestedView === 'add') {
        await installSkillMutation.mutateAsync({ skillName });
      } else if (activeNestedView === 'reload') {
        await reloadSkillMutation.mutateAsync(skillName);
      } else {
        await deleteSkillMutation.mutateAsync(skillName);
      }

      toast.success(getViewSuccessMessage(activeNestedView, skillName));
      setIsOpen(false);
      resetCommandMenuState();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          activeNestedView === 'add'
            ? 'Failed to install skill.'
            : activeNestedView === 'reload'
              ? 'Failed to reload skill.'
              : 'Failed to delete skill.'
        )
      );
      setPendingSkillAction(null);
    }
  };

  if (!enabled) {
    return null;
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      title="Command menu"
      description="Manage artifact skills."
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
        placeholder={activeNestedView ? getViewPlaceholder(activeNestedView) : 'Search commands...'}
      />
      <div className="text-muted-foreground flex items-center gap-1 px-3 py-2 text-[11px] font-medium">
        {activeNestedView ? (
          <>
            <button
              type="button"
              onClick={handleReturnToRootMenu}
              className="hover:text-foreground cursor-pointer transition-colors"
            >
              Artifact Skills
            </button>
            <ChevronRight className="size-2.5" />
            <span className="text-foreground">{getViewTitle(activeNestedView)}</span>
          </>
        ) : (
          <>
            <span>Artifact Skills</span>
            <ChevronRight className="size-2.5" />
          </>
        )}
      </div>
      <CommandList className="max-h-72 overflow-y-auto p-2">
        <CommandEmpty>{activeNestedView ? nestedEmptyMessage : 'No commands found.'}</CommandEmpty>
        {activeNestedView
          ? filteredNestedSkills.map((skill) => {
              const isPending =
                pendingSkillAction?.view === activeNestedView &&
                pendingSkillAction.skillName === skill.name;

              return (
                <CommandItem
                  key={skill.name}
                  value={skill.name}
                  keywords={[skill.description]}
                  disabled={isMutating}
                  onSelect={() => void handleSkillAction(skill.name)}
                  className="mb-1 gap-2 rounded-xl px-2.5 py-2 text-[13px] last:mb-0"
                >
                  {isPending ? (
                    <Loader2 className="size-3 animate-spin text-muted-foreground" />
                  ) : (
                    <SkillIcon skillName={skill.name} className="text-muted-foreground" />
                  )}
                  <span className="truncate font-medium">{skill.name}</span>
                </CommandItem>
              );
            })
          : filteredRootCommandItems.map((item) => (
              <CommandItem
                key={item.value}
                value={item.value}
                onSelect={() => handleOpenActionView(item.value)}
                className="mb-1 gap-2 rounded-xl px-2.5 py-2 text-[13px] last:mb-0"
              >
                <HugeiconsIcon
                  icon={item.icon}
                  size={15}
                  color="currentColor"
                  strokeWidth={1.7}
                  className="text-muted-foreground"
                />
                <span>{item.label}</span>
              </CommandItem>
            ))}
      </CommandList>
    </CommandDialog>
  );
}
