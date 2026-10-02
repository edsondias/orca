package expo.modules.orcacarmessaging

enum class CarActionKind { REPLY, MARK_AS_READ }

data class CarActionSpec(val kind: CarActionKind, val remoteInputCount: Int, val showsUserInterface: Boolean)

const val REMOTE_INPUT_KEY = "orca_car_reply"
const val CAR_CHANNEL_ID = "orca-car"
const val CAR_GROUP = "orca-car-conversations"

internal fun carActionSpecs(canReply: Boolean): List<CarActionSpec> = buildList {
  if (canReply) add(CarActionSpec(CarActionKind.REPLY, remoteInputCount = 1, showsUserInterface = false))
  add(CarActionSpec(CarActionKind.MARK_AS_READ, remoteInputCount = 0, showsUserInterface = false))
}

// Android Auto requires one PendingIntent per conversation and action, identical across updates.
internal fun replyRequestCode(conversationId: String): Int = ("reply:$conversationId").hashCode()
internal fun markReadRequestCode(conversationId: String): Int = ("read:$conversationId").hashCode()
internal fun conversationNotificationId(conversationId: String): Int = ("car:$conversationId").hashCode()
