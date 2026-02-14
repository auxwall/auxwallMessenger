import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import moment from 'moment';
import { formatConversationTitle, getConversationImage } from '../utils/chatHelpers';
import { Ionicons } from '@expo/vector-icons';

const ConversationItem = ({ conversation, currentUserId, onPress, theme = {} }) => {
  const [imgError, setImgError] = useState(false);
  
  const title = formatConversationTitle(conversation, currentUserId);
  const image = getConversationImage(conversation, currentUserId);

  const renderLastMessage = () => {

    // 2. Fallback to lastMessageText (common in your backend)
    if (conversation?.lastMessageText) {
      let text = conversation.lastMessageText;
      const isForwarded = typeof text === 'string' && text.startsWith(':::fw:::');
      if (isForwarded) {
        text = text.replace(':::fw:::', '');
      }

      if (text && typeof text === 'string' && (text.startsWith('http') || text.startsWith('file:') || text.startsWith('Auxwall/'))) {
        const lower = text.toLowerCase();
        if (lower.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/)) {
             return (
              <View style={styles.lastMsgRow}>
                {isForwarded && <Ionicons name="arrow-redo" size={14} color={theme.lightTextColor || '#8696a0'} style={{ marginRight: 4 }} />}
                <Ionicons name="image" size={14} color={theme.lightTextColor || '#8696a0'} style={{ marginRight: 4 }} />
                <Text style={[styles.lastMsgText, { color: theme.lightTextColor || '#8696a0' }]} numberOfLines={1}>Photo</Text>
              </View>
            );
          }
           if (lower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)(\?.*)?$/)) {
             return (
              <View style={styles.lastMsgRow}>
                {isForwarded && <Ionicons name="arrow-redo" size={14} color={theme.lightTextColor || '#8696a0'} style={{ marginRight: 4 }} />}
                <Ionicons name="document-text" size={14} color={theme.lightTextColor || '#8696a0'} style={{ marginRight: 4 }} />
                <Text style={[styles.lastMsgText, { color: theme.lightTextColor || '#8696a0' }]} numberOfLines={1}>Document</Text>
              </View>
            );
          }
           if (lower.match(/\.(m4a|mp3|wav|aac|amr)(\?.*)?$/)) {
             return (
              <View style={styles.lastMsgRow}>
                {isForwarded && <Ionicons name="arrow-redo" size={14} color={theme.lightTextColor || '#8696a0'} style={{ marginRight: 4 }} />}
                <Ionicons name="mic" size={14} color={theme.lightTextColor || '#8696a0'} style={{ marginRight: 4 }} />
                <Text style={[styles.lastMsgText, { color: theme.lightTextColor || '#8696a0' }]} numberOfLines={1}>Voice Message</Text>
              </View>
            );
          }
       }

      return (
        <View style={styles.lastMsgRow}>
          {isForwarded && <Ionicons name="arrow-redo" size={14} color={theme.lightTextColor || '#8696a0'} style={{ marginRight: 4 }} />}
          <Text style={[styles.lastMsgText, { color: theme.lightTextColor || '#8696a0' }]} numberOfLines={1}>
            {text || (isForwarded ? 'Forwarded' : '')}
          </Text>
        </View>
      );
    }
    
    return <Text style={[styles.lastMsgText, { color: theme.lightTextColor || '#8696a0' }]}>No messages yet</Text>;
  };

  const renderTime = () => {
    if (!conversation.updatedAt) return '';
    const date = moment(conversation.updatedAt);
    if (date.isSame(moment(), 'day')) {
      return date.format('hh:mm A');
    }
    if (date.isSame(moment().subtract(1, 'day'), 'day')) {
      return 'Yesterday';
    }
    return date.format('DD/MM/YY');
  };

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(conversation)}>
      <View style={styles.avatarContainer}>
        {image && !imgError ? (
          <Image 
            source={{ uri: image }} 
            style={styles.avatar} 
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: theme.borderColor || '#e0e0e0' }]}>
            <Text style={[styles.avatarLetter, { color: theme.textColor || '#303030' }]}>
              {(title || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.textColor || '#303030' }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.time, { color: theme.lightTextColor || '#8696a0' }]}>
            {renderTime()}
          </Text>
        </View>
        
        <View style={styles.footer}>
          {renderLastMessage()}
          {conversation.unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.primaryColor || '#6dcff6' }]}>
              <Text style={styles.badgeText}>{conversation.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 15,
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 15,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    height: 50,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 10,
  },
  time: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMsgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  lastMsgText: {
    fontSize: 14,
    flex: 1,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginLeft: 8,
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
});

export default ConversationItem;
