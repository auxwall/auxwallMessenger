import { useState, useEffect } from 'react';
import { View, Text, Modal, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatConversationTitle } from '../utils/chatHelpers';
import ConversationItem from './ConversationItem';
import usePeople from '../hooks/usePeople';

const ForwardTargetModal = ({ visible, onClose, feathersClient, currentUser, selectedMessages, config = {}, onForwardComplete, accessToken, apiBaseUrl }) => {
    const [chats, setChats] = useState([]);
    const [activeTab, setActiveTab] = useState('recent');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    const { members, staff, loading: peopleLoading } = usePeople({ 
        apiBaseUrl, 
        companyId: currentUser?.companyId || config.companyId, 
        accessToken, 
        search: activeTab !== 'recent' ? searchQuery : '' 
    });

    useEffect(() => {
        if (visible) {
            fetchChats();
        }
    }, [visible]);

    const fetchChats = async () => {
        setLoading(true);
        try {
            // Fetch recent conversations
            const response = await feathersClient.service('api/conversations').find({
                query: {
                    companyId: config.companyId,
                    $sort: { updatedAt: -1 },
                    $limit: 50 // Increased limit to find more chats
                }
            });
            setChats(response.data || response || []);
        } catch (error) {
            console.log("Error fetching chats for forward", error);
        } finally {
            setLoading(false);
        }
    };
    
    const filteredChats = chats.filter(chat => {
        const title = formatConversationTitle(chat, currentUser.id);
        return title.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const getTabContent = () => {
        if (activeTab === 'recent') return filteredChats;
        if (activeTab === 'members') return members;
        if (activeTab === 'staff') return staff;
        if (activeTab === 'groups') return chats.filter(c => c.type === 'group' || c.isGroup);
        return [];
    };

    const getRelativePath = (url) => {
        if (!url || typeof url !== 'string') return url;
        return url.includes('Auxwall') ? url.substring(url.indexOf('Auxwall')) : url;
    };

    const handleForwardTo = async (target) => {
        setSending(true);
        try {
            let targetConvId = target.id;
            const api = feathersClient.service('api/messages');

            // If target is a person (from Members/Staff tab) and not an existing conversation
            if (activeTab === 'members' || activeTab === 'staff') {
                // Check if we already have a conversation with this person in our 'chats' list
                const existing = chats.find(c => {
                    const isGroup = c.type === 'group' || c.isGroup;
                    if (isGroup) return false;
                    return c.participants?.some(p => String(p.userId) === String(target.id));
                });

                if (existing) {
                    targetConvId = existing.id;
                } else {
                    // Create new conversation (Align with useChat.js logic)
                    const createData = {
                        type: 'individual',
                        name: target.name,
                        createdByType: 'staff'
                    };

                    if (target.userType === 'member') {
                        createData.clientId = target.id;
                        createData.staffId = currentUser.id;
                    } else {
                        // Staff to Staff
                        createData.staffId = target.id;
                    }

                    const newConv = await feathersClient.service('api/conversations').create(createData, {
                        query: { companyId: currentUser.companyId || config.companyId }
                    });
                    
                    targetConvId = newConv.id || newConv._id; // Cover both id and _id
                }
            }

            // Loop through selected messages (reverse to keep order)
            const messagesToSend = [...selectedMessages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            for (const msg of messagesToSend) {
                const payload = {
                    conversationId: targetConvId,
                    senderId: currentUser.id,
                    companyId: config.companyId,
                    createdAt: new Date().toISOString()
                };

                if (msg.image) {
                    payload.type = 'image';
                    payload.content = `:::fw:::${getRelativePath(msg.image)}`;
                    payload.text = ':::fw:::'; 
                } else if (msg.audio) {
                    payload.type = 'audio';
                    payload.content = `:::fw:::${getRelativePath(msg.audio)}`;
                    payload.text = ':::fw:::';
                } else if (msg.documentUrl || (msg.type === 'document')) {
                    payload.type = 'document';
                    const docUrl = msg.documentUrl || msg.text || '';
                    const cleanDocUrl = getRelativePath(docUrl).replace('📄 ', '');
                    payload.content = `:::fw:::${cleanDocUrl}`;
                    payload.text = ':::fw:::';
                } else {
                    payload.type = 'text';
                    const originalText = msg.text || '';
                    const cleanText = originalText.startsWith(':::fw:::') ? originalText.replace(':::fw:::', '') : originalText;
                    payload.content = `:::fw:::${cleanText}`; 
                    payload.text = `:::fw:::${cleanText}`; 
                }

                await api.create(payload);
            }

            Alert.alert("Success", "Messages forwarded!");
            onForwardComplete(); // Clear selection and close
            onClose();

        } catch (error) {
            console.log("Forward error", error);
            Alert.alert("Error", "Failed to forward messages");
        } finally {
            setSending(false);
        }
    };

    const renderItem = ({ item }) => {
        // If it's a person from usePeople, wrap it to look like a conversation
        const isPerson = activeTab === 'members' || activeTab === 'staff';
        const conversationData = isPerson ? {
            id: item.id,
            type: 'individual',
            participants: [{ userId: item.id, fullName: item.name, imageURL: item.image, userType: item.userType }],
            lastMessageText: 'Tap to start chat'
        } : item;

        return (
            <ConversationItem 
                conversation={conversationData}
                currentUserId={currentUser.id}
                onPress={() => handleForwardTo(item)}
                theme={config.theme}
            />
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Forward to...</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                         <Text style={{color: '#007AFF', fontSize: 16}}>Cancel</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#888" style={{ marginRight: 10 }} />
                    <TextInput 
                        style={styles.searchInput}
                        placeholder={`Search ${activeTab}...`}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholderTextColor="#aaa"
                    />
                    {(searchQuery.length > 0) && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={20} color="#ccc" />
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.tabContainer}>
                    {['recent', 'members', 'staff', 'groups'].map(tab => (
                        <TouchableOpacity 
                            key={tab} 
                            style={[styles.tab, activeTab === tab && styles.activeTab]}
                            onPress={() => {
                                setActiveTab(tab);
                                setSearchQuery('');
                            }}
                        >
                            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
                
                {(loading || (peopleLoading && activeTab !== 'recent')) ? (
                    <ActivityIndicator style={{marginTop: 20}} />
                ) : (
                    <FlatList 
                        data={getTabContent()}
                        renderItem={renderItem}
                        keyExtractor={item => `${activeTab}-${item.id}`}
                        contentContainerStyle={{paddingBottom: 40}}
                    />
                )}
                
                {sending && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="white" />
                        <Text style={{color: 'white', marginTop: 10}}>Forwarding...</Text>
                    </View>
                )}
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', padding : 10 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        marginHorizontal: 15,
        marginVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        height: 44,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#333',
    },
    tabContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: 'white',
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
    },
    activeTab: {
        borderBottomWidth: 2,
        borderBottomColor: '#007AFF',
    },
    tabText: {
        fontSize: 13,
        color: '#666',
        fontWeight: '500',
    },
    activeTabText: {
        color: '#007AFF',
        fontWeight: 'bold',
    },
    avatarContainer: { marginRight: 15 },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    info: { flex: 1 },
    title: { fontWeight: '600', fontSize: 16 },
    subTitle: { color: '#888', fontSize: 12 },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }
});

export default ForwardTargetModal;
