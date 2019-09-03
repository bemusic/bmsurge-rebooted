export type OutputDiagnostics = {
  operationId?: string
  startedAt?: number
  workingDirectory?: string
  outFile?: string
  error?: string
  finishedAt?: number
  events: { time: number; event: string }[]
}
