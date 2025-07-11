import { Container } from '@n8n/di';
import type express from 'express';

import { WorkflowExecutionService } from '@/workflows/workflow-execution.service';
import { addNodeIds, replaceInvalidCredentials } from '@/workflow-helpers';
import type { IWorkflowBase, StartNodeData } from 'n8n-workflow';

import type { WorkflowRequest } from '../../../types';
import { apiKeyHasScope } from '../../shared/middlewares/global.middleware';

export = {
	executeWorkflow: [
		apiKeyHasScope('workflow:update'),
		async (
			req: WorkflowRequest.ExecuteWorkflow,
			res: express.Response,
		): Promise<express.Response> => {
			try {
				const body = req.body as any;
				const rawWorkflowData = body.workflowData || {};

				// 保证 id 字段和 isArchived 字段存在
				const workflowData: IWorkflowBase = {
					...rawWorkflowData,
					id: rawWorkflowData.id ?? '',
					isArchived: rawWorkflowData.isArchived ?? false,
				};

				await replaceInvalidCredentials(workflowData);
				addNodeIds(workflowData);
				workflowData.active = false;

				// 保证 startNodes 的 sourceData 存在
				let startNodes: StartNodeData[] | undefined = undefined;
				if (body.startNodes) {
					startNodes = body.startNodes.map((node: any) => ({
						name: node.name,
						sourceData: node.sourceData !== undefined ? node.sourceData : null,
					}));
				}

				const workflowExecutionService = Container.get(WorkflowExecutionService);

				const executionResult = await workflowExecutionService.executeManually(
					{
						workflowData,
						runData: body.runData,
						startNodes,
						destinationNode: body.destinationNode,
						triggerToStartFrom: body.triggerToStartFrom,
						agentRequest: body.agentRequest,
					},
					req.user,
					req.headers['push-ref'] as string,
					2, // 使用最新的部分执行版本
				);

				if (executionResult.waitingForWebhook) {
					return res.json({
						status: 'waiting_for_webhook',
						message: 'Workflow is waiting for webhook',
						executionId: executionResult.executionId,
					});
				}

				return res.json({
					status: 'success',
					executionId: executionResult.executionId,
					message: 'Workflow executed successfully',
				});
			} catch (error) {
				return res.status(500).json({
					status: 'error',
					message: error instanceof Error ? error.message : 'Internal server error',
				});
			}
		},
	],
};
