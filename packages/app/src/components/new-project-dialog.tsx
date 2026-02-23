'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useProjectsStore } from '@/stores';

type NewProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const NewProjectDialog: FC<NewProjectDialogProps> = ({ open, onOpenChange }) => {
  const router = useRouter();
  const projects = useProjectsStore((s) => s.projects);
  const createProject = useProjectsStore((s) => s.createProject);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const isDuplicate = projects.some((p) => p.projectName === trimmedName);

  function handleClose() {
    setName('');
    setError(null);
    onOpenChange(false);
  }

  async function handleCreate() {
    if (!trimmedName) {
      setError('Project name is required.');
      return;
    }
    if (isDuplicate) {
      setError('A project with this name already exists.');
      return;
    }

    await createProject(trimmedName);
    router.push(`/${trimmedName}`);
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Enter a name for your new project.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <Input
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
