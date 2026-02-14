import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity, Image, KeyboardAvoidingView, Text, Alert, Modal, ScrollView, useColorScheme, Linking, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GiftedChat, Bubble, Send, InputToolbar, Composer, MessageText, Actions, Message } from 'react-native-gifted-chat';
import { Ionicons } from '@expo/vector-icons';
import moment from 'moment';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ScreenCapture from 'expo-screen-capture';
import MessageImageView from './MessageImageView';
import AudioPlayer from './AudioPlayer';
import ForwardTargetModal from './ForwardTargetModal';
import useChat from '../hooks/useChat';
import useFileUpload from '../hooks/useFileUpload';
import { defaultConfig } from '../config/defaultConfig';
import { mapMessageToGiftedChat } from '../utils/chatHelpers';
import usePeople from '../hooks/usePeople';
import CreateGroup from './CreateGroup';

const ChatScreen = ({ config = defaultConfig, feathersClient, conversationId, targetUser, currentUser, accessToken, apiBaseUrl, title = 'Chat', headerImage, navigation, onBack, trainer }) => {
  
  const [headerImgError, setHeaderImgError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [docModalVisible, setDocModalVisible] = useState(false);
  const [docData, setDocData] = useState(null);
  const textInputRef = useRef(null);
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Use custom hooks
  const { messages, setMessages, loading, error, conversation, conversationType, sendMessage, fetchMessages, loadEarlier, hasMore, loadingEarlier } = useChat({ feathersClient, conversationId, targetUser, currentUserId: currentUser?.id, companyId: currentUser?.companyId, config, apiBaseUrl });

  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const companyId = currentUser?.companyId || config?.companyId;

  // 1. Hook for fetching potential new members
  const { members, staff, loading: peopleLoading } = usePeople({ apiBaseUrl, companyId, accessToken, search: memberSearch, trainer: trainer });

  const isAdmin = conversation?.createdBy == currentUser?.id;

  // Fetch Group Participants (Matches desktop GroupInfo.jsx logic)
  const fetchGroupParticipants = useCallback(async () => {
    if (!conversationId) return;
    setParticipantsLoading(true);
    try {
      const res = await feathersClient.service('api/conversation-participants').find({
        query: { conversationId: conversationId }
      });
      const rawParticipants = res.data || res || [];
      
      // Normalize participant data like desktop
      const enriched = rawParticipants.map(p => ({
        ...p,
        fullName: p['staff.fullName'] || p['client.fullName'] || p.fullName || 'Unknown User',
        imageURL: p['staff.imageURL'] || p['client.imageURL'] || p.imageURL || "#"
      }));
      
      setGroupParticipants(enriched);
    } catch (err) {
      console.log("Failed to fetch participants", err);
    } finally {
      setParticipantsLoading(false);
    }
  }, [conversationId, feathersClient]);

  useEffect(() => {
    if (showGroupInfo) {
      fetchGroupParticipants();
    }
  }, [showGroupInfo, fetchGroupParticipants]);

  const { uploading, isRecording, uploadFileToBackend, pickImage, takePhoto, pickDocument, startRecording, stopRecording, pauseRecording, resumeRecording, cancelRecording, isPaused, recordingStatus } = useFileUpload({ config, apiBaseUrl, accessToken, });

  const [waveformPoints, setWaveformPoints] = useState([]);
  

  useEffect(() => {
    if (isRecording && !isPaused && recordingStatus?.metering !== undefined) {
      // Collect metering points for waveform (normalize to 0-1 range roughly)
      const point = Math.max(0, (recordingStatus.metering + 160) / 160);
      setWaveformPoints(prev => [...prev.slice(-40), point]);
    }
    if (!isRecording) {
      setWaveformPoints([]);
    }
  }, [recordingStatus, isRecording, isPaused]);

  const handleRemoveParticipant = async (participantId) => {
    Alert.alert(
      "Remove Member",
      "Are you sure you want to remove this member from the group?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: async () => {
            try {
              setParticipantsLoading(true);
              await feathersClient.service('api/conversation-participants').remove(participantId, {
                query: { companyId }
              });
              await fetchGroupParticipants();
              alert("Member removed successfully");
            } catch (err) {
              console.log("Failed to remove member", err);
              alert("Failed to remove member: " + err.message);
            } finally {
              setParticipantsLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleAddParticipants = async (selectedParticipants) => {
    if (selectedParticipants.length === 0) return;
    
    try {
      setAddLoading(true);
      const promises = selectedParticipants.map(p => 
        feathersClient.service('api/conversation-participants').create({
          conversationId,
          userId: p.id,
          userType: p.userType,
          companyId
        }, { query: { companyId } })
      );

      await Promise.all(promises);
      await fetchGroupParticipants();
      setShowAddMember(false);
      alert("Members added successfully");
    } catch (err) {
      console.log("Failed to add members", err);
      throw err; // Let CreateGroup handle the error alert
    } finally {
      setAddLoading(false);
    }
  };

  // Handle image upload
  const handlePickImage = async () => {
    const result = await pickImage();
    if (!result) return;

    const fileData = {
      uri: result.uri,
      name: result.fileName || result.name || 'image.jpg',
      mimeType: result.mimeType || result.type || 'image/jpeg',
    };

    // Optimistic update
    const tempMsg = {
      _id: Math.random().toString(),
      image: result.uri,
      createdAt: new Date(),
      user: { _id: String(currentUser?.id), name: 'You' },
      pending: true,
    };
    setMessages((prev) => GiftedChat.append(prev, [tempMsg]));

    // Upload with metadata - Backend will create the message
    const uploadResult = await uploadFileToBackend(fileData.uri, fileData.name, fileData.mimeType, {
      conversationId: conversationId,
      type: 'image',
      senderId: currentUser?.id,
      companyId: currentUser?.companyId || config?.companyId
    });

    if (uploadResult && uploadResult.message) {
      const realMessage = uploadResult.message;
      setMessages((prev) => {
        // If real-time listener already added it, don't do anything
        if (prev.some(m => String(m._id) === String(realMessage.id))) {
          return prev.filter(m => m._id !== tempMsg._id);
        }
        // Otherwise replace temp with real message mapped for Gifted Chat
        return prev.map(m => m._id === tempMsg._id ? mapMessageToGiftedChat(realMessage, currentUser?.id, apiBaseUrl) : m);
      });
    } else {
      setMessages((prev) => prev.filter((m) => m._id !== tempMsg._id));
    }
  };

  // Handle camera photo
  const handleTakePhoto = async () => {
    const result = await takePhoto();
    if (!result) return;

    const fileData = {
      uri: result.uri,
      name: result.fileName || result.name || 'camera_photo.jpg',
      mimeType: result.mimeType || result.type || 'image/jpeg',
    };

    // Optimistic update
    const tempMsg = {
      _id: Math.random().toString(),
      image: result.uri,
      createdAt: new Date(),
      user: { _id: String(currentUser?.id), name: 'You' },
      pending: true,
    };
    setMessages((prev) => GiftedChat.append(prev, [tempMsg]));

    // Upload with metadata
    const uploadResult = await uploadFileToBackend(fileData.uri, fileData.name, fileData.mimeType, {
      conversationId: conversationId,
      type: 'image',
      senderId: currentUser?.id,
      companyId: currentUser?.companyId || config?.companyId
    });

    if (uploadResult && uploadResult.message) {
      const realMessage = uploadResult.message;
      setMessages((prev) => {
        if (prev.some(m => String(m._id) === String(realMessage.id))) {
          return prev.filter(m => m._id !== tempMsg._id);
        }
        return prev.map(m => m._id === tempMsg._id ? mapMessageToGiftedChat(realMessage, currentUser?.id, apiBaseUrl) : m);
      });
    } else {
      setMessages((prev) => prev.filter((m) => m._id !== tempMsg._id));
    }
  };

  // Handle document upload
  const handlePickDocument = async () => {
    const result = await pickDocument();
    if (!result) return;

    const fileData = {
      uri: result.uri,
      name: result.name || result.fileName || 'document',
      mimeType: result.mimeType || result.type || 'application/octet-stream',
    };

    // Optimistic update
    const tempMsg = {
      _id: Math.random().toString(),
      text: `📄 ${result.name}`,
      createdAt: new Date(),
      user: { _id: String(currentUser?.id), name: 'You' },
      pending: true,
    };
    setMessages((prev) => GiftedChat.append(prev, [tempMsg]));

    // Upload with metadata
    const uploadResult = await uploadFileToBackend(fileData.uri, fileData.name, fileData.mimeType, {
      conversationId: conversationId,
      type: 'document',
      senderId: currentUser?.id,
      companyId: currentUser?.companyId || config?.companyId
    });

    if (uploadResult && uploadResult.message) {
      const realMessage = uploadResult.message;
      setMessages((prev) => {
        if (prev.some(m => String(m._id) === String(realMessage.id))) {
          return prev.filter(m => m._id !== tempMsg._id);
        }
        return prev.map(m => m._id === tempMsg._id ? mapMessageToGiftedChat(realMessage, currentUser?.id, apiBaseUrl) : m);
      });
    } else {
      setMessages((prev) => prev.filter((m) => m._id !== tempMsg._id));
    }
  };

  // Handle document press (download and share/save/open)
  const handleDocumentPress = async (url, name) => {
    if (!config?.features?.documentSharing) return;

    try {
      if (!url) return;
      setDownloading(true);
      const safeName = (name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileUri = `${FileSystem.documentDirectory}${safeName}`;

      const { uri } = await FileSystem.downloadAsync(url, fileUri);
      
      setDownloading(false);

      if (Platform.OS === 'android') {
        setDocData({ uri, name: safeName });
        setDocModalVisible(true);
      } else {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      }
    } catch (error) {
      console.log(error);
      setDownloading(false);
      Alert.alert('Error', 'Failed to open document');
    }
  };

  // Handle voice recording
  const handleVoiceUpload = async () => {
    const uploadResult = await stopRecording({
      conversationId,
      senderId: currentUser?.id,
      companyId: currentUser?.companyId || config?.companyId
    });
    if (uploadResult && uploadResult.message) {
        const realMessage = uploadResult.message;
        setMessages((prev) => {
          if (prev.some(m => String(m._id) === String(realMessage.id))) {
            return prev;
          }
          return GiftedChat.append(prev, [mapMessageToGiftedChat(realMessage, currentUser?.id, apiBaseUrl)]);
        });
    }
  };

  // Send text message
  const onSend = useCallback(
    (newMessages = []) => {
      if (newMessages.length === 0) return;
      const { text } = newMessages[0];
      const tempId = Math.random().toString();

      const optimisticMessage = {
        _id: tempId,
        text: text,
        createdAt: new Date(),
        user: { _id: String(currentUser?.id), name: 'You' },
        pending: true,
      };

      setMessages((prev) => GiftedChat.append(prev, [optimisticMessage]));

      sendMessage({
        conversationId,
        content: text,
        type: 'text',
        senderId: currentUser?.id,
      }).then((realMessage) => {
        setMessages((prev) => {
          // If real-time listener already added it, don't do anything
          if (prev.some(m => String(m._id) === String(realMessage.id))) {
             return prev.filter(m => m._id !== tempId);
          }
          // Otherwise replace temp with real
          return prev.map(m => m._id === tempId ? mapMessageToGiftedChat(realMessage, currentUser?.id, apiBaseUrl) : m);
        });
      }).catch((error) => {
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
      });
    },
    [conversationId, currentUser, sendMessage, setMessages]
  );
  
  // Selection Mode Handlers
  const handleLongPressMessage = (context, message) => {
    if (selectedMessages.length > 0) return; // Already in selection mode
    setSelectedMessages([message]);
  };

  const handlePressMessage = (context, message) => {
    if (selectedMessages.length > 0) {
      // Toggle selection
      const exists = selectedMessages.find(m => m._id === message._id);
      if (exists) {
        setSelectedMessages(prev => prev.filter(m => m._id !== message._id));
      } else {
        setSelectedMessages(prev => [...prev, message]);
      }
    }
  };

  const chatStyles = styles(config.theme);

  // Render attachment button
  const renderActions = (props) => {
    if (!config?.features?.fileUploads) return null;

    return (
      <Actions
        {...props}
        containerStyle={chatStyles.sendContainer}
        onPressActionButton={() => {
          Alert.alert('Send Attachment', 'Choose an option', [
            { text: 'Take Photo', onPress: handleTakePhoto },
            { text: 'Photo/Video Library', onPress: handlePickImage },
            { text: 'Document', onPress: handlePickDocument },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }}
        icon={() => (
          <Ionicons
            name="attach"
            size={26}
            color={config.theme?.lightTextColor || '#8696a0'}
            style={{ transform: [{ rotate: '45deg' }] }}
          />
        )}
      />
    );
  };

    // Render message bubble
  const renderBubble = (props) => {
    const isMine = props.currentMessage.user._id === String(currentUser?.id);
    const msg = props.currentMessage;
    const isDoc = msg.documentUrl;
    const isAudio = msg.audio;

    const renderFooter = () => (
      <View style={chatStyles.footer}>
        <Text style={[chatStyles.footerText, isMine ? chatStyles.footerTextMine : chatStyles.footerTextOther]}>
          {moment(msg.createdAt).format('hh:mm A')}
        </Text>
        {isMine && (
          <Ionicons
            name={
              (conversationType === 'group' || conversation?.isGroup || conversation?.type === 'group') 
                ? 'checkmark' 
                : (msg.pending ? 'checkmark' : 'checkmark-done')
            }
            size={16}
            color={
              !(conversationType === 'group' || conversation?.isGroup || conversation?.type === 'group') && msg.received 
                ? '#53bdeb' 
                : config.theme?.tickColor || config.theme?.myMessageTextColor || config.theme?.textColor || '#303030'
            }
          />
        )}
      </View>
    );
    
    let showForwardedLabel = msg.isForwarded;

    const isSelected = selectedMessages.some(m => String(m._id) === String(msg._id));
    const selectionStyle = isSelected ? { backgroundColor: 'rgba(0, 123, 255, 0.27)' } : {};

    return (
      <View style={[selectionStyle, { borderRadius: 15 }]}>
        {showForwardedLabel && (
             <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, paddingHorizontal: 10, paddingTop: 5 }}>
                 <Ionicons name="arrow-redo" size={12} color="#666" style={{ marginRight: 4 }} />
                 <Text style={{ fontSize: 10, color: '#666', fontStyle: 'italic' }}>Forwarded</Text>
             </View>
        )}
        
        {conversationType === 'group' &&
          props.position === 'left' &&
          (!props.previousMessage ||
            !props.previousMessage.user ||
            props.currentMessage.user._id !== props.previousMessage.user._id) && (
            <Text style={chatStyles.senderName}>{props.currentMessage.user.name}</Text>
          )}
        <Bubble
          {...props}
          renderUsernameOnMessage={false}
          onLongPress={() => handleLongPressMessage(null, msg)}
          onPress={() => {
              if (selectedMessages.length > 0) {
                  handlePressMessage(null, msg);
              }
          }}
          wrapperStyle={{
            right: { ...chatStyles.bubbleRight, ...(isSelected ? { backgroundColor: 'transparent' } : {}) },
            left: { ...chatStyles.bubbleLeft, ...(isSelected ? { backgroundColor: 'transparent' } : {}) },
          }}
          textStyle={{
            right: { color: isDoc ? '#4a90e2' : (config.theme?.myMessageTextColor || 'white') },
            left: { color: isDoc ? '#4a90e2' : (config.theme?.messageTextColor || config.theme?.textColor || '#303030') },
          }}
          renderTime={() => null}
          renderTicks={() => null}
          renderMessageAudio={(audioProps) => (
            <View style={chatStyles.audioBubbleContainer}>
              <AudioPlayer 
                url={audioProps.currentMessage.audio} 
                isMine={isMine} 
                theme={config.theme} 
                onLongPress={() => handleLongPressMessage(null, msg)}
                onPress={selectedMessages.length > 0 ? () => handlePressMessage(null, msg) : undefined}
              />
              {renderFooter()}
            </View>
          )}
          currentMessage={{
             ...props.currentMessage,
             text: props.currentMessage.text ? props.currentMessage.text.replace(':::fw:::', '') : ''
          }}
          renderMessageImage={(imageProps) => (
            <MessageImageView 
              currentMessage={imageProps.currentMessage} 
              renderFooter={renderFooter} 
              isMine={isMine} 
              config={config} 
              onLongPress={() => handleLongPressMessage(null, msg)}
              onPress={() => handlePressMessage(null, msg)}
              isSelectionMode={selectedMessages.length > 0}
            />
          )}
          renderMessageText={(textProps) => {
            if (isDoc) {
              return (
                <View style={chatStyles.docContainer}>
                  <TouchableOpacity
                    onLongPress={() => handleLongPressMessage(null, msg)}
                    onPress={() => {
                      if (selectedMessages.length > 0) {
                        handlePressMessage(null, msg);
                      } else {
                        handleDocumentPress(
                          textProps.currentMessage.documentUrl,
                          textProps.currentMessage.text.replace('📄 ', '')
                        );
                      }
                    }}
                    style={chatStyles.docButton}
                  >
                    <View style={chatStyles.docIconContainer}>
                      <Ionicons name="document-text" size={24} color="#4a90e2" />
                    </View>
                    <Text style={chatStyles.docText} numberOfLines={2}>
                      {textProps.currentMessage.text.replace('📄 ', '')}
                    </Text>
                  </TouchableOpacity>
                  {renderFooter()}
                </View>
              );
            }

            return (
              <TouchableOpacity
                onLongPress={() => handleLongPressMessage(null, msg)}
                onPress={() => {
                  if (selectedMessages.length > 0) {
                      handlePressMessage(null, msg);
                  }
                }}
              >
                <View style={chatStyles.textContainer}>
                    <MessageText
                        {...textProps}
                        onLongPress={() => handleLongPressMessage(null, msg)}
                        onPress={() => {
                            if (selectedMessages.length > 0) {
                                handlePressMessage(null, msg);
                            }
                        }}
                        textStyle={{
                            right: chatStyles.messageTextRight,
                            left: chatStyles.messageTextLeft,
                        }}
                    />
                    <View style={chatStyles.textFooter}>
                    <Text style={[chatStyles.footerText, isMine ? chatStyles.footerTextMine : chatStyles.footerTextOther]}>
                        {moment(msg.createdAt).format('hh:mm A')}
                    </Text>
                    {isMine && (
                        <Ionicons
                        name={
                            (conversationType === 'group' || conversation?.isGroup || conversation?.type === 'group') 
                            ? 'checkmark' 
                            : (msg.pending ? 'checkmark' : 'checkmark-done')
                        }
                        size={16}
                        color={
                            !(conversationType === 'group' || conversation?.isGroup || conversation?.type === 'group') && msg.received 
                            ? '#53bdeb' 
                            : config.theme?.tickColor || config.theme?.myMessageTextColor || config.theme?.textColor || '#303030'
                        }
                        />
                    )}
                    </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  };

  const renderMessage = (props) => {
    return (
      <View style={{ width: '100%', paddingVertical: 2 }}>
        <Message {...props} />
      </View>
    );
  };

  const renderTicks = () => null;

  const renderSend = (props) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Send {...props} containerStyle={chatStyles.sendContainer}>
        <View style={chatStyles.sendingContainer}>
          <Ionicons name="send" size={26} color={config.theme?.primaryColor || '#6dcff6'} />
        </View>
      </Send>
      {!props.text && !isRecording && (
        <TouchableOpacity style={chatStyles.micButton} onPress={() => startRecording()}>
          <Ionicons name="mic-outline" size={26} color={config.theme?.primaryColor || '#6dcff6'} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderRecordingToolbar = () => (
    <View style={chatStyles.recordingToolbar}>
      <TouchableOpacity onPress={cancelRecording} style={chatStyles.recordingActionBtn}>
        <Ionicons name="trash-outline" size={24} color="#FF3B30" />
      </TouchableOpacity>
      
      <View style={chatStyles.recordingInfo}>
        <Text style={chatStyles.recordingTimer}>
          {moment.utc(recordingStatus?.durationMillis || 0).format('m:ss')}
        </Text>
        <View style={chatStyles.waveformContainer}>
          {waveformPoints.map((p, i) => (
            <View 
              key={i} 
              style={[
                chatStyles.waveformPoint, 
                { height: Math.max(4, p * 30), backgroundColor: config.theme?.primaryColor || '#6dcff6' }
              ]} 
            />
          ))}
        </View>
      </View>

      <TouchableOpacity 
        onPress={isPaused ? resumeRecording : pauseRecording} 
        style={chatStyles.recordingActionBtn}
      >
        <Ionicons 
          name={isPaused ? "play-circle" : "pause-circle"} 
          size={32} 
          color={isPaused ? (config.theme?.primaryColor || '#6dcff6') : "#FF3B30"} 
        />
      </TouchableOpacity>

      <TouchableOpacity onPress={handleVoiceUpload} style={chatStyles.recordingSendBtn}>
        <Ionicons name="send" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderInputToolbar = (props) => {
    if (isRecording) {
      return renderRecordingToolbar();
    }
    return (
      <InputToolbar
        {...props}
        containerStyle={chatStyles.inputToolbar}
        primaryStyle={chatStyles.inputPrimary}
        renderComposer={renderComposer}
        renderActions={renderActions}
      />
    );
  };

  const renderComposer = (props) => (
    <Composer
      {...props}
      textInputStyle={[chatStyles.composer, { color: isDark ? config.theme?.textColor : config.theme?.textColor || '#000' }]}
      placeholderTextColor={config.theme?.lightTextColor || '#8696a0'}
    />
  );

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation) {
      navigation.goBack();
    }
  };

  const renderDocumentModal = () => (
    <Modal
      visible={docModalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setDocModalVisible(false)}
    >
      <Pressable 
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} 
        onPress={() => setDocModalVisible(false)}
      >
        <View style={{ backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
          <View style={{ width: 40, height: 5, backgroundColor: '#E0E0E0', borderRadius: 2.5, alignSelf: 'center', marginBottom: 20 }} />
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: '#333', textAlign: 'center' }}>
            {docData?.name || 'Document Options'}
          </Text>

          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}
            onPress={async () => {
              if (!docData?.uri) return;
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(docData.uri);
              } else {
                Alert.alert('Error', 'Sharing is not available');
              }
              setDocModalVisible(false);
            }}
          >
            <View style={{ width: 40, alignItems: 'center' }}>
              <Ionicons name="share-social-outline" size={24} color="#007AFF" />
            </View>
            <Text style={{ fontSize: 16, color: '#333', marginLeft: 10 }}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15 }}
            onPress={async () => {
              if (!docData?.uri) return;
              try {
                const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (permissions.granted) {
                  const base64 = await FileSystem.readAsStringAsync(docData.uri, { encoding: FileSystem.EncodingType.Base64 });
                  
                  // Guess MIME type
                  let mimeType = 'application/octet-stream';
                  const ext = (docData.name || '').split('.').pop().toLowerCase();
                  if (ext === 'pdf') mimeType = 'application/pdf';
                  else if (ext === 'doc') mimeType = 'application/msword';
                  else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                  else if (ext === 'xls') mimeType = 'application/vnd.ms-excel';
                  else if (ext === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                  
                  const newUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, docData.name, mimeType);
                  await FileSystem.writeAsStringAsync(newUri, base64, { encoding: FileSystem.EncodingType.Base64 });
                  Alert.alert('Success', 'File saved successfully');
                }
              } catch (e) {
                console.log('Save error:', e);
                Alert.alert('Error', 'Failed to save file');
              }
              setDocModalVisible(false);
            }}
          >
           <View style={{ width: 40, alignItems: 'center' }}>
              <Ionicons name="download-outline" size={24} color="#007AFF" />
            </View>
            <Text style={{ fontSize: 16, color: '#333', marginLeft: 10 }}>Save to Device</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
             style={{ marginTop: 20, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 10 }}
             onPress={() => setDocModalVisible(false)}
          >
            <Text style={{ color: '#FF3B30', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );

  const renderGroupInfoModal = () => (
    <Modal
      visible={showGroupInfo}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowGroupInfo(false)}
    >
      <View style={chatStyles.modalOverlay}>
        <View style={chatStyles.modalContainer}>
          {showAddMember ? (
            <CreateGroup
              feathersClient={feathersClient}
              currentUser={currentUser}
              members={members.filter(m => !groupParticipants.some(gp => gp.userId == m.id))}
              staffs={staff.filter(s => !groupParticipants.some(gp => gp.userId == s.id))}
              config={config}
              loading={peopleLoading}
              onBack={() => setShowAddMember(false)}
              onSearchChange={setMemberSearch}
              isAddingMembers={true}
              onAddMembers={handleAddParticipants}
            />
          ) : (
            <>
              <View style={chatStyles.modalHeader}>
                <Text style={chatStyles.modalTitle}>Group Info</Text>
                <TouchableOpacity onPress={() => setShowGroupInfo(false)}>
                  <Ionicons name="close" size={24} color={config.theme?.groupInfoTextColor || config.theme?.textColor || '#303030'} />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={chatStyles.modalScroll}>
                <View style={chatStyles.groupInfoSection}>
                   <View style={chatStyles.largeAvatarPlaceholder}>
                     <Text style={chatStyles.largeAvatarLetter}>{(title || '?')[0].toUpperCase()}</Text>
                   </View>
                   <View style={{gap : 5}}>
                    <Text style={chatStyles.groupNameLarge}>{title}</Text>
                    <Text style={chatStyles.participantCount}>
                      {conversation?.participants?.length || 0} Participants
                    </Text>
                   </View>
                </View>

                <View style={chatStyles.participantsSection}>
                  <Text style={chatStyles.sectionTitle}>PARTICIPANTS</Text>
                  {participantsLoading ? (
                    <ActivityIndicator color={config.theme?.primaryColor || '#6dcff6'} />
                  ) : (
                    groupParticipants.map((p, idx) => (
                      <View style={chatStyles.participantItem} key={p.id || idx}>
                        <View style={chatStyles.smallAvatarContainer}>
                          {p.imageURL && p.imageURL !== '#' ? (
                            <Image source={{ uri: p.imageURL }} style={chatStyles.smallAvatarImage} />
                          ) : (
                            <Text style={chatStyles.smallAvatarLetter}>{(p.fullName || 'U')[0].toUpperCase()}</Text>
                          )}
                        </View>
                        <View style={chatStyles.participantDetails}>
                          <Text style={chatStyles.participantName}>{p.fullName || 'User'}</Text>
                          <Text style={chatStyles.participantType}>
                            {(p.userType || 'staff').charAt(0).toUpperCase() + (p.userType || 'staff').slice(1)}
                            {conversation?.createdBy == p.userId ? ' • Group Admin' : ''}
                          </Text>
                        </View>
                        {isAdmin && p.userId != currentUser?.id && (
                          <TouchableOpacity onPress={() => handleRemoveParticipant(p.id)}>
                            <Text style={chatStyles.removeButtonText}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
              
              {isAdmin && (
                <TouchableOpacity 
                  style={chatStyles.addMemberButton}
                  onPress={() => setShowAddMember(true)}
                >
                  <Ionicons name="person-add-outline" size={20} color="#fff" />
                  <Text style={chatStyles.addMemberButtonText}>Add Members</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  if (loading && messages.length === 0) {
    return (
      <View style={chatStyles.center}>
        <ActivityIndicator color={config.theme?.primaryColor || '#6dcff6'} size="large" />
      </View>
    );
  }

  if (error && messages.length === 0) {
    return (
      <View style={chatStyles.center}>
        <Ionicons name="alert-circle-outline" size={60} color="#FF3B30" />
        <Text style={[chatStyles.errorText, { color: config.theme?.textColor || '#333' }]}>
          {error}
        </Text>
        <TouchableOpacity 
          style={[chatStyles.retryButton, { backgroundColor: config.theme?.primaryColor || '#6dcff6' }]} 
          onPress={() => fetchMessages()}
        >
          <Text style={chatStyles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={chatStyles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header */}
      {selectedMessages.length > 0 ? (
        <View style={[chatStyles.header, { backgroundColor: config.theme?.headerColor || 'white', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setSelectedMessages([])} style={{ padding: 5 }}>
                    <Ionicons name="close" size={24} color={config.theme?.headerTextColor || '#303030'} />
                </TouchableOpacity>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: config.theme?.headerTextColor || '#303030', marginLeft: 15 }}>
                    {selectedMessages.length} Selected
                </Text>
            </View>
            <TouchableOpacity onPress={() => setForwardModalVisible(true)} style={{ padding: 5 }}>
                <Ionicons name="arrow-redo" size={24} color={config.theme?.headerTextColor || '#303030'} />
            </TouchableOpacity>
        </View>
      ) : (
      <View style={chatStyles.header}>
        <TouchableOpacity style={chatStyles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={config.theme?.textColor || '#303030'} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={chatStyles.headerCenter} 
          disabled={!(conversationType === 'group' || conversation?.isGroup || conversation?.type === 'group')}
          onPress={() => setShowGroupInfo(true)}
          activeOpacity={0.7}
        >
          {headerImage && headerImage !== '#' && !headerImgError ? (
            <Image
              source={{ uri: headerImage }}
              style={chatStyles.headerAvatar}
              onError={() => setHeaderImgError(true)}
            />
          ) : (
            <View style={chatStyles.headerAvatarPlaceholder}>
              <Text style={chatStyles.avatarLetter}>{(title || '?')[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={chatStyles.headerTextContainer}>
            <Text style={chatStyles.headerTitle} numberOfLines={1}>
              {title || 'Chat'}
            </Text>
            { (conversationType === 'group' || conversation?.isGroup || conversation?.type === 'group') && (
              <Text style={chatStyles.headerSubtitle}>Tap for group info</Text>
            )}
          </View>
        </TouchableOpacity>
      </View>
      )}

      {/* Upload/Download status */}
      {(uploading || downloading || isRecording) && (
        <View style={chatStyles.statusOverlay}>
          <Text style={chatStyles.statusText}>
            {uploading ? 'Uploading...' : (isRecording ? 'Recording voice message...' : 'Downloading file...')}
          </Text>
        </View>
      )}

      {/* Chat */}
      <KeyboardAvoidingView
        style={chatStyles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 5}
      >
        {/* Load More Button */}
        {hasMore && !loading && (
          <View style={chatStyles.loadMoreContainer}>
            <TouchableOpacity 
              style={chatStyles.loadMoreButton}
              onPress={loadEarlier}
              disabled={loadingEarlier}
            >
              {loadingEarlier ? (
                <ActivityIndicator size="small" color={config.theme?.primaryColor || '#6dcff6'} />
              ) : (
                <Text style={chatStyles.loadMoreText}>Load More Messages</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <GiftedChat
          messages={messages}
          onSend={(newMsgs) => onSend(newMsgs)}
          user={{ _id: String(currentUser?.id), name: 'You' }}
          onLongPress={handleLongPressMessage}
          onPress={handlePressMessage}
          extraData={selectedMessages.length}
          renderMessage={renderMessage}
          renderBubble={renderBubble}
          renderSend={renderSend}
          renderInputToolbar={renderInputToolbar}
          renderTicks={renderTicks}
          renderAvatar={null}
          showUserAvatar={false}
          placeholder="Type a message..."
          alwaysShowSend
          scrollToBottom
          infiniteScroll
          textInputProps={{
            style: { color: isDark ?  config.theme?.textColor : config.theme?.textColor || '#000' },
            ref: textInputRef,
            blurOnSubmit: false,
            returnKeyType: 'default',
          }}
          loadEarlier={false}
          renderUsernameOnMessage={true}
          listViewProps={{
            keyboardShouldPersistTaps: 'always',
          }}
        />
      </KeyboardAvoidingView>
      {renderGroupInfoModal()}
      {renderDocumentModal()}

      {/* Forward Modal */}
      <ForwardTargetModal
        visible={forwardModalVisible}
        onClose={() => setForwardModalVisible(false)}
        feathersClient={feathersClient}
        currentUser={currentUser}
        selectedMessages={selectedMessages}
        config={config}
        accessToken={accessToken}
        apiBaseUrl={apiBaseUrl}
        onForwardComplete={() => {
            setSelectedMessages([]);
            setForwardModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
};

const styles = (theme) => StyleSheet.create({
  loadMoreContainer: {
    padding: 8,
    alignItems: 'center',
    backgroundColor: theme.backgroundColor || '#e5ddd5',
  },
  loadMoreButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: theme.cardBackground || '#ffffff',
    borderRadius: 20,
    minWidth: 150,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  loadMoreText: {
    color: theme.primaryColor || '#6dcff6',
    fontWeight: '600',
    fontSize: 13,
  },
  micButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground || '#fff',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  recordingActionBtn: {
    padding: 8,
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  recordingTimer: {
    fontSize: 14,
    color: '#333',
    width: 45,
  },
  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: 30,
    marginLeft: 5,
    overflow: 'hidden',
  },
  waveformPoint: {
    width: 2,
    marginHorizontal: 1,
    borderRadius: 1,
  },
  recordingSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primaryColor || '#6dcff6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  audioBubbleContainer: {
    paddingHorizontal: 5,
    paddingTop: 5,
    minWidth: 200,
  },
  safeArea: {
    flex: 1,
    backgroundColor: theme.cardBackground || '#ffffff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.backgroundColor || '#e5ddd5',
  },
  errorText: {
    marginTop: 15,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  offlineBanner: {
    backgroundColor: '#FF3B30',
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground || '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderColor || '#e0e0e0',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    resizeMode: 'contain',
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.borderColor || '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarLetter: {
    color: theme.textColor || '#303030',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    color: theme.textColor || '#303030',
    fontSize: 18,
    fontWeight: '600',
  },
  statusOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 5,
    alignItems: 'center',
  },
  statusText: {
    color: 'white',
  },
  keyboardView: {
    flex: 1,
    backgroundColor: theme.backgroundColor || '#e5ddd5',
  },
  bubbleRight: {
    backgroundColor: theme.myMessageBackgroundColor || theme.navigatorBackgroundColor || theme.primaryColor || '#6dcff6',
    borderRadius: 8,
    marginVertical: 2,
    marginRight: 8,
    borderBottomRightRadius: 0,
    padding: 0,
  },
  bubbleLeft: {
    backgroundColor: theme.messageBackgroundColor || theme.cardBackground || '#ffffff',
    borderRadius: 8,
    marginVertical: 2,
    marginLeft: 8,
    borderBottomLeftRadius: 0,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  senderName: {
    color: theme.primaryColor || '#6dcff6',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 15,
    marginBottom: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: -5,
    paddingBottom: 4,
    paddingRight: 6,
  },
  footerText: {
    fontSize: 11,
    marginRight: 4,
    includeFontPadding: false,
  },
  footerTextMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  footerTextOther: {
    color: theme.lightTextColor || '#8696a0',
  },
  docContainer: {
    padding: 8,
    minWidth: 250,
  },
  docButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
    marginBottom: 4,
  },
  docIconContainer: {
    marginRight: 8,
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    padding: 8,
    borderRadius: 8,
  },
  docText: {
    color: '#4a90e2',
    textDecorationLine: 'underline',
    fontSize: 15,
    flex: 1,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    paddingRight: 6,
    paddingLeft: 8,
    paddingVertical: 4,
  },
  messageTextRight: {
    color: theme.myMessageTextColor || 'white',
    fontSize: 15,
    lineHeight: 20,
    margin: 0,
  },
  messageTextLeft: {
    color: theme.messageTextColor || theme.textColor || '#303030',
    fontSize: 15,
    lineHeight: 20,
    margin: 0,
  },
  textFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    marginBottom: 2,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  inputToolbar: {
    backgroundColor: theme.backgroundColor || '#e5ddd5',
    borderTopWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 60,
  },
  inputPrimary: {
    alignItems: 'center',
    backgroundColor: theme.cardBackground || '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    minHeight: 44,
  },
  composer: {
    fontSize: 16,
    lineHeight: 20,
    paddingTop: Platform.OS === 'ios' ? 10 : 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    paddingHorizontal: 4,
  },
  headerSubtitle: {
    fontSize: 11,
    color: theme.lightTextColor || '#8696a0',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: theme.cardBackground || '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderColor || '#e0e0e0',
    backgroundColor: theme.groupInfoBackground || theme.cardBackground || '#ffffff',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.groupInfoTextColor || theme.textColor || '#303030',
  },
  modalScroll: {
    flex: 1,
  },
  groupInfoSection: {
    gap : 15,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: theme.groupInfoBackground || theme.cardBackground || '#f0f0f0',
  },
  largeAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 50,
    backgroundColor: theme.borderColor || '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    // marginBottom: 15,
  },
  largeAvatarLetter: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.textColor || '#303030',
  },
  groupNameLarge: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.groupInfoTextColor || theme.textColor || '#303030',
    // marginBottom: 5,
  },
  participantCount: {
    fontSize: 12,
    color: theme.groupInfoTextColor || theme.lightTextColor || '#8696a0',
  },
  participantsSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.primaryColor || '#6dcff6',
    letterSpacing: 1,
    marginBottom: 15,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  smallAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.borderColor || '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  smallAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    resizeMode: 'cover',
  },
  smallAvatarLetter: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.textColor || '#303030',
  },
  participantDetails: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textColor || '#303030',
  },
  participantType: {
    fontSize: 12,
    color: theme.lightTextColor || '#8696a0',
    marginTop: 2,
  },
  removeButtonText: {
    color: '#d32f2f',
    fontSize: 13,
    fontWeight: '600',
    padding: 5,
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primaryColor || '#6dcff6',
    margin: 20,
    padding: 12,
    borderRadius: 10,
  },
  addMemberButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

export default ChatScreen;
