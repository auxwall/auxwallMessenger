// Chat helper utilities

export const mapMessageToGiftedChat = (msg, currentUserId, apiBaseUrl) => {
  const isMine = parseInt(msg.senderId) === parseInt(currentUserId);
  const name = isMine ? 'You' : (msg.senderName || (msg.senderType === 'member' ? 'Member' : 'Staff'));

  const isForwarded = (msg.content && msg.content.startsWith(':::fw:::')) || (msg.text && msg.text.startsWith(':::fw:::'));

  const resolveUrl = (url) => {
    if (!url) return url;
    let cleanUrl = typeof url === 'string' ? url.replace(':::fw:::', '').trim().replace(/\\/g, '/') : url;
    
    // If local file URI on device, return as is
    if (typeof cleanUrl === 'string' && (cleanUrl.startsWith('file://') || cleanUrl.startsWith('content://'))) {
      return cleanUrl;
    }
    
    let baseUrl = apiBaseUrl || '';
    if (baseUrl.endsWith('/api')) {
      baseUrl = baseUrl.slice(0, -4);
    }
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    // If it's an HTTP URL, rewrite origin to active baseUrl so old or mismatched ports (e.g. :8000) match the active server port (:8009)
    if (typeof cleanUrl === 'string' && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
      if (baseUrl) {
        const pathMatch = cleanUrl.match(/^https?:\/\/[^\/]+(\/.*)$/i);
        if (pathMatch && pathMatch[1]) {
          return `${baseUrl}${pathMatch[1]}`;
        }
      }
      return cleanUrl;
    }

    if (typeof cleanUrl === 'string') {
      if (cleanUrl.startsWith('/')) {
        return `${baseUrl}${cleanUrl}`;
      }
      if (cleanUrl.startsWith('uploads/')) {
        return `${baseUrl}/${cleanUrl}`;
      }
      return `${baseUrl}/uploads/${cleanUrl}`;
    }
    
    return cleanUrl;
  };

  const giftedMsg = {
    _id: msg.id || Math.random().toString(),
    text: (msg.type === 'text' || msg.type === 'deleted') ? (msg.content ? msg.content.replace(':::fw:::', '') : '') : '',
    createdAt: msg.createdAt,
    user: {
      _id: String(msg.senderId),
      name: name,
      avatar: msg.senderType === 'member' ? null : 'https://api.faceoffgym.com/public/staff-avatar-placeholder.png',
    },
    sent: true,
    received: !!msg.isRead,
    pending: msg.pending || false,
    messageType: msg.type,
    isForwarded: isForwarded
  };

  if (msg.type === 'image') {
    giftedMsg.image = resolveUrl(msg.content);
  }
  
  if (msg.type === 'document') {
    const cleanContent = msg.content ? msg.content.replace(':::fw:::', '') : '';
    giftedMsg.text = `📄 ${cleanContent.split('/').pop()}`;
    giftedMsg.documentUrl = resolveUrl(msg.content);
  }
  
  if (msg.type === 'audio') {
    giftedMsg.audio = resolveUrl(msg.content);
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
