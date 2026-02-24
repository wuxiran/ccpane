import { create } from "zustand";

interface DialogState {
  // Settings
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;

  // Journal
  journalOpen: boolean;
  journalWorkspaceName: string;
  openJournal: (workspaceName: string) => void;
  closeJournal: () => void;

  // Local History
  localHistoryOpen: boolean;
  localHistoryProjectPath: string;
  localHistoryFilePath: string;
  openLocalHistory: (projectPath: string, filePath?: string) => void;
  closeLocalHistory: () => void;

  // Session Cleaner
  sessionCleanerOpen: boolean;
  sessionCleanerProjectPath: string;
  openSessionCleaner: (projectPath: string) => void;
  closeSessionCleaner: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  // Settings
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  // Journal
  journalOpen: false,
  journalWorkspaceName: "",
  openJournal: (workspaceName) => set({ journalOpen: true, journalWorkspaceName: workspaceName }),
  closeJournal: () => set({ journalOpen: false }),

  // Local History
  localHistoryOpen: false,
  localHistoryProjectPath: "",
  localHistoryFilePath: "",
  openLocalHistory: (projectPath, filePath) =>
    set({ localHistoryOpen: true, localHistoryProjectPath: projectPath, localHistoryFilePath: filePath || "" }),
  closeLocalHistory: () => set({ localHistoryOpen: false, localHistoryFilePath: "" }),

  // Session Cleaner
  sessionCleanerOpen: false,
  sessionCleanerProjectPath: "",
  openSessionCleaner: (projectPath) => set({ sessionCleanerOpen: true, sessionCleanerProjectPath: projectPath }),
  closeSessionCleaner: () => set({ sessionCleanerOpen: false }),
}));
