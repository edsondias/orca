package expo.modules.orcacarmessaging

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CarConversationSpecTest {
  @Test
  fun `reply action carries exactly one remote input and opens no UI`() {
    val reply = carActionSpecs(canReply = true).single { it.kind == CarActionKind.REPLY }
    assertEquals(1, reply.remoteInputCount)
    assertFalse(reply.showsUserInterface)
  }

  @Test
  fun `mark as read is always present and opens no UI`() {
    for (canReply in listOf(true, false)) {
      val markRead = carActionSpecs(canReply).single { it.kind == CarActionKind.MARK_AS_READ }
      assertEquals(0, markRead.remoteInputCount)
      assertFalse(markRead.showsUserInterface)
    }
  }

  @Test
  fun `a conversation without a fenced prompt offers no reply`() {
    assertTrue(carActionSpecs(canReply = false).none { it.kind == CarActionKind.REPLY })
  }

  @Test
  fun `request codes are stable per conversation and distinct per action`() {
    assertEquals(replyRequestCode("agent-a"), replyRequestCode("agent-a"))
    assertNotEquals(replyRequestCode("agent-a"), markReadRequestCode("agent-a"))
    assertNotEquals(replyRequestCode("agent-a"), replyRequestCode("agent-b"))
  }

  @Test
  fun `notification id is stable per conversation`() {
    assertEquals(conversationNotificationId("agent-a"), conversationNotificationId("agent-a"))
  }
}
