// Main entry point for Auxwall Messenger Module
import ChatScreen from './components/ChatScreen';
import MessageImageView from './components/MessageImageView';
import ChatList from './components/ChatList';
import ConversationItem from './components/ConversationItem';
import CreateGroup from './components/CreateGroup';

export {
  ChatScreen,
  MessageImageView,
  ChatList,
  ConversationItem,
  CreateGroup
};

// Hooks
export { default as useChat } from './hooks/useChat';
export { default as useFileUpload } from './hooks/useFileUpload';
export { default as useConversations } from './hooks/useConversations';
export { default as usePeople } from './hooks/usePeople';

// Utils
export * from './utils/chatHelpers';
export * from './utils/messageMapper';
export { default as feathersManager, FeathersManager } from './utils/FeathersManager';

// Configuration presets
export {
  defaultConfig,
  memberConfig,
  staffConfig,
  adminConfig,
} from './config/defaultConfig';
