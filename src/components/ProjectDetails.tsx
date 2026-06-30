import { Project } from '@/types';
import { motion } from 'framer-motion';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { cn, formatDate, formatFullDate } from '@/utils';
import { X, Star, Pin, Archive, Trash2, CreditCard as Edit, RotateCcw, MessageSquare, FileText, StickyNote, SquareCheck as CheckSquare, Clock, Calendar, Zap, TrendingUp, Code, FileText as FileIcon, FlaskConical, Rocket, GraduationCap, Heart } from 'lucide-react';

interface ProjectDetailsProps {
  project: Project;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onRestore: () => void;
}

const templateIconMap: Record<string, React.ReactNode> = {
  software: <Code className="w-4 h-4" />,
  research: <FlaskConical className="w-4 h-4" />,
  startup: <Rocket className="w-4 h-4" />,
  college: <GraduationCap className="w-4 h-4" />,
  personal: <Heart className="w-4 h-4" />,
  blank: <FileIcon className="w-4 h-4" />,
};

export function ProjectDetails({
  project,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTogglePin,
  onToggleArchive,
  onRestore,
}: ProjectDetailsProps) {
  const hasActivity =
    project.stats.conversationCount > 0 ||
    project.stats.fileCount > 0 ||
    project.stats.noteCount > 0 ||
    project.stats.taskCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-white shadow-2xl border-l border-omni-200 overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-omni-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: project.color + '18' }}
            >
              <FileIcon className="w-5 h-5" style={{ color: project.color }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-omni-900 leading-tight">{project.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {project.isPinned && (
                  <Badge variant="warning" size="sm">
                    <Pin className="w-3 h-3 mr-0.5" /> Pinned
                  </Badge>
                )}
                {project.isFavorite && (
                  <Badge variant="warning" size="sm">
                    <Star className="w-3 h-3 mr-0.5 fill-accent-amber" /> Favorite
                  </Badge>
                )}
                {project.isArchived && (
                  <Badge variant="neutral" size="sm">
                    <Archive className="w-3 h-3 mr-0.5" /> Archived
                  </Badge>
                )}
                {project.isDeleted && (
                  <Badge variant="danger" size="sm">
                    <Trash2 className="w-3 h-3 mr-0.5" /> Deleted
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {project.isDeleted ? (
              <Button variant="secondary" size="sm" onClick={onRestore} icon={<RotateCcw className="w-4 h-4" />}>
                Restore
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleFavorite}
                  icon={<Star className={cn('w-4 h-4', project.isFavorite && 'fill-accent-amber text-accent-amber')} />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onTogglePin}
                  icon={<Pin className={cn('w-4 h-4', project.isPinned && 'text-accent-amber')} />}
                />
                <Button variant="ghost" size="sm" onClick={onEdit} icon={<Edit className="w-4 h-4" />} />
                <Button variant="ghost" size="sm" onClick={onToggleArchive} icon={<Archive className="w-4 h-4" />} />
                <Button variant="ghost" size="sm" onClick={onDelete} icon={<Trash2 className="w-4 h-4 text-red-500" />} />
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} icon={<X className="w-4 h-4" />} />
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-8">
        {/* Overview */}
        <section>
          <h3 className="text-xs font-semibold text-omni-400 uppercase tracking-wider mb-3">Overview</h3>
          <div className="bg-omni-50 rounded-xl p-4 space-y-3">
            {project.description && (
              <p className="text-sm text-omni-700">{project.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <Badge key={tag} variant="neutral" size="sm">{tag}</Badge>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-omni-500">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Created {formatFullDate(project.createdAt)}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Updated {formatDate(project.updatedAt)}
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Last opened {formatDate(project.lastOpenedAt)}
              </div>
              {project.template && (
                <div className="flex items-center gap-1.5">
                  {templateIconMap[project.template] || <FileIcon className="w-3.5 h-3.5" />}
                  Template: {project.template.charAt(0).toUpperCase() + project.template.slice(1)}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section>
          <h3 className="text-xs font-semibold text-omni-400 uppercase tracking-wider mb-3">Quick Stats</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-omni-200 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <MessageSquare className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-omni-900">{project.stats.conversationCount}</div>
                <div className="text-xs text-omni-500">Conversations</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-omni-200 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <FileText className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-omni-900">{project.stats.fileCount}</div>
                <div className="text-xs text-omni-500">Files</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-omni-200 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <StickyNote className="w-4.5 h-4.5 text-purple-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-omni-900">{project.stats.noteCount}</div>
                <div className="text-xs text-omni-500">Notes</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-omni-200 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                <CheckSquare className="w-4.5 h-4.5 text-green-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-omni-900">{project.stats.taskCount}</div>
                <div className="text-xs text-omni-500">Tasks</div>
              </div>
            </div>
          </div>
        </section>

        {/* Placeholder Sections */}
        <section>
          <h3 className="text-xs font-semibold text-omni-400 uppercase tracking-wider mb-3">Conversations</h3>
          <div className="rounded-xl border border-dashed border-omni-200 p-8 text-center">
            <MessageSquare className="w-8 h-8 text-omni-300 mx-auto mb-2" />
            <p className="text-sm text-omni-500">No conversations yet</p>
            <p className="text-xs text-omni-400 mt-1">Conversations will appear here when you start chatting</p>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-omni-400 uppercase tracking-wider mb-3">Files</h3>
          <div className="rounded-xl border border-dashed border-omni-200 p-8 text-center">
            <FileText className="w-8 h-8 text-omni-300 mx-auto mb-2" />
            <p className="text-sm text-omni-500">No files yet</p>
            <p className="text-xs text-omni-400 mt-1">Upload and manage files here</p>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-omni-400 uppercase tracking-wider mb-3">Notes</h3>
          <div className="rounded-xl border border-dashed border-omni-200 p-8 text-center">
            <StickyNote className="w-8 h-8 text-omni-300 mx-auto mb-2" />
            <p className="text-sm text-omni-500">No notes yet</p>
            <p className="text-xs text-omni-400 mt-1">Jot down ideas and references</p>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-omni-400 uppercase tracking-wider mb-3">Tasks</h3>
          <div className="rounded-xl border border-dashed border-omni-200 p-8 text-center">
            <CheckSquare className="w-8 h-8 text-omni-300 mx-auto mb-2" />
            <p className="text-sm text-omni-500">No tasks yet</p>
            <p className="text-xs text-omni-400 mt-1">Track your project tasks and milestones</p>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-omni-400 uppercase tracking-wider mb-3">Timeline</h3>
          <div className="rounded-xl border border-dashed border-omni-200 p-8 text-center">
            <TrendingUp className="w-8 h-8 text-omni-300 mx-auto mb-2" />
            <p className="text-sm text-omni-500">Timeline coming soon</p>
            <p className="text-xs text-omni-400 mt-1">Track your project progress over time</p>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-omni-400 uppercase tracking-wider mb-3">Connectors</h3>
          <div className="rounded-xl border border-dashed border-omni-200 p-8 text-center">
            <Zap className="w-8 h-8 text-omni-300 mx-auto mb-2" />
            <p className="text-sm text-omni-500">No connectors yet</p>
            <p className="text-xs text-omni-400 mt-1">Connect to external tools and APIs</p>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
