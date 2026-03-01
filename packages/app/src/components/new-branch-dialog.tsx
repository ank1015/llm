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
import { branchToSlug } from '@/lib/mock-data';
import { useProjectsStore } from '@/stores';

type NewBranchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
};

export const NewBranchDialog: FC<NewBranchDialogProps> = ({ open, onOpenChange, projectName }) => {
  const router = useRouter();
  const projects = useProjectsStore((s) => s.projects);
  const createBranch = useProjectsStore((s) => s.createBranch);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const project = projects.find((p) => p.projectName === projectName);
  const isDuplicate = project?.branches.some((b) => b.branchName === trimmedName) ?? false;

  function handleClose() {
    setName('');
    setError(null);
    onOpenChange(false);
  }

  async function handleCreate() {
    if (!trimmedName) {
      setError('Branch name is required.');
      return;
    }
    if (isDuplicate) {
      setError('A branch with this name already exists.');
      return;
    }

    await createBranch(projectName, trimmedName);
    router.push(`/${projectName}/${branchToSlug(trimmedName)}`);
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New branch</DialogTitle>
          <DialogDescription>Create a new branch in &ldquo;{projectName}&rdquo;.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <Input
            autoFocus
            placeholder="Branch name"
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
