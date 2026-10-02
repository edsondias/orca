package expo.modules.orcacarmessaging

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput

data class CarMessageData(val sender: String, val text: String, val timestamp: Long)
data class CarConversationData(val id: String, val title: String, val messages: List<CarMessageData>, val canReply: Boolean)

class CarNotificationPublisher(private val context: Context) {
  private val me = Person.Builder().setName("Me").setKey("me").build()

  fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CAR_CHANNEL_ID, "Orca in the car", NotificationManager.IMPORTANCE_HIGH)
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  fun publish(conversation: CarConversationData) {
    val agent = Person.Builder().setName(conversation.title).setKey(conversation.id).build()
    val orca = Person.Builder().setName("Orca").setKey("orca").build()
    val style = NotificationCompat.MessagingStyle(me).setConversationTitle(conversation.title).setGroupConversation(false)
    for (message in conversation.messages) {
      val sender = when (message.sender) { "me" -> me; "orca" -> orca; else -> agent }
      style.addMessage(NotificationCompat.MessagingStyle.Message(message.text, message.timestamp, sender))
    }
    val builder = NotificationCompat.Builder(context, CAR_CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setStyle(style)
      .setGroup(CAR_GROUP)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
    for (spec in carActionSpecs(conversation.canReply)) {
      when (spec.kind) {
        CarActionKind.REPLY -> builder.addAction(replyAction(conversation.id))
        CarActionKind.MARK_AS_READ -> builder.addInvisibleAction(markReadAction(conversation.id))
      }
    }
    NotificationManagerCompat.from(context).notify(conversationNotificationId(conversation.id), builder.build())
  }

  fun clear(conversationIds: Collection<String>) {
    val manager = NotificationManagerCompat.from(context)
    conversationIds.forEach { manager.cancel(conversationNotificationId(it)) }
  }

  private fun receiverIntent(action: String, conversationId: String) =
    Intent(context, CarReplyReceiver::class.java).setAction(action).putExtra(CarReplyReceiver.EXTRA_CONVERSATION_ID, conversationId)

  private fun replyAction(conversationId: String): NotificationCompat.Action {
    val pending = PendingIntent.getBroadcast(
      context, replyRequestCode(conversationId), receiverIntent(CarReplyReceiver.ACTION_REPLY, conversationId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )
    return NotificationCompat.Action.Builder(0, "Reply", pending)
      .addRemoteInput(RemoteInput.Builder(REMOTE_INPUT_KEY).build())
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .setShowsUserInterface(false)
      .build()
  }

  private fun markReadAction(conversationId: String): NotificationCompat.Action {
    val pending = PendingIntent.getBroadcast(
      context, markReadRequestCode(conversationId), receiverIntent(CarReplyReceiver.ACTION_MARK_READ, conversationId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Action.Builder(0, "Mark as read", pending)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
      .setShowsUserInterface(false)
      .build()
  }
}
