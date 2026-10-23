// The mobile app ships English copy only; every string the car speaks lives here.
export const CAR_COPY = {
  sent: (label: string) => `✓ Sent: ${label}`,
  promptChanged: 'The agent already moved on; reply discarded',
  hostUnverifiable: "No contact with the host; can't tell if the agent is alive",
  agentExited: 'Agent exited',
  waitingForInput: 'The agent is waiting for your input',
  desktopTooOld: 'Update Orca desktop to reply from the car',
  replyFromPhone: 'Reply to this one from your phone',
  disconnected: 'No connection to the desktop',
  replyRejected: 'Reply not sent',
  chooseOption: 'Say the option number, or yes or no'
} as const
