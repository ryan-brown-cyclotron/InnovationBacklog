/**
 * @momentum/sdk
 * Minimal SDK for the Momentum reference architecture.
 */

export type {
  ActivityResponseItem,
  AddCommentRequest,
  AddVoteRequest,
  AppUser,
  AttachmentResponse,
  CommentResponse,
  CreateRequestRequest,
  CreateSolutionRequest,
  LinkSolutionRequestBody,
  RemoveVoteRequest,
  RequestResponse,
  RequestSummaryEntry,
  SearchResponse,
  SearchResponseItem,
  SelectCanonicalSolutionRequestBody,
  SetVisibilityRequest,
  SolutionResponse,
  SolutionSummaryEntry,
  SolutionUseResponse,
  StartSolutionUseRequest,
  UpdateRequestRequest,
  UpdateSolutionUseRequest,
  UploadAttachmentRequest,
  VoteSummaryResponse,
} from "@momentum/contracts";
export type { IService } from "./types.js";

export {
  NS_SLUG,
  NS_DISPLAY,
  NS_ENV,
  toolName,
  appResourceUri,
  ENV_STORAGE_CONNECTION_STRING,
  mcpUri,
} from "./namespace.js";

export { MomentumContextProvider, useMomentumContext } from "./context.js";
export type { MomentumContext } from "./context.js";
