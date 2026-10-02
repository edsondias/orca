package expo.modules.orcacarmessaging

import android.content.Intent
import androidx.car.app.connection.CarConnection
import androidx.core.content.ContextCompat
import androidx.core.os.bundleOf
import androidx.lifecycle.Observer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference
import kotlinx.coroutines.launch

class OrcaCarMessagingModule : Module() {
  private val published = mutableSetOf<String>()
  private var connection: CarConnection? = null
  private val projectionObserver = Observer<Int> { type ->
    sendEvent(ON_PROJECTION, bundleOf("projecting" to (type == CarConnection.CONNECTION_TYPE_PROJECTION)))
  }

  override fun definition() = ModuleDefinition {
    Name("OrcaCarMessaging")
    Events(ON_REPLY, ON_MARK_READ, ON_PROJECTION)

    OnCreate {
      active = WeakReference(this@OrcaCarMessagingModule)
      val context = requireNotNull(appContext.reactContext)
      appContext.mainQueue.launch {
        connection = CarConnection(context).also { it.type.observeForever(projectionObserver) }
      }
    }

    OnDestroy {
      appContext.mainQueue.launch { connection?.type?.removeObserver(projectionObserver) }
    }

    AsyncFunction("startSession") {
      val context = requireNotNull(appContext.reactContext)
      ContextCompat.startForegroundService(context, Intent(context, OrcaCarSessionService::class.java))
    }

    AsyncFunction("stopSession") {
      val context = requireNotNull(appContext.reactContext)
      context.stopService(Intent(context, OrcaCarSessionService::class.java))
    }

    AsyncFunction("publishConversation") { conversation: Map<String, Any?> ->
      val context = requireNotNull(appContext.reactContext)
      val data = parseConversation(conversation)
      published.add(data.id)
      CarNotificationPublisher(context).apply { ensureChannel(); publish(data) }
    }

    AsyncFunction("clearConversation") { conversationId: String ->
      val context = requireNotNull(appContext.reactContext)
      CarNotificationPublisher(context).clear(listOf(conversationId))
      published.remove(conversationId)
    }

    AsyncFunction("clearConversations") {
      val context = requireNotNull(appContext.reactContext)
      CarNotificationPublisher(context).clear(published.toList())
      published.clear()
    }
  }

  private fun parseConversation(raw: Map<String, Any?>): CarConversationData {
    @Suppress("UNCHECKED_CAST")
    val messages = (raw["messages"] as? List<Map<String, Any?>>).orEmpty().map {
      CarMessageData(it["sender"] as String, it["text"] as String, (it["timestamp"] as Number).toLong())
    }
    return CarConversationData(raw["id"] as String, raw["title"] as String, messages, raw["canReply"] as Boolean)
  }

  companion object {
    private const val ON_REPLY = "onCarReply"
    private const val ON_MARK_READ = "onCarMarkRead"
    private const val ON_PROJECTION = "onProjectionChanged"
    private var active: WeakReference<OrcaCarMessagingModule>? = null

    fun emitReply(conversationId: String, text: String) {
      active?.get()?.sendEvent(ON_REPLY, bundleOf("conversationId" to conversationId, "text" to text))
    }

    fun emitMarkRead(conversationId: String) {
      active?.get()?.sendEvent(ON_MARK_READ, bundleOf("conversationId" to conversationId))
    }
  }
}
