import React, { useState, useMemo } from 'react';
import {  View,  Text,  StyleSheet,  FlatList,  TextInput,  ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useConversations from '../hooks/useConversations';
import ConversationItem from './ConversationItem';
import { defaultConfig } from '../config/defaultConfig';
import { formatConversationTitle } from '../utils/chatHelpers';

const ChatList = ({ feathersClient, currentUser, onSelectConversation, config = defaultConfig, navigation, onTabChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const features = config.features || defaultConfig.features;
  const initialTab = features.memberSearch ? 'members' : (features.staffSearch ? 'staffs' : 'groups');
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const { conversations, loading, fetchConversations } = useConversations({ 
    feathersClient, 
    currentUserId: currentUser?.id,
    companyId: currentUser?.companyId 
  });

  // Automatically refresh on focus so counts are always exact
  React.useEffect(() => {
    if (navigation) {
      const unsubscribe = navigation.addListener('focus', () => {
        // Trigger a silent refresh (no spinner)
        fetchConversations(true);
      });
      return unsubscribe;
    }
  }, [navigation, fetchConversations]);

  const theme = config.theme || defaultConfig.theme;

  const filteredConversations = useMemo(() => {
    let result = conversations;

    // 1. Tab Filtering
    if (activeTab === 'groups') {
      result = result.filter(c => (c.type === 'group' || c.isGroup));
    } else {
      result = result.filter(conv => {
        // Exclude groups from people tabs
        if (conv.type === 'group' || conv.isGroup) return false;
        
        // Find the "other" participant
        const other = conv.participants?.find(p => parseInt(p.userId) !== parseInt(currentUser?.id));
        if (!other) return false;
        
        const isOtherMember = (other.userType || '').toLowerCase() === 'member';
        
        if (activeTab === 'members') {
          return isOtherMember;
        } else if (activeTab === 'staffs') {
          return !isOtherMember;
        }
        return true;
      });
    }

    // 2. Search Filtering
    if (!searchQuery) return result;
    
    return result.filter(conv => {
      const title = formatConversationTitle(conv, currentUser?.id);
      return title.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [conversations, searchQuery, currentUser?.id, activeTab]);

  const renderHeader = () => (
    <View style={[styles.searchContainer, { backgroundColor: theme.cardBackground || '#ffffff' }]}>
      <View style={[styles.searchBar, { backgroundColor: theme.backgroundColor || '#f0f0f0' }]}>
        <Ionicons name="search" size={20} color={theme.lightTextColor || '#8696a0'} />
        <TextInput style={[styles.searchInput, { color: theme.textColor || '#303030' }]} placeholder="Search chats..." placeholderTextColor={theme.lightTextColor || '#8696a0'} value={searchQuery} onChangeText={setSearchQuery} />
      </View>
    </View>
  );

  const renderTabs = () => (
    <View style={[styles.tabsContainer, { borderBottomColor: theme.borderColor || '#e0e0e0' }]}>
      {features.memberSearch && (
        <TouchableOpacity style={[styles.tab, activeTab === 'members' && { borderBottomColor: theme.primaryColor || '#6dcff6', borderBottomWidth: 2 }]} onPress={() => handleTabChange('members')}>
          <Text style={[styles.tabText, { color: activeTab === 'members' ? (theme.primaryColor || '#6dcff6') : (theme.lightTextColor || '#8696a0') }, activeTab === 'members' && styles.activeTabText]}> Members </Text>
        </TouchableOpacity>
      )}
      {features.staffSearch && (
        <TouchableOpacity style={[styles.tab, activeTab === 'staffs' && { borderBottomColor: theme.primaryColor || '#6dcff6', borderBottomWidth: 2 }]} onPress={() => handleTabChange('staffs')}>
          <Text style={[styles.tabText, { color: activeTab === 'staffs' ? (theme.primaryColor || '#6dcff6') : (theme.lightTextColor || '#8696a0') }, activeTab === 'staffs' && styles.activeTabText]}> Staffs </Text>
        </TouchableOpacity>
      )}
      {features.groupChats && (
        <TouchableOpacity style={[styles.tab, activeTab === 'groups' && { borderBottomColor: theme.primaryColor || '#6dcff6', borderBottomWidth: 2 }]} onPress={() => handleTabChange('groups')}>
          <Text style={[styles.tabText, { color: activeTab === 'groups' ? (theme.primaryColor || '#6dcff6') : (theme.lightTextColor || '#8696a0') }, activeTab === 'groups' && styles.activeTabText]}> Groups </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="chatbubbles-outline" size={60} color={theme.lightTextColor || '#ccc'} />
        <Text style={[styles.emptyText, { color: theme.lightTextColor || '#999' }]}>
          {searchQuery ? 'No results found' : 'No conversations yet'}
        </Text>
      </View>
    );
  };

  const renderItem = ({ item }) => (
    <ConversationItem
      conversation={item}
      currentUserId={currentUser?.id}
      onPress={onSelectConversation}
      theme={theme}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.cardBackground || '#ffffff' }]}>
      {renderHeader()}
      {renderTabs()}
      
      {loading && conversations.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primaryColor || '#6dcff6'} size="large" />
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          refreshing={loading}
          onRefresh={fetchConversations}
          ListEmptyComponent={renderEmpty}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: theme.borderColor || '#e0e0e0' }]} />
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    padding: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 40,
    // marginTop:10
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    padding: 0,
  },
  separator: {
    height: 0.5,
    marginLeft: 0, 
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    marginTop: 15,
    fontSize: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    height: 48,
    borderBottomWidth: 0.5,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: 'bold',
  }
});

export default ChatList;
