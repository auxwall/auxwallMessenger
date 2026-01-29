import { useState, useCallback, useRef, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { Audio } from 'expo-av';
import moment from 'moment';

export default function useFileUpload({ config, apiBaseUrl, accessToken }) {
  const [uploading, setUploading] = useState(false);
  const recordingRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState(null);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(err => console.log('Cleanup error', err));
      }
    };
  }, []);

  const getUploadUrl = () => {
    let baseUrl = apiBaseUrl;
    if (baseUrl.endsWith('/api')) {
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
      const newFileName = `${moment().format('DD-MM-YYYY')}_${Date.now()}.${ext}`;

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

  const startRecording = useCallback(async (onStatusUpdate) => {
    if (recordingRef.current || isRecording) return;

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required to record voice messages');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, shouldAutomaticallyRouteToSpeakerIOS: true, });

      const recordingOptions = {
        isMeteringEnabled: true,

        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 22050,        // lower = smaller
          numberOfChannels: 1,      // mono = smaller
          bitRate: 32000,           // 32kbps (try 24000–64000)
        },

        ios: {
          extension: '.m4a',
          audioQuality: Audio.IOSAudioQuality.LOW, // or MEDIUM
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          sampleRate: 22050,
          numberOfChannels: 1,
          bitRate: 32000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },

        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 32000,
        },
      };


      const { recording: newRecording } = await Audio.Recording.createAsync( recordingOptions, (status) => {
          setRecordingStatus(status);
          if (onStatusUpdate) onStatusUpdate(status);
        },
        100 // update interval
      );
      
      recordingRef.current = newRecording;
      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      console.error('Failed to start recording', err);
      // Ensure state is reset on failure
      setIsRecording(false);
      setIsPaused(false);
      recordingRef.current = null;
      Alert.alert('Error', 'Could not start recording');
    }
  }, [isRecording]);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current || isPaused) return;
    try {
      await recordingRef.current.pauseAsync();
      setIsPaused(true);
    } catch (err) {
      console.error('Failed to pause recording', err);
    }
  }, [isPaused]);

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current || !isPaused) return;
    try {
      await recordingRef.current.startAsync();
      setIsPaused(false);
    } catch (err) {
      console.error('Failed to resume recording', err);
    }
  }, [isPaused]);

  const stopRecording = useCallback(async (metadata = {}) => {
    if (!recordingRef.current) {
      // If we are marked as recording but ref is null, it might be a race condition
      if (isRecording) {
         setIsRecording(false);
      }
      return null;
    }

    try {
      const capturedRecording = recordingRef.current;
      recordingRef.current = null;
      setIsRecording(false);

      await capturedRecording.stopAndUnloadAsync();
      
      // Reset audio mode to playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldAutomaticallyRouteToSpeakerIOS: true,
      });

      const uri = capturedRecording.getURI();
      console.log('[useFileUpload] Recording stopped, URI:', uri);

      // Upload the recorded file
      if (uri) {
        const fileName = `voice_${Date.now()}.m4a`;
        return await uploadFileToBackend(uri, fileName, 'audio/m4a', {
          ...metadata,
          type: 'audio'
        });
      }
    } catch (err) {
      console.error('[useFileUpload] Failed to stop/upload recording', err);
      Alert.alert('Error', 'Could not save recording');
    } finally {
        setIsRecording(false);
        recordingRef.current = null;
    }
    return null;
  }, [isRecording, uploadFileToBackend]);

  const cancelRecording = useCallback(async () => {
    if (!recordingRef.current) {
        setIsRecording(false);
        return;
    }
    try {
      const capturedRecording = recordingRef.current;
      recordingRef.current = null;
      setIsRecording(false);
      await capturedRecording.stopAndUnloadAsync();

      // Reset audio mode to playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldAutomaticallyRouteToSpeakerIOS: true,
      });
    } catch (err) {
      console.error('Failed to cancel recording', err);
    } finally {
        setIsRecording(false);
        setIsPaused(false);
        setRecordingStatus(null);
        recordingRef.current = null;
    }
  }, []);

  return {
    uploading,
    isRecording,
    uploadFileToBackend,
    pickImage,
    takePhoto,
    pickDocument,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    isPaused,
    recordingStatus,
  };
}
