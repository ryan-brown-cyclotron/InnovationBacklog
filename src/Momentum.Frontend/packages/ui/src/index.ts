export { AppShell } from "./AppShell.js";
export { App } from "./App.js";
export type { AppShellProps } from "./AppShell.js";
export type {
  View,
  ContributionKind,
  Request,
  Solution,
  RequestSolution,
  SolutionUse,
  Comment,
  Attachment,
  VoteSummary,
  SearchItem,
  SearchResult,
  DiscoveryItem,
  DiscoveryScope,
  ActivityRecord,
} from "./types.js";
/**
 * Presentational components: props in, callbacks out, no data access.
 *
 * These are the ones any host can mount, and the set the Innovation Backlog code
 * app composes its pages from. Components that still fetch their own data through
 * `useApi` are deliberately NOT exported — a component that reaches for a backend
 * can only be used by a host that has that particular backend, which is how a
 * shared component library stops being shared. They move into this list as their
 * fetches are lifted into the pages that own them.
 */
export { TagList } from "./Components/TagList/TagList.js";
export { ActivitySplit } from "./Components/ActivitySplit/ActivitySplit.js";
export { Empty, ContextualEmpty } from "./Components/Empty/Empty.js";
export { LoadingScreen } from "./Components/LoadingScreen/LoadingScreen.js";
export type { LoadingScreenProps } from "./Components/LoadingScreen/LoadingScreen.js";
export { SectionHeading } from "./Components/SectionHeading/SectionHeading.js";
export { Status } from "./Components/Status/Status.js";
export { PageHeader } from "./Components/PageHeader/PageHeader.js";
export { PersonAvatar } from "./Components/PersonAvatar/PersonAvatar.js";
export { AvatarStack } from "./Components/AvatarStack/AvatarStack.js";
export { DecisionForm } from "./Components/DecisionForm/DecisionForm.js";
export { ModalShell } from "./Components/Modal/ModalShell.js";
export { ProgressTrack } from "./Components/ProgressTrack/ProgressTrack.js";
export { useApi } from "./Hooks/useApi.js";
export { useWorkspace } from "./Hooks/useWorkspace.js";
export { useSearch } from "./Hooks/useSearch.js";
export { useReveal } from "./Hooks/useReveal.js";
export { useDebounce } from "./Hooks/useDebounce.js";
