# Auxwall Messenger Module

Reusable chat module for Auxwall React Native applications.

## Installation

Since this is a local module, install it using a relative path:

```bash
# From your app directory (e.g., auxwallClientApp, auxwallTrainerApp, or auxwallAdminApp)
npm install ../auxwallMessenger
```

Or add to your `package.json`:

```json
{
  "dependencies": {
    "@auxwall/messenger": "file:../auxwallMessenger"
  }
}
```

## Usage

### 1. Import the Module

```javascript
import { ChatScreen, memberConfig, staffConfig } from '@auxwall/messenger';
```

### 2. Use in Your App

#### Member App (Simple Mode)
```javascript
import React, { useContext } from 'react';
import { ChatScreen, memberConfig } from '@auxwall/messenger';
import client from './services/feathersClient';
import { TokenContext } from './screens/retrieveToken';

const MemberChatScreen = ({ route }) => {
  const { conversationId, title, staffImage } = route.params;
  const { userData, accessToken } = useContext(TokenContext);

  return (
    <ChatScreen
      config={memberConfig}
      feathersClient={client}
      conversationId={conversationId}
      currentUser={userData}
      accessToken={accessToken}
      title={title}
      headerImage={staffImage}
    />
  );
};

export default MemberChatScreen;
```

#### Trainer/Admin App (Full Features)
```javascript
import React, { useContext } from 'react';
import { ChatScreen, staffConfig } from '@auxwall/messenger';
import client from './services/feathersClient';
import { TokenContext } from './screens/retrieveToken';

const TrainerChatScreen = ({ route, navigation }) => {
  const { conversationId, title, staffImage } = route.params;
  const { userData, accessToken } = useContext(TokenContext);

  return (
    <ChatScreen
      config={staffConfig}  // Full features enabled
      feathersClient={client}
      conversationId={conversationId}
      currentUser={userData}
      accessToken={accessToken}
      title={title}
      headerImage={staffImage}
      navigation={navigation}
    />
  );
};

export default TrainerChatScreen;
```

### 3. Custom Configuration

You can also create custom configurations:

```javascript
const customConfig = {
  features: {
    groupChats: true,
    fileUploads: true,
    imageDownload: false,  // Disable image download
    staffSearch: true,
    memberSearch: false,
    documentSharing: true,
  },
  userType: 'staff',
  theme: {
    primaryColor: '#your-color',
    accentColor: '#your-accent',
    messageBackgroundColor: '#dcf8c6',
  },
  upload: {
    maxFileSize: 5 * 1024 * 1024,  // 5MB limit
    allowedImageTypes: ['image/jpeg', 'image/png'],
  },
};

<ChatScreen config={customConfig} ... />
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `features.groupChats` | boolean | true | Enable/disable group chat creation |
| `features.fileUploads` | boolean | true | Enable/disable file uploads |
| `features.imageDownload` | boolean | true | Show/hide image download button |
| `features.staffSearch` | boolean | true | Enable staff search in chat list |
| `features.memberSearch` | boolean | true | Enable member search |
| `features.documentSharing` | boolean | true | Enable document sharing |
| `userType` | string | 'staff' | User type: 'member', 'staff', or 'admin' |
| `theme.primaryColor` | string | '#6dcff6' | Primary app color |
| `upload.maxFileSize` | number | 10MB | Maximum upload file size in bytes |

## Available Components

- `ChatScreen` - Main chat screen component
- `MessageImageView` - Image message display with download
- `ChatList` - Conversation list (coming soon)
- `ConversationItem` - Individual conversation item (coming soon)

## Available Hooks

- `useChat` - Main chat logic hook
- `useFileUpload` - File upload functionality hook

## Available Utilities

- `mapMessageToGiftedChat` - Convert backend message format to GiftedChat format
- `buildUploadUrl` - Build file upload URL from base API URL
- `formatConversationTitle` - Format conversation display title
- `getConversationImage` - Get conversation avatar image

## Peer Dependencies

Make sure your app has these installed:

- `react` >= 16.8.0
- `react-native` >= 0.60.0
- `react-native-gifted-chat` ^2.0.0
- `moment` ^2.29.0
- `@expo/vector-icons`
- `expo-image-picker`
- `expo-document-picker`
- `expo-file-system`
- `expo-media-library`
- `expo-sharing`

## License

ISC
