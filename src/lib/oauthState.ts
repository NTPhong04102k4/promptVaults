let inProgress = false

export function setOAuthInProgress(value: boolean): void {
  inProgress = value
}

export function isOAuthInProgress(): boolean {
  return inProgress
}
