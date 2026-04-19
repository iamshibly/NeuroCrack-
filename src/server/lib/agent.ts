// Thin orchestrator: normalizes input, detects correction mode, then delegates
// to the LangGraph-powered academic agent.
// For multi-question messages, splits first and runs each sub-question
// through the graph independently before aggregating the results.

import type { AskRequest, AgentResponse } from "./types";
import { runGraph } from "./graph";
import {
  isMultiQuestion,
  splitIntoSubQuestions,
  runMultiQuestionAgent,
} from "./multi-question";
import { normalizeQuestion } from "./question-normalization";
import { detectCorrectionMode } from "./correction-mode";

export async function runAgent(req: AskRequest): Promise<AgentResponse> {
  // Diagnostic: confirm whether image reached the agent
  const hasImage = !!req.image;
  console.log(`[agent] chatId=${req.chatId} hasImage=${hasImage} imageLen=${req.image?.length ?? 0} msgLen=${req.message.length} subject="${req.selectedSubject}"`);

  // 1. Normalize imperfect math/science notation before any processing
  const { normalized, wasNormalized } = normalizeQuestion(req.message);
  const correctionMode = detectCorrectionMode(req.message);
  if (correctionMode) {
    console.log(`[agent:correction] detected — recentMessages=${req.recentMessages?.length ?? 0}`);
  }

  const processedReq: AskRequest = {
    ...req,
    message: wasNormalized ? normalized : req.message,
    normalizedMessage: wasNormalized ? normalized : undefined,
    isCorrectionMode: correctionMode,
  };

  // 2. Only split when there is clear multi-question structure (2+ numbered boundaries).
  // Single questions, Roman MCQs, and part-based questions pass through as-is.
  if (isMultiQuestion(processedReq.message)) {
    const subs = splitIntoSubQuestions(processedReq.message);
    if (subs.length >= 2) {
      return runMultiQuestionAgent(processedReq, subs);
    }
  }

  return runGraph(processedReq);
}
