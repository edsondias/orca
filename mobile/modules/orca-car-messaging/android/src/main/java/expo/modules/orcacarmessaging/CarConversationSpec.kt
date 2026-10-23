package expo.modules.orcacarmessaging

enum class CarActionKind { REPLY, MARK_AS_READ }

data class CarActionSpec(val kind: CarActionKind, val remoteInputCount: Int, val showsUserInterface: Boolean)

const val REMOTE_INPUT_KEY = "orca_car_reply"
const val CAR_CHANNEL_ID = "orca-car"
const val CAR_GROUP = "orca-car-conversations"
const val SESSION_CHANNEL_ID = "orca-car-session"
const val CAR_DATA_SCHEME = "orca-car"
const val NOTIFICATION_ICON_RESOURCE = "notification_icon"

// The launcher icon is adaptive and renders as a blob in the status bar; use it only when no monochrome icon exists.
internal fun smallIconResource(notificationIconId: Int, launcherIconId: Int): Int =
  if (notificationIconId != 0) notificationIconId else launcherIconId

// Android Auto drops a conversation without a semantic reply action, so read-only ones offer it too; JS answers with a receipt.
internal fun carActionSpecs(): List<CarActionSpec> = listOf(
  CarActionSpec(CarActionKind.REPLY, remoteInputCount = 1, showsUserInterface = false),
  CarActionSpec(CarActionKind.MARK_AS_READ, remoteInputCount = 0, showsUserInterface = false)
)

// Android Auto requires one PendingIntent per conversation and action, identical across updates.
internal fun replyRequestCode(conversationId: String): Int = ("reply:$conversationId").hashCode()
internal fun markReadRequestCode(conversationId: String): Int = ("read:$conversationId").hashCode()
internal fun conversationNotificationId(conversationId: String): Int = ("car:$conversationId").hashCode()
