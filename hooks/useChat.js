import { useState, useEffect, useCallback, useRef } from 'react';
import { mapMessageToGiftedChat } from '../utils/chatHelpers';

export default function useChat({ feathersClient, conversationId, targetUser, currentUserId, companyId, config }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const [conversation, setConversation] = useState(null);
  const [conversationType, setConversationType] = useState('individual');
  const [resolvedId, setResolvedId] = useState(conversationId);
  const [hasMore, setHasMore] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const PAGE_LIMIT = 10;
  const mounted = useRef(true);

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
      console.log('Failed to mark messages as read', error);
    }
  }, [resolvedId, currentUserId, companyId, feathersClient]);

  const fetchMessages = useCallback(async () => {
    if (!feathersClient) return;
    
    try {
      setLoading(true);
      setError(null);
      let activeId = resolvedId;

      // 1. Resolve ID if missing but targetUser is provided
      if (!activeId && targetUser) {
        const convService = feathersClient.service('api/conversations');
        
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
      
      const conv = await feathersClient.service('api/conversations').get(activeId, { query: { companyId } });
      
      if (mounted.current) {
        setConversation(conv);
        const type = (conv.type === 'group' || conv.isGroup) ? 'group' : 'individual';
        setConversationType(type);
      }
      
      const response = await feathersClient.service('api/messages').find({
        query: {
          conversationId: activeId,
          companyId,
          $sort: { createdAt: -1 },
          $limit: PAGE_LIMIT
        }
      });
      
      const feathersMessages = response.data || response || [];
      if (mounted.current) {
        setHasMore(feathersMessages.length >= PAGE_LIMIT);
      }
      const historicalGifted = feathersMessages.map(msg => mapMessageToGiftedChat(msg, currentUserId));
      
      if (mounted.current) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => String(m._id)));
          const newHistory = historicalGifted.filter(m => !existingIds.has(String(m._id)));
          return [...prev, ...newHistory].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        });
        markAsRead(activeId);
      }
    } catch (err) {
      console.log('Failed to fetch messages:', err);
      if (mounted.current) {
        setError(err.message || 'Failed to load messages');
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [resolvedId, targetUser, currentUserId, companyId, feathersClient, markAsRead]);

  const sendMessage = useCallback(async (messageData) => {
    try {
      return await feathersClient.service('api/messages').create(messageData, { query: { companyId } });
    } catch (error) {
      console.log('Failed to send message:', error);
      throw error;
    }
  }, [feathersClient, companyId]);

  useEffect(() => {
    mounted.current = true;
    setMessages([]);
    setLoading(true);
    setHasMore(true);
    setConversation(null);

    fetchMessages();

    const socket = feathersClient.io || (feathersClient.getSocket && feathersClient.getSocket());
    
    // Set initial connection state
    if (socket) {
      setIsConnected(socket.connected);
      if (!socket.connected) {
        setError('Connection error. Please check your internet.');
      }
    }

    const handleConnect = () => {
      setIsConnected(true);
      setError(null);
      fetchMessages();
    };

    const handleDisconnect = () => setIsConnected(false);

    if (socket) {
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      setIsConnected(socket.connected);
    }

    const messagesService = feathersClient.service('api/messages');

    const onMessageCreated = (message) => {
      if (String(message.conversationId) === String(resolvedId)) {
        setMessages((prev) => {
          const existsById = prev.some(m => String(m._id) === String(message.id));
          if (existsById) return prev;
          
          const isFromMe = String(message.senderId) === String(currentUserId);
          if (isFromMe) {
            // Look for a temporary message (one with generic ID or no ID yet, and pending status)
            const optimisticIdx = prev.findLastIndex(m => m.pending === true && m.messageType === message.type);
            
            if (optimisticIdx !== -1) {
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
      mounted.current = false;
      if (socket) {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      }
      messagesService.removeListener('created', onMessageCreated);
      messagesService.removeListener('patched', onMessagePatched);
      messagesService.removeListener('removed', onMessageRemoved);
    };
  }, [resolvedId, currentUserId, feathersClient, fetchMessages, markAsRead]);

  const loadEarlier = useCallback(async () => {
    if (!resolvedId || !hasMore || loadingEarlier || loading) return;

    setLoadingEarlier(true);
    try {
      const skip = messages.filter(m => !m.pending).length;
      const response = await feathersClient.service('api/messages').find({
        query: {
          conversationId: resolvedId,
          companyId,
          $sort: { createdAt: -1 },
          $limit: PAGE_LIMIT,
          $skip: skip
        }
      });

      const data = response.data || response || [];
      if (mounted.current) {
        if (data.length < PAGE_LIMIT) setHasMore(false);

        const historicalGifted = data.map(msg => mapMessageToGiftedChat(msg, currentUserId));
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => String(m._id)));
          const newHistory = historicalGifted.filter(m => !existingIds.has(String(m._id)));
          return [...prev, ...newHistory].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        });
      }
    } catch (e) {
      console.log("Failed to load earlier messages", e);
    } finally {
      if (mounted.current) setLoadingEarlier(false);
    }
  }, [resolvedId, hasMore, loadingEarlier, loading, messages, companyId, currentUserId, feathersClient, PAGE_LIMIT]);

  return {
    messages,
    setMessages,
    loading,
    error,
    isConnected,
    conversation,
    conversationType,
    fetchMessages,
    sendMessage,
    markAsRead,
    loadEarlier,
    hasMore,
    loadingEarlier
  };
}

