// Chat helper utilities

export const mapMessageToGiftedChat = (msg, currentUserId) => {
  const isMine = parseInt(msg.senderId) === parseInt(currentUserId);
  const name = isMine ? 'You' : (msg.senderName || (msg.senderType === 'member' ? 'Member' : 'Staff'));
  
  const giftedMsg = {
    _id: msg.id || Math.random().toString(),
    text: msg.type === 'text' ? msg.content : '',
    createdAt: msg.createdAt,
    user: {
      _id: String(msg.senderId),
      name: name,
      avatar: msg.senderType === 'member' ? null : 'https://api.faceoffgym.com/public/staff-avatar-placeholder.png',
    },
    sent: true,
    received: !!msg.isRead,
    pending: msg.pending || false,
    messageType: msg.type 
  };

  if (msg.type === 'image') {
    giftedMsg.image = msg.content;
  }
  
  if (msg.type === 'document') {
    giftedMsg.text = `📄 ${msg.content.split('/').pop()}`;
    giftedMsg.documentUrl = msg.content;
  }
  
  if (msg.type === 'audio') {
    giftedMsg.audio = msg.content;
  }

  return giftedMsg;
};

export const buildUploadUrl = (apiBaseUrl) => {
  let baseUrl = apiBaseUrl;
  if (baseUrl.endsWith('/api')) {
    baseUrl = baseUrl.replace('/api', '');
  }
  return `${baseUrl}/api/chat-upload`;
};

export const formatConversationTitle = (conversation, currentUserId) => {
  if (conversation.type === 'group') {
    return conversation.name || 'Group Chat';
  }
  
  // For individual chats, find the other participant
  const myId = parseInt(currentUserId);
  const otherParticipant = conversation.participants?.find(
    p => parseInt(p.userId || p.id) !== myId
  );
  
  return otherParticipant?.fullName || otherParticipant?.name || conversation.name || conversation.title || 'Chat';
};

export const getConversationImage = (conversation, currentUserId) => {
  const isGroup = conversation.type === 'group' || conversation.isGroup;

  // This prevents the 'pic swap' bug where the server broadcasts an imageURL
  // meant for the sender, not the receiver.
  if (!isGroup) {
    const myId = parseInt(currentUserId);
    const otherParticipant = conversation.participants?.find(
      p => parseInt(p.userId || p.id) !== myId
    );
    if (otherParticipant?.imageURL || otherParticipant?.image) {
      return otherParticipant.imageURL || otherParticipant.image;
    }
  }

  // 2. Fallback to conversation-level image (standard for groups)
  if (conversation.imageURL && conversation.imageURL !== '#' && conversation.imageURL !== '') {
    return conversation.imageURL;
  }

  if (isGroup) {
    return conversation.groupImage || null;
  }
  
  return null;
};
