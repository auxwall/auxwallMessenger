import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity, Image, KeyboardAvoidingView, Text, Alert, Modal, ScrollView, useColorScheme, Linking, Pressable } from 'react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GiftedChat, Bubble, Send, InputToolbar, Composer, MessageText, Actions, Message } from 'react-native-gifted-chat';
import { Ionicons } from '@expo/vector-icons';
import moment from 'moment';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ScreenCapture from 'expo-screen-capture';
import * as Clipboard from 'expo-clipboard';
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
  const [downloadingDocUrl, setDownloadingDocUrl] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [docModalVisible, setDocModalVisible] = useState(false);
  const [docData, setDocData] = useState(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const textInputRef = useRef(null);
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Use custom hooks
  const { messages, setMessages, loading, error, conversation, conversationType, sendMessage, deleteMessage, fetchMessages, loadEarlier, hasMore, loadingEarlier } = useChat({ feathersClient, conversationId, targetUser, currentUserId: currentUser?.id, companyId: currentUser?.companyId, config, apiBaseUrl });

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
    setActionModalVisible(false);
    if (Platform.OS === 'ios') {
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    const result = await pickImage();
    if (!result) return;

    const fileData = {
      uri: result.uri,
      name: result.fileName || result.name || 'image.jpg',
      mimeType: result.mimeType || result.type || 'image/jpeg',
    };

    const tempMsg = {
      _id: Math.random().toString(),
      image: result.uri,
      createdAt: new Date(),
      user: { _id: String(currentUser?.id), name: 'You' },
      pending: true,
      messageType: 'image',
    };
    setMessages((prev) => GiftedChat.append(prev, [tempMsg]));

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

  // Handle camera photo
  const handleTakePhoto = async () => {
    setActionModalVisible(false);
    if (Platform.OS === 'ios') {
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    const result = await takePhoto();
    if (!result) return;

    const fileData = {
      uri: result.uri,
      name: result.fileName || result.name || 'camera_photo.jpg',
      mimeType: result.mimeType || result.type || 'image/jpeg',
    };

    const tempMsg = {
      _id: Math.random().toString(),
      image: result.uri,
      createdAt: new Date(),
      user: { _id: String(currentUser?.id), name: 'You' },
      pending: true,
      messageType: 'image',
    };
    setMessages((prev) => GiftedChat.append(prev, [tempMsg]));

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
    setActionModalVisible(false);
    if (Platform.OS === 'ios') {
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    const result = await pickDocument();
    if (!result) return;

    const fileData = {
      uri: result.uri,
      name: result.name || result.fileName || 'document',
      mimeType: result.mimeType || result.type || 'application/octet-stream',
    };

    const tempMsg = {
      _id: Math.random().toString(),
      text: `📄 ${result.name || result.fileName || 'document'}`,
      documentUrl: result.uri,
      createdAt: new Date(),
      user: { _id: String(currentUser?.id), name: 'You' },
      pending: true,
      messageType: 'document',
    };
    setMessages((prev) => GiftedChat.append(prev, [tempMsg]));

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

  // Helper to determine document badge details (icon, color, background, label)
  const getDocDetails = (name) => {
    const ext = (name || '').split('.').pop().toLowerCase();
    switch (ext) {
      case 'pdf':
        return { type: 'PDF', icon: 'document-text', color: '#e02f2f', bg: 'rgba(224, 47, 47, 0.12)' };
      case 'xls':
      case 'xlsx':
      case 'csv':
        return { type: ext.toUpperCase(), icon: 'stats-chart', color: '#107c41', bg: 'rgba(16, 124, 65, 0.12)' };
      case 'doc':
      case 'docx':
        return { type: ext.toUpperCase(), icon: 'document', color: '#185abd', bg: 'rgba(24, 90, 189, 0.12)' };
      case 'ppt':
      case 'pptx':
        return { type: ext.toUpperCase(), icon: 'easel', color: '#d83b01', bg: 'rgba(216, 59, 1, 0.12)' };
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return { type: 'ZIP', icon: 'archive', color: '#7f6000', bg: 'rgba(127, 96, 0, 0.12)' };
      case 'txt':
        return { type: 'TXT', icon: 'document-text-outline', color: '#54656f', bg: 'rgba(84, 101, 111, 0.12)' };
      default:
        return { type: ext ? ext.toUpperCase().slice(0, 4) : 'DOC', icon: 'document-outline', color: '#54656f', bg: 'rgba(84, 101, 111, 0.12)' };
    }
  };

  // Download via XMLHttpRequest with timeout (bypasses iOS ATS and Android OkHttpClient hangs)
  const downloadWithXHR = (targetUrl, timeoutMs = 12000) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', targetUrl);
      xhr.responseType = 'blob';
      xhr.timeout = timeoutMs;

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Server responded with HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network request failed'));
      xhr.ontimeout = () => reject(new Error(`Connection timed out after ${timeoutMs / 1000}s`));
      xhr.send();
    });
  };

  // Convert Blob to Base64 and write directly to FileSystem
  const saveBlobToFile = (blob, destinationUri) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const res = reader.result;
          const base64Data = typeof res === 'string' ? (res.split(',')[1] || res) : null;
          if (!base64Data) {
            throw new Error('Empty base64 data produced from Blob');
          }
          await FileSystem.writeAsStringAsync(destinationUri, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          resolve(destinationUri);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  };

  // Smart document download: tries XHR first, then fetch with timeout, then FileSystem with timeout
  const downloadDocumentFile = async (targetUrl, destinationUri) => {
    // Method 1: XMLHttpRequest (reliable on React Native iOS/Android for cleartext HTTP)
    try {
      const blob = await downloadWithXHR(encodeURI(targetUrl), 10000);
      return await saveBlobToFile(blob, destinationUri);
    } catch (_) {}

    // Method 2: Fetch with 8-second Promise.race timeout
    try {
      const fetchPromise = fetch(encodeURI(targetUrl)).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.blob();
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timed out')), 8000)
      );

      const blob = await Promise.race([fetchPromise, timeoutPromise]);
      return await saveBlobToFile(blob, destinationUri);
    } catch (_) {}

    // Method 3: FileSystem.downloadAsync with 8-second timeout
    try {
      const fsPromise = FileSystem.downloadAsync(encodeURI(targetUrl), destinationUri);
      const fsTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('downloadAsync timed out')), 8000)
      );

      const res = await Promise.race([fsPromise, fsTimeout]);
      if (res && res.uri) {
        return res.uri;
      }
    } catch (fsErr) {
      throw fsErr;
    }

    throw new Error('All download methods failed for this URL');
  };

  // Handle document press (download and share/save/open)
  const handleDocumentPress = async (url, name) => {
    if (!config?.features?.documentSharing) return;

    try {
      if (!url) {
        Alert.alert('Notice', 'Document link is still being processed. Please try again.');
        return;
      }

      setDownloadingDocUrl(url);
      setDownloading(true);

      const safeName = (name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileUri = `${FileSystem.documentDirectory}${safeName}`;
      let targetUri = fileUri;

      // If already a local file (e.g. freshly sent from this device)
      if (typeof url === 'string' && (url.startsWith('file://') || url.startsWith('content://'))) {
        targetUri = url;
      } else {
        // Check if file is already cached locally
        const fileInfo = await FileSystem.getInfoAsync(fileUri);

        if (fileInfo.exists && fileInfo.size > 0) {
          targetUri = fileUri;
        } else {
          let baseUrl = apiBaseUrl || '';
          if (baseUrl.endsWith('/api')) baseUrl = baseUrl.slice(0, -4);
          if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

          const clean = typeof url === 'string' ? url.replace(':::fw:::', '').trim().replace(/\\/g, '/') : '';
          const candidateUrls = [];

          // Extract the path from any absolute HTTP URL (e.g. from an old port like :8000)
          let relativePath = clean;
          if (clean.startsWith('http://') || clean.startsWith('https://')) {
            const match = clean.match(/^https?:\/\/[^\/]+(\/.*)$/i);
            if (match && match[1]) {
              relativePath = match[1];
            }
          }

          // Strip leading slashes for consistent path building
          if (relativePath.startsWith('/')) {
            relativePath = relativePath.slice(1);
          }

          // Primary: Target the active baseUrl (matching active server port)
          if (baseUrl) {
            candidateUrls.push(`${baseUrl}/${relativePath}`);
            if (relativePath.startsWith('uploads/')) {
              candidateUrls.push(`${baseUrl}/${relativePath.replace('uploads/', '')}`);
            } else {
              candidateUrls.push(`${baseUrl}/uploads/${relativePath}`);
            }
            if (relativePath.includes('Auxwall/')) {
              candidateUrls.push(`${baseUrl}/uploads/${relativePath.slice(relativePath.indexOf('Auxwall/'))}`);
            }
          }

          // Fallback: Also include the original clean URL
          if (clean.startsWith('http://') || clean.startsWith('https://')) {
            candidateUrls.push(clean);
          }

          const uniqueCandidates = [...new Set(candidateUrls)];
          let downloadedUri = null;
          let lastError = null;

          for (let i = 0; i < uniqueCandidates.length; i++) {
            const candUrl = uniqueCandidates[i];
            try {
              downloadedUri = await downloadDocumentFile(candUrl, fileUri);
              if (downloadedUri) break;
            } catch (err) {
              lastError = err;
            }
          }

          if (!downloadedUri) {
            throw lastError || new Error('Could not download document from server');
          }
          targetUri = downloadedUri;
        }
      }

      if (Platform.OS === 'android') {
        setDocData({ uri: targetUri, name: safeName });
        setDocModalVisible(true);
      } else {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(targetUri);
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      }
    } catch (error) {
      Alert.alert('Download Error', error.message || 'Failed to download or open document');
    } finally {
      setDownloadingDocUrl(null);
      setDownloading(false);
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
        messageType: 'text',
      };

      setMessages((prev) => GiftedChat.append(prev, [optimisticMessage]));

      sendMessage({
        conversationId,
        content: text,
        type: 'text',
        senderId: currentUser?.id,
      }).then((realMessage) => {
        setMessages((prev) => {
          if (prev.some(m => String(m._id) === String(realMessage.id))) {
             return prev.filter(m => m._id !== tempId);
          }
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
    if (message.messageType === 'deleted') return;
    if (selectedMessages.length > 0) return;
    setSelectedMessages([message]);
  };

  const handlePressMessage = (context, message) => {
    if (message.messageType === 'deleted') return;
    if (selectedMessages.length > 0) {
      const exists = selectedMessages.find(m => m._id === message._id);
      if (exists) {
        setSelectedMessages(prev => prev.filter(m => m._id !== message._id));
      } else {
        setSelectedMessages(prev => [...prev, message]);
      }
    }
  };

  const handleDelete = async () => {
    if (selectedMessages.length === 0) return;
    
    const myMessages = selectedMessages.filter(m => String(m.user._id) === String(currentUser?.id));
    
    if (myMessages.length === 0) {
        Alert.alert("Delete Message", "You can only delete your own messages.");
        return;
    }
    
    Alert.alert(
        "Delete Message",
        `Are you sure you want to delete ${myMessages.length} message(s)?`,
        [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Delete", 
                style: "destructive",
                onPress: async () => {
                    try {
                        const promises = myMessages.map(m => deleteMessage(m._id));
                        await Promise.all(promises);
                        setSelectedMessages([]);
                    } catch (err) {
                        Alert.alert("Error", "Failed to delete messages");
                    }
                }
            }
        ]
    );
  };

  const handleCopy = async () => {
    if (selectedMessages.length === 0) return;
    
    const textToCopy = selectedMessages
        .filter(m => m.messageType === 'text' || (!m.image && !m.audio && !m.documentUrl && m.text && !m.text.startsWith('📄')))
        .map(m => m.text)
        .filter(Boolean)
        .join('\n');
    
    if (textToCopy) {
        await Clipboard.setStringAsync(textToCopy);
        Toast.show({ type: 'success', text1: 'Copied to clipboard', position: 'bottom', bottomOffset: 80 });
        setSelectedMessages([]);
    } else {
        Toast.show({ type: 'info', text1: 'No text selected', position: 'bottom', bottomOffset: 80 });
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
        onPressActionButton={() => setActionModalVisible(true)}
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
    const isDoc = !!msg.documentUrl || msg.messageType === 'document' || (typeof msg.text === 'string' && msg.text.startsWith('📄'));
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
            right: { color: config.theme?.myMessageTextColor || 'white' },
            left: { color: config.theme?.messageTextColor || config.theme?.textColor || '#303030' },
          }}
          renderTime={() => null}
          renderTicks={() => null}
          renderMessageAudio={(audioProps) => (
            <TouchableOpacity 
                style={chatStyles.audioBubbleContainer}
                onLongPress={() => handleLongPressMessage(null, msg)}
                onPress={() => {
                    if (selectedMessages.length > 0) {
                        handlePressMessage(null, msg);
                    }
                }}
            >
              <AudioPlayer 
                url={audioProps.currentMessage.audio} 
                isMine={isMine} 
                theme={config.theme} 
                onLongPress={() => handleLongPressMessage(null, msg)}
                onPress={selectedMessages.length > 0 ? () => handlePressMessage(null, msg) : undefined}
              />
              <View pointerEvents="none">
                {renderFooter()}
              </View>
            </TouchableOpacity>
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
              const rawName = (textProps.currentMessage.text || '').replace('📄 ', '') || 'document';
              const docUrl = textProps.currentMessage.documentUrl || textProps.currentMessage.content || textProps.currentMessage.text?.replace('📄 ', '');
              const docDetails = getDocDetails(rawName);
              const isCurrentDownloading = downloadingDocUrl === docUrl || (downloading && downloadingDocUrl === textProps.currentMessage.documentUrl);

              return (
                <TouchableOpacity 
                  activeOpacity={0.9}
                  style={chatStyles.docContainer}
                  onLongPress={() => handleLongPressMessage(null, msg)}
                  onPress={() => {
                    if (selectedMessages.length > 0) {
                      handlePressMessage(null, msg);
                    }
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onLongPress={() => handleLongPressMessage(null, msg)}
                    onPress={() => {
                      if (selectedMessages.length > 0) {
                        handlePressMessage(null, msg);
                      } else {
                        handleDocumentPress(docUrl, rawName);
                      }
                    }}
                    style={[
                      chatStyles.docCard,
                      isMine ? chatStyles.docCardMine : chatStyles.docCardOther
                    ]}
                  >
                    {/* File icon / type badge */}
                    <View style={[chatStyles.docBadge, { backgroundColor: docDetails.bg }]}>
                      <Ionicons name={docDetails.icon} size={20} color={docDetails.color} />
                      <Text style={[chatStyles.docBadgeText, { color: docDetails.color }]} numberOfLines={1}>
                        {docDetails.type}
                      </Text>
                    </View>

                    {/* File name & subtitle */}
                    <View style={chatStyles.docInfo}>
                      <Text 
                        style={[chatStyles.docTitle, isMine ? chatStyles.docTitleMine : chatStyles.docTitleOther]} 
                        numberOfLines={2}
                      >
                        {rawName}
                      </Text>
                      <Text style={[chatStyles.docSubtitle, isMine ? chatStyles.docSubtitleMine : chatStyles.docSubtitleOther]}>
                        {docDetails.type} • Document
                      </Text>
                    </View>

                    {/* Download circular action button */}
                    <View style={[chatStyles.downloadBtn, isMine ? chatStyles.downloadBtnMine : chatStyles.downloadBtnOther]}>
                      {isCurrentDownloading ? (
                        <ActivityIndicator size="small" color={isMine ? '#ffffff' : '#00a884'} />
                      ) : (
                        <Ionicons 
                          name="arrow-down" 
                          size={18} 
                          color={isMine ? (config.theme?.myMessageTextColor || '#ffffff') : '#54656f'} 
                        />
                      )}
                    </View>
                  </TouchableOpacity>

                  <View pointerEvents="none" style={chatStyles.docFooterWrapper}>
                    {renderFooter()}
                  </View>
                </TouchableOpacity>
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
                            right: textProps.currentMessage.messageType === 'deleted' ? { fontStyle: 'italic', color: '#ccc' } : chatStyles.messageTextRight,
                            left: textProps.currentMessage.messageType === 'deleted' ? { fontStyle: 'italic', color: '#999' } : chatStyles.messageTextLeft,
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

  const renderActionModal = () => (
    <Modal
      visible={actionModalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setActionModalVisible(false)}
    >
      <Pressable 
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} 
        onPress={() => setActionModalVisible(false)}
      >
        <View style={{ backgroundColor: isDark ? '#1e1e1e' : 'white', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: 20, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 10 }}>
          <View style={{ width: 40, height: 5, backgroundColor: isDark ? '#3a3a3a' : '#E0E0E0', borderRadius: 2.5, alignSelf: 'center', marginBottom: 10 }} />
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10, color: isDark ? '#fff' : '#333', textAlign: 'center' }}>
            Send Attachment
          </Text>

          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: isDark ? '#2a2a2a' : '#F0F0F0' }}
            onPress={handleTakePhoto}
          >
            <View style={{ width: 30, height: 30, borderRadius: 22.5, backgroundColor: isDark ? '#2a2a2a' : '#F0F7FF', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera" size={20} color={config.theme?.primaryColor || "#007AFF"} />
            </View>
            <Text style={{ fontSize: 14, color: isDark ? '#eee' : '#333', marginLeft: 15, fontWeight: '500' }}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: isDark ? '#2a2a2a' : '#F0F0F0' }}
            onPress={handlePickImage}
          >
            <View style={{ width: 30, height: 30, borderRadius: 22.5, backgroundColor: isDark ? '#2a2a2a' : '#F7F0FF', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="images" size={20} color="#A020F0" />
            </View>
            <Text style={{ fontSize: 14, color: isDark ? '#eee' : '#333', marginLeft: 15, fontWeight: '500' }}>Photo & Video Library</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 18 }}
            onPress={handlePickDocument}
          >
            <View style={{ width: 30, height: 30, borderRadius: 22.5, backgroundColor: isDark ? '#2a2a2a' : '#F0FFF4', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="document-text" size={20} color="#34C759" />
            </View>
            <Text style={{ fontSize: 14, color: isDark ? '#eee' : '#333', marginLeft: 15, fontWeight: '500' }}>Document</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
             style={{ paddingVertical: 15, alignItems: 'center', backgroundColor: isDark ? '#2a2a2a' : '#F9F9F9', borderRadius: 15 }}
             onPress={() => setActionModalVisible(false)}
          >
            <Text style={{ color: '#FF3B30', fontSize: 14, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );

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
            <View style={{ flexDirection: 'row' }}>
                {selectedMessages.every(m => 
                    String(m.user._id) === String(currentUser?.id) && 
                    moment().diff(moment(m.createdAt), 'minutes') < 5
                ) && (
                    <TouchableOpacity onPress={handleDelete} style={{ padding: 5, marginRight: 10 }}>
                        <Ionicons name="trash-outline" size={24} color={config.theme?.headerTextColor || '#303030'} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleCopy} style={{ padding: 5, marginRight: 10 }}>
                    <Ionicons name="copy-outline" size={24} color={config.theme?.headerTextColor || '#303030'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setForwardModalVisible(true)} style={{ padding: 5 }}>
                    <Ionicons name="arrow-redo" size={24} color={config.theme?.headerTextColor || '#303030'} />
                </TouchableOpacity>
            </View>
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
      {renderActionModal()}
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
    padding: 4,
    minWidth: 260,
    maxWidth: 320,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginHorizontal: 2,
    marginTop: 2,
  },
  docCardMine: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  docCardOther: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  docBadge: {
    width: 44,
    height: 48,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    paddingHorizontal: 2,
  },
  docBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  docInfo: {
    flex: 1,
    marginRight: 8,
    justifyContent: 'center',
  },
  docTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 3,
  },
  docTitleMine: {
    color: theme.myMessageTextColor || '#ffffff',
  },
  docTitleOther: {
    color: theme.messageTextColor || theme.textColor || '#111b21',
  },
  docSubtitle: {
    fontSize: 11,
  },
  docSubtitleMine: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  docSubtitleOther: {
    color: '#667781',
  },
  downloadBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtnMine: {
    borderColor: 'rgba(255, 255, 255, 0.6)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  downloadBtnOther: {
    borderColor: '#00a884',
    backgroundColor: 'rgba(0, 168, 132, 0.08)',
  },
  docFooterWrapper: {
    marginTop: 2,
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
