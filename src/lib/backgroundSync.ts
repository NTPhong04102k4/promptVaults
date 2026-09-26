import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'

import { runSync } from './syncEngine'

export const SYNC_TASK = 'promptvault-sync'

// Must run at module scope (imported by the root layout) so the task exists when the OS
// launches the app headless.
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const summary = await runSync()
    return summary.errors > 0
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync()
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return
  if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) return
  // minutes; the OS decides the real schedule.
  await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 })
}
