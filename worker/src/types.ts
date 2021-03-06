export type OutputDiagnostics = {
  operationId?: string
  startedAt?: number
  uploadedAt?: number
  archiveSize?: number
  wavSize?: number
  outSize?: number
  replayGain?: number
  workingDirectory?: string
  outFile?: string
  error?: string
  finishedAt?: number
  events: { time: number; event: string }[]
  warnings: { time: number; message: string }[]
  selectedChart?: any
  availableCharts?: string[]
  soundConversationStatus?: string
  wavSizeBeforeTrim?: number
  wavSizeAfterTrimStart?: number
  wavSizeAfterTrimEnd?: number
}
