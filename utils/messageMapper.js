// Message mapper utilities

export const convertBackendToLocal = (backendMessages, currentUserId) => {
  return backendMessages.map(msg => ({
    id: msg.id,
    content: msg.content,
    type: msg.type,
    senderId: msg.senderId,
    conversationId: msg.conversationId,
    createdAt: msg.createdAt,
    isRead: msg.isRead,
    senderName: msg.senderName,
    senderType: msg.senderType,
    pending: false,
  }));
};

export const convertLocalToBackend = (localMessage, conversationId, currentUserId) => {
  return {
    conversationId,
    content: localMessage.text,
    type: 'text',
    senderId: currentUserId,
  };
};
