/**
 * Omni Store — Centralized state management with typed slices.
 *
 * Pattern: One store, multiple slices. Each slice owns its domain.
 * No scattered state. Everything flows through here.
 */

import { createStore } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UIState, Toast, Modal } from "./slices/ui";
import { initialUIState } from "./slices/ui";
import type { WorkspaceSlice } from "./slices/workspace";
import { initialWorkspaceSlice } from "./slices/workspace";
import type { ProjectSlice } from "./slices/project";
import { initialProjectSlice } from "./slices/project";
import type { SettingsSlice } from "./slices/settings";
import { initialSettingsSlice } from "./slices/settings";
import type { SearchSlice } from "./slices/search";
import { initialSearchSlice } from "./slices/search";
import type { TimelineSlice } from "./slices/timeline";
import { initialTimelineSlice } from "./slices/timeline";
import type { ConnectorSlice } from "./slices/connector";
import { initialConnectorSlice } from "./slices/connector";
import type { NotificationSlice } from "./slices/notification";
import { initialNotificationSlice } from "./slices/notification";
import type { ConversationSlice, ConversationSliceStats } from "./slices/conversation";
import { initialConversationSlice } from "./slices/conversation";
import type { UUID } from "../types/omni";
import type { UniversalConversation } from "../models/universal-conversation";

export interface OmniStore {
  // UI Slice
  ui: UIState;
  setTheme: (theme: UIState["theme"]) => void;
  setView: (view: string) => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  openModal: (modal: Modal) => void;
  closeModal: (id: string) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setAppStatus: (status: UIState["appStatus"], message?: string) => void;
  setSidebar: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;

  // Workspace Slice
  workspace: WorkspaceSlice;
  setWorkspace: (workspace: Partial<WorkspaceSlice>) => void;
  setActiveProject: (projectId: string | null) => void;
  addActivity: (activity: WorkspaceSlice["recentActivity"][0]) => void;
  addNotification: (notification: WorkspaceSlice["notifications"][0]) => void;
  markNotificationsRead: () => void;
  updateWorkspaceStats: (stats: Partial<WorkspaceSlice["stats"]>) => void;

  // Project Slice
  project: ProjectSlice;
  setProject: (project: Partial<ProjectSlice>) => void;
  updateProjectStats: (stats: Partial<ProjectSlice["stats"]>) => void;

  // Settings Slice
  settings: SettingsSlice;
  setSettings: (settings: Partial<SettingsSlice>) => void;
  updateAppearance: (appearance: Partial<SettingsSlice["appearance"]>) => void;
  updateKeyboard: (keyboard: Partial<SettingsSlice["keyboard"]>) => void;
  updateStorage: (storage: Partial<SettingsSlice["storage"]>) => void;
  updateNotifications: (notifications: Partial<SettingsSlice["notifications"]>) => void;
  updatePrivacy: (privacy: Partial<SettingsSlice["privacy"]>) => void;
  updateExperimental: (experimental: Partial<SettingsSlice["experimental"]>) => void;
  updateDeveloper: (developer: Partial<SettingsSlice["developer"]>) => void;
  resetSettings: () => void;

  // Search Slice
  search: SearchSlice;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchSlice["results"], total: number, duration: number) => void;
  setSearchFilters: (filters: Partial<SearchSlice["filters"]>) => void;
  setIsSearching: (isSearching: boolean) => void;
  addSearchHistory: (query: string) => void;
  clearSearch: () => void;

  // Timeline Slice
  timeline: TimelineSlice;
  setTimelineEvents: (events: TimelineSlice["events"], hasMore: boolean, total: number) => void;
  addTimelineEvent: (event: TimelineSlice["events"][0]) => void;
  setTimelineFilter: (filter: Partial<TimelineSlice["filter"]>) => void;
  setTimelineLoading: (loading: boolean) => void;
  setSelectedEvent: (id: string | null) => void;

  // Connector Slice
  connector: ConnectorSlice;
  setConnectors: (connectors: ConnectorSlice["connectors"]) => void;
  updateConnector: (id: string, updates: Partial<ConnectorSlice["connectors"][0]>) => void;
  setConnectorLoading: (loading: boolean) => void;
  setActiveConnector: (id: string | null) => void;
  addConnectorError: (error: ConnectorSlice["errors"][0]) => void;

  // Notification Slice
  notification: NotificationSlice;
  addAppNotification: (notification: NotificationSlice["notifications"][0]) => void;
  markAppNotificationRead: (id: string) => void;
  markAllAppNotificationsRead: () => void;
  dismissAppNotification: (id: string) => void;
  setNotificationPanel: (open: boolean) => void;
  setMutedUntil: (timestamp: number | null) => void;

  // Conversation Slice
  conversation: ConversationSlice;
  setConversations: (conversations: UniversalConversation[]) => void;
  addConversation: (conversation: UniversalConversation) => void;
  updateConversation: (id: UUID, updates: Partial<UniversalConversation>) => void;
  deleteConversation: (id: UUID) => void;
  setActiveConversation: (id: UUID | null) => void;
  setConversationSearch: (query: string) => void;
  setConversationFilter: (platforms: string[], dateFrom?: number, dateTo?: number) => void;
  setConversationSort: (sort: ConversationSlice["sort"]) => void;
  updateConversationStats: (stats: Partial<ConversationSliceStats>) => void;
  setCaptureStatus: (status: ConversationSlice["captureStatus"], error?: string | null) => void;
  setSelectedConversations: (ids: UUID[]) => void;
  toggleConversationSelection: (id: UUID) => void;
  clearConversationSelection: () => void;

  // Global
  reset: () => void;
}

let toastId = 0;

export const useOmniStore = createStore<OmniStore>()(
  persist(
    (set, get) => ({
      // UI
      ui: { ...initialUIState },
      setTheme: (theme) => set((s) => ({ ui: { ...s.ui, theme } })),
      setView: (view) => set((s) => ({ ui: { ...s.ui, activeView: view } })),
      addToast: (toast) => {
        const id = `toast_${++toastId}_${Date.now()}`;
        set((s) => ({ ui: { ...s.ui, toasts: [...s.ui.toasts, { ...toast, id }] } }));
        setTimeout(() => {
          set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } }));
        }, toast.duration ?? 3000);
      },
      removeToast: (id) => set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } })),
      openModal: (modal) => set((s) => ({ ui: { ...s.ui, modals: [...s.ui.modals, modal] } })),
      closeModal: (id) => set((s) => ({ ui: { ...s.ui, modals: s.ui.modals.filter((m) => m.id !== id) } })),
      setLoading: (loading, message) => set((s) => ({ ui: { ...s.ui, isLoading: loading, loadingMessage: message ?? "" } })),
      setAppStatus: (status, message) => set((s) => ({ ui: { ...s.ui, appStatus: status, statusMessage: message ?? "" } })),
      setSidebar: (open) => set((s) => ({ ui: { ...s.ui, sidebarOpen: open } })),
      setSidebarWidth: (width) => set((s) => ({ ui: { ...s.ui, sidebarWidth: width })),

      // Workspace
      workspace: { ...initialWorkspaceSlice },
      setWorkspace: (workspace) => set((s) => ({ workspace: { ...s.workspace, ...workspace } })),
      setActiveProject: (projectId) =>
        set((s) => ({
          workspace: {
            ...s.workspace,
            activeProjectId: projectId,
            recentProjectIds: projectId
              ? [projectId, ...s.workspace.recentProjectIds.filter((id) => id !== projectId)].slice(0, 5)
              : s.workspace.recentProjectIds,
          },
        })),
      addActivity: (activity) =>
        set((s) => ({
          workspace: {
            ...s.workspace,
            recentActivity: [activity, ...s.workspace.recentActivity].slice(0, 100),
          },
        })),
      addNotification: (notification) =>
        set((s) => ({
          workspace: {
            ...s.workspace,
            notifications: [notification, ...s.workspace.notifications].slice(0, 100),
            unreadCount: s.workspace.unreadCount + 1,
          },
        })),
      markNotificationsRead: () =>
        set((s) => ({
          workspace: {
            ...s.workspace,
            notifications: s.workspace.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          },
        })),
      updateWorkspaceStats: (stats) =>
        set((s) => ({ workspace: { ...s.workspace, stats: { ...s.workspace.stats, ...stats } } })),

      // Project
      project: { ...initialProjectSlice },
      setProject: (project) => set((s) => ({ project: { ...s.project, ...project } })),
      updateProjectStats: (stats) =>
        set((s) => ({ project: { ...s.project, stats: { ...s.project.stats, ...stats } } })),

      // Settings
      settings: { ...initialSettingsSlice },
      setSettings: (settings) => set((s) => ({ settings: { ...s.settings, ...settings } })),
      updateAppearance: (appearance) =>
        set((s) => ({ settings: { ...s.settings, appearance: { ...s.settings.appearance, ...appearance } } })),
      updateKeyboard: (keyboard) =>
        set((s) => ({ settings: { ...s.settings, keyboard: { ...s.settings.keyboard, ...keyboard } } })),
      updateStorage: (storage) =>
        set((s) => ({ settings: { ...s.settings, storage: { ...s.settings.storage, ...storage } } })),
      updateNotifications: (notifications) =>
        set((s) => ({ settings: { ...s.settings, notifications: { ...s.settings.notifications, ...notifications } } })),
      updatePrivacy: (privacy) =>
        set((s) => ({ settings: { ...s.settings, privacy: { ...s.settings.privacy, ...privacy } } })),
      updateExperimental: (experimental) =>
        set((s) => ({ settings: { ...s.settings, experimental: { ...s.settings.experimental, ...experimental } } })),
      updateDeveloper: (developer) =>
        set((s) => ({ settings: { ...s.settings, developer: { ...s.settings.developer, ...developer } } })),
      resetSettings: () => set({ settings: { ...initialSettingsSlice } }),

      // Search
      search: { ...initialSearchSlice },
      setSearchQuery: (query) => set((s) => ({ search: { ...s.search, query } })),
      setSearchResults: (results, total, duration) =>
        set((s) => ({ search: { ...s.search, results, total, duration, isSearching: false } })),
      setSearchFilters: (filters) => set((s) => ({ search: { ...s.search, filters: { ...s.search.filters, ...filters } } })),
      setIsSearching: (isSearching) => set((s) => ({ search: { ...s.search, isSearching } })),
      addSearchHistory: (query) =>
        set((s) => ({
          search: {
            ...s.search,
            history: [query, ...s.search.history.filter((q) => q !== query)].slice(0, 20),
          },
        })),
      clearSearch: () => set((s) => ({ search: { ...initialSearchSlice } })),

      // Timeline
      timeline: { ...initialTimelineSlice },
      setTimelineEvents: (events, hasMore, total) =>
        set((s) => ({ timeline: { ...s.timeline, events, hasMore, total, isLoading: false } })),
      addTimelineEvent: (event) =>
        set((s) => ({ timeline: { ...s.timeline, events: [event, ...s.timeline.events].slice(0, 500) } })),
      setTimelineFilter: (filter) =>
        set((s) => ({ timeline: { ...s.timeline, filter: { ...s.timeline.filter, ...filter } } })),
      setTimelineLoading: (loading) => set((s) => ({ timeline: { ...s.timeline, isLoading: loading } })),
      setSelectedEvent: (id) => set((s) => ({ timeline: { ...s.timeline, selectedEventId: id } })),

      // Connector
      connector: { ...initialConnectorSlice },
      setConnectors: (connectors) => set((s) => ({ connector: { ...s.connector, connectors } })),
      updateConnector: (id, updates) =>
        set((s) => ({
          connector: {
            ...s.connector,
            connectors: s.connector.connectors.map((c) => (c.id === id ? { ...c, ...updates } : c)),
          },
        })),
      setConnectorLoading: (loading) => set((s) => ({ connector: { ...s.connector, isLoading: loading } })),
      setActiveConnector: (id) => set((s) => ({ connector: { ...s.connector, activeConnectorId: id } })),
      addConnectorError: (error) =>
        set((s) => ({
          connector: {
            ...s.connector,
            errors: [error, ...s.connector.errors].slice(0, 50),
          },
        })),

      // Notification
      notification: { ...initialNotificationSlice },
      addAppNotification: (notification) =>
        set((s) => ({
          notification: {
            ...s.notification,
            notifications: [notification, ...s.notification.notifications].slice(0, 100),
            unreadCount: s.notification.unreadCount + 1,
          },
        })),
      markAppNotificationRead: (id) =>
        set((s) => ({
          notification: {
            ...s.notification,
            notifications: s.notification.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
            unreadCount: Math.max(0, s.notification.unreadCount - 1),
          },
        })),
      markAllAppNotificationsRead: () =>
        set((s) => ({
          notification: {
            ...s.notification,
            notifications: s.notification.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          },
        })),
      dismissAppNotification: (id) =>
        set((s) => ({
          notification: {
            ...s.notification,
            notifications: s.notification.notifications.filter((n) => n.id !== id),
            unreadCount: Math.max(0, s.notification.unreadCount - 1),
          },
        })),
      setNotificationPanel: (open) => set((s) => ({ notification: { ...s.notification, isOpen: open } })),
      setMutedUntil: (timestamp) => set((s) => ({ notification: { ...s.notification, mutedUntil: timestamp } })),

      // Conversation
      conversation: { ...initialConversationSlice },
      setConversations: (conversations) =>
        set((s) => ({ conversation: { ...s.conversation, conversations, filteredConversations: conversations } })),
      addConversation: (conversation) =>
        set((s) => {
          const conversations = [conversation, ...s.conversation.conversations];
          const filtered = [...conversations];

          const stats = {
            totalConversations: conversations.length,
            totalMessages: conversations.reduce((sum, c) => sum + c.messageCount, 0),
            conversationsByPlatform: conversations.reduce((acc, c) => {
              acc[c.platform] = (acc[c.platform] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
            conversationsByProject: conversations.reduce((acc, c) => {
              const key = c.projectId || "unassigned";
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
            totalCodeBlocks: conversations.reduce((sum, c) => sum + c.stats.totalCodeBlocks, 0),
            totalAttachments: conversations.reduce((sum, c) => sum + c.stats.totalAttachments, 0),
          };

          return {
            conversation: {
              ...s.conversation,
              conversations,
              filteredConversations: filtered,
              stats,
            },
          };
        }),
      updateConversation: (id, updates) =>
        set((s) => {
          const conversations = s.conversation.conversations.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
          );
          return {
            conversation: {
              ...s.conversation,
              conversations,
              filteredConversations: conversations,
            },
          };
        }),
      deleteConversation: (id) =>
        set((s) => {
          const conversations = s.conversation.conversations.filter((c) => c.id !== id);
          return {
            conversation: {
              ...s.conversation,
              conversations,
              filteredConversations: conversations,
              activeConversationId: s.conversation.activeConversationId === id ? null : s.conversation.activeConversationId,
            },
          };
        }),
      setActiveConversation: (id) =>
        set((s) => ({ conversation: { ...s.conversation, activeConversationId: id } })),
      setConversationSearch: (query) =>
        set((s) => {
          const filtered = s.conversation.conversations.filter((c) => {
            if (!query) return true;
            const lowerQuery = query.toLowerCase();
            return (
              c.title.toLowerCase().includes(lowerQuery) ||
              c.summary.short.toLowerCase().includes(lowerQuery) ||
              c.platform.toLowerCase().includes(lowerQuery)
            );
          });
          return { conversation: { ...s.conversation, searchQuery: query, filteredConversations: filtered } };
        }),
      setConversationFilter: (platforms, dateFrom, dateTo) =>
        set((s) => {
          let filtered = s.conversation.conversations;

          if (platforms.length > 0) {
            filtered = filtered.filter((c) => platforms.includes(c.platform));
          }

          if (dateFrom) {
            filtered = filtered.filter((c) => c.createdAt >= dateFrom!);
          }

          if (dateTo) {
            filtered = filtered.filter((c) => c.createdAt <= dateTo!);
          }

          return {
            conversation: {
              ...s.conversation,
              platformFilter: platforms,
              dateFilter: { from: dateFrom, to: dateTo },
              filteredConversations: filtered,
            },
          };
        }),
      setConversationSort: (sort) =>
        set((s) => {
          const filtered = [...s.conversation.filteredConversations].sort((a, b) => {
            switch (sort) {
              case "newest":
                return b.createdAt - a.createdAt;
              case "oldest":
                return a.createdAt - b.createdAt;
              case "most_messages":
                return b.messageCount - a.messageCount;
              case "recently_updated":
                return b.updatedAt - a.updatedAt;
              default:
                return 0;
            }
          });

          return { conversation: { ...s.conversation, sort, filteredConversations: filtered } };
        }),
      updateConversationStats: (stats) =>
        set((s) => ({ conversation: { ...s.conversation, stats: { ...s.conversation.stats, ...stats } } })),
      setCaptureStatus: (status, error = null) =>
        set((s) => ({
          conversation: {
            ...s.conversation,
            captureStatus: status,
            captureError: error,
            isCapturing: status === "capturing" || status === "detecting",
          },
        })),
      setSelectedConversations: (ids) =>
        set((s) => ({ conversation: { ...s.conversation, selectedIds: ids } })),
      toggleConversationSelection: (id) =>
        set((s) => {
          const selected = s.conversation.selectedIds.includes(id)
            ? s.conversation.selectedIds.filter((i) => i !== id)
            : [...s.conversation.selectedIds, id];
          return { conversation: { ...s.conversation, selectedIds: selected } };
        }),
      clearConversationSelection: () =>
        set((s) => ({ conversation: { ...s.conversation, selectedIds: [] } })),

      // Global
      reset: () =>
        set({
          ui: { ...initialUIState },
          workspace: { ...initialWorkspaceSlice },
          project: { ...initialProjectSlice },
          settings: { ...initialSettingsSlice },
          search: { ...initialSearchSlice },
          timeline: { ...initialTimelineSlice },
          connector: { ...initialConnectorSlice },
          notification: { ...initialNotificationSlice },
          conversation: { ...initialConversationSlice },
        }),
    }),
    {
      name: "omni-store",
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            /* ignore */
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            /* ignore */
          }
        },
      })),
      partialize: (state) => ({
        ui: {
          theme: state.ui.theme,
          sidebarOpen: state.ui.sidebarOpen,
          sidebarWidth: state.ui.sidebarWidth,
          animationsEnabled: state.ui.animationsEnabled,
          glassmorphismEnabled: state.ui.glassmorphismEnabled,
          density: state.ui.density,
        },
        settings: state.settings,
        workspace: {
          id: state.workspace.id,
          name: state.workspace.name,
          projects: state.workspace.projects,
          activeProjectId: state.workspace.activeProjectId,
          recentProjectIds: state.workspace.recentProjectIds,
        },
        conversation: {
          conversations: state.conversation.conversations,
          projectConversations: Array.from(state.conversation.projectConversations.entries()),
        },
      }),
    },
  ),
);
