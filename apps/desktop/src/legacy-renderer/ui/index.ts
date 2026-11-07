/**
 * Shared UI components and hooks for tool modules.
 *
 * - useSplitPane: draggable split-pane hook
 * - HelpModal: shared help modal
 * - JsonTreeView: collapsible JSON tree view
 * - useTextSearch / SearchBar: in-panel text search (Cmd/Ctrl+F)
 */
export { useSplitPane } from './SplitPane';
export { HelpModal } from './HelpModal';
export { JsonTreeView } from './JsonTreeView';
export { useTextSearch, SearchBar } from './TextSearch';
export type { TextSearchResult } from './TextSearch';
export { ToolSection, ToolField, ToolInput, ToolSelect, ToolTextarea, ToolButton } from './ToolUI';
