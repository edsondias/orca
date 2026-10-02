package expo.modules.orcacarmessaging

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput

class CarReplyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: return
    when (intent.action) {
      ACTION_REPLY -> {
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(REMOTE_INPUT_KEY)?.toString() ?: return
        if (!OrcaCarMessagingModule.emitReply(conversationId, text)) logDropped(conversationId)
      }
      ACTION_MARK_READ -> if (!OrcaCarMessagingModule.emitMarkRead(conversationId)) logDropped(conversationId)
    }
  }

  // Never log the reply text.
  private fun logDropped(conversationId: String) {
    Log.w(TAG, "Dropped car action for $conversationId: no live module")
  }

  companion object {
    private const val TAG = "OrcaCarMessaging"
    const val ACTION_REPLY = "expo.modules.orcacarmessaging.REPLY"
    const val ACTION_MARK_READ = "expo.modules.orcacarmessaging.MARK_READ"
    const val EXTRA_CONVERSATION_ID = "conversationId"
  }
}
