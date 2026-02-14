import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, Alert, Modal, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const MessageImageView = ({ currentMessage, renderFooter, isMine, config, onLongPress, onPress, isSelectionMode }) => {
    const [imgError, setImgError] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    
    if (imgError) {
        return (
            <View style={{ width: 220, height: 100, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, margin: 4 }}>
                 <Ionicons name="image-outline" size={32} color="#ccc" />
                 <Text style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Image removed</Text>
                 {renderFooter()}
             </View>
        );
    }
    
    const downloadImage = async () => {
        try {
            const fileUri = `${FileSystem.documentDirectory}${new Date().getTime()}.jpg`;
            const { uri } = await FileSystem.downloadAsync(currentMessage.image, fileUri);
            
            // This opens the native "Save / Share" sheet. 
            // On Android, the user can click "Save to device" which works WITHOUT permissions.
            await Sharing.shareAsync(uri); 
            
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not save image.");
        }
    };

    // Only show download button if enabled in config and not from current user
    const showDownloadButton = config?.features?.imageDownload && !isMine;

    return (
        <View style={{ padding: 4 }}>
             <TouchableOpacity 
                onLongPress={onLongPress}
                onPress={() => {
                    if (isSelectionMode) {
                        onPress();
                    } else {
                        setModalVisible(true);
                    }
                }}
             >
                <Image 
                    source={{ uri: currentMessage.image }} 
                    style={{ width: 220, height: 160, borderRadius: 8, resizeMode: 'cover', marginBottom: 4 }} 
                    onError={() => setImgError(true)}
                />
             </TouchableOpacity>

             <Modal 
                visible={modalVisible} 
                transparent={true} 
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
             >
                <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
                    <StatusBar barStyle="light-content" backgroundColor="black" />
                    <TouchableOpacity 
                        onPress={() => setModalVisible(false)} 
                        style={{ position: 'absolute', top: 40, right: 10, zIndex: 10, padding: 10 }}
                    >
                        <Ionicons name="close" size={30} color="white" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Image 
                            source={{ uri: currentMessage.image }} 
                            style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                        />
                    </View>
                </SafeAreaView>
             </Modal>

            {/* Download Button Overlay */}
            {showDownloadButton && (
            <TouchableOpacity 
                onPress={downloadImage}
                style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
            >
                <Ionicons name="download" size={18} color="white" />
            </TouchableOpacity>
            )}

            {renderFooter()}
        </View>
    );
};

export default MessageImageView;
