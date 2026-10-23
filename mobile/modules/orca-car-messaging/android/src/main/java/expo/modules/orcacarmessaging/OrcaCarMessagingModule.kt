package expo.modules.orcacarmessaging

import android.content.Intent
import androidx.car.app.connection.CarConnection
import androidx.core.content.ContextCompat
import androidx.core.os.bundleOf
import androidx.lifecycle.LiveData
import androidx.lifecycle.Observer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class OrcaCarMessagingModule : Module() {
  private val published = mutableSetOf<String>()
  private var projectionSource: LiveData<Int>? = null
  @Volatile private var destroyed = false
  private val projectionObserver = Observer<Int> { type ->
    sendEvent(ON_PROJECTION, bundleOf("projecting" to (type == CarConnection.CONNECTION_TYPE_PROJECTION)))
  }

  override fun definition() = ModuleDefinition {
    Name("OrcaCarMessaging")
    Events(ON_REPLY, ON_MARK_READ, ON_PROJECTION)

    OnCreate {
      active = WeakReference(this@OrcaCarMessagingModule)
      val context = requireNotNull(appContext.reactContext).applicationContext
      // The module scope dies with the AppContext, so observer registration runs on the main executor instead.
      ContextCompat.getMainExecutor(context).execute {
        if (destroyed) return@execute
        val source = CarConnection(context).type
        source.observeForever(projectionObserver)
        projectionSource = source
      }
    }

    OnDestroy {
      destroyed = true
      if (active?.get() === this@OrcaCarMessagingModule) active = null
      val context = appContext.reactContext?.applicationContext ?: return@OnDestroy
      ContextCompat.getMainExecutor(context).execute {
        projectionSource?.removeObserver(projectionObserver)
        projectionSource = null
      }
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
    return CarConversationData(raw["id"] as String, raw["title"] as String, messages)
  }

  companion object {
    private const val ON_REPLY = "onCarReply"
    private const val ON_MARK_READ = "onCarMarkRead"
    private const val ON_PROJECTION = "onProjectionChanged"
    @Volatile private var active: WeakReference<OrcaCarMessagingModule>? = null

    // Returns false when no live module exists so the receiver can drop and log.
    fun emitReply(conversationId: String, text: String): Boolean {
      val module = active?.get() ?: return false
      module.sendEvent(ON_REPLY, bundleOf("conversationId" to conversationId, "text" to text))
      return true
    }

    fun emitMarkRead(conversationId: String): Boolean {
      val module = active?.get() ?: return false
      module.sendEvent(ON_MARK_READ, bundleOf("conversationId" to conversationId))
      return true
    }
  }
}
