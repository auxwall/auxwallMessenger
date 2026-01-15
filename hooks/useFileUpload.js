import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

export default function useFileUpload({ config, apiBaseUrl, accessToken }) {
  const [uploading, setUploading] = useState(false);

  const getUploadUrl = () => {
    let baseUrl = apiBaseUrl;
    if (baseUrl?.endsWith('/api')) {
      baseUrl = baseUrl.replace('/api', '');
    }
    return `${baseUrl}/api/chat-upload`;
  };

  const uploadFileToBackend = useCallback(async (fileUri, fileName, fileType, metadata = {}) => {
    if (!config?.features?.fileUploads) {
      Alert.alert('Error', 'File uploads are disabled');
      return null;
    }

    setUploading(true);
    try {
      const uploadUrl = getUploadUrl();
      
      // 1. Process Image if it's an image to reduce size
      let finalUri = fileUri;
      if (fileType?.startsWith('image/')) {
        try {
          const manipResult = await ImageManipulator.manipulateAsync(
            fileUri,
            [{ resize: { width: 1200 } }], // Resize to a reasonable width
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );
          finalUri = manipResult.uri;
        } catch (e) {
          console.log('Image compression failed, using original', e);
        }
      }

      const ext = (fileName || 'file.dat').split('.').pop();
      const newFileName = `${require('moment')().format('DD-MM-YYYY')}_${Date.now()}.${ext}`;

      const formData = new FormData();
      
      // Add metadata first for Multer
      if (metadata.conversationId) formData.append('conversationId', metadata.conversationId);
      if (metadata.type) formData.append('type', metadata.type);
      if (metadata.senderId) formData.append('senderId', metadata.senderId);
      if (metadata.companyId) formData.append('companyId', metadata.companyId);

      formData.append('file', {
        uri: Platform.OS === 'ios' ? finalUri.replace('file://', '') : finalUri,
        name: newFileName,
        type: fileType || 'application/octet-stream',
      });

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Upload failed';
        const errorText = await response.text();
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          if (errorText.includes('too large')) {
            errorMessage = 'File too large. Please select a smaller file.';
          } else {
            errorMessage = `Server Error (${response.status})`;
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      if (result.success) {
        // Return result object if message was created, otherwise just the URL
        return result.message ? result : result.url;
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (error) {
      Alert.alert('Upload Failed', error.message);
      return null;
    } finally {
      setUploading(false);
    }
  }, [config, apiBaseUrl, accessToken]);

  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
        return null;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        return result.assets[0];
      }
      return null;
    } catch (error) {
      console.log('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
      return null;
    }
  }, []);

  const takePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera access is required to take photos');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        return result.assets[0];
      }
      return null;
    } catch (error) {
      console.log('Camera error:', error);
      Alert.alert('Error', 'Failed to take photo');
      return null;
    }
  }, []);

  const pickDocument = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: config?.upload?.allowedDocumentTypes || '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        return result.assets[0];
      }
      return null;
    } catch (error) {
      console.log('Document picker error:', error);
      Alert.alert('Error', 'Failed to pick document');
      return null;
    }
  }, [config]);

  return {
    uploading,
    uploadFileToBackend,
    pickImage,
    takePhoto,
    pickDocument,
  };
}
