import { useState } from 'react';
import { Modal } from '@/ui/Modal';
import { Button } from '@/ui/Button';
import { ProjectId } from '@/types';
import { useProjectStore } from '@/state';
import { TriangleAlert as AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteProjectModalProps {
  isOpen: boolean;
  projectId: ProjectId | null;
  onClose: () => void;
  mode?: 'soft' | 'permanent';
}

export function DeleteProjectModal({ isOpen, projectId, onClose, mode = 'soft' }: DeleteProjectModalProps) {
  const projects = useProjectStore((s) => s.projects);
  const softDeleteProject = useProjectStore((s) => s.softDeleteProject);
  const permanentDeleteProject = useProjectStore((s) => s.permanentDeleteProject);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const project = projectId ? projects.find((p) => p.id === projectId) : null;
  if (!project) return null;

  const handleDelete = async () => {
    if (!projectId) return;
    setIsSubmitting(true);
    try {
      if (mode === 'permanent') {
        await permanentDeleteProject(projectId);
      } else {
        await softDeleteProject(projectId);
      }
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'permanent' ? 'Permanently Delete?' : 'Delete Project?'}
      description={
        mode === 'permanent'
          ? `This will permanently remove "${project.name}" and all its data. This cannot be undone.`
          : `"${project.name}" will be moved to trash. You can restore it later.`
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={isSubmitting}
            icon={mode === 'permanent' ? <Trash2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          >
            {isSubmitting ? 'Deleting...' : mode === 'permanent' ? 'Permanently Delete' : 'Move to Trash'}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <p>
          {mode === 'permanent'
            ? 'All conversations, notes, files, and tasks will be lost forever.'
            : 'The project can be restored from the trash at any time.'}
        </p>
      </div>
    </Modal>
  );
}
