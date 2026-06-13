import { readSettings } from "@askai/core";
import {
  createConversationRepository,
  createMessageRepository,
  initializeDatabase,
  mapSettingsToRetentionPolicy,
  type RetentionRunSummary,
  runRetentionPruning,
} from "@askai/db";

export const retentionAlarmName = "askai.retention.prune";
export const retentionAlarmPeriodMinutes = 60 * 12;

export async function runRetentionPass(): Promise<RetentionRunSummary> {
  const settings = await readSettings(chrome.storage.local);
  const policy = mapSettingsToRetentionPolicy(settings);

  await initializeDatabase();
  const conversations = createConversationRepository();
  const messages = createMessageRepository();

  return runRetentionPruning(policy, {
    listConversations: () => conversations.list({ includeArchived: true }),
    async aggregateConversationBytes(conversationId) {
      const rows = await messages.listByConversation(conversationId);
      return rows.reduce((total, message) => total + message.storageBytes, 0);
    },
    deleteConversation: (id) => conversations.delete(id),
  });
}

export function scheduleRetentionAlarm(): void {
  chrome.alarms.create(retentionAlarmName, {
    delayInMinutes: 5,
    periodInMinutes: retentionAlarmPeriodMinutes,
  });
}
