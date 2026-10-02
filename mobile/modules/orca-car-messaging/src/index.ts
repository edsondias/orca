import { requireNativeModule } from 'expo-modules-core'
import { Platform } from 'react-native'

export type CarMessage = { sender: 'agent' | 'me' | 'orca'; text: string; timestamp: number }
export type CarConversation = {
  id: string
  title: string
  messages: CarMessage[]
  canReply: boolean
}
export type CarReplyEvent = { conversationId: string; text: string }
export type CarMarkReadEvent = { conversationId: string }
export type CarProjectionEvent = { projecting: boolean }
type Subscription = { remove(): void }

type NativeCarMessaging = {
  startSession(): Promise<void>
  stopSession(): Promise<void>
  publishConversation(conversation: CarConversation): Promise<void>
  clearConversation(conversationId: string): Promise<void>
  clearConversations(): Promise<void>
  addListener(event: 'onCarReply', listener: (event: CarReplyEvent) => void): Subscription
  addListener(event: 'onCarMarkRead', listener: (event: CarMarkReadEvent) => void): Subscription
  addListener(
    event: 'onProjectionChanged',
    listener: (event: CarProjectionEvent) => void
  ): Subscription
}

const native: NativeCarMessaging | null =
  Platform.OS === 'android' ? requireNativeModule<NativeCarMessaging>('OrcaCarMessaging') : null

const noop: Subscription = { remove() {} }

export const OrcaCarMessaging = {
  startSession: async () => native?.startSession(),
  stopSession: async () => native?.stopSession(),
  publishConversation: async (conversation: CarConversation) =>
    native?.publishConversation(conversation),
  clearConversation: async (conversationId: string) => native?.clearConversation(conversationId),
  clearConversations: async () => native?.clearConversations(),
  addReplyListener: (listener: (event: CarReplyEvent) => void) =>
    native?.addListener('onCarReply', listener) ?? noop,
  addMarkReadListener: (listener: (event: CarMarkReadEvent) => void) =>
    native?.addListener('onCarMarkRead', listener) ?? noop,
  addProjectionListener: (listener: (event: CarProjectionEvent) => void) =>
    native?.addListener('onProjectionChanged', listener) ?? noop
}
