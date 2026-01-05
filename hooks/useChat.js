import { useState, useEffect, useCallback } from 'react';
import { mapMessageToGiftedChat } from '../utils/chatHelpers';

export default function useChat({ feathersClient, conversationId, targetUser, currentUserId, companyId, config }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState(null);
  const [conversationType, setConversationType] = useState('individual');
  const [resolvedId, setResolvedId] = useState(conversationId);

  const markAsRead = useCallback(async (idToMark) => {
    try {
      const activeId = idToMark || resolvedId;
      if (!activeId) return;
      await feathersClient.service('api/messages').patch(
        null,
        { isRead: true },
        {
          query: {
            conversationId: activeId,
            companyId,
            senderId: { $ne: currentUserId },
            isRead: false
          }
        }
      );
    } catch (error) {
      console.error('Failed to mark messages as read', error);
    }
  }, [resolvedId, currentUserId, companyId, feathersClient]);

  const fetchMessages = useCallback(async () => {
    if (!feathersClient) return;
    
    try {
      setLoading(true);
      let activeId = resolvedId;

      // 1. Resolve ID if missing but targetUser is provided
      if (!activeId && targetUser) {
        const convService = feathersClient.service('api/conversations');
        
        // Find existing individual chat
        const query = { type: 'individual', companyId };
        if (targetUser.userType === 'member') {
            query.clientId = targetUser.id;
            query.staffId = currentUserId;
        } else {
            query.staffId = targetUser.id; 
        }

        const response = await convService.find({ query });
        const resData = response.data || response;
        
        let existingConv = resData.find(c => 
          c.participants && c.participants.some(p => String(p.userId) === String(targetUser.id))
        );

        if (!existingConv) {
          // Create new one if not found
          const createData = {
            type: 'individual',
            name: targetUser.name,
            createdByType: 'staff'
          };
          if (targetUser.userType === 'member') {
            createData.clientId = targetUser.id;
            createData.staffId = currentUserId;
          } else {
            createData.staffId = targetUser.id;
          }
          existingConv = await convService.create(createData, { query: { companyId } });
        }

        if (existingConv) {
          activeId = existingConv.id;
          setResolvedId(activeId);
        }
      }

      if (!activeId) {
          setLoading(false);
          return;
      }
      
      // Fetch conversation details
      const conv = await feathersClient.service('api/conversations').get(activeId, { query: { companyId } });
      setConversation(conv);
      const type = (conv.type === 'group' || conv.isGroup) ? 'group' : 'individual';
      setConversationType(type);
      
      // Fetch history (limit 50)
      const response = await feathersClient.service('api/messages').find({
        query: {
          conversationId: activeId,
          companyId,
          $sort: { createdAt: -1 },
          $limit: 50
        }
      });
      
      const feathersMessages = response.data || response;
      const historicalGifted = feathersMessages.map(msg => mapMessageToGiftedChat(msg, currentUserId));
      
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => String(m._id)));
        const newHistory = historicalGifted.filter(m => !existingIds.has(String(m._id)));
        return [...prev, ...newHistory].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      });
      
      markAsRead(activeId);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  }, [resolvedId, targetUser, currentUserId, companyId, feathersClient, markAsRead]);

  const sendMessage = useCallback(async (messageData) => {
    try {
      return await feathersClient.service('api/messages').create(messageData, { query: { companyId } });
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }, [feathersClient, companyId]);

  // Real-time listeners
  useEffect(() => {
    // Eager reset when switching conversations
    setMessages([]);
    setLoading(true);
    setConversation(null);

    fetchMessages();

    const messagesService = feathersClient.service('api/messages');

    const onMessageCreated = (message) => {
      if (message.conversationId == resolvedId) {
        setMessages((prev) => {
          // 1. Check if message already exists by ID
          const existsById = prev.some(m => String(m._id) === String(message.id));
          if (existsById) return prev;
          
          // 2. Check if this is a response to our optimistic update
          const isFromMe = String(message.senderId) === String(currentUserId);
          if (isFromMe) {
            // Find an optimistic message with same content sent recently
            const optimisticIdx = prev.findIndex(m => 
              m.pending === true && 
              (m.text === message.content || m.image === message.content || m.documentUrl === message.content)
            );
            
            if (optimisticIdx !== -1) {
              // Replace optimistic message with real message
              const newMessages = [...prev];
              newMessages[optimisticIdx] = mapMessageToGiftedChat(message, currentUserId);
              return newMessages;
            }
          }
          
          const mapped = mapMessageToGiftedChat(message, currentUserId);
          return [mapped, ...prev];
        });

        if (String(message.senderId) !== String(currentUserId)) {
          markAsRead(resolvedId);
        }
      }
    };

    const onMessagePatched = (updated) => {
      if (updated.conversationId == resolvedId) {
        setMessages(prev =>
          prev.map(m => {
            if (String(m._id) === String(updated.id)) {
              return { ...m, received: !!updated.isRead };
            }
            return m;
          })
        );
      }
    };

    const onMessageRemoved = (removed) => {
      setMessages(prev => prev.filter(m => String(m._id) !== String(removed.id)));
    };

    messagesService.on('created', onMessageCreated);
    messagesService.on('patched', onMessagePatched);
    messagesService.on('removed', onMessageRemoved);

    return () => {
      messagesService.removeListener('created', onMessageCreated);
      messagesService.removeListener('patched', onMessagePatched);
      messagesService.removeListener('removed', onMessageRemoved);
    };
  }, [resolvedId, currentUserId, feathersClient, fetchMessages, markAsRead]);

  return {
    messages,
    setMessages,
    loading,
    conversation,
    conversationType,
    fetchMessages,
    sendMessage,
    markAsRead,
  };
}
