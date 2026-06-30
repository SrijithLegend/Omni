import { Project, ProjectId } from '@/types';
import { formatDate } from '@/utils';
import { cn } from '@/utils';
import { motion } from 'framer-motion';
import { Star, Pin, Archive, Trash2, CreditCard as Edit, ArrowRight, MessageSquare, FileText, StickyNote, SquareCheck as CheckSquare } from 'lucide-react';
import * as Icons from 'lucide-react';

interface ProjectCardProps {
  project: Project;
  onOpen: (id: ProjectId) => void;
  onEdit: (id: ProjectId) => void;
  onDelete: (id: ProjectId) => void;
  onToggleFavorite: (id: ProjectId) => void;
  onTogglePin: (id: ProjectId) => void;
  onToggleArchive: (id: ProjectId) => void;
  index?: number;
}

export function ProjectCard({
  project,
  onOpen,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTogglePin,
  onToggleArchive,
  index = 0,
}: ProjectCardProps) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[project.icon] || Icons.FileText;

  const hasActivity =
    project.stats.conversationCount > 0 ||
    project.stats.fileCount > 0 ||
    project.stats.noteCount > 0 ||
    project.stats.taskCount > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      whileHover={{ y: -2 }}
      className={cn(
        'group relative rounded-xl border border-omni-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md',
        project.isArchived && 'opacity-60'
      )}
      onClick={() => onOpen(project.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(project.id); } }}
      aria-label={`Open project ${project.name}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: project.color + '18' }}
        >
          <Icon className="w-5 h-5" style={{ color: project.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-omni-900 truncate">{project.name}</h3>
            {project.isPinned && <Pin className="w-3 h-3 text-accent-amber flex-shrink-0" />}
            {project.isFavorite && <Star className="w-3 h-3 text-accent-amber fill-accent-amber flex-shrink-0" />}
            {project.isArchived && <Archive className="w-3 h-3 text-omni-400 flex-shrink-0" />}
          </div>
          {project.description && (
            <p className="text-xs text-omni-500 mt-0.5 line-clamp-2">{project.description}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-omni-400">
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          {project.stats.conversationCount}
        </span>
        <span className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {project.stats.fileCount}
        </span>
        <span className="flex items-center gap-1">
          <StickyNote className="w-3 h-3" />
          {project.stats.noteCount}
        </span>
        <span className="flex items-center gap-1">
          <CheckSquare className="w-3 h-3" />
          {project.stats.taskCount}
        </span>
        <span className="ml-auto text-omni-400">
          {formatDate(project.lastOpenedAt)}
        </span>
      </div>

      <div
        className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onToggleFavorite(project.id)}
          className={cn(
            'rounded-md p-1.5 transition-colors',
            project.isFavorite
              ? 'text-accent-amber bg-amber-50'
              : 'text-omni-400 hover:bg-omni-100 hover:text-omni-700'
          )}
          title={project.isFavorite ? 'Unfavorite' : 'Favorite'}
          aria-label={project.isFavorite ? 'Unfavorite project' : 'Favorite project'}
        >
          <Star className={cn('w-3.5 h-3.5', project.isFavorite && 'fill-accent-amber')} />
        </button>
        <button
          onClick={() => onTogglePin(project.id)}
          className={cn(
            'rounded-md p-1.5 transition-colors',
            project.isPinned
              ? 'text-accent-amber bg-amber-50'
              : 'text-omni-400 hover:bg-omni-100 hover:text-omni-700'
          )}
          title={project.isPinned ? 'Unpin' : 'Pin'}
          aria-label={project.isPinned ? 'Unpin project' : 'Pin project'}
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onEdit(project.id)}
          className="rounded-md p-1.5 text-omni-400 hover:bg-omni-100 hover:text-omni-700 transition-colors"
          title="Edit"
          aria-label="Edit project"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onToggleArchive(project.id)}
          className={cn(
            'rounded-md p-1.5 transition-colors',
            project.isArchived
              ? 'text-omni-500 bg-omni-100'
              : 'text-omni-400 hover:bg-omni-100 hover:text-omni-700'
          )}
          title={project.isArchived ? 'Unarchive' : 'Archive'}
          aria-label={project.isArchived ? 'Unarchive project' : 'Archive project'}
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(project.id)}
          className="rounded-md p-1.5 text-omni-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          title="Delete"
          aria-label="Delete project"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
