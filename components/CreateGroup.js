import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { defaultConfig } from '../config/defaultConfig';

/**
 * CreateGroup Component
 * 
 * @param {Object} props
 * @param {Object} props.feathersClient - Feathers client instance
 * @param {Object} props.currentUser - Current user object
 * @param {Array<Object>} [props.members=[]] - List of members to select from
 * @param {Array<Object>} [props.staffs=[]] - List of staff to select from
 * @param {Object} [props.config] - Configuration object
 * @param {boolean} [props.loading=false] - Loading state for people fetching
 * @param {Function} [props.onGroupCreated] - Callback when group is created
 * @param {Function} [props.onBack] - Callback for back action
 * @param {Function} [props.onSearchChange] - Callback for search input change
 * @param {boolean} [props.isAddingMembers=false] - Mode: adding members to existing group
 * @param {Function} [props.onAddMembers] - Callback when adding members
 */
const CreateGroup = ({ 
  feathersClient, 
  currentUser, 
  members = [], 
  staffs = [], 
  config = defaultConfig,
  loading = false,
  onGroupCreated,
  onBack,
  onSearchChange,
  isAddingMembers = false,
  onAddMembers
}) => {
  
  const insets = useSafeAreaInsets();
  const [groupName, setGroupName] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState([]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (onSearchChange) {
        onSearchChange(searchTerm);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, onSearchChange]);

  const theme = config.theme;
  const compStyles = styles(theme);

  const toggleParticipant = (person) => {
    setSelectedParticipants(prev => {
      const exists = prev.find(p => p.id === person.id && p.userType === person.userType);
      if (exists) {
        return prev.filter(p => !(p.id === person.id && p.userType === person.userType));
      }
      return [...prev, person];
    });
  };

  const isSelected = (person) => {
    return selectedParticipants.some(p => p.id === person.id && p.userType === person.userType);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert("Error", "Please enter a group name");
      return;
    }
    if (selectedParticipants.length < 2) {
      Alert.alert("Error", "Please select at least 2 participants");
      return;
    }

    try {
      setCreating(true);
      const conversation = await feathersClient.service('api/conversations').create({
        type: 'group',
        name: groupName.trim(),
        participants: selectedParticipants.map(p => ({
          userId: p.id,
          userType: p.userType
        }))
      }, {
        query: { companyId: currentUser.companyId }
      });

      if (onGroupCreated) onGroupCreated(conversation);
    } catch (e) {
      console.error("Failed to create group", e);
      Alert.alert("Error", e.message || "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const handleAddMembers = async () => {
    if (selectedParticipants.length === 0) {
      Alert.alert("Error", "Please select at least one participant");
      return;
    }

    try {
      setCreating(true);
      if (onAddMembers) await onAddMembers(selectedParticipants);
    } catch (e) {
      console.error("Failed to add members", e);
      Alert.alert("Error", e.message || "Failed to add members");
    } finally {
      setCreating(false);
    }
  };

  const currentPeople = activeSubTab === 'members' ? members : staffs;
  const filteredPeople = currentPeople.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderPerson = ({ item }) => {
    const selected = isSelected(item);
    return (
      <TouchableOpacity style={[compStyles.personItem, selected && compStyles.selectedPersonItem]} onPress={() => toggleParticipant(item)}>
        <View style={compStyles.avatarContainer}>
          {item.image && item.image !== '#' ? (
            <Image source={{ uri: item.image }} style={compStyles.avatar} />
          ) : (
            <View style={[compStyles.avatarPlaceholder, { backgroundColor: theme.primaryColor + '20' }]}>
              <Text style={compStyles.avatarLetter}>{item.name[0]?.toUpperCase()}</Text>
            </View>
          )}
          {selected && (
            <View style={compStyles.checkBadge}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          )}
        </View>
        <Text style={[compStyles.personName, selected && compStyles.selectedPersonName]}>{item.name}</Text>
        {selected ? (
           <Ionicons name="checkbox" size={24} color={theme.primaryColor} />
        ) : (
           <Ionicons name="square-outline" size={24} color="#ccc" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={compStyles.container}>
      <View style={compStyles.header}>
        <TouchableOpacity style={compStyles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={compStyles.headerTitle}>{isAddingMembers ? 'Add Members' : 'New Group'}</Text>
      </View>

      {!isAddingMembers && (
        <View style={compStyles.headerSection}>
          <TextInput style={compStyles.groupNameInput} placeholder="Group Name..." value={groupName} onChangeText={setGroupName} placeholderTextColor={theme.lightTextColor}/>
        </View>
      )}

      {selectedParticipants.length > 0 && (
        <View style={compStyles.selectedSection}>
          <FlatList horizontal showsHorizontalScrollIndicator={false} data={selectedParticipants} keyExtractor={p => `${p.userType}-${p.id}`} renderItem={({ item }) => (
              <View style={compStyles.chip}>
                <Text style={compStyles.chipText} numberOfLines={1}>{item.name}</Text>
                <TouchableOpacity onPress={() => toggleParticipant(item)}>
                  <Ionicons name="close-circle" size={18} color="#666" style={{ marginLeft: 5 }} />
                </TouchableOpacity>
              </View>
            )}
            contentContainerStyle={{ paddingHorizontal: 15 }}
          />
        </View>
      )}

      <View style={compStyles.tabsContainer}>
        <TouchableOpacity  style={[compStyles.tab, activeSubTab === 'members' && compStyles.activeTab]}  onPress={() => setActiveSubTab('members')} >
          <Text style={[compStyles.tabText, activeSubTab === 'members' && compStyles.activeTabText]}>Members ({members?.length}) </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[compStyles.tab, activeSubTab === 'staffs' && compStyles.activeTab]} onPress={() => setActiveSubTab('staffs')}>
          <Text style={[compStyles.tabText, activeSubTab === 'staffs' && compStyles.activeTabText]}>Staffs ({staffs?.length})</Text>
        </TouchableOpacity>
      </View>

      <View style={compStyles.searchContainer}>
        {loading ? (
          <ActivityIndicator size="small" color={theme.primaryColor} style={{ marginRight: 10 }} />
        ) : (
          <Ionicons name="search" size={20} color="#888" style={{ marginRight: 10 }} />
        )}
        <TextInput style={compStyles.searchInput} placeholder={`Search ${activeSubTab}...`} value={searchTerm} onChangeText={setSearchTerm} placeholderTextColor={theme.lightTextColor} />
        {loading && <Text style={{ fontSize: 12, color: '#888' }}>Searching...</Text>}
      </View>

      <FlatList data={filteredPeople} renderItem={renderPerson} keyExtractor={item => `${item.userType}-${item.id}`} contentContainerStyle={compStyles.list} ListEmptyComponent={<Text style={compStyles.emptyText}>No one found</Text>}/>

      <View style={[compStyles.footer, { paddingBottom: insets.bottom }]}>
        {isAddingMembers ? (
          <TouchableOpacity style={[compStyles.submitBtn, (selectedParticipants.length === 0 || creating) && compStyles.disabledBtn]} onPress={handleAddMembers} disabled={selectedParticipants.length === 0 || creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={compStyles.submitBtnText}>Add Members</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[compStyles.submitBtn, (!groupName.trim() || selectedParticipants.length < 2 || creating) && compStyles.disabledBtn]} onPress={handleCreateGroup} disabled={!groupName.trim() || selectedParticipants.length < 2 || creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={compStyles.submitBtnText}>Create Group</Text>}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.cardBackground || '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderColor || '#f0f0f0',
  },
  backButton: {
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.textColor,
  },
  headerSection: {
    padding: 10,
  },
  groupNameInput: {
    height: 40,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.primaryColor,
    color: theme.textColor,
  },
  selectedSection: {
    paddingVertical: 10,
    backgroundColor: theme.backgroundColor || '#f9f9f9',
    height: 50,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 10,
    marginRight: 8,
    maxWidth: 150,
  },
  chipText: {
    fontSize: 12,
    color: '#333',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.borderColor || '#f0f0f0',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: theme.primaryColor,
  },
  tabText: {
    fontSize: 14,
    color: theme.lightTextColor || '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: theme.primaryColor,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundColor || '#f5f5f5',
    margin: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.textColor,
  },
  list: {
    paddingHorizontal: 15,
    gap:5,
    paddingBottom: 100,
  },
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.borderColor || '#f0f0f0',
  },
  selectedPersonItem: {
    backgroundColor: theme.primaryColor + '10',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginHorizontal: -10,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.textColor,
  },
  checkBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: theme.primaryColor,
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  personName: {
    flex: 1,
    fontSize: 14,
    color: theme.textColor,
  },
  selectedPersonName: {
    fontWeight: 'bold',
    color: theme.primaryColor,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.cardBackground || '#fff',
  },
  submitBtn: {
    backgroundColor: theme.primaryColor,
    borderRadius: 10,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: {
    backgroundColor: '#ccc',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: theme.lightTextColor || '#999',
  }
});

export default CreateGroup;
