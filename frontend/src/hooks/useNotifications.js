import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useNotifications(userId) {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    if (!userId) return;

    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        sendTokenToBackend(token, userId);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log(response);
    });

    return () => {
      if (notificationListener.current && typeof notificationListener.current.remove === 'function') {
        notificationListener.current.remove();
      }
      if (responseListener.current && typeof responseListener.current.remove === 'function') {
        responseListener.current.remove();
      }
    };
  }, [userId]);

  const sendTokenToBackend = async (token, uid) => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

      if (uid) {
        const device_type = Platform.OS === 'web' ? 'web' : (Platform.OS === 'android' ? 'android' : 'ios');
        await fetch(`${API_URL}/push/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': uid.toString()
          },
          body: JSON.stringify({ token, device_type })
        });
      }
    } catch (e) {
      console.error('Error sending push token:', e);
    }
  };

  return {
    expoPushToken,
    notification
  };
}

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Platform.OS === 'web') {
    console.log('Las notificaciones Push en Web requieren configuración VAPID. Omitiendo por ahora según prioridad móvil.');
    return null;
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    try {
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId
      })).data;
    } catch (e) {
      console.log("Error obtaining push token:", e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
