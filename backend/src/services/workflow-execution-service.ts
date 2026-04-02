import { WorkflowRun } from '../models/workflow.js';
import { AnthropicDraftAdapter, DraftGenerator } from './anthropic-draft-adapter.js';
import { WorkflowRepository } from './workflow-repository.js';

export class WorkflowExecutionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class WorkflowExecutionService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly draftGenerator: DraftGenerator = new AnthropicDraftAdapter()
  ) {}

  async executeRunById(runId: string, actorUserId: string): Promise<WorkflowRun> {
    const run = await this.repository.getRunById(runId);
    if (!run) {
      throw new WorkflowExecutionError('Run not found for execution');
    }

    return this.executeInitialSteps(run, actorUserId);
  }

  async executeInitialSteps(run: WorkflowRun, actorUserId: string): Promise<WorkflowRun> {
    await this.repository.updateStepStatus({
      runId: run.id,
      stepType: 'draft_generation',
      status: 'in_progress'
    });

    try {
      if (run.triggerData.forceFailure === true) {
        throw new WorkflowExecutionError('Draft generation failed due to forceFailure flag');
      }

      const draft = await this.draftGenerator.generate({
        triggerData: run.triggerData,
        context: run.context
      });

      await this.repository.updateStepStatus({
        runId: run.id,
        stepType: 'draft_generation',
        status: 'completed',
        output: {
          draftId: draft.draftId,
          summary: draft.summary,
          generatedAt: draft.generatedAt,
          confidence: draft.confidence,
          model: draft.model,
          tokenUsage: draft.tokenUsage,
          costUsd: draft.costUsd
        }
      });

      await this.repository.createStep({
        runId: run.id,
        stepIndex: 2,
        stepType: 'human_approval',
        input: {
          draftId: draft.draftId,
          summary: draft.summary
        },
        status: 'pending'
      });

      await this.repository.appendRunAuditEvent({
        runId: run.id,
        actorUserId,
        action: 'draft_generated',
        metadata: {
          draftId: draft.draftId,
          confidence: draft.confidence,
          model: draft.model,
          costUsd: draft.costUsd,
          totalTokens: draft.tokenUsage.totalTokens
        }
      });

      await this.repository.appendRunAuditEvent({
        runId: run.id,
        actorUserId,
        action: 'run_pending_approval',
        metadata: {
          status: 'pending_approval'
        }
      });

      const updatedRun = await this.repository.updateRunStatus({
        runId: run.id,
        status: 'pending_approval',
        context: {
          draft,
          llm: {
            model: draft.model,
            confidence: draft.confidence,
            tokenUsage: draft.tokenUsage,
            costUsd: draft.costUsd
          }
        }
      });

      if (!updatedRun) {
        throw new WorkflowExecutionError('Run disappeared before status update');
      }

      return updatedRun;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown draft generation failure';

      await this.repository.updateStepStatus({
        runId: run.id,
        stepType: 'draft_generation',
        status: 'failed',
        output: {
          error: message
        }
      });

      await this.repository.appendRunAuditEvent({
        runId: run.id,
        actorUserId,
        action: 'run_failed',
        metadata: {
          reason: message
        }
      });

      const failedRun = await this.repository.updateRunStatus({
        runId: run.id,
        status: 'failed',
        context: {
          failureReason: message
        }
      });

      if (!failedRun) {
        throw new WorkflowExecutionError('Run disappeared during failure handling');
      }

      return failedRun;
    }
  }

}
