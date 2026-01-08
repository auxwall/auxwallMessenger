import { useState, useEffect, useCallback, useRef } from 'react';

export default function useConversations({ feathersClient, currentUserId, companyId }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const mounted = useRef(true);

  const fetchConversations = useCallback(async (silent = false) => {
    if (!feathersClient || !currentUserId) return;
    
    try {
      if (!silent) setLoading(true);
      setError(null);

      const response = await feathersClient.service('api/conversations').find({
        query: {
          companyId,
          $sort: { updatedAt: -1 },
          $limit: 100
        }
      });
      
      if (mounted.current) {
        setConversations(response.data || response || []);
      }
    } catch (err) {
      console.log('[useConversations] Fetch Error:', err);
      if (mounted.current) {
        setError(err.message || 'Could not connect to chat server');
      }
    } finally {
      if (mounted.current && !silent) {
        setLoading(false);
      }
    }
  }, [feathersClient, companyId, currentUserId]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    setConversations([]);
    
    if (!currentUserId || !feathersClient) {
      setLoading(false);
      return;
    }
    
    fetchConversations();

    const socket = feathersClient.io || (feathersClient.getSocket && feathersClient.getSocket());
    
    // Set initial connection state
    if (socket) {
      setIsConnected(socket.connected);
      if (!socket.connected) {
        setError('Connection error. Please check your internet.');
        setLoading(false);
      }
    }

    const handleConnect = () => {
      setIsConnected(true);
      setError(null);
      fetchConversations(true); // Silent refresh on reconnect
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setError('Chat disconnected. Connecting...');
      setLoading(false);
    };

    const handleConnectError = (err) => {
      setIsConnected(false);
      setError('Connection error. Please check your internet.');
      setLoading(false);
    };

    if (socket) {
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('connect_error', handleConnectError);
    }
    
    const convService = feathersClient.service('api/conversations');
    const msgService = feathersClient.service('api/messages');

    const onConvCreated = (conv) => {
      if (companyId && conv.companyId && String(conv.companyId) !== String(companyId)) return;
      
      setConversations(prev => {
        if (prev.some(c => String(c.id) === String(conv.id))) return prev;
        return [conv, ...prev];
      });
    };

    const onConvPatched = (updated) => {
      if (!active) return;
      setConversations(prev => {
        const index = prev.findIndex(c => String(c.id) === String(updated.id));
        
        if (index === -1) {
            if (companyId && updated.companyId && String(updated.companyId) !== String(companyId)) return prev;
            return [updated, ...prev];
        }
        
        const newConvs = [...prev];
        const existing = newConvs[index];
        const isGroup = updated.type === 'group' || updated.isGroup || existing.type === 'group' || existing.isGroup;
        
        let merged;
        if (!isGroup) {
          const { unreadCount: serverUnread, imageURL, name, participants, title, ...neutralUpdates } = updated;
          
          let finalUnread = existing.unreadCount || 0;
          if (typeof serverUnread === 'number' && serverUnread > finalUnread) {
            finalUnread = serverUnread;
          }

          merged = { 
            ...existing, 
            ...neutralUpdates,
            unreadCount: finalUnread
          };
        } else {
          const { unreadCount: serverUnread, ...groupUpdates } = updated;
          let finalUnread = existing.unreadCount || 0;
          
          if (typeof serverUnread === 'number' && serverUnread > finalUnread) {
             finalUnread = serverUnread;
          }

          merged = { 
            ...existing, 
            ...groupUpdates,
            unreadCount: finalUnread
          };
        }

        newConvs[index] = merged;
        return newConvs.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      });
    };
    
    const onConvRemoved = (removed) => {
      setConversations(prev => prev.filter(c => String(c.id) !== String(removed.id)));
    };

    const onMessageCreated = async (message) => {
      const myId = String(currentUserId || '0');
      const senderId = String(message.senderId || '0');
      const isFromMe = (myId !== '0' && senderId !== '0' && myId === senderId);

      setConversations(prev => {
        const index = prev.findIndex(c => String(c.id) === String(message.conversationId));
        
        if (index === -1) {
            feathersClient.service('api/conversations').get(message.conversationId, { query: { companyId } })
              .then(conv => {
                if (active && String(conv.companyId) === String(companyId)) {
                   setConversations(current => {
                     if (current.some(c => String(c.id) === String(conv.id))) return current;
                     return [conv, ...current];
                   });
                }
              })
              .catch(() => {});
            return prev;
        }
        
        const newConvs = [...prev];
        const conv = { ...newConvs[index] };
        
        conv.lastMessage = message;
        conv.lastMessageText = message.content;
        conv.updatedAt = message.createdAt;
        
        if (!isFromMe) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        } else {
          conv.unreadCount = 0;
        }
        
        newConvs.splice(index, 1);
        return [conv, ...newConvs];
      });
    };

    const onMessagePatched = (message) => {
      if (message.isRead) {
        setConversations(prev => prev.map(c => {
          if (String(c.id) === String(message.conversationId)) {
            return { ...c, unreadCount: 0 };
          }
          return c;
        }));
      }
    };

    convService.on('created', onConvCreated);
    convService.on('patched', onConvPatched);
    convService.on('updated', onConvPatched);
    convService.on('removed', onConvRemoved);
    msgService.on('created', onMessageCreated);
    msgService.on('patched', onMessagePatched);

    return () => {
      active = false;
      mounted.current = false;
      if (socket) {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('connect_error', handleConnectError);
      }
      convService.removeListener('created', onConvCreated);
      convService.removeListener('patched', onConvPatched);
      convService.removeListener('updated', onConvPatched);
      convService.removeListener('removed', onConvRemoved);
      msgService.removeListener('created', onMessageCreated);
      msgService.removeListener('patched', onMessagePatched);
    };
  }, [feathersClient, fetchConversations, currentUserId, companyId]);

  return {
    conversations,
    loading,
    error,
    isConnected,
    fetchConversations
  };
}

