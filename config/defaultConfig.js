export const defaultConfig = {
  // Feature flags
  features: {
    groupChats: true,
    fileUploads: true,
    imageDownload: true,
    staffSearch: true,
    memberSearch: true,
    documentSharing: true,
  },
  
  // User type
  userType: 'staff', // 'member' | 'staff' | 'admin'
  
  // Allowed conversation types
  allowedTypes: ['individual', 'group', 'staff-only'],
  
  // UI customization
  theme: {
    primaryColor: '#6dcff6',
    secondaryColor: '#273040',
    backgroundColor: '#e5ddd5',
    textColor: '#303030',
    lightTextColor: '#8696a0',
    cardBackground: '#ffffff',
    borderColor: '#e0e0e0',
    navigatorBackgroundColor: '#6dcff6',
    messageBackgroundColor: '#dcf8c6',
  },
  
  // Upload settings
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/jpg'],
    allowedDocumentTypes: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'],
  },
  
  // API settings
  api: {
    uploadEndpoint: '/api/chat-upload',
    messagesService: 'api/messages',
    conversationsService: 'api/conversations',
  },
};

// Member-specific config preset
export const memberConfig = {
  ...defaultConfig,
  features: {
    groupChats: true,
    fileUploads: true,
    imageDownload: false,
    staffSearch: true,
    memberSearch: false,
    documentSharing: true,
  },
  userType: 'member',
  allowedTypes: ['individual'],
};

// Staff/Trainer config preset
export const staffConfig = {
  ...defaultConfig,
  features: {
    groupChats: true,
    fileUploads: true,
    imageDownload: true,
    staffSearch: true,
    memberSearch: true,
    documentSharing: true,
  },
  userType: 'staff',
  allowedTypes: ['individual', 'group', 'staff-only'],
};

// Admin config preset
export const adminConfig = {
  ...staffConfig,
  userType: 'admin',
};
