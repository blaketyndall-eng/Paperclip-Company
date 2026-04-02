import { WorkflowRun } from '../models/workflow.js';
import { WorkflowRepository } from './workflow-repository.js';

export class WorkflowExecutionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class WorkflowExecutionService {
  constructor(private readonly repository: WorkflowRepository) {}

  async executeInitialSteps(run: WorkflowRun, actorUserId: string): Promise<WorkflowRun> {
    await this.repository.updateStepStatus({
      runId: run.id,
      stepType: 'draft_generation',
      status: 'in_progress'
    });

    try {
      const draft = this.generateDraftStub(run.triggerData, run.context);

      await this.repository.updateStepStatus({
        runId: run.id,
        stepType: 'draft_generation',
        status: 'completed',
        output: draft
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
          draftId: draft.draftId
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
          draft
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

  private generateDraftStub(
    triggerData: Record<string, unknown>,
    context: Record<string, unknown>
  ): { draftId: string; summary: string; generatedAt: string } {
    const shouldFail = triggerData.forceFailure === true;
    if (shouldFail) {
      throw new WorkflowExecutionError('Draft generation failed due to forceFailure flag');
    }

    const source = typeof triggerData.source === 'string' ? triggerData.source : 'unknown';
    const customerId = typeof context.customerId === 'string' ? context.customerId : 'n/a';

    return {
      draftId: `draft-${Date.now()}`,
      summary: `Draft prepared for source=${source}, customer=${customerId}`,
      generatedAt: new Date().toISOString()
    };
  }
}
