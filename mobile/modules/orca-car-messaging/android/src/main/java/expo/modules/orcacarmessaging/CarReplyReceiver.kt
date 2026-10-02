package expo.modules.orcacarmessaging

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput

class CarReplyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: return
    when (intent.action) {
      ACTION_REPLY -> {
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(REMOTE_INPUT_KEY)?.toString() ?: return
        OrcaCarMessagingModule.emitReply(conversationId, text)
      }
      ACTION_MARK_READ -> OrcaCarMessagingModule.emitMarkRead(conversationId)
    }
  }

  companion object {
    const val ACTION_REPLY = "expo.modules.orcacarmessaging.REPLY"
    const val ACTION_MARK_READ = "expo.modules.orcacarmessaging.MARK_READ"
    const val EXTRA_CONVERSATION_ID = "conversationId"
  }
}
