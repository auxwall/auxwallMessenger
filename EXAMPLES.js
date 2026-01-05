// Example usage of @auxwall/messenger module in your apps

// ====================================
// EXAMPLE 1: Member App (Simple Mode)
// ====================================

import React, { useContext } from 'react';
import { ChatScreen, memberConfig } from '@auxwall/messenger';
import client from '../services/feathersClient';
import config from '../config/config';
import { TokenContext } from './retrieveToken';

const MemberChatScreen = ({ route, navigation }) => {
  const { conversationId, title, staffImage } = route.params;
  const { userData, accessToken } = useContext(TokenContext);

  return (
    <ChatScreen
      config={memberConfig}  // Member preset: no groups, no image download
      feathersClient={client}
      conversationId={conversationId}
      currentUser={userData}
      accessToken={accessToken}
      apiBaseUrl={config.api}
      title={title}
      headerImage={staffImage}
      navigation={navigation}
    />
  );
};

export default MemberChatScreen;


// ==========================================
// EXAMPLE 2: Trainer/Admin App (Full Mode)
// ==========================================

import React, { useContext } from 'react';
import { ChatScreen, staffConfig } from '@auxwall/messenger';
import client from '../services/feathersClient';
import config from '../config/config';
import { TokenContext } from './retrieveToken';

const TrainerChatScreen = ({ route, navigation }) => {
  const { conversationId, title, staffImage } = route.params;
  const { userData, accessToken } = useContext(TokenContext);

  return (
    <ChatScreen
      config={staffConfig}  // Staff preset: full features enabled
      feathersClient={client}
      conversationId={conversationId}
      currentUser={userData}
      accessToken={accessToken}
      apiBaseUrl={config.api}
      title={title}
      headerImage={staffImage}
      navigation={navigation}
    />
  );
};

export default TrainerChatScreen;


// =======================================
// EXAMPLE 3: Custom Configuration
// =======================================

import React, { useContext } from 'react';
import { ChatScreen } from '@auxwall/messenger';
import client from '../services/feathersClient';
import config from '../config/config';
import { TokenContext } from './retrieveToken';

const CustomChatScreen = ({ route, navigation }) => {
  const { conversationId, title, staffImage } = route.params;
  const { userData, accessToken } = useContext(TokenContext);

  // Custom config - mix and match features
  const customConfig = {
    features: {
      groupChats: true,
      fileUploads: true,
      imageDownload: false,  // Disable download
      staffSearch: true,
      memberSearch: false,   // Disable member search
      documentSharing: true,
    },
    userType: 'staff',
    theme: {
      primaryColor: '#ff6b6b',  // Custom red theme
      accentColor: '#4ecdc4',
      messageBackgroundColor: '#ffe66d',
      backgroundColor: '#f7f7f7',
      textColor: '#2c3e50',
      lightTextColor: '#95a5a6',
    },
    upload: {
      maxFileSize: 5 * 1024 * 1024,  // 5MB limit
      allowedImageTypes: ['image/jpeg', 'image/png'],
      allowedDocumentTypes: ['.pdf', '.doc', '.docx'],
    },
  };

  return (
    <ChatScreen
      config={customConfig}
      feathersClient={client}
      conversationId={conversationId}
      currentUser={userData}
      accessToken={accessToken}
      apiBaseUrl={config.api}
      title={title}
      headerImage={staffImage}
      navigation={navigation}
    />
  );
};

export default CustomChatScreen;


// =======================================
// EXAMPLE 4: Using Individual Components
// =======================================

import React, { useContext } from 'react';
import { View } from 'react-native';
import { useChat, useFileUpload, MessageImageView } from '@auxwall/messenger';
import client from '../services/feathersClient';
import { TokenContext } from './retrieveToken';

const CustomChatImplementation = ({ conversationId }) => {
  const { userData, accessToken } = useContext(TokenContext);

  // Use individual hooks
  const {
    messages,
    loading,
    sendMessage,
  } = useChat({
    feathersClient: client,
    conversationId,
    currentUserId: userData?.id,
    config: memberConfig,
  });

  const {
    uploading,
    uploadFileToBackend,
    pickImage,
  } = useFileUpload({
    config: memberConfig,
    apiBaseUrl: config.api,
    accessToken,
  });

  // Build your own custom UI using the hooks
  return (
    <View>
      {/* Your custom chat UI here */}
    </View>
  );
};

export default CustomChatImplementation;
