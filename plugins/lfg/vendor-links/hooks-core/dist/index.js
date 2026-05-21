// @bun
// vendor/omo-standalone/packages/hooks-core/src/index.ts
import { processFilePathForAgentsInjection } from "@oh-my-opencode/agents-md-core";
import { parseApplyPatchRequests, runCommentChecker } from "@oh-my-opencode/comment-checker-core";
import { resolveModelWithFallback } from "@oh-my-opencode/model-core";
import { findRuleFiles, shouldApplyRule } from "@oh-my-opencode/rules-engine";
import { createUlwLoopEngine, runTrackedUlw } from "@oh-my-opencode/ulw-kernel";
import { replaceToolArgs } from "@oh-my-opencode/utils";
import { isAbsolute, relative, resolve } from "path";
var QUESTION_LABEL_MAX_LENGTH = 30;
var AUTO_SLASH_COMMAND_TAG_OPEN = "<auto-slash-command>";
var AUTO_SLASH_COMMAND_TAG_CLOSE = "</auto-slash-command>";
var KEYWORD_CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
var KEYWORD_INLINE_CODE_PATTERN = /`[^`]+`/g;
var SLASH_COMMAND_LEAD_PATTERN = /^\s*\/[a-zA-Z][\w-]*(?:\s|$)/;
var SLASH_COMMAND_PATTERN = /^\/([a-zA-Z@][\w.:@/-]*)\s*(.*)/;
var EXCLUDED_SLASH_COMMANDS = new Set(["ralph-loop", "cancel-ralph", "ulw-loop"]);
var SEARCH_PATTERN = /\b(search|find|locate|lookup|look\s*up|explore|discover|scan|grep|query|browse|detect|trace|seek|track|pinpoint|hunt)\b|where\s+is|show\s+me|list\s+all|\uAC80\uC0C9|\uCC3E\uC544|\uD0D0\uC0C9|\uC870\uD68C|\uC2A4\uCE94|\uC11C\uCE58|\uB4A4\uC838|\uCC3E\uAE30|\uC5B4\uB514|\uCD94\uC801|\uD0D0\uC9C0|\uCC3E\uC544\uBD10|\uCC3E\uC544\uB0B4|\uBCF4\uC5EC\uC918|\uBAA9\uB85D|\u691C\u7D22|\u63A2\u3057\u3066|\u898B\u3064\u3051\u3066|\u30B5\u30FC\u30C1|\u63A2\u7D22|\u30B9\u30AD\u30E3\u30F3|\u3069\u3053|\u767A\u898B|\u635C\u7D22|\u898B\u3064\u3051\u51FA\u3059|\u4E00\u89A7|\u641C\u7D22|\u67E5\u627E|\u5BFB\u627E|\u67E5\u8BE2|\u68C0\u7D22|\u5B9A\u4F4D|\u626B\u63CF|\u53D1\u73B0|\u5728\u54EA\u91CC|\u627E\u51FA\u6765|\u5217\u51FA|t\u00ECm ki\u1EBFm|tra c\u1EE9u|\u0111\u1ECBnh v\u1ECB|qu\u00E9t|ph\u00E1t hi\u1EC7n|truy t\u00ECm|t\u00ECm ra|\u1EDF \u0111\u00E2u|li\u1EC7t k\u00EA/i;
var TEAM_PATTERN = /\bteam[\s_-]?mode\b|(?<![\uAC00-\uD7A3])(?:\uD300\s*\uBAA8\uB4DC|\uD300\uC73C\uB85C)/i;
var HYPERPLAN_PATTERN = /\b(hyperplan|hpp)\b/i;
var HYPERPLAN_ULTRAWORK_PATTERN = /\b(?:hpp|hyperplan)\s+(?:ulw|ultrawork)\b|\b(?:ulw|ultrawork)\s+(?:hpp|hyperplan)\b/i;
var HASHLINE_NIBBLE_STR = "ZPMQVRWSNKTXJBYH";
var HASHLINE_DICT = Array.from({ length: 256 }, (_, index) => `${HASHLINE_NIBBLE_STR[index >>> 4]}${HASHLINE_NIBBLE_STR[index & 15]}`);
var COLON_READ_LINE_PATTERN = /^\s*(\d+): ?(.*)$/;
var PIPE_READ_LINE_PATTERN = /^\s*(\d+)\| ?(.*)$/;
var OPENCODE_LINE_TRUNCATION_SUFFIX = "... (line truncated to 2000 chars)";
var WRITE_SUCCESS_MARKER = "File written successfully.";
var TOKEN_LIMIT_PATTERNS = [/(\d+)\s*tokens?\s*>\s*(\d+)\s*maximum/i, /prompt.*?(\d+).*?tokens.*?exceeds.*?(\d+)/i, /(\d+).*?tokens.*?limit.*?(\d+)/i, /context.*?length.*?(\d+).*?maximum.*?(\d+)/i, /max.*?context.*?(\d+).*?but.*?(\d+)/i];
var TOKEN_LIMIT_KEYWORDS = ["prompt is too long", "is too long", "context_length_exceeded", "max_tokens", "token limit", "context length", "too many tokens", "non-empty content"];
var THINKING_BLOCK_ERROR_PATTERNS = [/thinking.*first block/i, /first block.*thinking/i, /must.*start.*thinking/i, /thinking.*redacted_thinking/i, /expected.*thinking.*found/i, /thinking.*disabled.*cannot.*contain/i];
var TEAM_MODE_STATUS_MARKER = '<team_mode_status enabled="true">';
var THINKING_SUMMARY_MAX_CHARS = 500;
var RUNTIME_RETRYABLE_ERROR_PATTERNS = [/rate.?limit/i, /too.?many.?requests/i, /quota\s+will\s+reset\s+after/i, /quota.?exceeded/i, /service.?unavailable/i, /overloaded/i, /temporarily.?unavailable/i, /try.?again/i, /(?:^|\s)429(?:\s|$)/, /(?:^|\s)503(?:\s|$)/, /(?:^|\s)529(?:\s|$)/];
var PREEMPTIVE_COMPACTION_THRESHOLD = 0.78;
var PREEMPTIVE_COMPACTION_COOLDOWN_MS = 60000;
var START_WORK_TEMPLATE_MARKER = "You are starting a Sisyphus work session.";
var START_WORK_KEYWORD_PATTERN = /\b(ultrawork|ulw)\b/gi;
var WORKTREE_FLAG_PATTERN = /--worktree(?:\s+(\S+))?/;
var WRAPPING_QUOTES_PATTERN = /^(['"`])([\s\S]*)\1$/;
var TASK_SECTION_HEADER_PATTERN = /^##\s*1\.\s*TASK\s*$/i;
var TODO_TASK_LINE_PATTERN = /^(?:[-*]\s*\[\s*\]\s*)?(\d+)\.\s+(.+)$/;
var FINAL_WAVE_TASK_LINE_PATTERN = /^(?:[-*]\s*\[\s*\]\s*)?(F\d+)\.\s+(.+)$/i;
var ATLAS_SINGLE_TASK_DIRECTIVE = "Complete exactly one assigned task. Do not broaden scope.";
var HOOKS = [
  hook("todo-continuation-enforcer", "createTodoContinuationEnforcer", "loop", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("context-window-monitor", "createContextWindowMonitorHook", "context-window", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("session-notification", "createSessionNotification", "notification", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("session-notification-sender", "sendSessionNotification", "notification", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", sourceFile: "session-notification-sender.ts" }),
  hook("session-notification-formatting", "buildWindowsToastScript", "notification", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", sourceFile: "session-notification-formatting.ts" }),
  hook("session-todo-status", "hasIncompleteTodos", "todo", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", sourceFile: "session-todo-status.ts" }),
  hook("session-notification-scheduler", "createIdleNotificationScheduler", "notification", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", sourceFile: "session-notification-scheduler.ts" }),
  hook("session-recovery", "createSessionRecoveryHook", "recovery", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("comment-checker", "createCommentCheckerHooks", "quality", "behavior-mapped", { standalonePackage: "@oh-my-opencode/comment-checker-core" }),
  hook("tool-output-truncator", "createToolOutputTruncatorHook", "tool-output", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", sourceFile: "tool-output-truncator.ts" }),
  hook("directory-agents-injector", "createDirectoryAgentsInjectorHook", "context", "behavior-mapped", { standalonePackage: "@oh-my-opencode/agents-md-core" }),
  hook("directory-readme-injector", "createDirectoryReadmeInjectorHook", "context", "behavior-mapped", { standalonePackage: "@oh-my-opencode/agents-md-core" }),
  hook("empty-task-response-detector", "createEmptyTaskResponseDetectorHook", "recovery", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", sourceFile: "empty-task-response-detector.ts" }),
  hook("anthropic-context-window-limit-recovery", "createAnthropicContextWindowLimitRecoveryHook", "context-window", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("think-mode", "createThinkModeHook", "model", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("anthropic-effort", "createAnthropicEffortHook", "model", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("model-fallback", "createModelFallbackHook", "model", "behavior-mapped", { standalonePackage: "@oh-my-opencode/model-core" }),
  hook("claude-code-hooks", "createClaudeCodeHooksHook", "plugin-loader", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("rules-injector", "createRulesInjectorHook", "context", "behavior-mapped", { standalonePackage: "@oh-my-opencode/rules-engine" }),
  hook("background-notification", "createBackgroundNotificationHook", "notification", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("auto-update-checker", "createAutoUpdateCheckerHook", "maintenance", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("startup-toast", "showStartupToast", "maintenance", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", originalSource: "src/hooks/auto-update-checker/hook/startup-toasts.ts" }),
  hook("agent-usage-reminder", "createAgentUsageReminderHook", "prompting", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("keyword-detector", "createKeywordDetectorHook", "prompting", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("non-interactive-env", "createNonInteractiveEnvHook", "environment", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("interactive-bash-session", "createInteractiveBashSessionHook", "terminal", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("thinking-block-validator", "createThinkingBlockValidatorHook", "validation", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("team-mailbox-injector", "createTeamMailboxInjector", "team", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("team-mode-status-injector", "createTeamModeStatusInjector", "team", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("tool-pair-validator", "createToolPairValidatorHook", "validation", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("category-skill-reminder", "createCategorySkillReminderHook", "skills", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("ralph-loop", "createRalphLoopHook", "loop", "behavior-mapped", { standalonePackage: "@oh-my-opencode/ulw-kernel" }),
  hook("no-sisyphus-gpt", "createNoSisyphusGptHook", "model", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("no-hephaestus-non-gpt", "createNoHephaestusNonGptHook", "model", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("auto-slash-command", "createAutoSlashCommandHook", "commands", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("edit-error-recovery", "createEditErrorRecoveryHook", "recovery", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("prometheus-md-only", "createPrometheusMdOnlyHook", "guard", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("sisyphus-junior-notepad", "createSisyphusJuniorNotepadHook", "guard", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("task-resume-info", "createTaskResumeInfoHook", "task", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("start-work", "createStartWorkHook", "workflow", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("atlas", "createAtlasHook", "workflow", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("team-tool-gating", "createTeamToolGating", "team", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("delegate-task-retry", "createDelegateTaskRetryHook", "task", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("question-label-truncator", "createQuestionLabelTruncatorHook", "question", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("stop-continuation-guard", "createStopContinuationGuardHook", "loop", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("compaction-context-injector", "createCompactionContextInjector", "context-window", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("compaction-todo-preserver", "createCompactionTodoPreserverHook", "context-window", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("unstable-agent-babysitter", "createUnstableAgentBabysitterHook", "agent", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("preemptive-compaction", "createPreemptiveCompactionHook", "context-window", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", sourceFile: "preemptive-compaction.ts" }),
  hook("tasks-todowrite-disabler", "createTasksTodowriteDisablerHook", "task", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("runtime-fallback", "createRuntimeFallbackHook", "runtime", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("write-existing-file-guard", "createWriteExistingFileGuardHook", "guard", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("bash-file-read-guard", "createBashFileReadGuardHook", "guard", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", sourceFile: "../bash-file-read-guard.ts" }),
  hook("hashline-read-enhancer", "createHashlineReadEnhancerHook", "tool-output", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("json-error-recovery", "createJsonErrorRecoveryHook", "recovery", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("read-image-resizer", "createReadImageResizerHook", "tool-output", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("todo-description-override", "createTodoDescriptionOverrideHook", "todo", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("webfetch-redirect-guard", "createWebFetchRedirectGuardHook", "guard", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("legacy-plugin-toast", "createLegacyPluginToastHook", "notification", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("fsync-skip-warning", "createFsyncSkipWarningHook", "guard", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" }),
  hook("notepad-write-guard", "createNotepadWriteGuardHook", "guard", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core", sourceFile: "index.ts" }),
  hook("plan-format-validator", "createPlanFormatValidatorHook", "workflow", "behavior-mapped", { standalonePackage: "@oh-my-opencode/hooks-core" })
];
var standaloneHookBehaviors = {
  commentChecker: { parseApplyPatchRequests, runCommentChecker },
  directoryContext: { processFilePathForAgentsInjection },
  rules: { findRuleFiles, shouldApplyRule },
  modelFallback: { resolveModelWithFallback },
  modelAgentGuard: { createModelAgentGuardHook, resolveModelAgentGuard, isGptModel, isGptNativeSisyphusModel, createThinkModeHook, resolveThinkMode, detectThinkKeyword, isAlreadyHighReasoningVariant, createAnthropicEffortHook, resolveAnthropicEffort, isClaudeProvider, isOpusModel, isEffortUnsupportedModel, shouldSkipForInternalAgent },
  thinkingBlockValidator: { createThinkingBlockValidatorHook, repairThinkingBlockMessages, hasSignedThinkingBlocksInHistory },
  toolGuards: { createBashFileReadGuardHook, isSimpleFileReadCommand, createWebFetchRedirectGuardHook, normalizeWebFetchRedirectOutput, buildWebFetchRedirectLimitMessage, createWriteExistingFileGuardHook, resolveWriteExistingFileGuard, isOmoWorkspacePath, isOverwriteEnabled },
  outputRecovery: { createEmptyTaskResponseDetectorHook, createJsonErrorRecoveryHook, createToolOutputTruncatorHook, createEditErrorRecoveryHook, recoverEmptyTaskOutput, recoverJsonErrorOutput, recoverEditErrorOutput, truncateToolOutput },
  promptDetectors: { createKeywordDetectorHook, detectKeywordsWithType, detectKeywords, removeKeywordCodeBlocks, looksLikeSlashCommand },
  slashCommands: { createAutoSlashCommandHook, parseSlashCommand, detectSlashCommand, findSlashCommandPartIndex, formatSlashCommandTemplate },
  continuation: { createTodoContinuationEnforcer, trackContinuationProgress, getTodoProgressSnapshot },
  todoAndTask: { hasIncompleteTodos, createTasksTodowriteDisablerHook, applyTodoDescriptionOverride, createNotepadWriteGuardHook, isNotepadPath, shouldBlockTaskTodoTool },
  taskRecovery: { createToolPairValidatorHook, repairMissingToolResults, createDelegateTaskRetryHook, addDelegateTaskRetryGuidance, createTaskResumeInfoHook, appendTaskResumeInfo, createStopContinuationGuardHook },
  hostGuards: { createNonInteractiveEnvHook, buildNonInteractiveGitCommand, detectBannedInteractiveCommand, createCategorySkillReminderHook, buildCategorySkillReminderMessage, formatFsyncSkipWarning, describePathClassification, createLegacyPluginToastDecisionHook, resolveLegacyPluginToastDecision, createPrometheusMdOnlyHook, isPrometheusAgent, isPrometheusAllowedFile, createSisyphusJuniorNotepadHook, addSisyphusJuniorNotepadDirective, createAgentUsageReminderHook, shouldRemindAgentUsage, isOrchestratorAgentForReminder },
  notifications: { escapeAppleScriptText, escapePowerShellSingleQuotedText, buildWindowsToastScript, getDefaultNotificationSoundPath, normalizeNotificationPlatform, createBackgroundNotificationHook, shouldForwardBackgroundEvent, createSessionNotification, buildReadyNotificationContent, extractSessionNotificationText, findLastSessionNotificationMessage },
  notificationScheduler: { createIdleNotificationScheduler, createIdleNotificationState },
  team: { createTeamToolGating, resolveTeamToolGate, isUniversalTeamTool, createTeamMailboxInjector, injectTeamMailboxMessage, buildTeamMailboxTurnMarker, createTeamModeStatusInjector, injectTeamModeStatus, buildTeamModeStatusContent },
  contextWindow: { createContextWindowMonitorHook, buildContextWindowReminder, appendContextWindowStatus, shouldWarnContextWindow, parseAnthropicTokenLimitError, formatBytes, isTokenLimitErrorText, createCompactionContextInjector, buildCompactionContextPrompt, createTailMonitorState, finalizeTrackedAssistantMessage, shouldTreatAssistantPartAsOutput, trackAssistantOutput, extractTodos, hasDetailedTodos, isAtlasBootstrapTodoList, shouldRestoreOverCurrentTodos, replaceAtlasBootstrapTodos, shouldRunPreemptiveCompaction, buildPreemptiveCompactionFailureToast },
  sessionRecovery: { createSessionRecoveryHook, detectErrorType, extractMessageIndex, extractUnavailableToolName },
  unstableAgent: { getMessageInfo, getMessageParts, extractMessages, isUnstableTask, buildUnstableAgentReminder },
  runtimeFallback: { createRuntimeFallbackHook, getRuntimeFallbackErrorMessage, extractRuntimeFallbackStatusCode, classifyRuntimeFallbackErrorType, containsRuntimeFallbackErrorContent, isRuntimeFallbackRetryableError },
  claudeCodeHooks: { createClaudeCodeHooksHook, listClaudeCodeHookNames },
  autoUpdate: { isPrereleaseVersion, isDistTag, isPrereleaseOrDistTag, extractChannel, createAutoUpdateCheckerHook, shouldShowAutoUpdateToast },
  workflow: { createStartWorkHook, parseUserRequest, parseWorktreeListPorcelain, resolveStartWorkTemplate, createAtlasHook, parseTrackedTaskFromPrompt, buildAtlasSingleTaskPrompt, shouldWarnAtlasDirectModification, resolveAtlasPendingTaskRef },
  planFormat: { createPlanFormatValidatorHook, validatePlanFormat, countRawTopLevelPlanCheckboxes, buildPlanFormatWarning, isPlanFilePath },
  terminal: { parseTmuxCommand, buildInteractiveBashSessionReminder, createInteractiveBashSessionHook, isOmoTmuxSession },
  imageResizer: { calculateTargetDimensions, calculateImageTokens, formatImageResizeAppendix },
  hashline: { createHashlineReadEnhancerHook, transformHashlineReadOutput, formatHashLine, computeLineHash, buildHashlineWriteSuccessOutput },
  ralphLoop: { createUlwLoopEngine, runTrackedUlw },
  questionLabelTruncator: { createQuestionLabelTruncatorHook, truncateQuestionLabels, truncateQuestionLabel }
};
function getStandaloneHookBehavior(name) {
  if (name === "comment-checker")
    return standaloneHookBehaviors.commentChecker;
  if (name === "directory-agents-injector" || name === "directory-readme-injector")
    return standaloneHookBehaviors.directoryContext;
  if (name === "rules-injector")
    return standaloneHookBehaviors.rules;
  if (name === "model-fallback")
    return standaloneHookBehaviors.modelFallback;
  if (name === "no-sisyphus-gpt" || name === "no-hephaestus-non-gpt" || name === "think-mode" || name === "anthropic-effort")
    return standaloneHookBehaviors.modelAgentGuard;
  if (name === "thinking-block-validator")
    return standaloneHookBehaviors.thinkingBlockValidator;
  if (name === "bash-file-read-guard" || name === "webfetch-redirect-guard" || name === "write-existing-file-guard")
    return standaloneHookBehaviors.toolGuards;
  if (name === "empty-task-response-detector" || name === "json-error-recovery" || name === "tool-output-truncator" || name === "edit-error-recovery")
    return standaloneHookBehaviors.outputRecovery;
  if (name === "keyword-detector")
    return standaloneHookBehaviors.promptDetectors;
  if (name === "auto-slash-command")
    return standaloneHookBehaviors.slashCommands;
  if (name === "todo-continuation-enforcer")
    return standaloneHookBehaviors.continuation;
  if (name === "session-todo-status" || name === "tasks-todowrite-disabler" || name === "todo-description-override" || name === "notepad-write-guard")
    return standaloneHookBehaviors.todoAndTask;
  if (name === "tool-pair-validator" || name === "delegate-task-retry" || name === "task-resume-info" || name === "stop-continuation-guard")
    return standaloneHookBehaviors.taskRecovery;
  if (name === "non-interactive-env" || name === "category-skill-reminder" || name === "fsync-skip-warning" || name === "legacy-plugin-toast" || name === "prometheus-md-only" || name === "sisyphus-junior-notepad" || name === "agent-usage-reminder")
    return standaloneHookBehaviors.hostGuards;
  if (name === "session-notification-formatting" || name === "session-notification-sender" || name === "background-notification" || name === "session-notification")
    return standaloneHookBehaviors.notifications;
  if (name === "session-notification-scheduler")
    return standaloneHookBehaviors.notificationScheduler;
  if (name === "session-recovery")
    return standaloneHookBehaviors.sessionRecovery;
  if (name === "team-tool-gating" || name === "team-mailbox-injector" || name === "team-mode-status-injector")
    return standaloneHookBehaviors.team;
  if (name === "context-window-monitor" || name === "anthropic-context-window-limit-recovery" || name === "compaction-context-injector" || name === "compaction-todo-preserver")
    return standaloneHookBehaviors.contextWindow;
  if (name === "unstable-agent-babysitter")
    return standaloneHookBehaviors.unstableAgent;
  if (name === "runtime-fallback")
    return standaloneHookBehaviors.runtimeFallback;
  if (name === "claude-code-hooks")
    return standaloneHookBehaviors.claudeCodeHooks;
  if (name === "auto-update-checker" || name === "startup-toast")
    return standaloneHookBehaviors.autoUpdate;
  if (name === "start-work" || name === "atlas")
    return standaloneHookBehaviors.workflow;
  if (name === "plan-format-validator")
    return standaloneHookBehaviors.planFormat;
  if (name === "interactive-bash-session")
    return standaloneHookBehaviors.terminal;
  if (name === "read-image-resizer")
    return standaloneHookBehaviors.imageResizer;
  if (name === "hashline-read-enhancer")
    return standaloneHookBehaviors.hashline;
  if (name === "ralph-loop")
    return standaloneHookBehaviors.ralphLoop;
  if (name === "question-label-truncator")
    return standaloneHookBehaviors.questionLabelTruncator;
  return;
}
function truncateQuestionLabel(label, maxLength = QUESTION_LABEL_MAX_LENGTH) {
  if (label.length <= maxLength)
    return label;
  return `${label.slice(0, maxLength - 3)}...`;
}
function truncateQuestionLabels(args) {
  if (!Array.isArray(args.questions))
    return args;
  return {
    ...args,
    questions: args.questions.map((question) => ({
      ...question,
      options: question.options?.map((option) => ({
        ...option,
        label: truncateQuestionLabel(option.label)
      })) ?? []
    }))
  };
}
function createQuestionLabelTruncatorHook() {
  return {
    "tool.execute.before": async (input, output) => {
      const toolName = input.tool?.toLowerCase();
      if (toolName !== "askuserquestion" && toolName !== "ask_user_question")
        return;
      if (!hasQuestions(output.args))
        return;
      replaceToolArgs(output, { questions: truncateQuestionLabels(output.args).questions });
    }
  };
}
function createModelAgentGuardHook(options = {}) {
  return {
    "chat.message": async (input, output) => {
      const decision = resolveModelAgentGuard(input.agent ?? options.sessionAgent, input.model, options);
      if (decision.agent !== undefined)
        input.agent = decision.agent;
      if (decision.outputAgent !== undefined && output?.message)
        output.message.agent = decision.outputAgent;
      if (decision.variant !== undefined && output?.message && output.message.variant === undefined)
        output.message.variant = decision.variant;
      return decision;
    }
  };
}
var THINK_KEYWORDS = ["\uC0DD\uAC01", "\uAC80\uD1A0", "\uC81C\uB300\uB85C", "\u601D\u8003", "\u8003\u8651", "\u8003\u616E", "\u8003\u3048", "\u719F\u8003", "\u0938\u094B\u091A", "\u0935\u093F\u091A\u093E\u0930", "\u062A\u0641\u0643\u064A\u0631", "\u062A\u0623\u0645\u0644", "\u099A\u09BF\u09A8\u09CD\u09A4\u09BE", "\u09AD\u09BE\u09AC\u09A8\u09BE", "\u0434\u0443\u043C\u0430\u0442\u044C", "\u0434\u0443\u043C\u0430\u0439", "\u0440\u0430\u0437\u043C\u044B\u0448\u043B\u044F\u0442\u044C", "\u0440\u0430\u0437\u043C\u044B\u0448\u043B\u044F\u0439", "pensar", "pense", "refletir", "reflita", "piensa", "reflexionar", "reflexiona", "penser", "pense", "r\xE9fl\xE9chir", "r\xE9fl\xE9chis", "denken", "denk", "nachdenken", "suy ngh\u0129", "c\xE2n nh\u1EAFc", "d\xFC\u015F\xFCn", "d\xFC\u015F\xFCnmek", "pensare", "pensa", "riflettere", "rifletti", "\u0E04\u0E34\u0E14", "\u0E1E\u0E34\u0E08\u0E32\u0E23\u0E13\u0E32", "my\u015Bl", "my\u015Ble\u0107", "zastan\xF3w", "nadenken", "berpikir", "pikir", "pertimbangkan", "\u0434\u0443\u043C\u0430\u0442\u0438", "\u0434\u0443\u043C\u0430\u0439", "\u0440\u043E\u0437\u0434\u0443\u043C\u0443\u0432\u0430\u0442\u0438", "\u03C3\u03BA\u03AD\u03C8\u03BF\u03C5", "\u03C3\u03BA\u03AD\u03C6\u03C4\u03BF\u03BC\u03B1\u03B9", "myslet", "mysli", "p\u0159em\xFD\u0161let", "g\xE2nde\u0219te", "g\xE2ndi", "reflect\u0103", "t\xE4nka", "t\xE4nk", "fundera", "gondolkodj", "gondolkodni", "ajattele", "ajatella", "pohdi", "t\xE6nk", "t\xE6nke", "overvej", "tenk", "tenke", "gruble", "\u05D7\u05E9\u05D5\u05D1", "\u05DC\u05D7\u05E9\u05D5\u05D1", "\u05DC\u05D4\u05E8\u05D4\u05E8", "fikir", "berfikir"];
var CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
var INLINE_CODE_PATTERN = /`[^`]+`/g;
function detectThinkKeyword(text) {
  const textWithoutCode = text.replace(CODE_BLOCK_PATTERN, "").replace(INLINE_CODE_PATTERN, "");
  return /\b(?:ultrathink|think)\b/i.test(textWithoutCode) || THINK_KEYWORDS.some((keyword) => textWithoutCode.toLowerCase().includes(keyword.toLowerCase()));
}
function isAlreadyHighReasoningVariant(modelID) {
  const normalized = modelID.replace(/(gpt-\d+)\.(\d+)/g, "$1-$2");
  const base = normalized.includes("/") ? normalized.split("/").pop() ?? normalized : normalized;
  return base.endsWith("-high");
}
function resolveThinkMode(parts, model, message) {
  const promptText = parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
  const state = { requested: false, modelSwitched: false, variantSet: false };
  if (!detectThinkKeyword(promptText))
    return { state };
  state.requested = true;
  if (typeof message.variant === "string" || !model)
    return { state };
  state.providerID = model.providerID;
  state.modelID = model.modelID;
  if (isAlreadyHighReasoningVariant(model.modelID))
    return { state };
  state.variantSet = true;
  return { state, variant: "high" };
}
function createThinkModeHook() {
  const states = new Map;
  return {
    getState: (sessionID) => states.get(sessionID),
    clear: (sessionID) => {
      states.delete(sessionID);
    },
    "chat.message": async (input, output) => {
      const result = resolveThinkMode(output.parts, input.model, output.message);
      if (result.variant)
        output.message.variant = result.variant;
      states.set(input.sessionID, result.state);
    },
    event: async ({ event }) => {
      if (event.type !== "session.deleted")
        return;
      const sessionID = extractSessionId(event.properties);
      if (sessionID)
        states.delete(sessionID);
    }
  };
}
function resolveModelAgentGuard(agent, model, options = {}) {
  const agentKey = getAgentConfigKey(agent ?? "");
  const modelID = model?.modelID;
  if (agentKey === "sisyphus" && modelID && isGptNativeSisyphusModel(modelID)) {
    return { variant: getNativeSisyphusGptVariant(model) };
  }
  if (agentKey === "sisyphus" && modelID && isGptModel(modelID)) {
    return {
      agent: "hephaestus",
      outputAgent: "hephaestus",
      sessionAgent: "hephaestus",
      toast: {
        title: "NEVER Use Sisyphus with GPT",
        message: `Sisyphus works best with Claude Opus, and works fine with Kimi/GLM models.
Do NOT use Sisyphus with GPT (except GPT-5.4 and GPT-5.5 which have specialized support).
For other GPT models, always use Hephaestus.`,
        variant: "error"
      }
    };
  }
  if (agentKey === "hephaestus" && modelID && !isGptModel(modelID)) {
    const allowed = options.allowHephaestusNonGptModel === true;
    return {
      agent: allowed ? undefined : "sisyphus",
      outputAgent: allowed ? undefined : "sisyphus",
      sessionAgent: allowed ? undefined : "sisyphus",
      toast: {
        title: "NEVER Use Hephaestus with Non-GPT",
        message: `Hephaestus is designed exclusively for GPT models.
Hephaestus is trash without GPT.
For Claude/Kimi/GLM models, always use Sisyphus.`,
        variant: allowed ? "warning" : "error"
      }
    };
  }
  return {};
}
var ANTHROPIC_OPUS_PATTERN = /claude-.*opus/i;
var ANTHROPIC_EFFORT_UNSUPPORTED_PATTERN = /claude-.*haiku/i;
var ANTHROPIC_INTERNAL_SKIP_AGENTS = new Set(["title", "summary", "compaction"]);
function isClaudeProvider(providerID, modelID) {
  if (["anthropic", "google-vertex-anthropic", "opencode"].includes(providerID))
    return true;
  return providerID === "github-copilot" && modelID.toLowerCase().includes("claude");
}
function isOpusModel(modelID) {
  return ANTHROPIC_OPUS_PATTERN.test(normalizeAnthropicModelID(modelID));
}
function isEffortUnsupportedModel(modelID) {
  return ANTHROPIC_EFFORT_UNSUPPORTED_PATTERN.test(normalizeAnthropicModelID(modelID));
}
function shouldSkipForInternalAgent(agentName) {
  return agentName ? ANTHROPIC_INTERNAL_SKIP_AGENTS.has(agentName.trim().toLowerCase()) : false;
}
function resolveAnthropicEffort(input, output, options = {}) {
  const providerID = input.model?.providerID;
  const modelID = input.model?.modelID;
  if (!providerID || !modelID || !isClaudeProvider(providerID, modelID))
    return { reason: "not-claude" };
  if (isEffortUnsupportedModel(modelID))
    return { reason: "unsupported-model" };
  if (shouldSkipForInternalAgent(input.agent?.name))
    return { reason: "internal-agent" };
  const opus = isOpusModel(modelID);
  const constrained = providerID === "github-copilot" || options.isConstrainedProvider?.(providerID) === true;
  if (output.options.effort !== undefined) {
    if (output.options.effort === "max" && constrained)
      return { effort: "high", variant: "high", reason: "clamped-existing" };
    return { effort: String(output.options.effort), reason: "existing-effort" };
  }
  if (input.message.variant !== "max")
    return { reason: "variant-not-max" };
  const effort = opus && !constrained ? "max" : "high";
  return { effort, variant: effort === "max" ? undefined : effort, reason: effort === "max" ? "injected" : "clamped-variant" };
}
function createAnthropicEffortHook(options = {}) {
  return {
    "chat.params": async (input, output) => {
      const decision = resolveAnthropicEffort(input, output, options);
      if (decision.effort !== undefined)
        output.options.effort = decision.effort;
      if (decision.variant !== undefined)
        input.message.variant = decision.variant;
      return decision;
    }
  };
}
function isGptModel(model) {
  return extractModelName(model).toLowerCase().includes("gpt");
}
function isGptNativeSisyphusModel(model) {
  return /gpt-5[.-](?:[4-9]|\d{2,})/i.test(extractModelName(model).toLowerCase());
}
function createThinkingBlockValidatorHook() {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      repairThinkingBlockMessages(output.messages);
    }
  };
}
function repairThinkingBlockMessages(messages) {
  if (messages.length === 0 || !hasSignedThinkingBlocksInHistory(messages))
    return;
  for (let index = 0;index < messages.length; index++) {
    const message = messages[index];
    if (message.info.role !== "assistant")
      continue;
    if (hasContentParts(message.parts) && !startsWithThinkingBlock(message.parts)) {
      const thinkingPart = findPreviousThinkingPart(messages, index);
      if (thinkingPart)
        message.parts.unshift(thinkingPart);
    }
  }
}
function hasSignedThinkingBlocksInHistory(messages) {
  return messages.some((message) => message.info.role === "assistant" && message.parts.some(isSignedThinkingPart));
}
var BASH_FILE_READ_WARNING_MESSAGE = "Prefer the Read tool over `cat`/`head`/`tail` for reading file contents. The Read tool provides line numbers and hash anchors for precise editing.";
var FILE_READ_PATTERNS = [
  /^\s*cat\s+(?!-)[^\s|&;]+\s*$/,
  /^\s*head\s+(-n\s+\d+\s+)?(?!-)[^\s|&;]+\s*$/,
  /^\s*tail\s+(-n\s+\d+\s+)?(?!-)[^\s|&;]+\s*$/
];
function isSimpleFileReadCommand(command) {
  return FILE_READ_PATTERNS.some((pattern) => pattern.test(command));
}
function createBashFileReadGuardHook() {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool?.toLowerCase() !== "bash")
        return;
      const command = output.args.command;
      if (typeof command === "string" && isSimpleFileReadCommand(command))
        output.message = BASH_FILE_READ_WARNING_MESSAGE;
    }
  };
}
var MAX_WEBFETCH_REDIRECTS = 10;
var WEBFETCH_REDIRECT_ERROR_PATTERNS = [/redirect/i, /too many redirects/i, /maximum redirects/i];
function buildWebFetchRedirectLimitMessage(url) {
  const suffix = url ? ` for ${url}` : "";
  return `Error: WebFetch failed: exceeded maximum redirects (${MAX_WEBFETCH_REDIRECTS})${suffix}`;
}
function normalizeWebFetchRedirectOutput(output, originalUrl) {
  const isToolError = output.trimStart().toLowerCase().startsWith("error:");
  const isRedirectLoop = WEBFETCH_REDIRECT_ERROR_PATTERNS.some((pattern) => pattern.test(output));
  return isToolError && isRedirectLoop ? buildWebFetchRedirectLimitMessage(originalUrl) : output;
}
function createWebFetchRedirectGuardHook() {
  const pendingFailures = new Map;
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool?.toLowerCase() !== "webfetch")
        return;
      const url = typeof output.args.url === "string" ? output.args.url : undefined;
      if (url && input.sessionID && input.callID && output.args.redirectFailed === true)
        pendingFailures.set(`${input.sessionID}:${input.callID}`, url);
    },
    "tool.execute.after": async (input, output) => {
      if (input.tool?.toLowerCase() !== "webfetch")
        return;
      const key = input.sessionID && input.callID ? `${input.sessionID}:${input.callID}` : undefined;
      const pendingUrl = key ? pendingFailures.get(key) : undefined;
      if (key)
        pendingFailures.delete(key);
      output.output = pendingUrl ? buildWebFetchRedirectLimitMessage(pendingUrl) : normalizeWebFetchRedirectOutput(output.output);
    }
  };
}
function isOverwriteEnabled(value) {
  return value === true || typeof value === "string" && value.toLowerCase() === "true";
}
function isOmoWorkspacePath(filePath) {
  return /(^|[/\\])\.omo([/\\]|$)/.test(filePath);
}
function getPathFromExistingFileGuardArgs(args) {
  return args?.filePath ?? args?.path ?? args?.file_path;
}
function resolveWriteExistingFileGuard(input, args, options) {
  const toolName = input.tool?.toLowerCase();
  if (toolName !== "write" && toolName !== "read")
    return "allow";
  const filePath = getPathFromExistingFileGuardArgs(args);
  if (!filePath)
    return "allow";
  if (toolName === "read") {
    if (input.sessionID && options.exists(filePath)) {
      options.readPermissions.add(filePath);
      return "register-read";
    }
    return "allow";
  }
  const overwriteEnabled = isOverwriteEnabled(args?.overwrite);
  if (!options.exists(filePath) || isOmoWorkspacePath(filePath) || overwriteEnabled)
    return "allow";
  if (input.sessionID && options.readPermissions.delete(filePath))
    return "allow";
  return "block";
}
function createWriteExistingFileGuardHook(options) {
  const readPermissionsBySession = new Map;
  const getReadPermissions = (sessionID) => {
    const existing = readPermissionsBySession.get(sessionID);
    if (existing)
      return existing;
    const created = new Set;
    readPermissionsBySession.set(sessionID, created);
    return created;
  };
  return {
    getReadPermissions,
    "tool.execute.before": async (input, output) => {
      const sessionID = input.sessionID ?? "";
      const args = output.args;
      const decision = resolveWriteExistingFileGuard(input, args, { exists: options.exists, readPermissions: getReadPermissions(sessionID) });
      if ("overwrite" in output.args)
        delete output.args.overwrite;
      if (decision === "block")
        throw new Error("File already exists. Use edit tool instead.");
    },
    event: async ({ event }) => {
      if (event.type !== "session.deleted")
        return;
      const sessionID = extractSessionId(event.properties);
      if (sessionID)
        readPermissionsBySession.delete(sessionID);
    }
  };
}
var EMPTY_TASK_RESPONSE_WARNING = `[Task Empty Response Warning]

Task invocation completed but returned no response. This indicates the agent either:
- Failed to execute properly
- Did not terminate correctly
- Returned an empty result

Note: The call has already completed - you are NOT waiting for a response. Proceed accordingly.`;
function recoverEmptyTaskOutput(tool, output) {
  return (tool === "Task" || tool === "task") && output.trim() === "" ? EMPTY_TASK_RESPONSE_WARNING : output;
}
function createEmptyTaskResponseDetectorHook() {
  return {
    "tool.execute.after": async (input, output) => {
      output.output = recoverEmptyTaskOutput(input.tool ?? "", output.output);
    }
  };
}
var JSON_ERROR_TOOL_EXCLUDE_LIST = ["bash", "read", "glob", "grep", "webfetch", "look_at", "grep_app_searchgithub", "websearch_web_search_exa", "todowrite", "todoread"];
var JSON_ERROR_REMINDER_MARKER = "[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]";
var JSON_ERROR_REMINDER = `
[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]

You sent invalid JSON arguments. The system could not parse your tool call.
STOP and do this NOW:

1. LOOK at the error message above to see what was expected vs what you sent.
2. CORRECT your JSON syntax (missing braces, unescaped quotes, trailing commas, etc).
3. RETRY the tool call with valid JSON.

DO NOT repeat the exact same invalid call.
`;
var JSON_ERROR_EXCLUDED_TOOLS = new Set(JSON_ERROR_TOOL_EXCLUDE_LIST);
var JSON_ERROR_PATTERNS = [/json parse error/i, /failed to parse json/i, /invalid json/i, /malformed json/i, /unexpected end of json input/i, /syntaxerror:\s*unexpected token.*json/i, /json[^\n]*expected '\}'/i, /json[^\n]*unexpected eof/i];
function recoverJsonErrorOutput(tool, output) {
  if (JSON_ERROR_EXCLUDED_TOOLS.has(tool.toLowerCase()) || output.includes(JSON_ERROR_REMINDER_MARKER))
    return output;
  return JSON_ERROR_PATTERNS.some((pattern) => pattern.test(output)) ? `${output}
${JSON_ERROR_REMINDER}` : output;
}
function createJsonErrorRecoveryHook() {
  return {
    "tool.execute.after": async (input, output) => {
      output.output = recoverJsonErrorOutput(input.tool ?? "", output.output);
    }
  };
}
var EDIT_ERROR_PATTERNS = ["oldString and newString must be different", "oldString not found", "oldString found multiple times"];
var EDIT_ERROR_REMINDER = `
[EDIT ERROR - IMMEDIATE ACTION REQUIRED]

You made an Edit mistake. STOP and do this NOW:

1. READ the file immediately to see its ACTUAL current state
2. VERIFY what the content really looks like (your assumption was wrong)
3. APOLOGIZE briefly to the user for the error
4. CONTINUE with corrected action based on the real file content

DO NOT attempt another edit until you've read and verified the file state.
`;
function recoverEditErrorOutput(tool, output) {
  if (tool.toLowerCase() !== "edit")
    return output;
  const lowered = output.toLowerCase();
  return EDIT_ERROR_PATTERNS.some((pattern) => lowered.includes(pattern.toLowerCase())) ? `${output}
${EDIT_ERROR_REMINDER}` : output;
}
function createEditErrorRecoveryHook() {
  return {
    "tool.execute.after": async (input, output) => {
      output.output = recoverEditErrorOutput(input.tool ?? "", output.output);
    }
  };
}
var TRUNCATABLE_TOOLS = new Set(["grep", "Grep", "safe_grep", "glob", "Glob", "safe_glob", "lsp_diagnostics", "ast_grep_search", "interactive_bash", "Interactive_bash", "skill_mcp", "webfetch", "WebFetch"]);
var DEFAULT_MAX_TOKENS = 50000;
var WEBFETCH_MAX_TOKENS = 1e4;
function truncateToolOutput(tool, output, options = {}) {
  if (!options.truncateAll && !TRUNCATABLE_TOOLS.has(tool))
    return { output, truncated: false };
  const maxTokens = options.maxTokens ?? (tool === "webfetch" || tool === "WebFetch" ? WEBFETCH_MAX_TOKENS : DEFAULT_MAX_TOKENS);
  const maxCharacters = maxTokens * 4;
  if (output.length <= maxCharacters)
    return { output, truncated: false };
  return { output: `${output.slice(0, maxCharacters)}

[Tool output truncated to ${maxTokens} tokens]`, truncated: true };
}
function createToolOutputTruncatorHook(options = {}) {
  return {
    "tool.execute.after": async (input, output) => {
      const result = truncateToolOutput(input.tool ?? "", output.output, options);
      if (result.truncated)
        output.output = result.output;
    }
  };
}
function hasIncompleteTodos(todos) {
  return todos.some((todo) => todo.status !== "completed" && todo.status !== "cancelled");
}
var TASK_TODOWRITE_BLOCKED_TOOLS = ["TodoWrite", "TodoRead"];
var TASK_TODOWRITE_REPLACEMENT_MESSAGE = `TodoRead/TodoWrite are DISABLED because experimental.task_system is enabled.

**ACTION REQUIRED**: RE-REGISTER what you were about to write as Todo using Task tools NOW. Then ASSIGN yourself and START WORKING immediately.

**Use these tools instead:**
- TaskCreate: Create new task with auto-generated ID
- TaskUpdate: Update status, assign owner, add dependencies
- TaskList: List active tasks with dependency info
- TaskGet: Get full task details

**Workflow:**
1. TaskCreate({ subject: "your task description" })
2. TaskUpdate({ id: "T-xxx", status: "in_progress", owner: "your-thread-id" })
3. DO THE WORK
4. TaskUpdate({ id: "T-xxx", status: "completed" })

CRITICAL: 1 task = 1 task. Fire independent tasks concurrently.

**STOP! DO NOT START WORKING DIRECTLY - NO MATTER HOW SMALL THE TASK!**
Even if the task seems trivial (1 line fix, simple edit, quick change), you MUST:
1. FIRST register it with TaskCreate
2. THEN mark it in_progress
3. ONLY THEN do the actual work
4. FINALLY mark it completed

**WHY?** Task tracking = visibility = accountability. Skipping registration = invisible work = chaos.

DO NOT retry TodoWrite. Convert to TaskCreate NOW.`;
function shouldBlockTaskTodoTool(tool, taskSystemEnabled) {
  return taskSystemEnabled && TASK_TODOWRITE_BLOCKED_TOOLS.some((blocked) => blocked.toLowerCase() === tool.toLowerCase());
}
function createTasksTodowriteDisablerHook(config = {}) {
  const taskSystemEnabled = config.experimental?.task_system === true;
  return {
    "tool.execute.before": async (input) => {
      if (input.tool && shouldBlockTaskTodoTool(input.tool, taskSystemEnabled))
        throw new Error(TASK_TODOWRITE_REPLACEMENT_MESSAGE);
    }
  };
}
var TODOWRITE_DESCRIPTION = `Use this tool to create and manage a structured task list for tracking progress on multi-step work.

## OpenCode Schema Contract

The upstream OpenCode \`todowrite\` schema expects each todo item to include:

- \`content\`: string
- \`status\`: string, one of \`pending\`, \`in_progress\`, \`completed\`, \`cancelled\`
- \`priority\`: string, one of \`high\`, \`medium\`, \`low\`

\`priority\` is a string field. Never send numeric priorities such as \`0\`, \`1\`, \`2\`, or labels such as \`P0\`, \`P1\`, \`P2\`.

## Todo Format (MANDATORY)

Each todo title MUST encode four elements: WHERE, WHY, HOW, and EXPECTED RESULT.

Format: "[WHERE] [HOW] to [WHY] - expect [RESULT]"`;
async function applyTodoDescriptionOverride(input, output) {
  if (input.toolID === "todowrite")
    output.description = TODOWRITE_DESCRIPTION;
}
function isNotepadPath(filePath) {
  return filePath.includes("/.sisyphus/notepads/") || filePath.startsWith(".sisyphus/notepads/");
}
function createNotepadWriteGuardHook() {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool?.toLowerCase() !== "write")
        return;
      const filePath = getWritePath(output.args);
      if (filePath && isNotepadPath(filePath))
        throw new Error(`Refused: Write to ${filePath} is blocked because notepad files are append-only and Write would destroy history. Report the original Edit failure to the user and ask for guidance instead.`);
    }
  };
}
function getWritePath(args) {
  const raw = args.filePath ?? args.path ?? args.file_path;
  return typeof raw === "string" ? raw : undefined;
}
function getToolUseId(part) {
  if (part.type === "tool_use" && typeof part.id === "string" && part.id.length > 0)
    return part.id;
  if (part.type === "tool" && typeof part.callID === "string" && part.callID.length > 0)
    return part.callID;
  return;
}
function getToolResultId(part) {
  if (part.type !== "tool_result")
    return;
  if (typeof part.toolUseId === "string" && part.toolUseId.length > 0)
    return part.toolUseId;
  if (typeof part.tool_use_id === "string" && part.tool_use_id.length > 0)
    return part.tool_use_id;
  return;
}
function extractUniqueToolUseIds(parts) {
  const seen = new Set;
  const ids = [];
  for (const part of parts) {
    const id = getToolUseId(part);
    if (!id || seen.has(id))
      continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
function createToolResultPart(toolUseId) {
  return { type: "tool_result", toolUseId, tool_use_id: toolUseId, isError: true, content: [{ type: "text", text: TOOL_RESULT_PLACEHOLDER }] };
}
function findToolResultInsertIndex(parts) {
  let last = -1;
  for (let index = 0;index < parts.length; index++)
    if (getToolResultId(parts[index]))
      last = index;
  return last === -1 ? 0 : last + 1;
}
function buildDelegateTaskRetryGuidance(error) {
  const pattern = DELEGATE_TASK_ERROR_PATTERNS.find((candidate) => candidate.errorType === error.errorType);
  const available = error.originalOutput.match(/Available[^:]*:\s*(.+)$/m)?.[1]?.trim();
  return `
 [task CALL FAILED - IMMEDIATE RETRY REQUIRED]
 
 **Error Type**: ${error.errorType}
 **Fix**: ${pattern?.fixHint ?? "Fix the error and retry with correct parameters."}
 ${available ? `
**Available Options**: ${available}
` : ""}
 **Action**: Retry task NOW with corrected parameters.
 
 Example of CORRECT call:
 \`\`\`
 task(
   description="Task description",
   prompt="Detailed prompt...",
   category="unspecified-low",  // OR subagent_type="explore"
   run_in_background=false,
   load_skills=[]
 )
 \`\`\`
 `;
}
function extractTaskId(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return;
  const record = metadata;
  for (const key of ["taskId", "taskID", "task_id", "sessionId", "sessionID", "session_id"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0)
      return value.trim();
  }
  return;
}
function extractTaskIdFromText(output) {
  const taskMetadata = output.match(/(?:task_id|session_id):\s*([a-zA-Z0-9_-]+)/)?.[1];
  if (taskMetadata)
    return taskMetadata;
  return output.match(/Session ID:\s*(ses_[a-zA-Z0-9_-]+)/)?.[1];
}
function extractSessionId(properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties))
    return;
  const record = properties;
  const nested = record.session;
  if (typeof record.sessionID === "string")
    return record.sessionID;
  if (typeof record.id === "string")
    return record.id;
  if (nested && typeof nested === "object" && !Array.isArray(nested) && typeof nested.id === "string")
    return nested.id;
  return;
}
var TOOL_RESULT_PLACEHOLDER = "Tool output unavailable (context compacted)";
function createToolPairValidatorHook() {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      repairMissingToolResults(output.messages);
    }
  };
}
function repairMissingToolResults(messages) {
  for (let index = 0;index < messages.length; index++) {
    const message = messages[index];
    if (message.info.role !== "assistant")
      continue;
    const toolUseIds = extractUniqueToolUseIds(message.parts);
    if (toolUseIds.length === 0)
      continue;
    const next = messages[index + 1];
    if (next?.info.role !== "user") {
      messages.splice(index + 1, 0, { info: { role: "user", ...typeof message.info.sessionID === "string" ? { sessionID: message.info.sessionID } : {} }, parts: toolUseIds.map(createToolResultPart) });
      continue;
    }
    const existing = new Set(next.parts.map(getToolResultId).filter((id) => id !== undefined));
    const missing = toolUseIds.filter((id) => !existing.has(id));
    if (missing.length > 0)
      next.parts.splice(findToolResultInsertIndex(next.parts), 0, ...missing.map(createToolResultPart));
  }
}
var DELEGATE_TASK_ERROR_PATTERNS = [
  { pattern: "run_in_background", errorType: "missing_run_in_background", fixHint: "Add run_in_background=false (for delegation) or run_in_background=true (for parallel exploration)" },
  { pattern: "load_skills", errorType: "missing_load_skills", fixHint: "Add load_skills=[] parameter (empty array if no skills needed). Note: Calling Skill tool does NOT populate this." },
  { pattern: "category OR subagent_type", errorType: "mutual_exclusion", fixHint: "Provide ONLY one of: category (e.g., 'general', 'quick') OR subagent_type (e.g., 'oracle', 'explore')" },
  { pattern: "Must provide either category or subagent_type", errorType: "missing_category_or_agent", fixHint: "Add either category='general' OR subagent_type='explore'" },
  { pattern: "Unknown category", errorType: "unknown_category", fixHint: "Use a valid category from the Available list in the error message" },
  { pattern: "Agent name cannot be empty", errorType: "empty_agent", fixHint: "Provide a non-empty subagent_type value" },
  { pattern: "Unknown agent", errorType: "unknown_agent", fixHint: "Use a valid agent from the Available agents list in the error message" },
  { pattern: "Cannot call primary agent", errorType: "primary_agent", fixHint: "Primary agents cannot be called via task. Use a subagent like 'explore', 'oracle', or 'librarian'" },
  { pattern: "Skills not found", errorType: "unknown_skills", fixHint: "Use valid skill names from the Available list in the error message" }
];
function detectDelegateTaskError(output) {
  if (!output.includes("[ERROR]") && !output.includes("Invalid arguments"))
    return;
  const pattern = DELEGATE_TASK_ERROR_PATTERNS.find((candidate) => output.includes(candidate.pattern));
  return pattern ? { errorType: pattern.errorType, originalOutput: output } : undefined;
}
function addDelegateTaskRetryGuidance(tool, output) {
  if (tool.toLowerCase() !== "task")
    return output;
  const error = detectDelegateTaskError(output);
  return error ? `${output}
${buildDelegateTaskRetryGuidance(error)}` : output;
}
function createDelegateTaskRetryHook() {
  return {
    "tool.execute.after": async (input, output) => {
      output.output = addDelegateTaskRetryGuidance(input.tool ?? "", output.output);
    }
  };
}
function appendTaskResumeInfo(tool, output, metadata) {
  if (!["task", "Task", "task_tool", "call_omo_agent"].includes(tool))
    return output;
  if (output.startsWith("Error:") || output.startsWith("Failed") || output.includes(`
to continue:`))
    return output;
  const taskID = extractTaskId(metadata) ?? extractTaskIdFromText(output);
  return taskID ? `${output.trimEnd()}

to continue: task(task_id="${taskID}", load_skills=[], run_in_background=false, prompt="...")` : output;
}
function createTaskResumeInfoHook() {
  return {
    "tool.execute.after": async (input, output) => {
      output.output = appendTaskResumeInfo(input.tool ?? "", output.output, output.metadata);
    }
  };
}
function createStopContinuationGuardHook() {
  const stopped = new Set;
  return {
    stop(sessionID) {
      stopped.add(sessionID);
    },
    isStopped(sessionID) {
      return stopped.has(sessionID);
    },
    clear(sessionID) {
      stopped.delete(sessionID);
    },
    event: async ({ event }) => {
      if (event.type === "session.deleted") {
        const sessionID = extractSessionId(event.properties);
        if (sessionID)
          stopped.delete(sessionID);
      }
    },
    "chat.message": async (_input) => {}
  };
}
var NON_INTERACTIVE_ENV = {
  CI: "true",
  DEBIAN_FRONTEND: "noninteractive",
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "never",
  HOMEBREW_NO_AUTO_UPDATE: "1",
  GIT_EDITOR: ":",
  EDITOR: ":",
  VISUAL: "",
  GIT_SEQUENCE_EDITOR: ":",
  GIT_MERGE_AUTOEDIT: "no",
  GIT_PAGER: "cat",
  PAGER: "cat",
  npm_config_yes: "true",
  PIP_NO_INPUT: "1",
  YARN_ENABLE_IMMUTABLE_INSTALLS: "false"
};
var BANNED_INTERACTIVE_COMMANDS = ["vim", "nano", "vi", "emacs", "less", "more", "man", "git add -p", "git rebase -i"];
function detectBannedInteractiveCommand(command) {
  return BANNED_INTERACTIVE_COMMANDS.find((candidate) => new RegExp(`\\b${escapeRegExp(candidate)}\\b`).test(command));
}
function buildNonInteractiveEnvPrefix(shellType = "posix") {
  const entries = Object.entries(NON_INTERACTIVE_ENV);
  if (shellType === "cmd")
    return entries.map(([key, value]) => `set ${key}=${value}`).join(" && ");
  if (shellType === "powershell")
    return entries.map(([key, value]) => `$env:${key}='${value.replaceAll("'", "''")}'`).join("; ");
  return entries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ");
}
function buildNonInteractiveGitCommand(command, shellType = "posix") {
  if (!/\bgit\b/.test(command))
    return command;
  const prefix = buildNonInteractiveEnvPrefix(shellType);
  return command.trimStart().startsWith(prefix.trim()) ? command : `${prefix} ${command}`;
}
function createNonInteractiveEnvHook(options = {}) {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool?.toLowerCase() !== "bash")
        return;
      const command = typeof output.args.command === "string" ? output.args.command : undefined;
      if (!command)
        return;
      const banned = detectBannedInteractiveCommand(command);
      if (banned)
        output.message = `Warning: '${banned}' is an interactive command that may hang in non-interactive environments.`;
      const nextCommand = buildNonInteractiveGitCommand(command, options.shellType);
      if (nextCommand !== command)
        replaceToolArgs(output, { command: nextCommand });
    }
  };
}
function formatSkillNames(skills, limit) {
  if (skills.length === 0)
    return "(none)";
  const shown = skills.slice(0, limit).map((skill) => skill.name);
  const remaining = skills.length - shown.length;
  return shown.join(", ") + (remaining > 0 ? ` (+${remaining} more)` : "");
}
function buildCategorySkillReminderMessage(availableSkills) {
  const builtinSkills = availableSkills.filter((skill) => skill.location === "plugin");
  const customSkills = availableSkills.filter((skill) => skill.location !== "plugin");
  const exampleSkillName = customSkills[0]?.name ?? builtinSkills[0]?.name;
  const loadSkills = exampleSkillName ? `["${exampleSkillName}"]` : "[]";
  return [
    "",
    "[Category+Skill Reminder]",
    "",
    `**Built-in**: ${formatSkillNames(builtinSkills, 8)}`,
    `**\u26A1 YOUR SKILLS (PRIORITY)**: ${formatSkillNames(customSkills, 8)}`,
    "",
    "> User-installed skills OVERRIDE built-in defaults. ALWAYS prefer YOUR SKILLS when domain matches.",
    "",
    "```typescript",
    `task(category="visual-engineering", load_skills=${loadSkills}, run_in_background=true)`,
    "```",
    ""
  ].join(`
`);
}
function createCategorySkillReminderHook(availableSkills = []) {
  const sessionStates = new Map;
  const reminder = buildCategorySkillReminderMessage(availableSkills);
  return {
    "tool.execute.after": async (input, output) => {
      const sessionID = input.sessionID;
      if (!sessionID || !isCategoryReminderTargetAgent(input.agent) || !input.tool)
        return;
      const tool = input.tool.toLowerCase();
      const state = sessionStates.get(sessionID) ?? { delegationUsed: false, reminderShown: false, toolCallCount: 0 };
      sessionStates.set(sessionID, state);
      if (tool === "task" || tool === "call_omo_agent") {
        state.delegationUsed = true;
        return;
      }
      if (!["edit", "write", "bash", "read", "grep", "glob"].includes(tool))
        return;
      state.toolCallCount++;
      if (state.toolCallCount >= 3 && !state.delegationUsed && !state.reminderShown) {
        output.output += reminder;
        state.reminderShown = true;
      }
    },
    event: async ({ event }) => {
      if (event.type !== "session.deleted")
        return;
      const sessionID = extractSessionId(event.properties);
      if (sessionID)
        sessionStates.delete(sessionID);
    }
  };
}
var AGENT_USAGE_REMINDER_MESSAGE = `
[Agent Usage Reminder]

You called a search/fetch tool directly without leveraging specialized agents.

RECOMMENDED: Use task with explore/librarian agents for better results:

\`\`\`
// Parallel exploration - fire multiple agents simultaneously
task(subagent_type="explore", load_skills=[], prompt="Find all files matching pattern X")
task(subagent_type="explore", load_skills=[], prompt="Search for implementation of Y")
task(subagent_type="librarian", load_skills=[], prompt="Lookup documentation for Z")

// Then continue your work while they run in background
// System will notify you when each completes
\`\`\`

WHY:
- Agents can perform deeper, more thorough searches
- Background tasks run in parallel, saving time
- Specialized agents have domain expertise
- Reduces context window usage in main session

ALWAYS prefer: Multiple parallel task calls > Direct tool calls
`;
var AGENT_USAGE_TARGET_TOOLS = new Set(["grep", "safe_grep", "glob", "safe_glob", "webfetch", "context7_resolve-library-id", "context7_query-docs", "websearch_web_search_exa", "context7_get-library-docs", "grep_app_searchgithub"]);
var AGENT_USAGE_AGENT_TOOLS = new Set(["task", "call_omo_agent"]);
function isOrchestratorAgentForReminder(agentName) {
  if (!agentName)
    return true;
  return ["sisyphus", "sisyphus-junior", "atlas", "hephaestus", "prometheus"].includes(getAgentConfigKey(agentName));
}
function shouldRemindAgentUsage(tool, state, agentName, maxReminders = 3, now = Date.now) {
  if (!isOrchestratorAgentForReminder(agentName))
    return false;
  const toolLower = tool.toLowerCase();
  if (AGENT_USAGE_AGENT_TOOLS.has(toolLower)) {
    state.agentUsed = true;
    state.updatedAt = now();
    return false;
  }
  if (!AGENT_USAGE_TARGET_TOOLS.has(toolLower) || state.agentUsed || state.reminderCount >= maxReminders)
    return false;
  state.reminderCount++;
  state.updatedAt = now();
  return true;
}
function createAgentUsageReminderHook(options = {}) {
  const states = new Map;
  const now = options.now ?? Date.now;
  const getState = (sessionID) => {
    const existing = states.get(sessionID);
    if (existing)
      return existing;
    const created = { sessionID, agentUsed: false, reminderCount: 0, updatedAt: now() };
    states.set(sessionID, created);
    return created;
  };
  return {
    getState,
    "tool.execute.after": async (input, output) => {
      if (!input.tool || !input.sessionID)
        return;
      const state = getState(input.sessionID);
      if (shouldRemindAgentUsage(input.tool, state, options.getAgent?.(input.sessionID) ?? input.agent, 3, now))
        output.output += AGENT_USAGE_REMINDER_MESSAGE;
    },
    event: async ({ event }) => {
      if (event.type !== "session.deleted")
        return;
      const sessionID = extractSessionId(event.properties);
      if (sessionID)
        states.delete(sessionID);
    }
  };
}
function escapeAppleScriptText(input) {
  return input.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
function escapePowerShellSingleQuotedText(input) {
  return input.replace(/'/g, "''");
}
function buildWindowsToastScript(title, message) {
  const psTitle = escapePowerShellSingleQuotedText(title);
  const psMessage = escapePowerShellSingleQuotedText(message);
  return `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$Template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$RawXml = [xml] $Template.GetXml()
($RawXml.toast.visual.binding.text | Where-Object {$_.id -eq '1'}).AppendChild($RawXml.CreateTextNode('${psTitle}')) | Out-Null
($RawXml.toast.visual.binding.text | Where-Object {$_.id -eq '2'}).AppendChild($RawXml.CreateTextNode('${psMessage}')) | Out-Null
$SerializedXml = New-Object Windows.Data.Xml.Dom.XmlDocument
$SerializedXml.LoadXml($RawXml.OuterXml)
$Toast = [Windows.UI.Notifications.ToastNotification]::new($SerializedXml)
$Notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OpenCode')
$Notifier.Show($Toast)
`.trim().replace(/\n/g, "; ");
}
function normalizeNotificationPlatform(platform) {
  return platform === "darwin" || platform === "linux" || platform === "win32" ? platform : "unsupported";
}
function getDefaultNotificationSoundPath(platform) {
  switch (platform) {
    case "darwin":
      return "/System/Library/Sounds/Glass.aiff";
    case "linux":
      return "/usr/share/sounds/freedesktop/stereo/complete.oga";
    case "win32":
      return "C:\\Windows\\Media\\notify.wav";
    case "unsupported":
      return "";
  }
}
var BACKGROUND_FORWARDED_EVENT_TYPES = new Set(["message.updated", "message.part.updated", "message.part.delta", "todo.updated", "session.idle", "session.error", "session.deleted", "session.status"]);
function shouldForwardBackgroundEvent(eventType) {
  return BACKGROUND_FORWARDED_EVENT_TYPES.has(eventType);
}
function createBackgroundNotificationHook(manager) {
  return {
    event: async ({ event }) => {
      if (shouldForwardBackgroundEvent(event.type))
        manager.handleEvent(event);
    },
    "chat.message": async (input, output) => {
      manager.injectPendingNotificationsIntoChatMessage(output, input.sessionID);
    }
  };
}
var CONTEXT_WARNING_THRESHOLD = 0.7;
function buildContextWindowReminder(actualLimit) {
  return `[SYSTEM DIRECTIVE: CONTEXT_WINDOW_MONITOR]

You are using a ${actualLimit.toLocaleString()}-token context window.
You still have context remaining - do NOT rush or skip tasks.
Complete your work thoroughly and methodically.`;
}
function shouldWarnContextWindow(tokens, actualLimit) {
  const totalInputTokens = (tokens.input ?? 0) + (tokens.cache?.read ?? 0);
  return actualLimit > 0 && totalInputTokens / actualLimit >= CONTEXT_WARNING_THRESHOLD;
}
function appendContextWindowStatus(output, tokens, actualLimit) {
  const totalInputTokens = (tokens.input ?? 0) + (tokens.cache?.read ?? 0);
  const usage = totalInputTokens / actualLimit;
  const clampedPercentage = Math.min(Math.max(usage, 0), 1);
  const usedPct = (clampedPercentage * 100).toFixed(1);
  const remainingPct = ((1 - clampedPercentage) * 100).toFixed(1);
  return `${output}

${buildContextWindowReminder(actualLimit)}
[Context Status: ${usedPct}% used (${totalInputTokens.toLocaleString()}/${actualLimit.toLocaleString()} tokens), ${remainingPct}% remaining]`;
}
function createContextWindowMonitorHook(options) {
  const remindedSessions = new Set;
  const tokenCache = new Map;
  return {
    event: async ({ event }) => {
      if (event.type === "session.deleted") {
        const sessionID2 = extractSessionId(event.properties);
        if (sessionID2) {
          remindedSessions.delete(sessionID2);
          tokenCache.delete(sessionID2);
        }
        return;
      }
      if (event.type !== "message.updated")
        return;
      const props = event.properties;
      const info = props?.info;
      if (!info || info.role !== "assistant" || !info.finish || options.isCompactionAgent?.(info.agent) === true)
        return;
      const sessionID = extractSessionId(props);
      if (!sessionID || !info.providerID || !info.tokens)
        return;
      tokenCache.set(sessionID, { providerID: info.providerID, modelID: info.modelID ?? "", tokens: info.tokens });
    },
    "tool.execute.after": async (input, output) => {
      const sessionID = input.sessionID;
      if (!sessionID || remindedSessions.has(sessionID))
        return;
      const cached = tokenCache.get(sessionID);
      if (!cached)
        return;
      const actualLimit = options.resolveLimit(cached.providerID, cached.modelID);
      if (!actualLimit || !shouldWarnContextWindow(cached.tokens, actualLimit))
        return;
      remindedSessions.add(sessionID);
      output.output = appendContextWindowStatus(output.output, cached.tokens, actualLimit);
    }
  };
}
var UNIVERSAL_TEAM_TOOL_NAMES = new Set(["team_send_message", "team_task_create", "team_task_list", "team_task_update", "team_task_get", "team_status"]);
function isUniversalTeamTool(toolName) {
  return UNIVERSAL_TEAM_TOOL_NAMES.has(toolName);
}
function resolveTeamToolGate(toolName, participant, args) {
  if (!toolName.startsWith("team_") && toolName !== "delegate-task")
    return;
  if (toolName === "delegate-task" || toolName === "team_list")
    return;
  if (toolName === "team_create")
    return participant.role === "neither" ? undefined : `team_create denied: session is already a participant of team ${participant.teamRunId}`;
  const teamRunId = typeof args.teamRunId === "string" ? args.teamRunId : undefined;
  const memberName = typeof args.memberName === "string" ? args.memberName : undefined;
  if (toolName === "team_delete" || toolName === "team_shutdown_request")
    return participant.role === "lead" && participant.teamRunId === teamRunId ? undefined : `${toolName} is lead-only`;
  if (toolName === "team_approve_shutdown" || toolName === "team_reject_shutdown") {
    const isLead = participant.role === "lead" && participant.teamRunId === teamRunId;
    const isTargetMember = participant.role === "member" && participant.teamRunId === teamRunId && participant.memberName === memberName;
    return isLead || isTargetMember ? undefined : `${toolName}: caller must be target member or team lead`;
  }
  if (isUniversalTeamTool(toolName)) {
    const participantInTeam = (participant.role === "lead" || participant.role === "member") && participant.teamRunId === teamRunId;
    if (participantInTeam)
      return;
    return teamRunId === undefined ? `team-mode tool ${toolName} requires teamRunId argument` : `team-mode tool ${toolName} denied: not a participant of team ${teamRunId}`;
  }
  return;
}
function createTeamToolGating(options) {
  return {
    "tool.execute.before": async (input, output) => {
      if (!options.enabled || !input.tool || !input.sessionID)
        return;
      const denial = resolveTeamToolGate(input.tool, options.getParticipant(input.sessionID), output.args);
      if (denial)
        throw new Error(denial);
    }
  };
}
function parseTmuxCommand(tmuxCommand) {
  const tokens = tokenizeTmuxCommand(tmuxCommand);
  const subCommand = findTmuxSubcommand(tokens);
  const sessionName = extractTmuxSessionName(tokens, subCommand);
  return { subCommand, sessionName };
}
function isOmoTmuxSession(sessionName) {
  return typeof sessionName === "string" && sessionName.startsWith("omo-");
}
function buildInteractiveBashSessionReminder(sessions) {
  return sessions.length === 0 ? "" : `

[System Reminder] Active omo-* tmux sessions: ${sessions.join(", ")}`;
}
function createInteractiveBashSessionHook(options = {}) {
  const states = new Map;
  const now = options.now ?? Date.now;
  const getState = (sessionID) => {
    const existing = states.get(sessionID);
    if (existing)
      return existing;
    const created = { sessionID, tmuxSessions: new Set, updatedAt: now() };
    states.set(sessionID, created);
    return created;
  };
  return {
    getState,
    "tool.execute.after": async (input, output) => {
      if (input.tool?.toLowerCase() !== "interactive_bash" || !input.sessionID || typeof input.args?.tmux_command !== "string" || output.output.startsWith("Error:"))
        return;
      const state = getState(input.sessionID);
      const { subCommand, sessionName } = parseTmuxCommand(input.args.tmux_command);
      let stateChanged = false;
      if (subCommand === "new-session" && isOmoTmuxSession(sessionName)) {
        state.tmuxSessions.add(sessionName);
        stateChanged = true;
      } else if (subCommand === "kill-session" && isOmoTmuxSession(sessionName)) {
        state.tmuxSessions.delete(sessionName);
        stateChanged = true;
      } else if (subCommand === "kill-server") {
        state.tmuxSessions.clear();
        stateChanged = true;
      }
      if (stateChanged)
        state.updatedAt = now();
      if (subCommand === "new-session" || subCommand === "kill-session" || subCommand === "kill-server")
        output.output += buildInteractiveBashSessionReminder([...state.tmuxSessions]);
    },
    event: async ({ event }) => {
      if (event.type !== "session.deleted")
        return;
      const sessionID = extractSessionId(event.properties);
      if (sessionID)
        states.delete(sessionID);
    }
  };
}
function removeKeywordCodeBlocks(text) {
  return text.replace(KEYWORD_CODE_BLOCK_PATTERN, "").replace(KEYWORD_INLINE_CODE_PATTERN, "");
}
function looksLikeSlashCommand(text) {
  return SLASH_COMMAND_LEAD_PATTERN.test(text);
}
function detectKeywords(text, agentName, modelID, disabledKeywords) {
  return detectKeywordsWithType(text, agentName, modelID, disabledKeywords).map(({ message }) => message);
}
function detectKeywordsWithType(text, agentName, modelID, disabledKeywords) {
  const textWithoutCode = removeKeywordCodeBlocks(text);
  const disabled = new Set(disabledKeywords ?? []);
  if (disabled.has("ultrawork") || disabled.has("hyperplan"))
    disabled.add("hyperplan-ultrawork");
  const detectors = [
    { type: "ultrawork", pattern: /\b(ultrawork|ulw)\b/i, message: getUltraworkDirective(agentName, modelID) },
    { type: "search", pattern: SEARCH_PATTERN, message: `[search-mode]
MAXIMIZE SEARCH EFFORT. Launch multiple background agents IN PARALLEL.` },
    { type: "analyze", pattern: /\b(analyze|analyse|investigate|examine|research|study|deep[\s-]?dive|inspect|audit|evaluate|assess|review|diagnose|debug|understand)\b|why\s+is|how\s+does|how\s+to|\uBD84\uC11D|\uC870\uC0AC|\uD30C\uC545|\uAC80\uD1A0|\uC9C4\uB2E8|\uC774\uD574|\uC124\uBA85|\uC6D0\uC778|\uC774\uC720|\uC65C|\uC5B4\uB5BB\uAC8C/i, message: `[analyze-mode]
ANALYSIS MODE. Gather context before diving deep.` },
    { type: "team", pattern: TEAM_PATTERN, message: `[team-mode]
Team mode reference detected. If user wants team-mode work, MUST orchestrate via team_* tools.` },
    { type: "hyperplan", pattern: HYPERPLAN_PATTERN, message: `<hyperplan-mode>
**MANDATORY**: Say "HYPERPLAN MODE ENABLED!" as your first response, exactly once.
</hyperplan-mode>` },
    { type: "hyperplan-ultrawork", pattern: HYPERPLAN_ULTRAWORK_PATTERN, message: `<hyperplan-ultrawork-mode>
**MANDATORY**: Say "HYPERPLAN ULTRAWORK MODE ENABLED!" exactly once as your first response.
</hyperplan-ultrawork-mode>` }
  ];
  return detectors.filter((detector) => detector.pattern.test(textWithoutCode) && !disabled.has(detector.type)).map(({ type, message }) => ({ type, message }));
}
function createKeywordDetectorHook() {
  return {
    "chat.message": async (input, output) => {
      const text = extractRealPromptText(output.parts);
      const messages = detectKeywords(text, input.agent, input.model?.modelID);
      for (const message of messages)
        output.parts.push({ type: "text", text: message, synthetic: true });
    }
  };
}
function parseSlashCommand(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/"))
    return null;
  const match = trimmed.match(SLASH_COMMAND_PATTERN);
  if (!match)
    return null;
  const [raw, command, args] = match;
  return { command: command.toLowerCase(), args: args.trim(), raw };
}
function detectSlashCommand(text) {
  const parsed = parseSlashCommand(text.replace(KEYWORD_CODE_BLOCK_PATTERN, "").trim());
  return parsed && !EXCLUDED_SLASH_COMMANDS.has(parsed.command) ? parsed : null;
}
function findSlashCommandPartIndex(parts) {
  for (let index = 0;index < parts.length; index++) {
    const part = parts[index];
    if (part.type === "text" && part.synthetic !== true && (part.text ?? "").trim().startsWith("/"))
      return index;
  }
  return -1;
}
function formatSlashCommandTemplate(command, args) {
  const sections = [`# /${command.name} Command
`];
  if (command.description)
    sections.push(`**Description**: ${command.description}
`);
  if (args)
    sections.push(`**User Arguments**: ${args}
`);
  if (command.model)
    sections.push(`**Model**: ${command.model}
`);
  if (command.agent)
    sections.push(`**Agent**: ${command.agent}
`);
  sections.push(`**Scope**: ${command.scope}
`, `---
`, `## Command Instructions
`, (command.content ?? "").replace(/\$\{user_message\}/g, args).replace(/\$ARGUMENTS/g, args).trim());
  if (args)
    sections.push(`

---
`, `## User Request
`, args);
  return sections.join(`
`);
}
function createAutoSlashCommandHook(options) {
  return {
    "chat.message": async (_input, output) => {
      const index = findSlashCommandPartIndex(output.parts);
      if (index === -1)
        return;
      const parsed = detectSlashCommand(output.parts[index]?.text ?? "");
      if (!parsed)
        return;
      const command = options.commands.find((candidate) => candidate.name.toLowerCase() === parsed.command);
      if (!command)
        return;
      output.parts[index] = { type: "text", text: `${AUTO_SLASH_COMMAND_TAG_OPEN}
${formatSlashCommandTemplate(command, parsed.args)}
${AUTO_SLASH_COMMAND_TAG_CLOSE}`, synthetic: true };
    }
  };
}
function calculateTargetDimensions(width, height, maxLongEdge = 1568) {
  if (width <= 0 || height <= 0 || maxLongEdge <= 0)
    return null;
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge)
    return null;
  return width >= height ? { width: maxLongEdge, height: Math.max(1, Math.floor(height * maxLongEdge / width)) } : { width: Math.max(1, Math.floor(width * maxLongEdge / height)), height: maxLongEdge };
}
function calculateImageTokens(width, height) {
  return Math.ceil(width * height / 750);
}
function formatImageResizeAppendix(entries) {
  const header = entries.some((entry) => entry.status === "resized") ? "[Image Resize Info]" : "[Image Info]";
  const lines = [`

${header}`];
  for (const entry of entries) {
    if (entry.status === "unknown-dims" || !entry.originalDims) {
      lines.push(`- ${entry.filename}: dimensions could not be parsed`);
      continue;
    }
    const originalText = `${entry.originalDims.width}x${entry.originalDims.height}`;
    const originalTokens = calculateImageTokens(entry.originalDims.width, entry.originalDims.height);
    if (entry.status === "within-limits") {
      lines.push(`- ${entry.filename}: ${originalText} (within limits, tokens: ${originalTokens})`);
    } else if (entry.status === "resize-skipped") {
      lines.push(`- ${entry.filename}: ${originalText} (exceeds provider limits, image removed to prevent API error)`);
    } else if (!entry.resizedDims) {
      lines.push(`- ${entry.filename}: ${originalText} (resize skipped, tokens: ${originalTokens})`);
    } else {
      const resizedText = `${entry.resizedDims.width}x${entry.resizedDims.height}`;
      const resizedTokens = calculateImageTokens(entry.resizedDims.width, entry.resizedDims.height);
      lines.push(`- ${entry.filename}: ${originalText} -> ${resizedText} (resized, tokens: ${originalTokens} -> ${resizedTokens})`);
    }
  }
  return lines.join(`
`);
}
function computeLineHash(lineNumber, content) {
  const normalized = content.replace(/\r/g, "").trimEnd();
  const seed = /[\p{L}\p{N}]/u.test(normalized) ? 0 : lineNumber;
  return HASHLINE_DICT[xxHash32(normalized, seed) % 256];
}
function formatHashLine(lineNumber, content) {
  return `${lineNumber}#${computeLineHash(lineNumber, content)}|${content}`;
}
function transformHashlineReadOutput(output) {
  if (!output)
    return output;
  const lines = output.split(`
`);
  const contentStart = lines.findIndex((line) => line === "<content>" || line.startsWith("<content>"));
  const contentEnd = lines.indexOf("</content>");
  const fileStart = lines.findIndex((line) => line === "<file>" || line.startsWith("<file>"));
  const fileEnd = lines.indexOf("</file>");
  const blockStart = contentStart !== -1 ? contentStart : fileStart;
  const blockEnd = contentStart !== -1 ? contentEnd : fileEnd;
  const openTag = contentStart !== -1 ? "<content>" : "<file>";
  if (blockStart !== -1 && blockEnd !== -1 && blockEnd > blockStart) {
    const openLine = lines[blockStart] ?? "";
    const inlineFirst = openLine.startsWith(openTag) && openLine !== openTag ? openLine.slice(openTag.length) : null;
    const fileLines = inlineFirst !== null ? [inlineFirst, ...lines.slice(blockStart + 1, blockEnd)] : lines.slice(blockStart + 1, blockEnd);
    if (!isHashlineTextFile(fileLines[0] ?? ""))
      return output;
    const transformed = transformHashlineLines(fileLines);
    const prefix = inlineFirst !== null ? [...lines.slice(0, blockStart), openTag] : lines.slice(0, blockStart + 1);
    return [...prefix, ...transformed, ...lines.slice(blockEnd)].join(`
`);
  }
  return isHashlineTextFile(lines[0] ?? "") ? transformHashlineLines(lines).join(`
`) : output;
}
function buildHashlineWriteSuccessOutput(output, metadata) {
  if (output.startsWith(WRITE_SUCCESS_MARKER) || output.toLowerCase().startsWith("error") || output.toLowerCase().includes("failed"))
    return output;
  const lineCount = extractMetadataLineCount(metadata);
  return lineCount === undefined ? output : `${WRITE_SUCCESS_MARKER} ${lineCount} lines written.`;
}
function createHashlineReadEnhancerHook(config) {
  return {
    "tool.execute.after": async (input, output) => {
      if (!config.enabled || typeof output.output !== "string")
        return;
      if (input.tool.toLowerCase() === "read")
        output.output = transformHashlineReadOutput(output.output);
      else if (input.tool.toLowerCase() === "write")
        output.output = buildHashlineWriteSuccessOutput(output.output, output.metadata);
    }
  };
}
function createIdleNotificationState() {
  return { notifiedSessions: new Set, pendingSessions: new Set, sessionActivitySinceIdle: new Set, notificationVersions: new Map, executingNotifications: new Set, scheduledAt: new Map };
}
function createIdleNotificationScheduler(options) {
  const state = createIdleNotificationState();
  const now = options.now ?? Date.now;
  const activityGracePeriodMs = options.activityGracePeriodMs ?? 100;
  const cleanupOldSessions = () => {
    trimSet(state.notifiedSessions, options.maxTrackedSessions);
    trimSet(state.pendingSessions, options.maxTrackedSessions);
    trimSet(state.sessionActivitySinceIdle, options.maxTrackedSessions);
    trimMap(state.notificationVersions, options.maxTrackedSessions);
    trimSet(state.executingNotifications, options.maxTrackedSessions);
    trimMap(state.scheduledAt, options.maxTrackedSessions);
  };
  return {
    state,
    markSessionActivity(sessionID) {
      const scheduledTime = state.scheduledAt.get(sessionID);
      if (activityGracePeriodMs > 0 && scheduledTime !== undefined && now() - scheduledTime <= activityGracePeriodMs)
        return "ignored-pending";
      state.pendingSessions.delete(sessionID);
      state.scheduledAt.delete(sessionID);
      state.sessionActivitySinceIdle.add(sessionID);
      state.notificationVersions.set(sessionID, (state.notificationVersions.get(sessionID) ?? 0) + 1);
      if (!state.executingNotifications.has(sessionID))
        state.notifiedSessions.delete(sessionID);
      return "cancelled-by-activity";
    },
    scheduleIdleNotification(sessionID) {
      if (state.notifiedSessions.has(sessionID))
        return "ignored-already-notified";
      if (state.pendingSessions.has(sessionID))
        return "ignored-pending";
      if (state.executingNotifications.has(sessionID))
        return "ignored-executing";
      state.sessionActivitySinceIdle.delete(sessionID);
      state.scheduledAt.set(sessionID, now());
      state.pendingSessions.add(sessionID);
      state.notificationVersions.set(sessionID, (state.notificationVersions.get(sessionID) ?? 0) + 1);
      cleanupOldSessions();
      return "scheduled";
    },
    shouldExecuteNotification(sessionID, version, hasIncompleteTodos2) {
      if (state.executingNotifications.has(sessionID) || state.notificationVersions.get(sessionID) !== version || state.sessionActivitySinceIdle.delete(sessionID) || state.notifiedSessions.has(sessionID) || hasIncompleteTodos2)
        return false;
      state.executingNotifications.add(sessionID);
      state.notifiedSessions.add(sessionID);
      return true;
    },
    finishNotification(sessionID) {
      state.executingNotifications.delete(sessionID);
      state.pendingSessions.delete(sessionID);
      state.scheduledAt.delete(sessionID);
      if (state.sessionActivitySinceIdle.delete(sessionID))
        state.notifiedSessions.delete(sessionID);
    },
    deleteSession(sessionID) {
      state.pendingSessions.delete(sessionID);
      state.notifiedSessions.delete(sessionID);
      state.sessionActivitySinceIdle.delete(sessionID);
      state.notificationVersions.delete(sessionID);
      state.executingNotifications.delete(sessionID);
      state.scheduledAt.delete(sessionID);
      return "deleted";
    }
  };
}
function detectErrorType(error) {
  const message = getRecoveryErrorMessage(error);
  if (message.includes("assistant message prefill") || message.includes("conversation must end with a user message"))
    return "assistant_prefill_unsupported";
  if (message.includes("thinking") && (message.includes("first block") || message.includes("must start with") || message.includes("preceeding") || message.includes("final block") || message.includes("cannot be thinking") || message.includes("expected") && message.includes("found")))
    return "thinking_block_order";
  if (message.includes("thinking") && message.includes("cannot be modified"))
    return "thinking_block_modified";
  if (message.includes("thinking is disabled") && message.includes("cannot contain"))
    return "thinking_disabled_violation";
  if (message.includes("tool_use") && message.includes("tool_result"))
    return "tool_result_missing";
  if (message.includes("dummy_tool") || message.includes("unavailable tool") || message.includes("model tried to call unavailable") || message.includes("nosuchtoolerror") || message.includes("no such tool"))
    return "unavailable_tool";
  return null;
}
function extractMessageIndex(error) {
  const match = getRecoveryErrorMessage(error).match(/messages\.(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}
function extractUnavailableToolName(error) {
  const match = getRecoveryErrorMessage(error).match(/(?:unavailable tool|no such tool)[:\s'"]+([^'".\s]+)/);
  return match ? match[1] : null;
}
function createSessionRecoveryHook() {
  return { isRecoverableError: (error) => detectErrorType(error) !== null, detectErrorType, extractMessageIndex, extractUnavailableToolName };
}
function parseAnthropicTokenLimitError(error) {
  const textSources = collectTokenLimitTextSources(error);
  if (textSources.length === 0)
    return null;
  const combinedText = textSources.join(" ");
  if (!isTokenLimitErrorText(combinedText))
    return null;
  if (combinedText.toLowerCase().includes("non-empty content"))
    return { currentTokens: 0, maxTokens: 0, errorType: "non-empty content", messageIndex: extractTokenLimitMessageIndex(combinedText) };
  for (const text of textSources) {
    const tokens = extractTokensFromLimitMessage(text);
    if (tokens)
      return { ...tokens, errorType: "token_limit_exceeded", requestId: extractRequestId(text) };
  }
  return { currentTokens: 0, maxTokens: 0, errorType: "token_limit_exceeded_unknown" };
}
function isTokenLimitErrorText(text) {
  if (THINKING_BLOCK_ERROR_PATTERNS.some((pattern) => pattern.test(text)))
    return false;
  const lower = text.toLowerCase();
  return TOKEN_LIMIT_KEYWORDS.some((keyword) => lower.includes(keyword));
}
function formatBytes(bytes) {
  if (bytes < 1024)
    return `${bytes}B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function buildTeamMailboxTurnMarker(sessionID, messages) {
  return `${sessionID}#${messages.length}`;
}
function injectTeamMailboxMessage(messages, sessionID, content) {
  const injected = createSyntheticUserMessage(sessionID, content);
  const lastUserIndex = findLastUserMessageIndex(messages);
  const next = [...messages];
  if (lastUserIndex === -1)
    next.unshift(injected);
  else
    next.splice(lastUserIndex, 0, injected);
  return next;
}
function createTeamMailboxInjector(options) {
  return {
    "experimental.chat.messages.transform": async (input, output) => {
      if (!options.enabled || output.messages.length === 0)
        return;
      const sessionID = input.sessionID ?? resolveMessageSessionID(output.messages);
      if (!sessionID)
        return;
      const result = options.getInjection(sessionID, buildTeamMailboxTurnMarker(sessionID, output.messages));
      if (result.injected && result.content)
        output.messages = injectTeamMailboxMessage(output.messages, sessionID, result.content);
    }
  };
}
function buildTeamModeStatusContent() {
  return `${TEAM_MODE_STATUS_MARKER}
Team mode is ENABLED for this session.
If the team_* tools are present, that is authoritative proof that team mode is active.
Do not inspect ~/.config/opencode or project config files to verify team mode.
If you need usage guidance, load the team-mode skill. Otherwise use the team_* tools directly.
</team_mode_status>`;
}
function injectTeamModeStatus(messages, sessionID) {
  if (messages.some((message) => message.parts.some((part) => part.synthetic === true && part.type === "text" && typeof part.text === "string" && part.text.includes(TEAM_MODE_STATUS_MARKER))))
    return messages;
  const lastUserIndex = findLastUserMessageIndex(messages);
  if (lastUserIndex === -1)
    return messages;
  const next = [...messages];
  next.splice(lastUserIndex, 0, createSyntheticUserMessage(sessionID, buildTeamModeStatusContent()));
  return next;
}
function createTeamModeStatusInjector(options) {
  return {
    "experimental.chat.messages.transform": async (input, output) => {
      if (!options.enabled || output.messages.length === 0)
        return;
      const sessionID = input.sessionID ?? resolveMessageSessionID(output.messages);
      if (!sessionID)
        return;
      const lastUserIndex = findLastUserMessageIndex(output.messages);
      if (lastUserIndex === -1)
        return;
      const message = output.messages[lastUserIndex];
      const promptText = message.parts.filter((part) => part.type === "text" && part.synthetic !== true).map((part) => part.text || "").join(" ");
      if (detectKeywordsWithType(promptText, undefined, undefined, options.disabledKeywords).some((keyword) => keyword.type === "team"))
        output.messages = injectTeamModeStatus(output.messages, sessionID);
    }
  };
}
function buildCompactionContextPrompt(history) {
  const prompt = `<system-directive type="compaction_context">

When summarizing this session, you MUST include the following sections in your summary:

## 1. User Requests (As-Is)
## 2. Final Goal
## 3. Work Completed
## 4. Remaining Tasks
## 5. Active Working Context (For Seamless Continuation)
## 6. Explicit Constraints (Verbatim Only)
## 7. Agent Verification State (Critical for Reviewers)
## 8. Delegated Agent Sessions
`;
  return history ? `${prompt}
### Active/Recent Delegated Sessions
${history}
` : prompt;
}
function createTailMonitorState() {
  return { currentHasOutput: false, consecutiveNoTextMessages: 0 };
}
function finalizeTrackedAssistantMessage(state) {
  if (!state.currentMessageID)
    return state.consecutiveNoTextMessages;
  state.consecutiveNoTextMessages = state.currentHasOutput ? 0 : state.consecutiveNoTextMessages + 1;
  state.currentMessageID = undefined;
  state.currentHasOutput = false;
  return state.consecutiveNoTextMessages;
}
function shouldTreatAssistantPartAsOutput(part) {
  return part.type === "text" ? !!part.text?.trim() : typeof part.type === "string" && ["reasoning", "tool", "tool_use"].includes(part.type);
}
function trackAssistantOutput(state, messageID) {
  if (messageID && !state.currentMessageID)
    state.currentMessageID = messageID;
  state.currentHasOutput = true;
  state.consecutiveNoTextMessages = 0;
}
function createCompactionContextInjector(options = {}) {
  const tailStates = new Map;
  const getTailState = (sessionID) => tailStates.get(sessionID) ?? (tailStates.set(sessionID, createTailMonitorState()), tailStates.get(sessionID));
  return { inject: (sessionID) => buildCompactionContextPrompt(sessionID ? options.history?.(sessionID) : undefined), getTailState, clear: (sessionID) => tailStates.delete(sessionID) };
}
function extractTodos(response) {
  const payload = response;
  if (Array.isArray(payload?.data))
    return payload.data;
  return Array.isArray(response) ? response : [];
}
function hasDetailedTodos(todos) {
  return todos.some((todo) => !isAtlasBootstrapTodo(todo));
}
function isAtlasBootstrapTodoList(todos) {
  return todos.length > 0 && todos.every(isAtlasBootstrapTodo);
}
function shouldRestoreOverCurrentTodos(input) {
  if (input.currentTodos.length === 0)
    return true;
  if (!isAtlasBootstrapTodoList(input.currentTodos))
    return false;
  return hasDetailedTodos(input.snapshot);
}
function replaceAtlasBootstrapTodos(requestedTodos, snapshot) {
  return isAtlasBootstrapTodoList(requestedTodos) && hasDetailedTodos(snapshot) ? snapshot : requestedTodos;
}
function getMessageInfo(value) {
  if (!isRecord(value) || !isRecord(value.info))
    return;
  const info = value.info;
  const modelValue = isRecord(info.model) ? info.model : undefined;
  const model = modelValue && typeof modelValue.providerID === "string" && typeof modelValue.modelID === "string" ? { providerID: modelValue.providerID, modelID: modelValue.modelID, ...typeof modelValue.variant === "string" ? { variant: modelValue.variant } : {} } : undefined;
  return { role: typeof info.role === "string" ? info.role : undefined, agent: typeof info.agent === "string" ? info.agent : undefined, model, providerID: typeof info.providerID === "string" ? info.providerID : undefined, modelID: typeof info.modelID === "string" ? info.modelID : undefined, tools: isRecord(info.tools) ? Object.fromEntries(Object.entries(info.tools).filter(([, value2]) => value2 === true || value2 === false || value2 === "allow" || value2 === "deny" || value2 === "ask")) : undefined };
}
function getMessageParts(value) {
  if (!isRecord(value) || !Array.isArray(value.parts))
    return [];
  return value.parts.filter(isRecord).map((part) => ({ type: typeof part.type === "string" ? part.type : undefined, text: typeof part.text === "string" ? part.text : undefined, thinking: typeof part.thinking === "string" ? part.thinking : undefined }));
}
function extractMessages(value) {
  return Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.data) ? value.data : [];
}
function isUnstableTask(task) {
  const modelID = task.model?.modelID?.toLowerCase();
  return task.isUnstableAgent === true || (modelID ? modelID.includes("gemini") || modelID.includes("minimax") : false);
}
function buildUnstableAgentReminder(task, summary, idleMs) {
  return `Unstable background agent appears idle for ${Math.round(idleMs / 1000)}s.

Task ID: ${task.id}
Description: ${task.description}
Agent: ${task.agent}
Status: ${task.status}
Session ID: ${task.sessionId ?? "N/A"}

Thinking summary (first ${THINKING_SUMMARY_MAX_CHARS} chars):
${summary ?? "(No thinking trace available)"}

Suggested actions:
- background_output task_id="${task.id}" full_session=true include_thinking=true include_tool_results=true message_limit=50
- background_cancel taskId="${task.id}"

This is a reminder only. No automatic action was taken.`;
}
function getTodoProgressSnapshot(todos) {
  return todos.map((todo) => ({ key: todo.id ?? `${todo.content}:${todo.priority}`, status: todo.status })).sort((left, right) => left.key.localeCompare(right.key)).map(({ key, status }) => `${key}=${status}`).join("|");
}
function trackContinuationProgress(input) {
  const previousIncompleteCount = input.state.lastIncompleteCount;
  const nextSnapshot = input.todos ? getTodoProgressSnapshot(input.todos) : undefined;
  input.state.lastIncompleteCount = input.incompleteCount;
  const hasProgressed = previousIncompleteCount !== undefined && (input.incompleteCount < previousIncompleteCount || nextSnapshot !== undefined && input.previousSnapshot !== undefined && nextSnapshot !== input.previousSnapshot);
  if (hasProgressed) {
    input.state.stagnationCount = 0;
    input.state.awaitingPostInjectionProgressCheck = false;
  } else if (previousIncompleteCount !== undefined && input.state.awaitingPostInjectionProgressCheck) {
    input.state.stagnationCount += 1;
    input.state.awaitingPostInjectionProgressCheck = false;
  }
  return { nextSnapshot, hasProgressed, stagnationCount: input.state.stagnationCount };
}
function createTodoContinuationEnforcer() {
  const states = new Map;
  return { getState: (sessionID) => states.get(sessionID) ?? (states.set(sessionID, { stagnationCount: 0 }), states.get(sessionID)), markRecovering: (sessionID) => {
    states.set(sessionID, { ...states.get(sessionID), stagnationCount: states.get(sessionID)?.stagnationCount ?? 0 });
  }, cleanup: (sessionID) => states.delete(sessionID) };
}
function extractSessionNotificationText(message) {
  return (message?.parts ?? []).filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text?.trim() ?? "").filter(Boolean).join(`
`);
}
function findLastSessionNotificationMessage(messages, role) {
  for (let index = messages.length - 1;index >= 0; index--) {
    const message = messages[index];
    if (message.info?.role === role && !(role === "assistant" && message.info.error) && extractSessionNotificationText(message))
      return message;
  }
  return;
}
function buildReadyNotificationContent(input) {
  const messages = input.messages ?? [];
  const lastUserText = collapseWhitespace(extractSessionNotificationText(findLastSessionNotificationMessage(messages, "user")));
  const lastAssistantLine = getLastNonEmptyLine(extractSessionNotificationText(findLastSessionNotificationMessage(messages, "assistant")));
  const detailLines = [lastUserText ? `User: ${lastUserText}` : "", lastAssistantLine ? `Assistant: ${lastAssistantLine}` : ""].filter(Boolean);
  return { title: `${input.baseTitle} \xB7 ${input.sessionTitle?.trim() || input.sessionID}`, message: detailLines.length > 0 ? [input.baseMessage, ...detailLines].join(`
`) : input.baseMessage };
}
function createSessionNotification(options) {
  const platform = options.platform ?? normalizeNotificationPlatform(process.platform);
  return { platform, defaultSoundPath: getDefaultNotificationSoundPath(platform), buildContent: (input) => buildReadyNotificationContent({ ...input, baseTitle: options.baseTitle, baseMessage: options.baseMessage }) };
}
function isPrereleaseVersion(version) {
  return version.includes("-");
}
function isDistTag(version) {
  return !/^\d/.test(version);
}
function isPrereleaseOrDistTag(version) {
  return !!version && (isPrereleaseVersion(version) || isDistTag(version));
}
function extractChannel(version) {
  if (!version)
    return "latest";
  if (isDistTag(version))
    return version;
  const prerelease = version.split("-")[1];
  return prerelease?.match(/^(alpha|beta|rc|canary|next)/)?.[1] ?? "latest";
}
function shouldShowAutoUpdateToast(result, options) {
  return options.showStartupToast !== false && options.autoUpdate !== false && result.needsUpdate && !result.isLocalDev && !!result.currentVersion && !!result.latestVersion;
}
function createAutoUpdateCheckerHook(options) {
  return { shouldShowToast: (result) => shouldShowAutoUpdateToast(result, options), extractChannel };
}
function listClaudeCodeHookNames() {
  return ["experimental.session.compacting", "chat.message", "tool.execute.before", "tool.execute.after", "event", "dispose"];
}
function createClaudeCodeHooksHook() {
  return Object.fromEntries(listClaudeCodeHookNames().map((name) => [name, true]));
}
function shouldRunPreemptiveCompaction(input) {
  if (input.compacted || input.inProgress || !input.cached || input.actualLimit === null || !input.cached.modelID)
    return { shouldRun: false, usageRatio: 0 };
  if (input.lastCompactionTime && input.now - input.lastCompactionTime < PREEMPTIVE_COMPACTION_COOLDOWN_MS)
    return { shouldRun: false, usageRatio: 0 };
  const usageRatio = ((input.cached.tokens.input ?? 0) + (input.cached.tokens.cache?.read ?? 0)) / input.actualLimit;
  return { shouldRun: usageRatio >= PREEMPTIVE_COMPACTION_THRESHOLD, usageRatio };
}
function buildPreemptiveCompactionFailureToast(error) {
  return { title: "Preemptive compaction failed", message: `Context window is above ${Math.round(PREEMPTIVE_COMPACTION_THRESHOLD * 100)}% and auto-compaction could not run. The session may grow large. Error: ${String(error)}`, variant: "warning", duration: 1e4 };
}
function getRuntimeFallbackErrorMessage(error) {
  return getRecoveryErrorMessage(error);
}
function extractRuntimeFallbackStatusCode(error, retryOnErrors = [429, 500, 502, 503, 504]) {
  const direct = extractStatusCodeFromObject(error);
  if (direct !== undefined)
    return direct;
  const match = getRuntimeFallbackErrorMessage(error).match(new RegExp(`\\b(${retryOnErrors.join("|")})\\b`));
  return match ? Number.parseInt(match[1], 10) : undefined;
}
function classifyRuntimeFallbackErrorType(error) {
  const message = getRuntimeFallbackErrorMessage(error);
  const name = extractRuntimeFallbackErrorName(error)?.toLowerCase().replace(/[_-]/g, "");
  if (name?.includes("loadapi") || /api.?key.?is.?missing/i.test(message) && /environment variable/i.test(message))
    return "missing_api_key";
  if (/api.?key/i.test(message) && /must be a string/i.test(message))
    return "invalid_api_key";
  if (name?.includes("modelnotfound") || /model\s+not\s+found/i.test(message))
    return "model_not_found";
  if (name?.includes("quotaexceeded") || name?.includes("resourceexhausted") || /quota.?exceeded|insufficient.?quota|out\s+of\s+credits?|payment.?required/i.test(message))
    return "quota_exceeded";
  return;
}
function containsRuntimeFallbackErrorContent(parts) {
  const errors = (parts ?? []).filter((part) => part.type === "error").map((part) => part.text).filter((text) => typeof text === "string");
  return errors.length > 0 ? { hasError: true, errorMessage: errors.join(`
`) || undefined } : { hasError: false };
}
function isRuntimeFallbackRetryableError(error, retryOnErrors = [429, 500, 502, 503, 504]) {
  const type = classifyRuntimeFallbackErrorType(error);
  return type === "missing_api_key" || type === "model_not_found" || type === "quota_exceeded" || !!(extractRuntimeFallbackStatusCode(error, retryOnErrors) && retryOnErrors.includes(extractRuntimeFallbackStatusCode(error, retryOnErrors))) || RUNTIME_RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(getRuntimeFallbackErrorMessage(error)));
}
function createRuntimeFallbackHook(config = {}) {
  return { isRetryableError: (error) => isRuntimeFallbackRetryableError(error, config.retry_on_errors ?? [429, 500, 502, 503, 504]), classifyErrorType: classifyRuntimeFallbackErrorType };
}
function parseUserRequest(promptText) {
  const match = promptText.match(/<user-request>\s*([\s\S]*?)\s*<\/user-request>/i);
  if (!match)
    return { planName: null, explicitWorktreePath: null };
  let rawArg = match[1].trim();
  if (!rawArg)
    return { planName: null, explicitWorktreePath: null };
  const worktreeMatch = rawArg.match(WORKTREE_FLAG_PATTERN);
  const explicitWorktreePath = worktreeMatch ? worktreeMatch[1] ?? null : null;
  if (worktreeMatch)
    rawArg = rawArg.replace(worktreeMatch[0], "").trim();
  const cleanedArg = rawArg.replace(START_WORK_KEYWORD_PATTERN, "").trim();
  const quoted = cleanedArg.match(WRAPPING_QUOTES_PATTERN);
  return { planName: (quoted ? quoted[2].trim() : cleanedArg) || null, explicitWorktreePath };
}
function parseWorktreeListPorcelain(output) {
  const entries = [];
  let current;
  for (const line of output.split(`
`).map((value) => value.trim())) {
    if (!line) {
      if (current?.path)
        entries.push({ path: current.path, branch: current.branch, bare: current.bare ?? false });
      current = undefined;
    } else if (line.startsWith("worktree "))
      current = { path: line.slice("worktree ".length).trim() };
    else if (current && line.startsWith("branch "))
      current.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    else if (current && line === "bare")
      current.bare = true;
  }
  if (current?.path)
    entries.push({ path: current.path, branch: current.branch, bare: current.bare ?? false });
  return entries;
}
function resolveStartWorkTemplate(promptText, input) {
  if (!promptText.includes("<session-context>") || !promptText.includes(START_WORK_TEMPLATE_MARKER))
    return null;
  return `${promptText.replace(/\$SESSION_ID/g, input.sessionID).replace(/\$TIMESTAMP/g, input.timestamp)}

---
${input.contextInfo}`;
}
function createStartWorkHook() {
  return { parseUserRequest, parseWorktreeListPorcelain, resolveStartWorkTemplate };
}
function parseTrackedTaskFromPrompt(prompt) {
  const lines = prompt.split(/\r?\n/);
  const taskHeaderIndex = lines.findIndex((line) => TASK_SECTION_HEADER_PATTERN.test(line.trim()));
  if (taskHeaderIndex < 0)
    return null;
  for (let index = taskHeaderIndex + 1;index < Math.min(lines.length, taskHeaderIndex + 6); index++) {
    const candidate = lines[index]?.trim();
    if (!candidate)
      continue;
    const finalWaveMatch = candidate.match(FINAL_WAVE_TASK_LINE_PATTERN);
    if (finalWaveMatch?.[1] && finalWaveMatch[2])
      return { key: `final-wave:${finalWaveMatch[1].toLowerCase()}`, label: finalWaveMatch[1].toUpperCase(), title: finalWaveMatch[2].trim() };
    const todoMatch = candidate.match(TODO_TASK_LINE_PATTERN);
    if (todoMatch?.[1] && todoMatch[2])
      return { key: `todo:${todoMatch[1]}`, label: todoMatch[1], title: todoMatch[2].trim() };
  }
  return null;
}
function buildAtlasSingleTaskPrompt(prompt) {
  return prompt.includes("<system-") ? prompt : `<system-reminder>${ATLAS_SINGLE_TASK_DIRECTIVE}</system-reminder>
${prompt}`;
}
function shouldWarnAtlasDirectModification(input) {
  return ["write", "edit", "multiedit"].includes(input.tool.toLowerCase()) && !!input.filePath && input.isOmoPath !== true;
}
function resolveAtlasPendingTaskRef(input) {
  if (!input.callID)
    return null;
  if (input.requestedSessionId)
    return { kind: "skip", reason: "explicit_resume" };
  const task = input.prompt ? parseTrackedTaskFromPrompt(input.prompt) : null;
  if (!task)
    return null;
  return input.existingKeys?.includes(task.key) ? { kind: "skip", reason: "ambiguous_task_key", task } : { kind: "track", task };
}
function createAtlasHook() {
  return { parseTrackedTaskFromPrompt, buildAtlasSingleTaskPrompt, shouldWarnAtlasDirectModification, resolveAtlasPendingTaskRef };
}
function describePathClassification(pathClassification) {
  switch (pathClassification) {
    case "icloud":
      return "iCloud Drive";
    case "onedrive":
      return "OneDrive";
    case "desktop-sync":
      return "Desktop sync (macOS)";
    case "network-drive":
      return "Network drive";
    case "unknown":
      return "filesystem that does not support fsync";
  }
}
function formatFsyncSkipWarning(entries) {
  if (entries.length === 0)
    return "";
  const classification = selectMostCommonPathClassification(entries);
  const shownEntries = entries.slice(0, 5);
  const hiddenCount = entries.length - shownEntries.length;
  const pathLines = shownEntries.map((entry) => `  - ${entry.filePath} (code: ${entry.errorCode})`);
  if (hiddenCount > 0)
    pathLines.push(`  ... and ${hiddenCount} more`);
  const environmentLines = classification === "unknown" ? [] : [`Detected environment: ${describePathClassification(classification)}`];
  const durabilityLine = classification === "unknown" ? "  - Crash durability is best-effort because this filesystem does not support fsync." : "  - Crash durability is best-effort on this filesystem (this is normal for iCloud, OneDrive, network drives, antivirus-locked paths).";
  return [
    "---",
    `[fsync-skipped] ${entries.length} write(s) bypassed fsync because the underlying filesystem rejected the syscall.`,
    "",
    ...environmentLines,
    "Affected paths:",
    ...pathLines,
    "",
    "What this means:",
    "  - The write+rename succeeded \u2014 the file is on disk, atomicity is preserved.",
    durabilityLine,
    "  - No action required. Operation completed successfully."
  ].join(`
`);
}
function resolveLegacyPluginToastDecision(input) {
  if (!input.hasLegacyEntry)
    return;
  if (input.migration?.migrated) {
    return {
      title: "Plugin Entry Migrated",
      message: `"${input.migration.from}" has been renamed to "${input.migration.to}" in your opencode.json.
No action needed.`,
      variant: "success",
      duration: 8000
    };
  }
  return {
    title: "Legacy Plugin Name Detected",
    message: `Update your opencode.json: "oh-my-opencode" has been renamed to "oh-my-openagent".
Run: bunx oh-my-opencode install`,
    variant: "warning",
    duration: 1e4
  };
}
function createLegacyPluginToastDecisionHook(getInput) {
  let fired = false;
  return {
    event: async ({ event }) => {
      if (event.type !== "session.created" || fired || extractParentId(event.properties))
        return;
      fired = true;
      return resolveLegacyPluginToastDecision(getInput());
    }
  };
}
var SYSTEM_DIRECTIVE_PREFIX = "[SYSTEM DIRECTIVE:";
var PLANNING_CONSULT_WARNING = `

---

[SYSTEM DIRECTIVE: PROMETHEUS READ ONLY]

You are being invoked by Prometheus, a planning agent restricted to .omo/*.md plan files only.

**CRITICAL CONSTRAINTS:**
- DO NOT modify any files (no Write, Edit, or any file mutations)
- DO NOT execute commands that change system state
- DO NOT create, delete, or rename files
- ONLY provide analysis, recommendations, and information

**YOUR ROLE**: Provide consultation, research, and analysis to assist with planning.
Return your findings and recommendations. The actual implementation will be handled separately after planning is complete.

---

`;
var PROMETHEUS_WORKFLOW_REMINDER = `

---

[SYSTEM DIRECTIVE: PROMETHEUS READ ONLY]

## PROMETHEUS MANDATORY WORKFLOW REMINDER

**You are writing a work plan. STOP AND VERIFY you completed ALL steps:**

**DID YOU COMPLETE STEPS 1-2 BEFORE WRITING THIS PLAN?**
**AFTER WRITING, WILL YOU DO STEPS 4-5?**

If you skipped steps, STOP NOW. Go back and complete them.

---

`;
var NOTEPAD_DIRECTIVE = `
<Work_Context>
## Notepad Location (for recording learnings)
NOTEPAD PATH: .omo/notepads/{plan-name}/
- learnings.md: Record patterns, conventions, successful approaches
- issues.md: Record problems, blockers, gotchas encountered
- decisions.md: Record architectural choices and rationales
- problems.md: Record unresolved issues, technical debt

You SHOULD append findings to notepad files after completing work.
IMPORTANT: Always APPEND to notepad files - never overwrite or use Edit tool.

## Plan Location (subagent: READ ONLY)
PLAN PATH: .omo/plans/{plan-name}.md

SUBAGENT PLAN RESTRICTION (applies to YOU, the delegated worker \u2014 NOT to the Orchestrator):
- You may READ the plan to understand your assigned tasks
- You may READ checkbox items to know what to work on
- You MUST NOT edit the plan file or mark checkboxes \u2014 that is the Orchestrator's job
- The Orchestrator (Atlas) updates checkboxes after verifying your completed work
</Work_Context>
`;
function isPrometheusAgent(agentName) {
  return agentName?.toLowerCase().includes("prometheus") ?? false;
}
function isPrometheusAllowedFile(filePath, workspaceRoot) {
  const resolvedPath = resolve(workspaceRoot, filePath);
  const relativePath = relative(workspaceRoot, resolvedPath);
  return !relativePath.startsWith("..") && !isAbsolute(relativePath) && /(^|[/\\])\.omo([/\\]|$)/i.test(relativePath) && resolvedPath.toLowerCase().endsWith(".md");
}
function createPrometheusMdOnlyHook(options) {
  return {
    "tool.execute.before": async (input, output) => {
      if (!isPrometheusAgent(options.agentName))
        return;
      const toolName = input.tool ?? "";
      if (toolName === "task" || toolName === "call_omo_agent") {
        const prompt = typeof output.args.prompt === "string" ? output.args.prompt : undefined;
        if (prompt && !prompt.includes(SYSTEM_DIRECTIVE_PREFIX))
          replaceToolArgs(output, { prompt: PLANNING_CONSULT_WARNING + prompt });
        return;
      }
      if (!["Write", "Edit", "write", "edit"].includes(toolName))
        return;
      const filePath = getWritePath(output.args);
      if (!filePath)
        return;
      if (!isPrometheusAllowedFile(filePath, options.workspaceRoot))
        throw new Error(`[prometheus-md-only] Prometheus is a planning agent. File operations restricted to .omo/*.md plan files only. Use task() to delegate implementation. Attempted to modify: ${filePath}. APOLOGIZE TO THE USER, REMIND OF YOUR PLAN WRITING PROCESSES, TELL USER WHAT YOU WILL GOING TO DO AS THE PROCESS, WRITE THE PLAN`);
      const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");
      if (normalizedPath.includes(".omo/plans/"))
        output.message = (output.message ?? "") + PROMETHEUS_WORKFLOW_REMINDER;
    }
  };
}
function addSisyphusJuniorNotepadDirective(prompt) {
  return prompt.includes(SYSTEM_DIRECTIVE_PREFIX) ? prompt : NOTEPAD_DIRECTIVE + prompt;
}
function createSisyphusJuniorNotepadHook(options) {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "task" || !options.isCallerOrchestrator)
        return;
      const prompt = typeof output.args.prompt === "string" ? output.args.prompt : undefined;
      if (prompt)
        replaceToolArgs(output, { prompt: addSisyphusJuniorNotepadDirective(prompt) });
    }
  };
}
function hasQuestions(args) {
  return Array.isArray(args.questions);
}
function isSignedThinkingPart(part) {
  return (part.type === "thinking" || part.type === "redacted_thinking") && typeof part.signature === "string" && part.signature.length > 0 && part.synthetic !== true;
}
function hasContentParts(parts) {
  return parts.some((part) => part.type === "tool" || part.type === "tool_use" || part.type === "text");
}
function startsWithThinkingBlock(parts) {
  const firstPart = parts[0];
  return firstPart?.type === "thinking" || firstPart?.type === "redacted_thinking" || firstPart?.type === "reasoning";
}
function findPreviousThinkingPart(messages, currentIndex) {
  for (let index = currentIndex - 1;index >= 0; index--) {
    const message = messages[index];
    if (message.info.role !== "assistant")
      continue;
    const thinkingPart = message.parts.find(isSignedThinkingPart);
    if (thinkingPart)
      return thinkingPart;
  }
  return;
}
function extractModelName(model) {
  return model.includes("/") ? model.split("/").pop() ?? model : model;
}
function normalizeAnthropicModelID(modelID) {
  return extractModelName(modelID).toLowerCase().replace(/\./g, "-");
}
function getAgentConfigKey(agent) {
  return agent.trim().toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
}
function getNativeSisyphusGptVariant(model) {
  if (model.modelID === "gpt-5.5" || model.modelID.endsWith("/gpt-5.5"))
    return "medium";
  return;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isCategoryReminderTargetAgent(agent) {
  const key = getAgentConfigKey(agent ?? "");
  return key === "sisyphus" || key === "sisyphus-junior" || key === "atlas" || key.includes("sisyphus") || key.includes("atlas");
}
function selectMostCommonPathClassification(entries) {
  const counts = new Map;
  for (const entry of entries)
    counts.set(entry.pathClassification, (counts.get(entry.pathClassification) ?? 0) + 1);
  let selected = "unknown";
  let selectedCount = -1;
  for (const [classification, count] of counts) {
    if (count > selectedCount) {
      selected = classification;
      selectedCount = count;
    }
  }
  return selected;
}
function extractParentId(properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties))
    return;
  const info = properties.info;
  if (!info || typeof info !== "object" || Array.isArray(info))
    return;
  const parentID = info.parentID;
  return typeof parentID === "string" && parentID.length > 0 ? parentID : undefined;
}
function tokenizeTmuxCommand(command) {
  const tokens = [];
  let current = "";
  let quote;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if ((char === "'" || char === '"') && quote === undefined) {
      quote = char;
    } else if (char === quote) {
      quote = undefined;
    } else if (char === " " && quote === undefined) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current)
    tokens.push(current);
  return tokens;
}
function findTmuxSubcommand(tokens) {
  const optionsWithArgs = new Set(["-L", "-S", "-f", "-c", "-T"]);
  for (let index = 0;index < tokens.length; ) {
    const token = tokens[index];
    if (token === "--")
      return tokens[index + 1] ?? "";
    if (optionsWithArgs.has(token)) {
      index += 2;
    } else if (token.startsWith("-")) {
      index++;
    } else {
      return token;
    }
  }
  return "";
}
function extractTmuxSessionName(tokens, subCommand) {
  const flag = subCommand === "new-session" ? findFlagValue(tokens, "-s") ?? findFlagValue(tokens, "-t") : findFlagValue(tokens, "-t");
  return flag ? flag.split(":")[0].split(".")[0] : null;
}
function findFlagValue(tokens, flag) {
  const index = tokens.indexOf(flag);
  return index >= 0 ? tokens[index + 1] ?? null : null;
}
function extractRealPromptText(parts) {
  return parts.filter((part) => part.type === "text" && part.synthetic !== true).map((part) => part.text || "").join(" ");
}
function getUltraworkDirective(agentName, modelID) {
  if (agentName === "prometheus" || agentName === "plan")
    return `<ultrawork-mode>
Planner ultrawork mode activated. Say "ULTRAWORK MODE ENABLED!" first.
</ultrawork-mode>`;
  if (modelID?.toLowerCase().includes("gpt"))
    return `<ultrawork-mode>
**MANDATORY**: You MUST say "ULTRAWORK MODE ENABLED!" to the user as your first response when this mode activates.
[CODE RED] Maximum precision required.
</ultrawork-mode>`;
  if (modelID?.toLowerCase().includes("gemini"))
    return `<ultrawork-mode>
**MANDATORY**: Say "ULTRAWORK MODE ENABLED!" first. Gemini ultrawork protocol active.
</ultrawork-mode>`;
  return `<ultrawork-mode>
**MANDATORY**: You MUST say "ULTRAWORK MODE ENABLED!" to the user as your first response when this mode activates.
</ultrawork-mode>`;
}
function isHashlineTextFile(firstLine) {
  return COLON_READ_LINE_PATTERN.test(firstLine) || PIPE_READ_LINE_PATTERN.test(firstLine);
}
function parseHashlineReadLine(line) {
  const colonMatch = COLON_READ_LINE_PATTERN.exec(line);
  if (colonMatch)
    return { lineNumber: Number.parseInt(colonMatch[1], 10), content: colonMatch[2] };
  const pipeMatch = PIPE_READ_LINE_PATTERN.exec(line);
  return pipeMatch ? { lineNumber: Number.parseInt(pipeMatch[1], 10), content: pipeMatch[2] } : null;
}
function transformHashlineLines(lines) {
  const result = [];
  for (const line of lines) {
    const parsed = parseHashlineReadLine(line);
    if (!parsed) {
      result.push(...lines.slice(result.length));
      break;
    }
    result.push(parsed.content.endsWith(OPENCODE_LINE_TRUNCATION_SUFFIX) ? line : formatHashLine(parsed.lineNumber, parsed.content));
  }
  return result;
}
function extractMetadataLineCount(metadata) {
  if (!metadata || typeof metadata !== "object")
    return;
  for (const value of [metadata.lineCount, metadata.linesWritten, metadata.lines]) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0)
      return value;
  }
  return;
}
function trimSet(set, max) {
  while (set.size > max) {
    const next = set.values().next();
    if (next.done)
      return;
    set.delete(next.value);
  }
}
function trimMap(map, max) {
  while (map.size > max) {
    const next = map.keys().next();
    if (next.done)
      return;
    map.delete(next.value);
  }
}
function getRecoveryErrorMessage(error) {
  if (!error)
    return "";
  if (typeof error === "string")
    return error.toLowerCase();
  const errorObj = error;
  const paths = [errorObj.data, errorObj.error, errorObj, errorObj.data?.error];
  for (const obj of paths) {
    if (obj && typeof obj === "object") {
      const message = obj.message;
      if (typeof message === "string" && message.length > 0)
        return message.toLowerCase();
    }
  }
  try {
    return JSON.stringify(error).toLowerCase();
  } catch {
    return "";
  }
}
function collapseWhitespace(text) {
  return text.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean).join(" ");
}
function getLastNonEmptyLine(text) {
  return text.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
}
function extractStatusCodeFromObject(error) {
  if (!error || typeof error !== "object")
    return;
  const object = error;
  return [object.statusCode, object.status, object.data?.statusCode, object.error?.statusCode, object.cause?.statusCode].find((code) => typeof code === "number");
}
function extractRuntimeFallbackErrorName(error) {
  if (!error || typeof error !== "object")
    return;
  const object = error;
  for (const value of [object.name, object.data?.name, object.error?.name, object.data?.error?.name])
    if (typeof value === "string" && value.length > 0)
      return value;
  return;
}
function collectTokenLimitTextSources(error) {
  if (typeof error === "string")
    return [error];
  if (!error || typeof error !== "object")
    return [];
  const object = error;
  const data = object.data;
  const nestedError = object.error?.error;
  const candidates = [data?.responseBody, object.message, object.error?.message, object.body, object.details, object.reason, object.description, nestedError?.message, data?.message, data?.error];
  const textSources = candidates.filter((candidate) => typeof candidate === "string");
  if (textSources.length > 0)
    return textSources;
  try {
    const serialized = JSON.stringify(object);
    return isTokenLimitErrorText(serialized) ? [serialized] : [];
  } catch {
    return [];
  }
}
function extractTokensFromLimitMessage(message) {
  for (const pattern of TOKEN_LIMIT_PATTERNS) {
    const match = message.match(pattern);
    if (!match)
      continue;
    const first = Number.parseInt(match[1], 10);
    const second = Number.parseInt(match[2], 10);
    return first > second ? { currentTokens: first, maxTokens: second } : { currentTokens: second, maxTokens: first };
  }
  return null;
}
function extractTokenLimitMessageIndex(text) {
  const match = text.match(/messages\.(\d+)/);
  return match ? Number.parseInt(match[1], 10) : undefined;
}
function extractRequestId(text) {
  const match = text.match(/"request_id"\s*:\s*"([^"]+)"/);
  return match?.[1];
}
function findLastUserMessageIndex(messages) {
  for (let index = messages.length - 1;index >= 0; index--) {
    if (messages[index]?.info.role === "user")
      return index;
  }
  return -1;
}
function resolveMessageSessionID(messages) {
  for (let index = messages.length - 1;index >= 0; index--) {
    const sessionID = messages[index]?.info.sessionID;
    if (typeof sessionID === "string" && sessionID.length > 0)
      return sessionID;
  }
  return;
}
function createSyntheticUserMessage(sessionID, content) {
  return { info: { role: "user", sessionID }, parts: [{ type: "text", text: content, synthetic: true }] };
}
function isAtlasBootstrapTodo(todo) {
  return todo.id === "orchestrate-plan" || todo.id === "pass-final-wave" || todo.content === "Complete ALL implementation tasks" || todo.content === "Pass Final Verification Wave - ALL reviewers APPROVE";
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function xxHash32(input, seed) {
  const data = new TextEncoder().encode(input);
  let offset = 0;
  let hash;
  if (data.length >= 16) {
    const limit = data.length - 16;
    let value1 = seed + 2654435761 + 2246822519 >>> 0;
    let value2 = seed + 2246822519 >>> 0;
    let value3 = seed >>> 0;
    let value4 = seed - 2654435761 >>> 0;
    while (offset <= limit) {
      value1 = round32(value1, readUint32LittleEndian(data, offset));
      offset += 4;
      value2 = round32(value2, readUint32LittleEndian(data, offset));
      offset += 4;
      value3 = round32(value3, readUint32LittleEndian(data, offset));
      offset += 4;
      value4 = round32(value4, readUint32LittleEndian(data, offset));
      offset += 4;
    }
    hash = rotateLeft32(value1, 1) + rotateLeft32(value2, 7) >>> 0;
    hash = hash + rotateLeft32(value3, 12) >>> 0;
    hash = hash + rotateLeft32(value4, 18) >>> 0;
  } else {
    hash = seed + 374761393 >>> 0;
  }
  hash = hash + data.length >>> 0;
  while (offset + 4 <= data.length) {
    hash = hash + Math.imul(readUint32LittleEndian(data, offset), 3266489917) >>> 0;
    hash = Math.imul(rotateLeft32(hash, 17), 668265263) >>> 0;
    offset += 4;
  }
  while (offset < data.length) {
    hash = hash + Math.imul(data[offset] ?? 0, 374761393) >>> 0;
    hash = Math.imul(rotateLeft32(hash, 11), 2654435761) >>> 0;
    offset++;
  }
  hash = Math.imul((hash ^ hash >>> 15) >>> 0, 2246822519) >>> 0;
  hash = Math.imul((hash ^ hash >>> 13) >>> 0, 3266489917) >>> 0;
  return (hash ^ hash >>> 16) >>> 0;
}
function round32(accumulator, value) {
  return Math.imul(rotateLeft32(accumulator + Math.imul(value, 2246822519) >>> 0, 13), 2654435761) >>> 0;
}
function rotateLeft32(value, bits) {
  return (value << bits | value >>> 32 - bits) >>> 0;
}
function readUint32LittleEndian(input, offset) {
  return ((input[offset] ?? 0) | (input[offset + 1] ?? 0) << 8 | (input[offset + 2] ?? 0) << 16 | (input[offset + 3] ?? 0) << 24) >>> 0;
}
function listOmoHooks() {
  return HOOKS.map(cloneHook);
}
function getOmoHook(name) {
  const hook = HOOKS.find((candidate) => candidate.name === name);
  return hook ? cloneHook(hook) : undefined;
}
function listOmoHooksByStatus(status) {
  return HOOKS.filter((hook) => hook.status === status).map(cloneHook);
}
function listOmoHooksByWave(wave) {
  return HOOKS.filter((hook) => hook.wave === wave).map(cloneHook);
}
function listOmoHooksByExitPath(exitPath) {
  return HOOKS.filter((hook) => hook.exitPath === exitPath).map(cloneHook);
}
function summarizeOmoHookPorting() {
  return HOOKS.reduce((summary, hook) => {
    summary[hook.status] += 1;
    return summary;
  }, { "behavior-mapped": 0, "adapter-bound": 0, missing: 0 });
}
function hook(name, originalExport, domain, status, options = {}) {
  return {
    name,
    originalExport,
    domain,
    status,
    standalonePackage: options.standalonePackage,
    originalSource: options.originalSource ?? `src/hooks/${name}/${options.sourceFile ?? "hook.ts"}`,
    exitPath: resolveOmoHookExitPath(status, domain),
    targetPackage: options.standalonePackage ?? resolveOmoHookTargetPackage(status, domain),
    wave: resolveWave(domain),
    testTypes: resolveOmoHookTestTypes(status),
    adapterImpact: resolveAdapterImpact(status, domain)
  };
}
function cloneHook(hook2) {
  return { ...hook2, testTypes: [...hook2.testTypes] };
}
function resolveOmoHookExitPath(status, domain) {
  if (status === "adapter-bound")
    return "adapter-bound";
  if (status === "behavior-mapped")
    return "pure-domain-port";
  if (domain === "workflow" || domain === "plugin-loader" || domain === "terminal" || domain === "environment")
    return "limited-redesign";
  if (domain === "notification" || domain === "maintenance")
    return "limited-redesign";
  return "pure-domain-port";
}
function resolveOmoHookTargetPackage(status, domain) {
  if (status === "adapter-bound")
    return "@oh-my-opencode/adapter-opencode";
  if (domain === "model")
    return "@oh-my-opencode/model-core";
  if (domain === "context")
    return "@oh-my-opencode/agents-md-core";
  if (domain === "loop")
    return "@oh-my-opencode/ulw-kernel";
  return "@oh-my-opencode/hooks-core";
}
function resolveWave(domain) {
  if (domain === "guard" || domain === "prompting" || domain === "model" || domain === "validation" || domain === "quality")
    return "phase-1-safety";
  if (domain === "context-window" || domain === "recovery" || domain === "tool-output" || domain === "runtime")
    return "phase-2-recovery";
  if (domain === "loop" || domain === "task" || domain === "team" || domain === "workflow" || domain === "todo" || domain === "commands")
    return "phase-3-orchestration";
  if (domain === "notification" || domain === "environment" || domain === "terminal" || domain === "maintenance" || domain === "agent")
    return "phase-4-host";
  return "phase-5-adapter-convergence";
}
function resolveOmoHookTestTypes(status) {
  if (status === "adapter-bound")
    return ["adapter", "integration", "manual-qa"];
  if (status === "behavior-mapped")
    return ["unit", "parity", "manual-qa"];
  return ["unit", "parity"];
}
function resolveAdapterImpact(status, domain) {
  if (status === "adapter-bound")
    return "high";
  if (domain === "notification" || domain === "terminal" || domain === "environment" || domain === "workflow" || domain === "plugin-loader")
    return "high";
  if (domain === "team" || domain === "task" || domain === "loop" || domain === "runtime")
    return "medium";
  return status === "behavior-mapped" ? "none" : "low";
}
export {
  truncateToolOutput,
  truncateQuestionLabels,
  truncateQuestionLabel,
  transformHashlineReadOutput,
  trackContinuationProgress,
  trackAssistantOutput,
  summarizeOmoHookPorting,
  standaloneHookBehaviors,
  shouldWarnContextWindow,
  shouldWarnAtlasDirectModification,
  shouldTreatAssistantPartAsOutput,
  shouldSkipForInternalAgent,
  shouldShowAutoUpdateToast,
  shouldRunPreemptiveCompaction,
  shouldRestoreOverCurrentTodos,
  shouldRemindAgentUsage,
  shouldForwardBackgroundEvent,
  shouldBlockTaskTodoTool,
  resolveWriteExistingFileGuard,
  resolveThinkMode,
  resolveTeamToolGate,
  resolveStartWorkTemplate,
  resolveOmoHookTestTypes,
  resolveOmoHookTargetPackage,
  resolveOmoHookExitPath,
  resolveModelAgentGuard,
  resolveLegacyPluginToastDecision,
  resolveAtlasPendingTaskRef,
  resolveAnthropicEffort,
  replaceAtlasBootstrapTodos,
  repairThinkingBlockMessages,
  repairMissingToolResults,
  removeKeywordCodeBlocks,
  recoverJsonErrorOutput,
  recoverEmptyTaskOutput,
  recoverEditErrorOutput,
  parseWorktreeListPorcelain,
  parseUserRequest,
  parseTrackedTaskFromPrompt,
  parseTmuxCommand,
  parseSlashCommand,
  parseAnthropicTokenLimitError,
  normalizeWebFetchRedirectOutput,
  normalizeNotificationPlatform,
  looksLikeSlashCommand,
  listOmoHooksByWave,
  listOmoHooksByStatus,
  listOmoHooksByExitPath,
  listOmoHooks,
  listClaudeCodeHookNames,
  isUnstableTask,
  isUniversalTeamTool,
  isTokenLimitErrorText,
  isSimpleFileReadCommand,
  isRuntimeFallbackRetryableError,
  isPrometheusAllowedFile,
  isPrometheusAgent,
  isPrereleaseVersion,
  isPrereleaseOrDistTag,
  isOverwriteEnabled,
  isOrchestratorAgentForReminder,
  isOpusModel,
  isOmoWorkspacePath,
  isOmoTmuxSession,
  isNotepadPath,
  isGptNativeSisyphusModel,
  isGptModel,
  isEffortUnsupportedModel,
  isDistTag,
  isClaudeProvider,
  isAtlasBootstrapTodoList,
  isAlreadyHighReasoningVariant,
  injectTeamModeStatus,
  injectTeamMailboxMessage,
  hasSignedThinkingBlocksInHistory,
  hasIncompleteTodos,
  hasDetailedTodos,
  getTodoProgressSnapshot,
  getStandaloneHookBehavior,
  getRuntimeFallbackErrorMessage,
  getOmoHook,
  getMessageParts,
  getMessageInfo,
  getDefaultNotificationSoundPath,
  formatSlashCommandTemplate,
  formatImageResizeAppendix,
  formatHashLine,
  formatFsyncSkipWarning,
  formatBytes,
  findSlashCommandPartIndex,
  findLastSessionNotificationMessage,
  finalizeTrackedAssistantMessage,
  extractUnavailableToolName,
  extractTodos,
  extractSessionNotificationText,
  extractRuntimeFallbackStatusCode,
  extractMessages,
  extractMessageIndex,
  extractChannel,
  escapePowerShellSingleQuotedText,
  escapeAppleScriptText,
  detectThinkKeyword,
  detectSlashCommand,
  detectKeywordsWithType,
  detectKeywords,
  detectErrorType,
  detectDelegateTaskError,
  detectBannedInteractiveCommand,
  describePathClassification,
  createWriteExistingFileGuardHook,
  createWebFetchRedirectGuardHook,
  createToolPairValidatorHook,
  createToolOutputTruncatorHook,
  createTodoContinuationEnforcer,
  createThinkingBlockValidatorHook,
  createThinkModeHook,
  createTeamToolGating,
  createTeamModeStatusInjector,
  createTeamMailboxInjector,
  createTasksTodowriteDisablerHook,
  createTaskResumeInfoHook,
  createTailMonitorState,
  createStopContinuationGuardHook,
  createStartWorkHook,
  createSisyphusJuniorNotepadHook,
  createSessionRecoveryHook,
  createSessionNotification,
  createRuntimeFallbackHook,
  createQuestionLabelTruncatorHook,
  createPrometheusMdOnlyHook,
  createNotepadWriteGuardHook,
  createNonInteractiveEnvHook,
  createModelAgentGuardHook,
  createLegacyPluginToastDecisionHook,
  createKeywordDetectorHook,
  createJsonErrorRecoveryHook,
  createInteractiveBashSessionHook,
  createIdleNotificationState,
  createIdleNotificationScheduler,
  createHashlineReadEnhancerHook,
  createEmptyTaskResponseDetectorHook,
  createEditErrorRecoveryHook,
  createDelegateTaskRetryHook,
  createContextWindowMonitorHook,
  createCompactionContextInjector,
  createClaudeCodeHooksHook,
  createCategorySkillReminderHook,
  createBashFileReadGuardHook,
  createBackgroundNotificationHook,
  createAutoUpdateCheckerHook,
  createAutoSlashCommandHook,
  createAtlasHook,
  createAnthropicEffortHook,
  createAgentUsageReminderHook,
  containsRuntimeFallbackErrorContent,
  computeLineHash,
  classifyRuntimeFallbackErrorType,
  calculateTargetDimensions,
  calculateImageTokens,
  buildWindowsToastScript,
  buildWebFetchRedirectLimitMessage,
  buildUnstableAgentReminder,
  buildTeamModeStatusContent,
  buildTeamMailboxTurnMarker,
  buildReadyNotificationContent,
  buildPreemptiveCompactionFailureToast,
  buildNonInteractiveGitCommand,
  buildNonInteractiveEnvPrefix,
  buildInteractiveBashSessionReminder,
  buildHashlineWriteSuccessOutput,
  buildContextWindowReminder,
  buildCompactionContextPrompt,
  buildCategorySkillReminderMessage,
  buildAtlasSingleTaskPrompt,
  applyTodoDescriptionOverride,
  appendTaskResumeInfo,
  appendContextWindowStatus,
  addSisyphusJuniorNotepadDirective,
  addDelegateTaskRetryGuidance,
  TOOL_RESULT_PLACEHOLDER,
  TODOWRITE_DESCRIPTION,
  THINKING_SUMMARY_MAX_CHARS,
  TASK_TODOWRITE_REPLACEMENT_MESSAGE,
  TASK_TODOWRITE_BLOCKED_TOOLS,
  QUESTION_LABEL_MAX_LENGTH,
  PROMETHEUS_WORKFLOW_REMINDER,
  PLANNING_CONSULT_WARNING,
  NOTEPAD_DIRECTIVE,
  MAX_WEBFETCH_REDIRECTS,
  JSON_ERROR_TOOL_EXCLUDE_LIST,
  JSON_ERROR_REMINDER_MARKER,
  JSON_ERROR_REMINDER,
  EMPTY_TASK_RESPONSE_WARNING,
  EDIT_ERROR_REMINDER,
  EDIT_ERROR_PATTERNS,
  CONTEXT_WARNING_THRESHOLD,
  BASH_FILE_READ_WARNING_MESSAGE,
  AUTO_SLASH_COMMAND_TAG_OPEN,
  AUTO_SLASH_COMMAND_TAG_CLOSE,
  AGENT_USAGE_REMINDER_MESSAGE
};
