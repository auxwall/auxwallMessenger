import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import moment from 'moment';

import { stopCurrent, getCurrent, setCurrent } from '../utils/audioManager';

const AudioPlayer = ({ url, isMine, theme = {}, onLongPress, onPress }) => {
  const [sound, setSound] = useState(null);
  const soundRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  useEffect(() => {
    return () => {
      // unload on unmount
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis ?? 0);
      setDuration(status.durationMillis ?? 0);

      setIsPlaying(Boolean(status.isPlaying));

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    } else if (status.error) {
      console.error(`Playback Error: ${status.error}`);
    }
  };

  const playSound = async () => {
    try {
      setLoading(true);

      // Force audio output to the main speaker on iOS
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldAutomaticallyRouteToSpeakerIOS: true,
      });

      // ✅ Stop any other audio that is currently playing (global)
      const { currentSound } = getCurrent();
      const mySound = soundRef.current;

      // If some other instance is playing, stop it
      if (currentSound && currentSound !== mySound) {
        await stopCurrent();
      }

      // If this instance already has a sound loaded, just toggle play/pause
      if (mySound) {
        let status;
        try {
          status = await mySound.getStatusAsync();
        } catch (e) {
          // If the sound was unloaded by another instance, status check will fail
          status = { isLoaded: false };
        }

        if (status.isLoaded) {
          if (status.isPlaying) {
            await mySound.pauseAsync();
            setIsPlaying(false);
            setLoading(false);
            return;
          }

          // if finished, restart
          if (status.positionMillis >= status.durationMillis) {
            await mySound.setPositionAsync(0);
          }

          await mySound.playAsync();
          setCurrent(mySound, url); 
          setIsPlaying(true);
          setLoading(false);
          return;
        } else {
            // Sound was unloaded globally, clear it so we can re-create below
            setSound(null);
            soundRef.current = null;
        }
      }

      // Create and play new sound
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setCurrent(newSound, url); 
      setIsPlaying(true);
      setLoading(false);
    } catch (error) {
      console.error('Error playing sound', error);
      setLoading(false);
    }
  };

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <TouchableOpacity 
      onLongPress={onLongPress}
      onPress={() => {
          if (onPress) {
              onPress();
          } else {
              playSound();
          }
      }}
      activeOpacity={0.9}
    >
      <View style={[styles.container, isMine ? styles.containerMine : styles.containerOther]}>
        <View style={styles.playButton}>
          {loading ? (
            <ActivityIndicator size="small" color={isMine ? '#fff' : (theme.primaryColor || '#6dcff6')} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={isMine ? '#fff' : (theme.primaryColor || '#6dcff6')}
            />
          )}
        </View>

        <View style={styles.contentContainer}>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarForeground,
                { width: `${progress}%`, backgroundColor: isMine ? '#fff' : (theme.primaryColor || '#6dcff6') },
              ]}
            />
          </View>
          <View style={styles.timeContainer}>
            <Text style={[styles.timeText, isMine ? styles.timeTextMine : styles.timeTextOther]}>
              {duration > 0 ? moment.utc(position).format('m:ss') : 'Voice Message'}
            </Text>
            {duration > 0 && (
              <Text style={[styles.timeText, isMine ? styles.timeTextMine : styles.timeTextOther]}>
                {moment.utc(duration).format('m:ss')}
              </Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// styles same as yours...

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 12,
    minWidth: 230,
    marginVertical: 5,
  },
  containerMine: {
    backgroundColor: 'transparent',
  },
  containerOther: {
    backgroundColor: 'transparent',
  },
  playButton: {
    width: 25,
    height: 25,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  contentContainer: {
    flex: 1,
  },
  progressBarBackground: {
    height: 2,
    backgroundColor: 'rgba(155, 154, 154, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarForeground: {
    height: '100%',
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    fontSize: 10,
    opacity: 0.7,
  },
  timeTextMine: {
    color: '#fff',
  },
  timeTextOther: {
    color: '#666',
  },
});

export default AudioPlayer;
